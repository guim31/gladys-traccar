// -----------------------------------------------------------------------------
// The hub: the link to one Traccar server, and everything Gladys sees of it —
// devices, states, connection status, scene events, the presence pings.
//
// Live updates come from the push socket. While it is down, the REST API is
// read every `fallbackInterval`; every (re)opening of the socket reads the
// REST snapshot too, so nothing missed during an outage is lost: a geofence
// crossed meanwhile still fires its trigger, late.
//
// Geofence and alarm triggers are derived from the positions themselves
// (`geofenceIds`, `attributes.alarm`): Traccar only pushes its own events to
// users who created a notification for them, the positions always arrive.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import {
  buildDevice,
  buildStates,
  deviceIds,
  featureKeyOf,
  OPTIONAL_KEYS,
  reportedKeys,
} from './devices.js';
import { alarmsOf, homeModeOf, mapUrl, statusOf, viewOf, zoneIdsOf } from './model.js';
import { alarmLabel, formatTime, INIT_FAILED, STATUS_TEXT, TEST_TEXT } from './texts.js';
import { TraccarClient, TraccarError } from './traccar/client.js';
import { PushLink } from './traccar/socket.js';

const logger = createLogger({ name: 'traccar-hub' });

export const WIDGET_KEY = 'trackers';

// Scene trigger keys (manifest `scene_triggers`).
export const TRIGGERS = {
  enter: 'geofence_enter',
  exit: 'geofence_exit',
  offline: 'tracker_offline',
  alarm: 'alarm',
};

export const DEFAULT_TIMINGS = {
  // REST reads while the push socket is down.
  fallbackInterval: 30_000,
  // Geofence names (renames, new zones) while the socket is up.
  geofenceInterval: 15 * 60_000,
  // Presence pings: checked every minute, sent every 5 minutes at most.
  presenceCheck: 60_000,
  presenceEvery: 5 * 60_000,
  // Unchanged values re-sent so Gladys never shows "no recent value".
  heartbeatCheck: 30 * 60_000,
  heartbeat: 12 * 60 * 60_000,
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
};

export class Hub {
  constructor({ gladys, fetch, createSocket, timings, socketTimings, now = Date.now }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.createSocket = createSocket;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.socketTimings = socketTimings;
    this.now = now;

    this.config = null;
    this.client = null;
    this.link = null;
    this.server = null;
    /** @type {Map<number, { device: object, position: object | null, optional: Set<string> }>} */
    this.trackers = new Map();
    /** @type {Map<number, string>} */
    this.geofences = new Map();
    this.house = null;
    this.problem = null; // the code of the current Traccar problem, null when fine
    this.reported = undefined; // the last connection status sent to Gladys
    this.lastDevicesSignature = '';
    this.lastPresence = new Map();
    this.timers = [];
    this.queue = Promise.resolve();
    this.widgetTimer = null;
    this.lastWidgetRefresh = 0;
    this.stopped = false;
  }

  // --- lifecycle -------------------------------------------------------------

  async start(config) {
    this.stopped = false;
    this.config = config;
    await this.#loadHouse();
    if (!isConfigured(config)) {
      this.trackers.clear();
      await this.publishDevices({ force: true });
      await this.#reportStatus(config.invalidUrl ? 'invalid_url' : 'not_configured');
      return;
    }
    this.client = new TraccarClient({
      url: config.url,
      token: config.token,
      email: config.email,
      password: config.password,
      fetch: this.fetch,
    });
    await this.#serialized(() => this.#refresh({ initial: true }));
    this.link = new PushLink({
      client: this.client,
      createSocket: this.createSocket,
      timings: this.socketTimings,
    });
    this.link.on('open', () => this.#onPushOpen());
    this.link.on('message', (frame) => this.#serialized(() => this.#onFrame(frame)));
    this.link.on('close', () => logger.debug('Push link closed, REST fallback until it is back'));
    this.link.start();
    this.#every(this.timings.fallbackInterval, () => {
      if (!this.link?.live) {
        return this.#serialized(() => this.#refresh());
      }
      return undefined;
    });
    this.#every(this.timings.geofenceInterval, () =>
      this.link?.live ? this.#serialized(() => this.#refreshGeofences()) : undefined,
    );
    this.#every(this.timings.presenceCheck, () => this.#pingPresences());
    this.#every(this.timings.heartbeatCheck, () =>
      this.publishAllStates({ heartbeat: this.timings.heartbeat }),
    );
  }

  stop() {
    this.stopped = true;
    this.link?.stop();
    this.link = null;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    clearTimeout(this.widgetTimer);
    this.widgetTimer = null;
  }

  /** The configuration changed: start over (the devices keep their ids). */
  async reconfigure(config) {
    this.stop();
    this.trackers.clear();
    this.geofences.clear();
    this.server = null;
    this.problem = null;
    this.lastDevicesSignature = '';
    this.gladys.forgetPublishedStates?.();
    await this.start(config);
    this.refreshWidget();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.reported = undefined;
    await this.reconfigure(config);
  }

  #every(interval, fn) {
    const timer = setInterval(() => {
      Promise.resolve()
        .then(fn)
        .catch((err) => logger.error('Periodic task failed', err));
    }, interval);
    timer.unref?.();
    this.timers.push(timer);
  }

  /** Runs fn after the previous frames and refreshes: states stay in order. */
  #serialized(fn) {
    const run = this.queue.then(() => (this.stopped ? undefined : fn()));
    this.queue = run.catch((err) => logger.error('Traccar update failed', err));
    return run;
  }

  // --- Gladys house ----------------------------------------------------------

  async #loadHouse() {
    let houses = [];
    try {
      houses = await this.gladys.getHouses();
    } catch (err) {
      logger.warn(`Cannot read the Gladys houses (${err.message}): no distance from home`);
    }
    const located = (houses ?? []).filter(
      (house) => typeof house.latitude === 'number' && typeof house.longitude === 'number',
    );
    const wanted = this.config.house.toLowerCase();
    const house =
      (wanted && located.find((h) => String(h.name).toLowerCase() === wanted)) || located[0];
    if (wanted && house && String(house.name).toLowerCase() !== wanted) {
      logger.warn(`No located Gladys house named "${this.config.house}", using "${house.name}"`);
    }
    this.house = house
      ? { name: house.name, latitude: house.latitude, longitude: house.longitude }
      : null;
  }

  // --- Traccar -> state ------------------------------------------------------

  /** Reads the whole REST snapshot and applies it. */
  async #refresh({ initial = false } = {}) {
    try {
      const [server, devices, positions, geofences] = await Promise.all([
        this.server && !initial ? this.server : this.client.getServer(),
        this.client.getDevices(),
        this.client.getPositions(),
        this.client.getGeofences(),
      ]);
      this.server = server;
      this.#setGeofences(geofences);
      const seen = new Set();
      for (const device of Array.isArray(devices) ? devices : []) {
        if (Number.isInteger(device?.id)) {
          seen.add(device.id);
          await this.#applyDevice(device);
        }
      }
      let removed = false;
      for (const id of [...this.trackers.keys()]) {
        if (!seen.has(id)) {
          this.trackers.delete(id);
          removed = true;
        }
      }
      for (const position of Array.isArray(positions) ? positions : []) {
        if (this.trackers.has(position?.deviceId)) {
          await this.#applyPosition(position);
        }
      }
      await this.#recovered(initial);
      await this.publishDevices({ force: initial || removed });
      await this.publishAllStates();
      this.refreshWidget();
    } catch (err) {
      await this.#failed(err);
    }
  }

  async #refreshGeofences() {
    try {
      const before = JSON.stringify([...this.geofences]);
      this.#setGeofences(await this.client.getGeofences());
      if (JSON.stringify([...this.geofences]) !== before) {
        await this.publishAllStates();
        this.refreshWidget();
      }
    } catch (err) {
      logger.debug(`Geofences not refreshed (${err.message})`);
    }
  }

  #setGeofences(list) {
    this.geofences = new Map(
      (Array.isArray(list) ? list : [])
        .filter((g) => Number.isInteger(g?.id) && typeof g.name === 'string')
        .map((g) => [g.id, g.name.trim() || `#${g.id}`]),
    );
  }

  async #onPushOpen() {
    logger.debug('Push link open');
    // Catch up with what happened while the socket was down.
    await this.#serialized(() => this.#refresh());
  }

  async #onFrame(frame) {
    let structure = false;
    const touched = new Set();
    for (const device of Array.isArray(frame.devices) ? frame.devices : []) {
      if (!Number.isInteger(device?.id)) {
        continue;
      }
      structure ||= !this.trackers.has(device.id);
      await this.#applyDevice(device);
      touched.add(device.id);
    }
    for (const position of Array.isArray(frame.positions) ? frame.positions : []) {
      if (!this.trackers.has(position?.deviceId)) {
        continue;
      }
      structure ||= await this.#applyPosition(position);
      touched.add(position.deviceId);
    }
    if (Array.isArray(frame.events) && frame.events.length > 0) {
      logger.debug(`${frame.events.length} Traccar event(s) received (triggers use the positions)`);
    }
    if (structure) {
      await this.publishDevices();
    }
    for (const id of touched) {
      await this.#publishTracker(id);
    }
  }

  /** @returns {boolean} whether the tracker is new */
  async #applyDevice(device) {
    const tracker = this.trackers.get(device.id);
    if (!tracker) {
      this.trackers.set(device.id, {
        device,
        position: null,
        optional: this.#knownOptional(device.id),
      });
      return true;
    }
    const before = statusOf(tracker.device);
    tracker.device = { ...tracker.device, ...device };
    const after = statusOf(tracker.device);
    if (before !== after) {
      logger.debug(`Tracker ${device.id}: ${before} -> ${after}`);
      this.refreshWidget();
      if (after === 'offline') {
        await this.#fire(TRIGGERS.offline, tracker, {
          last_update: formatTime(tracker.device.lastUpdate, this.config.language, this.now()),
        });
      }
    }
    return false;
  }

  /** @returns {boolean} whether the device structure changed (a new feature) */
  async #applyPosition(position) {
    const tracker = this.trackers.get(position.deviceId);
    const previous = tracker.position;
    if (previous && Number.isInteger(previous.id) && position.id <= previous.id) {
      return false; // the same fix again (socket greeting, REST snapshot)
    }
    tracker.position = position;
    const view = this.view(tracker);
    let structure = false;
    for (const key of reportedKeys(view)) {
      if (!tracker.optional.has(key)) {
        tracker.optional.add(key);
        structure = true;
      }
    }
    if (!previous) {
      return structure; // the first fix known: nothing to compare with
    }

    const before = zoneIdsOf(previous);
    const after = view.zoneIds;
    const name = (id) => this.geofences.get(id) ?? `#${id}`;
    const common = { address: view.address ?? '', map_url: mapUrl(view) };
    for (const id of before.filter((id) => !after.includes(id))) {
      await this.#fire(TRIGGERS.exit, tracker, { geofence: name(id), ...common });
    }
    for (const id of after.filter((id) => !before.includes(id))) {
      await this.#fire(TRIGGERS.enter, tracker, { geofence: name(id), ...common });
    }
    if (before.join() !== after.join()) {
      this.refreshWidget();
    }
    for (const alarm of alarmsOf(position)) {
      logger.info(`Alarm "${alarm}" on tracker ${tracker.device.id}`);
      await this.#fire(TRIGGERS.alarm, tracker, {
        alarm,
        alarm_label: alarmLabel(alarm, this.config.language),
        map_url: common.map_url,
      });
    }
    if (view.atHome) {
      await this.#pingPresence(tracker, view, { force: true });
    }
    return structure;
  }

  /** Optional features the tracker already has in Gladys (never dropped). */
  #knownOptional(trackerId) {
    const created = this.#createdDevice(trackerId);
    const keys = (created?.features ?? []).map((f) => featureKeyOf(f.external_id));
    return new Set(keys.filter((key) => OPTIONAL_KEYS.includes(key)));
  }

  #createdDevice(trackerId) {
    const id = deviceIds(this.gladys, trackerId).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === id) ?? null;
  }

  view(tracker) {
    return viewOf(tracker, { geofences: this.geofences, house: this.house, config: this.config });
  }

  /** The tracker of a Gladys device external id, or null. */
  trackerOf(externalId) {
    for (const tracker of this.trackers.values()) {
      if (deviceIds(this.gladys, tracker.device.id).device === externalId) {
        return tracker;
      }
    }
    return null;
  }

  // --- scene events ----------------------------------------------------------

  async #fire(key, tracker, data) {
    // Only the trackers added to Gladys fire: a scene "any tracker" must not
    // run for one the user left out.
    if (!this.#createdDevice(tracker.device.id)) {
      return;
    }
    const event = {
      device: deviceIds(this.gladys, tracker.device.id).device,
      tracker: this.view(tracker).name,
      ...data,
    };
    logger.debug(`Scene event ${key} for tracker ${tracker.device.id}`);
    try {
      await this.gladys.publishSceneEvent(key, event);
    } catch (err) {
      logger.error(`Scene event ${key} refused by Gladys`, err);
    }
  }

  // --- presence --------------------------------------------------------------

  async #pingPresences() {
    for (const tracker of this.trackers.values()) {
      const view = this.view(tracker);
      if (view.atHome) {
        await this.#pingPresence(tracker, view);
      }
    }
  }

  /**
   * "Seen at home": a presence-sensor/push value, at each fix at home and
   * then every 5 minutes while the last fix is recent enough. A phone that
   * stopped reporting stops pinging, and Gladys' "Check user presence" marks
   * the user away after the delay chosen in the scene.
   */
  async #pingPresence(tracker, view, { force = false } = {}) {
    const created = this.#createdDevice(tracker.device.id);
    const ids = deviceIds(this.gladys, tracker.device.id);
    if (!created?.features?.some((f) => f.external_id === ids.feature('presence'))) {
      return;
    }
    const now = this.now();
    const fix = Date.parse(view.fixTime ?? '');
    if (!Number.isFinite(fix) || now - fix > this.config.presenceMaxAge * 60_000) {
      return;
    }
    const last = this.lastPresence.get(tracker.device.id) ?? 0;
    if (!force && now - last < this.timings.presenceEvery) {
      return;
    }
    if (force && now - last < 60_000) {
      return; // several fixes in a row at home: one ping a minute is plenty
    }
    this.lastPresence.set(tracker.device.id, now);
    try {
      await this.gladys.publishState(ids.feature('presence'), 1);
    } catch (err) {
      logger.warn(`Presence of tracker ${tracker.device.id} not sent (${err.message})`);
    }
  }

  // --- Gladys publishing -----------------------------------------------------

  /** The discovered devices; only sent again when their structure changed. */
  async publishDevices({ force = false } = {}) {
    const hasHouse = this.house !== null;
    const hasHome = this.config ? homeModeOf(this.config, this.house) !== null : false;
    const devices = [...this.trackers.values()]
      .sort((a, b) => a.device.id - b.device.id)
      .map((tracker) =>
        buildDevice(this.gladys, this.view(tracker), {
          language: this.config?.language ?? 'fr',
          optional: tracker.optional,
          hasHouse,
          hasHome,
        }),
      );
    const signature = JSON.stringify(devices);
    if (!force && signature === this.lastDevicesSignature) {
      return;
    }
    this.lastDevicesSignature = signature;
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** The states of one tracker, for the features its Gladys device has. */
  #statesOf(tracker) {
    const created = this.#createdDevice(tracker.device.id);
    if (!created) {
      return [];
    }
    const keys = new Set((created.features ?? []).map((f) => featureKeyOf(f.external_id)));
    return buildStates(this.gladys, this.view(tracker), { language: this.config.language, keys });
  }

  async #publishTracker(id) {
    const tracker = this.trackers.get(id);
    if (tracker) {
      await this.#publish(this.#statesOf(tracker));
    }
  }

  async publishAllStates(options) {
    const states = [...this.trackers.values()].flatMap((tracker) => this.#statesOf(tracker));
    await this.#publish(states, options);
  }

  async #publish(states, options) {
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, options);
    } catch (err) {
      logger.warn(`States not accepted by Gladys (${err.message}), sent again next time`);
    }
  }

  /** A device was added in Gladys: its states, and the widget. */
  async onDeviceCreated(device) {
    await this.#serialized(async () => {
      for (const tracker of this.trackers.values()) {
        if (deviceIds(this.gladys, tracker.device.id).device === device?.external_id) {
          this.gladys.forgetPublishedStates?.(device.external_id);
          await this.#publish(this.#statesOf(tracker));
          const view = this.view(tracker);
          if (view.atHome) {
            this.lastPresence.delete(tracker.device.id);
            await this.#pingPresence(tracker, view);
          }
        }
      }
    });
    this.refreshWidget({ now: true });
  }

  /** onPoll fallback (the devices say should_poll: false). */
  async poll(device) {
    const tracker = this.trackerOf(device?.external_id);
    if (tracker) {
      await this.#publish(this.#statesOf(tracker));
    }
  }

  async scan() {
    await this.publishDevices({ force: true });
  }

  /** requestWidgetRefresh, at most once every 10 s (later calls are merged). */
  refreshWidget({ now = false } = {}) {
    if (this.stopped) {
      return;
    }
    const wait = this.lastWidgetRefresh + this.timings.widgetGap - this.now();
    if (now || wait <= 0) {
      clearTimeout(this.widgetTimer);
      this.widgetTimer = null;
      this.lastWidgetRefresh = this.now();
      Promise.resolve(this.gladys.requestWidgetRefresh(WIDGET_KEY)).catch(() => {});
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  // --- connection status -----------------------------------------------------

  async #failed(err) {
    const code = err instanceof TraccarError ? err.code : 'error';
    const status = ['unauthorized', 'unreachable'].includes(code) ? code : 'error';
    if (this.problem !== status) {
      // One line per outage, not one per attempt.
      logger.warn(`Traccar: ${err.message}`);
      this.problem = status;
    } else {
      logger.debug(`Traccar still failing: ${err.message}`);
    }
    await this.#reportStatus(status);
    if (this.trackers.size === 0) {
      await this.publishDevices();
    }
  }

  async #recovered(initial) {
    if (this.problem !== null || initial) {
      const version = this.server?.version ?? '?';
      logger.info(
        `${this.problem ? 'Traccar is back' : 'Connected to Traccar'} ${version}: ${this.trackers.size} tracker(s)`,
      );
    }
    this.problem = null;
    await this.#reportStatus(null);
  }

  async #reportStatus(code) {
    if (this.reported === code) {
      return;
    }
    this.reported = code;
    try {
      if (code === null) {
        await this.gladys.setConnectionStatus(true);
      } else {
        const message = Object.fromEntries(
          Object.entries(STATUS_TEXT).map(([language, texts]) => [language, texts[code]]),
        );
        await this.gladys.setConnectionStatus(false, message);
      }
    } catch (err) {
      this.reported = undefined;
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async reportInitFailed() {
    await this.gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
  }

  // --- "Test the connection" button -------------------------------------------

  async testReport() {
    const config = this.config;
    const fail = (code) =>
      Object.fromEntries(Object.entries(STATUS_TEXT).map(([language, t]) => [language, t[code]]));
    if (!config || !isConfigured(config)) {
      return fail(config?.invalidUrl ? 'invalid_url' : 'not_configured');
    }
    const client = new TraccarClient({
      url: config.url,
      token: config.token,
      email: config.email,
      password: config.password,
      fetch: this.fetch,
    });
    try {
      const [server, devices, geofences] = await Promise.all([
        client.getServer(),
        client.getDevices(),
        client.getGeofences(),
      ]);
      logger.info('Connection test: success');
      return Object.fromEntries(
        Object.entries(TEST_TEXT).map(([language, t]) => [
          language,
          t.ok(server?.version ?? '?', devices.length, geofences.length),
        ]),
      );
    } catch (err) {
      logger.info(`Connection test: ${err.message}`);
      const code = err instanceof TraccarError ? err.code : 'error';
      return fail(['unauthorized', 'unreachable'].includes(code) ? code : 'error');
    }
  }
}

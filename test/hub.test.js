// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Traccar: devices, states,
// scene events derived from the positions, presence pings, REST fallback,
// session expiry, connection status and quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AWAY,
  createTraccar,
  EMAIL,
  HOME,
  network,
  PASSWORD,
  position,
  settle,
  TOKEN,
  WORK,
} from './helpers/fakeTraccar.js';
import { createWorld, deviceId, featureId } from './helpers/world.js';

process.env.TZ = 'UTC';

/** Captures the SDK logger's lines (console.log for debug/info, console.error above). */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    lines,
    take() {
      return lines.splice(0);
    },
  };
}

const lastText = (gladys, id, key) => gladys.fake.lastState(featureId(id, key));

test('publishes one device per tracker and the states of the added ones', async (t) => {
  const { gladys, app } = await createWorld();
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const ids = gladys.fake.discoveredDevices.map((d) => d.external_id).sort();
  assert.deepEqual(ids, [deviceId(1), deviceId(2)]);
  // The phone is at work (geofence 2), 4.1 km from the Gladys house.
  assert.deepEqual(lastText(gladys, 1, 'zone'), 'Work');
  assert.deepEqual(lastText(gladys, 1, 'status'), 'En ligne');
  assert.equal(lastText(gladys, 1, 'distance_home'), 4.1);
  assert.equal(lastText(gladys, 1, 'at_home'), 0);
  assert.equal(lastText(gladys, 1, 'battery'), 86);
  // Traccar speaks knots: 5 kn = 9.3 km/h.
  assert.equal(lastText(gladys, 1, 'speed'), 9.3);
  assert.deepEqual(lastText(gladys, 2, 'zone'), 'Hors zone');
  assert.deepEqual(lastText(gladys, 1, 'last_update'), '15/10 14:08');
  for (const device of gladys.fake.discoveredDevices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('no state for a tracker the user did not add, and its states once added', async (t) => {
  const { gladys, app } = await createWorld({ devices: 'none' });
  t.after(() => app.stop());
  assert.equal(gladys.fake.states.length, 0);
  const phone = gladys.fake.discoveredDevices.find((d) => d.external_id === deviceId(1));
  await gladys.fake.deviceCreated(structuredClone(phone));
  await settle();
  assert.deepEqual(lastText(gladys, 1, 'zone'), 'Work');
  assert.equal(lastText(gladys, 2, 'zone'), undefined);
  assert.ok(gladys.fake.widgetRefreshes.includes('trackers'));
});

test('entering and leaving geofences fire the triggers, at home pings the presence', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  gladys.fake.sceneEvents.length = 0;

  traccar.addPosition(position(1, { ...HOME, geofenceIds: [1], address: '1 Home Street' }));
  await settle(20);
  const events = gladys.fake.sceneEvents.map((e) => [e.key, e.data.geofence]);
  assert.deepEqual(events, [
    ['geofence_exit', 'Work'],
    ['geofence_enter', 'Home'],
  ]);
  const enter = gladys.fake.sceneEvents[1].data;
  assert.equal(enter.device, deviceId(1));
  assert.equal(enter.tracker, 'Phone Alice');
  assert.equal(enter.address, '1 Home Street');
  assert.match(enter.map_url, /^https:\/\/www\.openstreetmap\.org\/\?mlat=48\.85660&mlon=2\.35220/);

  assert.deepEqual(lastText(gladys, 1, 'zone'), 'Home');
  assert.equal(lastText(gladys, 1, 'at_home'), 1);
  assert.equal(lastText(gladys, 1, 'distance_home'), 0);
  assert.equal(lastText(gladys, 1, 'presence'), 1);

  // The same fix again (socket greeting, REST snapshot): nothing fires.
  traccar.push({ positions: traccar.positions });
  await settle(20);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('an alarm fires once per position, with its label in the configured language', async (t) => {
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({
    traccar,
    config: { url: traccar.url, token: TOKEN, language: 'en' },
  });
  t.after(() => app.stop());
  // The fixture position of the car already holds an SOS: a stale alarm,
  // read at start, never fires.
  assert.equal(gladys.fake.sceneEvents.length, 0);

  const alarm = position(2, { ...AWAY, attributes: { alarm: 'lowBattery,overspeed' } });
  traccar.addPosition(alarm);
  traccar.push({ positions: [alarm] });
  await settle(20);
  const fired = gladys.fake.sceneEvents.filter((e) => e.key === 'alarm');
  assert.deepEqual(
    fired.map((e) => [e.data.alarm, e.data.alarm_label, e.data.tracker]),
    [
      ['lowBattery', 'Low battery', 'Car'],
      ['overspeed', 'Overspeed', 'Car'],
    ],
  );
});

test('an alarm repeated on every message fires once', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  for (let i = 0; i < 3; i += 1) {
    traccar.addPosition(
      position(1, { ...WORK, geofenceIds: [2], attributes: { alarm: 'powerCut' } }),
    );
  }
  await settle(20);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'alarm').length, 1);
});

test('a message without a fix keeps the last position: no false exit', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  traccar.addPosition(position(1, { latitude: 0, longitude: 0 }));
  await settle(20);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(lastText(gladys, 1, 'zone'), 'Work');
});

test('a geofence created meanwhile is named in the trigger', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  traccar.geofences.push({ id: 7, attributes: {}, calendarId: 0, name: 'School', area: 'x' });
  traccar.addPosition(position(1, { ...AWAY, geofenceIds: [7] }));
  await settle(20);
  const enter = gladys.fake.sceneEvents.find((e) => e.key === 'geofence_enter');
  assert.equal(enter.data.geofence, 'School');
});

test('continuous values of a moving tracker are sent at most every period', async (t) => {
  let clock = Date.parse('2026-10-15T14:00:00Z');
  const { gladys, app, traccar } = await createWorld({
    now: () => clock,
    timings: { continuousGap: 30_000 },
  });
  t.after(() => app.stop());
  const speeds = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === featureId(2, 'speed'));
  const before = speeds().length;
  for (let i = 1; i <= 5; i += 1) {
    clock += 5_000;
    traccar.addPosition(position(2, { ...AWAY, speed: i * 10 }));
    await settle(10);
  }
  assert.ok(speeds().length - before <= 1, `${speeds().length - before} speed states`);
  // The zone goes at once.
  traccar.addPosition(position(2, { ...WORK, geofenceIds: [2], speed: 1 }));
  await settle(10);
  assert.equal(lastText(gladys, 2, 'zone'), 'Work');
});

test('a phone that stops reporting (unknown) fires the offline trigger once', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  traccar.updateDevice(1, { status: 'unknown' });
  traccar.updateDevice(1, { status: 'offline' });
  await settle(20);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    ['tracker_offline'],
  );
});

test('a tracker going offline fires its trigger, and only for added trackers', async (t) => {
  const { gladys, app, traccar } = await createWorld({ devices: 'none' });
  t.after(() => app.stop());
  const car = gladys.fake.discoveredDevices.find((d) => d.external_id === deviceId(2));
  await gladys.fake.deviceCreated(structuredClone(car));
  traccar.updateDevice(1, { status: 'offline' });
  traccar.updateDevice(2, { status: 'offline' });
  await settle(20);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [e.key, e.data.device]),
    [['tracker_offline', deviceId(2)]],
  );
  assert.deepEqual(lastText(gladys, 2, 'status'), 'Hors ligne');
  // Back online, then offline again: a second event.
  traccar.updateDevice(2, { status: 'online' });
  traccar.updateDevice(2, { status: 'offline' });
  await settle(20);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a home geofence replaces the radius around the Gladys house', async (t) => {
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({
    traccar,
    houses: [],
    config: { url: traccar.url, token: TOKEN, home_geofence: 'work' },
  });
  t.after(() => app.stop());
  const phone = gladys.fake.discoveredDevices.find((d) => d.external_id === deviceId(1));
  assert.ok(!phone.features.some((f) => f.external_id.endsWith(':distance_home')));
  assert.ok(phone.features.some((f) => f.external_id.endsWith(':presence')));
  // Case-insensitive match on the geofence name "Work".
  assert.equal(lastText(gladys, 1, 'at_home'), 1);
  assert.equal(lastText(gladys, 2, 'at_home'), 0);
});

test('without a house nor a home geofence, no home features', async (t) => {
  const { gladys, app } = await createWorld({ houses: [] });
  t.after(() => app.stop());
  for (const device of gladys.fake.discoveredDevices) {
    const keys = device.features.map((f) => f.external_id.split(':').pop());
    for (const key of ['distance_home', 'at_home', 'presence']) {
      assert.ok(!keys.includes(key), key);
    }
  }
});

test('the house is picked by name, else the first located one', async (t) => {
  const houses = [
    { id: 'a', name: 'Appartement', selector: 'a', latitude: null, longitude: null },
    { id: 'b', name: 'Chalet', selector: 'b', latitude: 45.9, longitude: 6.87 },
    { id: 'c', name: 'Maison', selector: 'c', latitude: 48.8566, longitude: 2.3522 },
  ];
  const first = await createWorld({ houses });
  t.after(() => first.app.stop());
  assert.equal(first.hub.house.name, 'Chalet');
  const traccar = createTraccar();
  const named = await createWorld({
    traccar,
    houses,
    config: { url: traccar.url, token: TOKEN, house: 'maison' },
  });
  t.after(() => named.app.stop());
  assert.equal(named.hub.house.name, 'Maison');
});

test('presence pings repeat while the last fix at home is recent, then stop', async (t) => {
  let clock = Date.parse('2026-10-15T14:00:00Z');
  const traccar = createTraccar();
  const { gladys, app, hub } = await createWorld({
    traccar,
    now: () => clock,
    timings: { presenceCheck: 10 },
  });
  t.after(() => app.stop());
  const pings = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === featureId(1, 'presence'))
      .length;
  traccar.addPosition(
    position(1, { ...HOME, geofenceIds: [1], fixTime: new Date(clock).toISOString() }),
  );
  await settle(20);
  assert.equal(pings(), 1);
  clock += 4 * 60_000;
  await settle(30);
  assert.equal(pings(), 1, 'not before 5 minutes');
  clock += 2 * 60_000;
  await settle(30);
  assert.equal(pings(), 2);
  // 31 minutes after the last fix (presence_max_age 30): no more pings.
  clock += 25 * 60_000;
  await settle(30);
  assert.equal(pings(), 2);
  assert.equal(hub.view(hub.trackers.get(1)).atHome, true);
});

test('while the socket is down, the REST API is read, and a missed crossing still fires', async (t) => {
  const traccar = createTraccar();
  const net = network(traccar);
  let socketsAllowed = true;
  const { gladys, app } = await createWorld({
    traccar,
    timings: { fallbackInterval: 20 },
  });
  t.after(() => app.stop());
  // The socket of this world uses the default factory of the network; cut it.
  app.hub.link.createSocket = (url, headers) => {
    if (!socketsAllowed) {
      throw new Error('refused');
    }
    return net.createSocket(url, headers);
  };
  socketsAllowed = false;
  traccar.dropSockets();
  await settle(10);
  // A fix nobody pushes: only the REST fallback can see it.
  traccar.positions = [
    ...traccar.positions.filter((p) => p.deviceId !== 1),
    position(1, { ...HOME, geofenceIds: [1] }),
  ];
  await settle(60);
  assert.deepEqual(lastText(gladys, 1, 'zone'), 'Home');
  assert.ok(gladys.fake.sceneEvents.some((e) => e.key === 'geofence_enter'));
  socketsAllowed = true;
  await settle(80);
  assert.equal(app.hub.link.live, true, 'the socket came back');
});

test('an expired session is opened again, transparently', async (t) => {
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({ traccar, timings: { fallbackInterval: 20 } });
  t.after(() => app.stop());
  const sessions = traccar.sessionCount;
  traccar.expireSession();
  traccar.dropSockets();
  traccar.positions = [
    ...traccar.positions.filter((p) => p.deviceId !== 1),
    position(1, { ...AWAY }),
  ];
  await settle(80);
  assert.ok(traccar.sessionCount > sessions);
  assert.deepEqual(lastText(gladys, 1, 'zone'), 'Hors zone');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('email and password work as well as a token', async (t) => {
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({
    traccar,
    config: { url: traccar.url, email: EMAIL, password: PASSWORD },
  });
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('a refused token is reported once, in four languages, without the token', async (t) => {
  const logs = captureLogs(t);
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({
    traccar,
    config: { url: traccar.url, token: 'wrong-token-value' },
    timings: { fallbackInterval: 10 },
  });
  t.after(() => app.stop());
  await settle(60);
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(status.message.fr, /refusé le jeton/);
  const warnings = logs.lines.filter((line) => /WARN/.test(line));
  assert.equal(warnings.length, 1, logs.lines.join('\n'));
  assert.ok(logs.lines.every((line) => !line.includes('wrong-token-value')));
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('an empty configuration says what to fill in, and asks nothing of the network', async (t) => {
  const traccar = createTraccar();
  const { gladys, app } = await createWorld({ traccar, config: {} });
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /address of Traccar/);
  assert.equal(traccar.requests.length, 0);
  const bad = await createWorld({ traccar, config: { url: 'ftp://nope', token: TOKEN } });
  t.after(() => bad.app.stop());
  assert.match(bad.gladys.fake.connectionStatus.message.en, /not valid/);
});

test('two quick configuration changes leave one push link', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  await Promise.all([
    gladys.fake.configUpdated({ url: traccar.url, token: TOKEN, language: 'en' }),
    gladys.fake.configUpdated({ url: traccar.url, token: TOKEN, language: 'de' }),
  ]);
  await settle(40);
  assert.equal(traccar.sockets.size, 1);
  assert.equal(app.hub.config.language, 'de');
});

test('refused credentials are not retried every 30 seconds', async (t) => {
  const traccar = createTraccar();
  const { app } = await createWorld({
    traccar,
    config: { url: traccar.url, token: 'wrong' },
    timings: { fallbackInterval: 5, unauthorizedRetry: 60_000 },
  });
  t.after(() => app.stop());
  const logins = () => traccar.requests.filter((r) => r.path === '/api/session').length;
  await settle(20);
  const count = logins();
  await settle(60);
  // Only the socket retries (growing delay) may still log in.
  assert.ok(logins() - count <= 3, `${logins() - count} logins`);
});

test('a new configuration reconnects with it', async (t) => {
  const first = createTraccar();
  const second = createTraccar({ host: '192.0.2.11' });
  const net = network(first, second);
  const { gladys, app } = await createWorld({ traccar: first });
  t.after(() => app.stop());
  app.hub.fetch = net.fetch;
  app.hub.createSocket = net.createSocket;
  second.devices = second.devices.filter((d) => d.id === 1);
  await gladys.fake.configUpdated({ url: second.url, token: TOKEN });
  await settle(20);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [deviceId(1)],
  );
  assert.ok(second.requests.length > 0);
});

test('a normal cycle writes nothing at info level; an outage one line, its end one', async (t) => {
  const logs = captureLogs(t);
  const traccar = createTraccar();
  const { app } = await createWorld({ traccar, timings: { fallbackInterval: 15 } });
  t.after(() => app.stop());
  const start = logs.take();
  assert.ok(start.some((line) => /\[INFO\].*Connected to Traccar 6\.16\.0/.test(line)));
  for (let i = 0; i < 5; i += 1) {
    traccar.addPosition(position(1, { ...WORK, geofenceIds: [2], speed: i }));
    traccar.updateDevice(1, { lastUpdate: new Date().toISOString() });
  }
  await settle(30);
  assert.deepEqual(logs.take(), []);

  traccar.up = false;
  traccar.dropSockets();
  await settle(80);
  const outage = logs.take();
  assert.equal(outage.length, 1, outage.join('\n'));
  assert.match(outage[0], /WARN.*unreachable/);
  traccar.up = true;
  await settle(80);
  const back = logs.take();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /INFO.*Traccar is back/);
  // Never a coordinate in the logs.
  assert.ok(logs.lines.every((line) => !/48\.8|2\.35/.test(line)));
});

test('a heartbeat re-sends unchanged values', async (t) => {
  const { gladys, app } = await createWorld({
    timings: { heartbeatCheck: 20, heartbeat: 1 },
  });
  t.after(() => app.stop());
  const count = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === featureId(2, 'zone')).length;
  const before = count();
  await settle(50);
  assert.ok(count() > before);
});

test('onPoll re-sends the states of a device', async (t) => {
  const { gladys, app } = await createWorld();
  t.after(() => app.stop());
  gladys.forgetPublishedStates();
  const device = gladys.fake.discoveredDevices[0];
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.ok(gladys.fake.states.length > 0);
});

test('a new tracker in Traccar shows up in the discovered devices', async (t) => {
  const { gladys, app, traccar } = await createWorld();
  t.after(() => app.stop());
  const bike = { ...traccar.devices[0], id: 3, name: 'Bike', uniqueId: '100003' };
  traccar.devices.push(bike);
  traccar.push({ devices: [bike] });
  await settle(20);
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id === deviceId(3)));
});

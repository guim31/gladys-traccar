// -----------------------------------------------------------------------------
// Traccar device -> Gladys device, and tracker view -> feature states.
//
// One Gladys device per Traccar device, keyed on the Traccar device id (the
// `uniqueId` is the hardware identifier the user may edit in Traccar; the id
// never changes for the life of the device).
//
// Couples chosen among those the Gladys front knows (test/gladys-rules.test.js):
// - status, last update, zone, address: text/text;
// - speed: speed-sensor/decimal in km/h; battery: battery/integer;
// - moving: motion-sensor/binary; ignition: input/binary (no ignition couple);
// - distance from home: distance-sensor/decimal in km;
// - at home: presence-sensor/binary, a state scenes can test and trigger on;
// - presence: presence-sensor/push, the couple the core's "Check user
//   presence" scene action reads (a value received in the last N minutes means
//   "seen at home"), like the Bluetooth presence of the core.
// Battery, moving, ignition and address only exist when the tracker reports
// them; distance needs a located Gladys house, at home and presence a home rule.
//
// Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { formatTime, NAMES, STATUS_LABELS, ZONE_TEXT } from './texts.js';

export const DEVICE_TYPE = 'tracker';

export const OPTIONAL_KEYS = ['battery', 'motion', 'ignition', 'address'];

export const MAX_SPEED_KMH = 400;
export const MAX_DISTANCE_KM = 20_040; // half the Earth's circumference

export function deviceIds(gladys, trackerId) {
  return gladys.externalIds(DEVICE_TYPE, String(trackerId));
}

/** The feature key of a feature external id (`...:tracker:12:zone` -> `zone`). */
export function featureKeyOf(externalId) {
  return externalId.slice(externalId.lastIndexOf(':') + 1);
}

/** The optional keys a view reports right now. */
export function reportedKeys(view) {
  const keys = [];
  if (view.battery !== null) keys.push('battery');
  if (view.motion !== null) keys.push('motion');
  if (view.ignition !== null) keys.push('ignition');
  if (view.address !== null) keys.push('address');
  return keys;
}

/**
 * @param {object} gladys
 * @param {object} view the tracker view (model.viewOf)
 * @param {{ language: string, optional: Set<string>, hasHouse: boolean, hasHome: boolean }} options
 */
export function buildDevice(gladys, view, { language, optional, hasHouse, hasHome }) {
  const names = NAMES[language] ?? NAMES.en;
  const ids = deviceIds(gladys, view.id);
  const feature = (key, fields) => ({
    name: names[key],
    external_id: ids.feature(key),
    selector: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
  const text = { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 };
  const binary = (category) => ({ category, type: TYPE.SENSOR.BINARY, min: 0, max: 1 });

  const features = [
    feature('status', text),
    feature('last_update', text),
    feature('zone', text),
    feature('speed', {
      category: CAT.SPEED_SENSOR,
      type: TYPE.SENSOR.DECIMAL,
      unit: UNIT.KILOMETER_PER_HOUR,
      min: 0,
      max: MAX_SPEED_KMH,
    }),
  ];
  if (optional.has('battery')) {
    features.push(
      feature('battery', {
        category: CAT.BATTERY,
        type: TYPE.BATTERY.INTEGER,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
      }),
    );
  }
  if (optional.has('motion')) {
    features.push(feature('motion', binary(CAT.MOTION_SENSOR)));
  }
  if (optional.has('ignition')) {
    features.push(feature('ignition', binary(CAT.INPUT)));
  }
  if (optional.has('address')) {
    features.push(feature('address', text));
  }
  if (hasHouse) {
    features.push(
      feature('distance_home', {
        category: CAT.DISTANCE_SENSOR,
        type: TYPE.SENSOR.DECIMAL,
        unit: UNIT.KM,
        min: 0,
        max: MAX_DISTANCE_KM,
      }),
    );
  }
  if (hasHome) {
    features.push(feature('at_home', binary(CAT.PRESENCE_SENSOR)));
    features.push(
      feature('presence', {
        category: CAT.PRESENCE_SENSOR,
        type: TYPE.SENSOR.PUSH,
        min: 0,
        max: 1,
      }),
    );
  }

  return {
    name: view.name.slice(0, 60),
    external_id: ids.device,
    selector: ids.device,
    model: 'Traccar',
    // Pushed by Traccar's socket (and a REST fallback): the core never polls.
    should_poll: false,
    features,
  };
}

/** The zone text of a view. */
export function zoneText(view, language) {
  const texts = ZONE_TEXT[language] ?? ZONE_TEXT.en;
  if (!view.hasPosition) {
    return texts.no_position;
  }
  return view.zones.length > 0 ? view.zones.join(', ').slice(0, 250) : texts.none;
}

/**
 * The states of a view, for the features the device has (`keys`). The
 * presence push is not here: it is a "seen" ping, sent by the hub.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function buildStates(gladys, view, { language, keys }) {
  const ids = deviceIds(gladys, view.id);
  const states = [];
  const add = (key, value) => {
    if (!keys.has(key) || value === null || value === undefined) {
      return;
    }
    if (typeof value === 'string') {
      if (value !== '') {
        states.push({ device_feature_external_id: ids.feature(key), text: value });
      }
      return;
    }
    states.push({ device_feature_external_id: ids.feature(key), state: value });
  };
  const labels = STATUS_LABELS[language] ?? STATUS_LABELS.en;

  add('status', labels[view.status]);
  if (view.lastUpdate) {
    add('last_update', formatTime(view.lastUpdate, language, null));
  }
  add('zone', zoneText(view, language));
  if (view.hasPosition) {
    add('speed', view.speedKmh === null ? null : Math.round(view.speedKmh * 10) / 10);
    add('address', view.address);
    if (view.distanceKm !== null) {
      add('distance_home', Math.round(view.distanceKm * 10) / 10);
    }
    if (view.atHome !== null) {
      add('at_home', view.atHome ? 1 : 0);
    }
  }
  add('battery', view.battery === null ? null : Math.round(view.battery));
  add('motion', view.motion === null ? null : Number(view.motion));
  add('ignition', view.ignition === null ? null : Number(view.ignition));
  return states;
}

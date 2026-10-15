// -----------------------------------------------------------------------------
// What the integration knows of one Traccar device (a "tracker"): its device
// object and latest position, as Traccar sends them, turned into a plain view
// the devices, the widget and the scene action share.
//
// Units of Traccar's API: speed in knots, whatever the protocol;
// `attributes.batteryLevel` in percent; `geofenceIds` null outside any zone.
// -----------------------------------------------------------------------------

export const KNOT_IN_KMH = 1.852;
const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in kilometers. */
export function haversineKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const STATUSES = ['online', 'offline', 'unknown'];

export function statusOf(device) {
  return STATUSES.includes(device?.status) ? device.status : 'unknown';
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function hasCoordinates(position) {
  return (
    position &&
    finite(position.latitude) &&
    finite(position.longitude) &&
    // 0,0 is what Traccar stores for a fix-less message.
    !(position.latitude === 0 && position.longitude === 0)
  );
}

/** The geofence ids a position is in, as a sorted array. */
export function zoneIdsOf(position) {
  return Array.isArray(position?.geofenceIds)
    ? [...new Set(position.geofenceIds.filter(Number.isInteger))].sort((a, b) => a - b)
    : [];
}

/**
 * The home rule: a Traccar geofence named in the configuration, or else a
 * radius around the Gladys house. Null when neither is available.
 * @param {{ homeGeofence: string, homeRadius: number }} config
 * @param {{ latitude: number, longitude: number } | null} house
 */
export function homeModeOf(config, house) {
  if (config.homeGeofence) {
    return 'geofence';
  }
  return house ? 'house' : null;
}

/**
 * @param {{ device: object, position: object | null }} tracker
 * @param {{ geofences: Map<number, string>, house: object | null, config: object }} context
 */
export function viewOf(tracker, { geofences, house, config }) {
  const { device, position } = tracker;
  const located = hasCoordinates(position);
  const zoneIds = located ? zoneIdsOf(position) : [];
  const zones = zoneIds.map((id) => geofences.get(id)).filter(Boolean);
  const attributes = position?.attributes ?? {};
  const distanceKm = located && house ? haversineKm(position, house) : null;

  let atHome = null;
  const mode = homeModeOf(config, house);
  if (located && mode === 'geofence') {
    const wanted = config.homeGeofence.toLowerCase();
    atHome = zones.some((name) => name.toLowerCase() === wanted);
  } else if (located && mode === 'house') {
    atHome = distanceKm * 1000 <= config.homeRadius;
  }

  return {
    id: device.id,
    name:
      typeof device.name === 'string' && device.name.trim() ? device.name.trim() : `#${device.id}`,
    status: statusOf(device),
    lastUpdate: device.lastUpdate ?? null,
    hasPosition: located,
    positionId: position?.id ?? null,
    fixTime: located ? (position.fixTime ?? position.deviceTime ?? null) : null,
    latitude: located ? position.latitude : null,
    longitude: located ? position.longitude : null,
    zoneIds,
    zones,
    address:
      located && typeof position.address === 'string' && position.address.trim()
        ? position.address.trim()
        : null,
    speedKmh: located && finite(position.speed) ? position.speed * KNOT_IN_KMH : null,
    battery: finite(attributes.batteryLevel) ? attributes.batteryLevel : null,
    motion: typeof attributes.motion === 'boolean' ? attributes.motion : null,
    ignition: typeof attributes.ignition === 'boolean' ? attributes.ignition : null,
    distanceKm,
    atHome,
  };
}

/** A link the scene can send (OpenStreetMap, no account, no key). */
export function mapUrl(view) {
  if (!view.hasPosition) {
    return '';
  }
  const lat = view.latitude.toFixed(5);
  const lon = view.longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

/** The alarm types a position carries (`sos`, `lowBattery,overspeed`...). */
export function alarmsOf(position) {
  const raw = position?.attributes?.alarm;
  if (typeof raw !== 'string') {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(',')
        .map((alarm) => alarm.trim())
        .filter(Boolean),
    ),
  ];
}

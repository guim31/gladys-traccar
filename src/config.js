// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  url: '',
  token: '',
  email: '',
  password: '',
  house: '',
  home_geofence: '',
  home_radius: 150,
  presence_max_age: 30,
  language: 'fr',
};

// Bounds of the number fields (the manifest declares the same, see the tests).
export const LIMITS = {
  home_radius: { min: 20, max: 5000 },
  presence_max_age: { min: 5, max: 720 },
};

/**
 * Turn what the user typed into the base URL of Traccar: `192.0.2.10:8082`,
 * `traccar.home` or a full URL with a path (behind a reverse proxy). Without
 * a port nor a scheme, Traccar's default web port (8082) is assumed. Returns
 * null when it is not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  if (!hasScheme && url.port === '') {
    url.port = '8082';
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function integer(value, key) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return DEFAULT_CONFIG[key];
  }
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawUrl = text(source.url);
  return {
    url: normalizeUrl(rawUrl),
    invalidUrl: rawUrl !== '' && normalizeUrl(rawUrl) === null,
    token: text(source.token),
    email: text(source.email),
    // A password may legitimately start or end with a space.
    password: typeof source.password === 'string' ? source.password : '',
    house: text(source.house),
    homeGeofence: text(source.home_geofence),
    homeRadius: integer(source.home_radius ?? DEFAULT_CONFIG.home_radius, 'home_radius'),
    presenceMaxAge: integer(
      source.presence_max_age ?? DEFAULT_CONFIG.presence_max_age,
      'presence_max_age',
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** True when the configuration can open a Traccar session. */
export function isConfigured(config) {
  return Boolean(config.url && (config.token || (config.email && config.password)));
}

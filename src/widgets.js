// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `trackers`.
//
// Every tracker on one card, in a `card-list`: its name, its zone and the time
// of its last fix, its status as a colored badge. Tapping a tracker opens the
// detail panel of the core: address, speed, battery, distance from home and a
// map link (OpenStreetMap). No map in the card: the widget vocabulary of the
// core has none.
//
// In a `card-list`, a `date` replaces the subtitle (core front, v5.2.0): the
// time is written in the subtitle instead, next to the zone.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { zoneText } from './devices.js';
import { mapUrl } from './model.js';
import { WIDGET_KEY } from './hub.js';
import { formatDistance, formatTime, NAMES, STATUS_LABELS } from './texts.js';

export { WIDGET_KEY };

// A `list` card-list shows 8 items at most.
export const MAX_ITEMS = 8;

export const TEXT = {
  empty: {
    en: 'No tracker in Traccar yet, or Traccar is not connected.',
    fr: "Aucun traceur dans Traccar pour l'instant, ou Traccar n'est pas connecté.",
    de: 'Noch kein Tracker in Traccar, oder Traccar ist nicht verbunden.',
    es: 'Todavía no hay rastreadores en Traccar, o Traccar no está conectado.',
  },
  more: {
    en: '%d more tracker(s) not shown.',
    fr: '%d autre(s) traceur(s) non affiché(s).',
    de: '%d weitere(r) Tracker nicht angezeigt.',
    es: '%d rastreador(es) más no mostrado(s).',
  },
  map: { en: 'Map', fr: 'Carte', de: 'Karte', es: 'Mapa' },
};

const STATUS_COLORS = {
  online: WIDGET_COLORS.SUCCESS,
  offline: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

const pick = (table, language) => table[language] ?? table.en;

function detail(view, language) {
  const names = NAMES[language];
  // French typography: a space before the colon.
  const line = (key, value) => `${names[key]}${language === 'fr' ? ' : ' : ': '}${value}`;
  const lines = [];
  if (view.address) lines.push(line('address', view.address));
  if (view.speedKmh !== null) lines.push(line('speed', `${Math.round(view.speedKmh)} km/h`));
  if (view.battery !== null) lines.push(line('battery', `${Math.round(view.battery)} %`));
  if (view.distanceKm !== null) {
    lines.push(line('distance_home', formatDistance(view.distanceKm, language)));
  }
  if (view.lastUpdate) {
    lines.push(line('last_update', formatTime(view.lastUpdate, language, null)));
  }
  return lines.join('\n');
}

/**
 * @param {object} hub
 * @param {{ language?: string }} request
 */
export function buildContent(hub, { language = 'en' } = {}) {
  const lang = NAMES[language] ? language : 'en';
  const views = [...hub.trackers.values()]
    .map((tracker) => hub.view(tracker))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  if (views.length === 0) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.empty, lang) }],
    };
  }
  const now = hub.now();
  const items = views.slice(0, MAX_ITEMS).map((view) => {
    const time = view.fixTime ? formatTime(view.fixTime, lang, now) : '';
    const item = {
      title: view.name,
      subtitle: [zoneText(view, lang), time].filter(Boolean).join(' · '),
      badge: { text: STATUS_LABELS[lang][view.status], color: STATUS_COLORS[view.status] },
    };
    const description = detail(view, lang);
    if (description) {
      item.description = description;
    }
    if (view.hasPosition) {
      item.links = [{ url: mapUrl(view), label: pick(TEXT.map, lang) }];
    }
    return item;
  });
  const components = [{ type: 'card-list', display: 'list', items }];
  if (views.length > MAX_ITEMS) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: pick(TEXT.more, lang).replace('%d', String(views.length - MAX_ITEMS)),
    });
  }
  // The hub nudges the widget on every zone or status change: the TTL only
  // refreshes the times of the subtitles.
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get(hub, request) {
      return buildContent(hub, request ?? {});
    },
  },
};

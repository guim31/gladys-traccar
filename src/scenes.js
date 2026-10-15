// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// `get_position`: where is this tracker? A ready-made sentence for a message
// or a voice answer, and the raw values for conditions (`at_home`,
// `distance_km`...). Read from what the socket already pushed: no request to
// Traccar, instant.
// -----------------------------------------------------------------------------

import { mapUrl } from './model.js';
import { STATUS_LABELS, ACTION_ERRORS, formatTime, positionSentence } from './texts.js';
import { zoneText } from './devices.js';

export const SCENE_ACTIONS = {
  async get_position(hub, { fields = {} }) {
    const language = hub.config?.language ?? 'fr';
    const tracker = hub.trackerOf(fields.device);
    if (!tracker) {
      throw new Error((ACTION_ERRORS[language] ?? ACTION_ERRORS.en).unknown_tracker);
    }
    const view = hub.view(tracker);
    const now = hub.now();
    return {
      sentence: positionSentence(view, language, now),
      tracker: view.name,
      status: (STATUS_LABELS[language] ?? STATUS_LABELS.en)[view.status],
      zone: zoneText(view, language),
      address: view.address ?? '',
      at_home: view.atHome === true,
      distance_km: view.distanceKm === null ? -1 : Math.round(view.distanceKm * 10) / 10,
      speed_kmh: view.speedKmh === null ? 0 : Math.round(view.speedKmh),
      last_update: view.fixTime ? formatTime(view.fixTime, language, now) : '',
      map_url: mapUrl(view),
    };
  },
};

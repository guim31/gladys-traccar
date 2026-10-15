// -----------------------------------------------------------------------------
// The scene action `get_position` and the `trackers` widget, on the fake
// Gladys: outputs, sentences in the four languages, the widget content
// validated by the SDK (vocabulary and budget of the core).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createTraccar, HOME, position, settle, TOKEN } from './helpers/fakeTraccar.js';
import { createWorld, deviceId } from './helpers/world.js';
import { MAX_ITEMS } from '../src/widgets.js';

process.env.TZ = 'UTC';
const NOW = Date.parse('2026-10-15T15:00:00Z');

test('get_position: the sentence and the values of a tracker', async (t) => {
  const { gladys, app } = await createWorld({ now: () => NOW });
  t.after(() => app.stop());
  const ack = await gladys.fake.sceneAction('get_position', { device: deviceId(1) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    sentence: 'Phone Alice est dans la zone Work, à 4,1 km de la maison, position de 14:08.',
    tracker: 'Phone Alice',
    status: 'En ligne',
    zone: 'Work',
    address: '',
    at_home: false,
    distance_km: 4.1,
    speed_kmh: 9,
    last_update: '14:08',
    map_url: 'https://www.openstreetmap.org/?mlat=48.87000&mlon=2.30000#map=16/48.87000/2.30000',
  });
});

test('get_position: at home, and in the other languages', async (t) => {
  const expected = {
    en: 'Phone Alice is at home (1 Home Street), position of 15/10 14:30.',
    de: 'Phone Alice ist zu Hause (1 Home Street), Position von 15.10. 14:30.',
    es: 'Phone Alice está en casa (1 Home Street), posición de 15/10 14:30.',
  };
  for (const [language, sentence] of Object.entries(expected)) {
    const traccar = createTraccar();
    const { gladys, app } = await createWorld({
      traccar,
      now: () => NOW + 86_400_000,
      config: { url: traccar.url, token: TOKEN, language },
    });
    t.after(() => app.stop());
    traccar.addPosition(
      position(1, {
        ...HOME,
        geofenceIds: [1],
        address: '1 Home Street',
        fixTime: '2026-10-15T14:30:00.000+00:00',
      }),
    );
    await settle(20);
    const ack = await gladys.fake.sceneAction('get_position', { device: deviceId(1) });
    assert.equal(ack.data.outputs.sentence, sentence);
    assert.equal(ack.data.outputs.at_home, true);
  }
});

test('get_position: an unknown tracker fails with a clear message', async (t) => {
  const { gladys, app } = await createWorld();
  t.after(() => app.stop());
  const ack = await gladys.fake.sceneAction('get_position', { device: 'ext:other:9' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /inconnu/);
});

test('the widget lists every tracker with its zone, time and status', async (t) => {
  const { gladys, app } = await createWorld({ now: () => NOW });
  t.after(() => app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await gladys.fake.widgetGet('trackers', {
      settings: {},
      language,
      units: 'metric',
    });
    assert.equal(ack.success, true, ack.error);
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content), []);
    const [list] = content.components;
    assert.equal(list.type, 'card-list');
    assert.deepEqual(
      list.items.map((i) => i.title),
      ['Car', 'Phone Alice'],
    );
    if (language === 'fr') {
      assert.equal(list.items[1].subtitle, 'Work · 14:08');
      assert.equal(list.items[0].subtitle, 'Hors zone · 14:08');
      assert.deepEqual(list.items[1].badge, { text: 'En ligne', color: 'success' });
      assert.match(list.items[1].description, /Batterie : 86 %/);
      assert.equal(list.items[1].links[0].label, 'Carte');
    }
  }
});

test('the widget says when there is nothing to show, and caps the list', async (t) => {
  const empty = createTraccar();
  empty.devices = [];
  empty.positions = [];
  const world = await createWorld({ traccar: empty });
  t.after(() => world.app.stop());
  const ack = await world.gladys.fake.widgetGet('trackers', { settings: {}, language: 'en' });
  assert.match(ack.data.content.components[0].text, /No tracker/);

  const many = createTraccar();
  many.devices = Array.from({ length: 11 }, (_, i) => ({
    ...many.devices[0],
    id: i + 1,
    name: `Tracker ${String(i + 1).padStart(2, '0')}`,
  }));
  const full = await createWorld({ traccar: many });
  t.after(() => full.app.stop());
  const content = (await full.gladys.fake.widgetGet('trackers', { settings: {}, language: 'en' }))
    .data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].items.length, MAX_ITEMS);
  assert.equal(content.components[1].text, '3 more tracker(s) not shown.');
});

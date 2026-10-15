// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (recorded on Traccar 6.16.0): a phone (Traccar Client, battery,
// motion) and a car tracker (ignition, alarm), then every optional feature at
// once, with and without a Gladys house — in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTraccar, position, settle, TOKEN, WORK } from './helpers/fakeTraccar.js';
import { createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'default language (French)', language: undefined },
  { label: 'English names', language: 'en' },
  { label: 'German names', language: 'de' },
  { label: 'Spanish names', language: 'es' },
  { label: 'no Gladys house, home geofence', language: 'en', houses: [], homeGeofence: 'Home' },
  { label: 'no house, no home rule', language: 'fr', houses: [] },
];

function checkDevice(device) {
  const where = device.name;
  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const traccar = createTraccar();
    const { gladys, app } = await createWorld({
      traccar,
      houses: scenario.houses,
      config: {
        url: traccar.url,
        token: TOKEN,
        ...(scenario.language ? { language: scenario.language } : {}),
        ...(scenario.homeGeofence ? { home_geofence: scenario.homeGeofence } : {}),
      },
    });
    try {
      // The car reports everything optional: ignition, battery, an address.
      traccar.addPosition(
        position(2, {
          ...WORK,
          geofenceIds: [2],
          speed: 20,
          address: '1 Example Street',
          attributes: { ignition: true, batteryLevel: 55, motion: true },
        }),
      );
      await settle(20);
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 2, 'one device per Traccar device');
      const car = devices.find((d) => d.external_id.endsWith(':2'));
      for (const key of ['ignition', 'battery', 'address', 'motion']) {
        assert.ok(
          car.features.some((f) => f.external_id.endsWith(`:${key}`)),
          key,
        );
      }
      for (const device of devices) {
        checkDevice(device);
      }
    } finally {
      app.stop();
    }
  });
}

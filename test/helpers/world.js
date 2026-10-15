// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Traccar on a fake network.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { createTraccar, network, settle, TOKEN } from './fakeTraccar.js';

export const FAST_SOCKET = { reconnectMin: 10, reconnectMax: 50, idleTimeout: 60_000 };

export const HOUSE = {
  id: 'house-1',
  name: 'Maison',
  selector: 'maison',
  latitude: 48.8566,
  longitude: 2.3522,
};

export const deviceId = (id) => `ext:test-integration:tracker:${id}`;
export const featureId = (id, key) => `${deviceId(id)}:${key}`;

/**
 * @param {object} [options]
 * @param {object} [options.traccar] a fake Traccar (default: the fixtures)
 * @param {object} [options.config] integration config (default: token on the fake)
 * @param {object[]} [options.devices] devices "created" in Gladys
 * @param {'all' | 'none' | object[]} [options.devices]
 */
export async function createWorld({
  traccar = createTraccar(),
  config,
  devices = 'all',
  houses = [HOUSE],
  connect = true,
  timings,
  now,
} = {}) {
  const net = network(traccar);
  const gladys = createFakeGladys({
    config: config ?? { url: traccar.url, token: TOKEN },
    devices: Array.isArray(devices) ? devices : [],
    houses,
  });
  const app = registerHandlers(gladys, {
    fetch: net.fetch,
    createSocket: net.createSocket,
    // No throttling of the continuous values, unless a test asks for it.
    timings: { continuousGap: 0, ...timings },
    socketTimings: FAST_SOCKET,
    now,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
    if (devices === 'all') {
      // The user adds every discovered tracker.
      for (const device of gladys.fake.discoveredDevices) {
        await gladys.fake.deviceCreated(structuredClone(device));
      }
      await settle();
    }
  }
  return { gladys, app, hub: app.hub, traccar };
}

// -----------------------------------------------------------------------------
// A fake Traccar server on a fake network: the REST API (session cookie,
// devices, positions, geofences, server) and the push socket, both served
// from the fixtures recorded on Traccar 6.16.0 (test/fixtures/traccar-6.16).
// Tests never touch the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const TOKEN = 'test-token-not-a-secret';
export const EMAIL = 'user@example.com';
export const PASSWORD = 'test-password';

export function fixture(name) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/traccar-6.16/${name}`, import.meta.url), 'utf8'),
  );
}

/** Lets the pending promises and timers of zero delay run. */
export const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeSocket {
  constructor(server, headers) {
    this.server = server;
    this.headers = headers;
    this.listeners = {};
    this.closed = false;
    setTimeout(() => {
      if (this.closed) {
        return;
      }
      if (!server.up || headers?.Cookie !== `JSESSIONID=${server.session}`) {
        this.#close();
        return;
      }
      server.sockets.add(this);
      this.#emit('open', {});
      // Traccar greets with the latest positions.
      this.send({ positions: server.positions });
    }, 1);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  #emit(type, event) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }

  /** Server -> client frame. */
  send(frame) {
    if (!this.closed) {
      this.#emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
    }
  }

  #close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.server.sockets.delete(this);
    this.#emit('close', { code: 1006 });
  }

  close() {
    this.#close();
  }

  /** The server drops the connection. */
  drop() {
    this.#close();
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.host]
 */
export function createTraccar({
  host = '192.0.2.10',
  devices = fixture('devices.json'),
  positions = fixture('positions.json'),
  geofences = fixture('geofences.json'),
  server = fixture('server.json'),
} = {}) {
  const traccar = {
    url: `http://${host}:8082`,
    devices: structuredClone(devices),
    positions: structuredClone(positions),
    geofences: structuredClone(geofences),
    server: structuredClone(server),
    up: true,
    session: null,
    sessionCount: 0,
    requests: [],
    sockets: new Set(),

    async handle(url, init = {}) {
      const { pathname, searchParams } = new URL(url);
      const method = init.method ?? 'GET';
      this.requests.push({ method, path: pathname });
      if (!this.up) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      if (pathname === '/api/session') {
        let ok;
        if (method === 'GET') {
          const token = searchParams.get('token');
          if (token !== TOKEN) {
            return new Response('Bad token', { status: 400 });
          }
          ok = true;
        } else {
          const form = new URLSearchParams(init.body);
          ok = form.get('email') === EMAIL && form.get('password') === PASSWORD;
        }
        if (!ok) {
          return new Response('jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized', {
            status: 401,
          });
        }
        this.sessionCount += 1;
        this.session = `node0session${this.sessionCount}.node0`;
        return Response.json(fixture('session.json'), {
          headers: { 'Set-Cookie': `JSESSIONID=${this.session}; Path=/; HttpOnly` },
        });
      }
      if (!this.session || init.headers?.Cookie !== `JSESSIONID=${this.session}`) {
        return new Response('', { status: 401 });
      }
      const routes = {
        '/api/server': () => this.server,
        '/api/devices': () => this.devices,
        '/api/positions': () => this.positions,
        '/api/geofences': () => this.geofences,
      };
      const route = routes[pathname];
      return route ? Response.json(route()) : new Response('', { status: 404 });
    },

    /** Pushes a frame to every open socket. */
    push(frame) {
      for (const socket of this.sockets) {
        socket.send(frame);
      }
    },

    /** A new fix: stored as the latest of its device, and pushed. */
    addPosition(position) {
      this.positions = [
        ...this.positions.filter((p) => p.deviceId !== position.deviceId),
        position,
      ];
      this.push({ positions: [position] });
    },

    /** A device update (status...): stored and pushed. */
    updateDevice(id, changes) {
      const device = this.devices.find((d) => d.id === id);
      Object.assign(device, changes);
      this.push({ devices: [device] });
    },

    /** Expires the session (the next request gets a 401). */
    expireSession() {
      this.session = null;
    },

    dropSockets() {
      for (const socket of [...this.sockets]) {
        socket.drop();
      }
    },
  };
  return traccar;
}

/** The fetch and socket factory of a fake network holding these servers. */
export function network(...servers) {
  const find = (url) =>
    servers.find((s) => url.startsWith(s.url) || url.startsWith(s.url.replace(/^http/, 'ws')));
  return {
    fetch: async (url, init) => {
      const server = find(url);
      if (!server) {
        throw new TypeError('fetch failed', { cause: { code: 'EHOSTUNREACH' } });
      }
      return server.handle(url, init);
    },
    createSocket: (url, headers) => {
      const server = find(url);
      if (!server) {
        throw new Error('unreachable');
      }
      return new FakeSocket(server, headers);
    },
  };
}

let nextPositionId = 100;

/** A position as Traccar pushes it (speed in knots). */
export function position(deviceId, { latitude, longitude, geofenceIds = null, ...rest } = {}) {
  nextPositionId += 1;
  const time = rest.fixTime ?? new Date().toISOString();
  return {
    id: rest.id ?? nextPositionId,
    attributes: rest.attributes ?? { motion: false },
    deviceId,
    protocol: 'osmand',
    serverTime: time,
    deviceTime: time,
    fixTime: time,
    valid: true,
    latitude,
    longitude,
    altitude: 0,
    speed: rest.speed ?? 0,
    course: 0,
    address: rest.address ?? null,
    accuracy: 0,
    network: null,
    geofenceIds,
  };
}

// The fixture geofences: Home (id 1) around HOME, Work (id 2).
export const HOME = { latitude: 48.8566, longitude: 2.3522 };
export const WORK = { latitude: 48.87, longitude: 2.3 };
export const AWAY = { latitude: 48.8, longitude: 2.3 };

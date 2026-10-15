// -----------------------------------------------------------------------------
// The push link of Traccar: the WebSocket `/api/socket`, authenticated by the
// session cookie of the REST client (a Bearer header is refused there).
//
// Checked on Traccar 6.16.0: right after the upgrade the server sends
// `{"positions":[...]}` (the latest known), then, as they happen, objects
// holding `devices` (status, lastUpdate), `positions` (each new fix with its
// `geofenceIds` and attributes) and `events` (only those the user subscribed
// to with a Traccar notification), plus `{}` as a keep-alive.
//
// Node 22+ ships WebSocket as a global, and accepts the `headers` option: no
// dependency needed.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'traccar-push' });

export const DEFAULT_SOCKET_TIMINGS = {
  // Traccar sends a `{}` keep-alive well under this: silence means a dead link.
  idleTimeout: 180_000,
  reconnectMin: 2_000,
  reconnectMax: 120_000,
};

export function socketUrl(baseUrl) {
  return `${baseUrl.replace(/^http/i, 'ws')}/api/socket`;
}

/**
 * Emits `message` (each parsed frame), `open` and `close` (with the reason).
 * Reconnects by itself, with a growing delay, until stop().
 */
export class PushLink extends EventEmitter {
  constructor({
    client,
    createSocket = (url, headers) => new WebSocket(url, { headers }),
    timings = {},
  }) {
    super();
    this.client = client;
    this.createSocket = createSocket;
    this.timings = { ...DEFAULT_SOCKET_TIMINGS, ...timings };
    this.socket = null;
    this.running = false;
    this.live = false;
    this.failures = 0;
    this.retryTimer = null;
    this.idleTimer = null;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.failures = 0;
    this.#open();
  }

  stop() {
    this.running = false;
    clearTimeout(this.retryTimer);
    clearTimeout(this.idleTimer);
    this.retryTimer = null;
    this.idleTimer = null;
    this.#drop();
  }

  async #open() {
    let headers;
    try {
      // A fresh session every time: the previous one may be the reason the
      // socket closed.
      this.client.resetSession();
      headers = await this.client.socketHeaders();
    } catch (err) {
      this.#scheduleRetry(err);
      return;
    }
    if (!this.running) {
      return;
    }
    let socket;
    try {
      socket = this.createSocket(socketUrl(this.client.url), headers);
    } catch (err) {
      this.#scheduleRetry(err);
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.failures = 0;
      this.live = true;
      this.#armIdle();
      this.emit('open');
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.#armIdle();
      let frame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        logger.debug('Ignored a frame that is not JSON');
        return;
      }
      if (frame && typeof frame === 'object') {
        this.emit('message', frame);
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.#lost(new Error('socket closed'));
    });
    socket.addEventListener('error', () => {
      // A `close` follows: the retry is scheduled there.
    });
  }

  #armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => this.#lost(new Error('no message')),
      this.timings.idleTimeout,
    );
    this.idleTimer.unref?.();
  }

  #lost(err) {
    this.#drop();
    this.#scheduleRetry(err);
  }

  #drop() {
    const socket = this.socket;
    this.socket = null;
    clearTimeout(this.idleTimer);
    if (socket) {
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
    if (this.live) {
      this.live = false;
      this.emit('close');
    }
  }

  #scheduleRetry(err) {
    if (!this.running) {
      return;
    }
    this.failures += 1;
    const delay = Math.min(
      this.timings.reconnectMax,
      this.timings.reconnectMin * 2 ** (this.failures - 1),
    );
    // The hub reports the outage once (see Hub#onPushClosed): debug here.
    logger.debug(`Push link down (${err?.message}), retry in ${Math.round(delay / 1000)} s`);
    this.emit('failure', err);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.#open(), delay);
    this.retryTimer.unref?.();
  }
}

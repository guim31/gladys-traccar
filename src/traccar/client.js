// -----------------------------------------------------------------------------
// REST client of the Traccar server (checked on Traccar 6.16.0).
//
// Everything goes through a session cookie (JSESSIONID), because the push
// socket (/api/socket) accepts nothing else: a Bearer header is refused there.
// The session is opened either with a user API token (GET /api/session?token=,
// Traccar 5.x and later) or with an email and a password (POST /api/session).
// A 401 on a request means the session expired: one new login, one retry.
//
// Answers checked on the real server: a bad token is a 400, a bad password a
// 401 whose body is a Java stack trace (never shown nor logged).
// -----------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 15_000;

/** An error of the Traccar link, with a stable code for the messages. */
export class TraccarError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'http' | 'invalid'} code
   * @param {string} message never holds a secret
   * @param {number} [status]
   */
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class TraccarClient {
  /**
   * @param {{ url: string, token?: string, email?: string, password?: string,
   *   fetch?: typeof fetch, timeout?: number }} options
   */
  constructor({ url, token = '', email = '', password = '', fetch = globalThis.fetch, timeout }) {
    this.url = url;
    this.token = token;
    this.email = email;
    this.password = password;
    this.fetch = fetch;
    this.timeout = timeout ?? REQUEST_TIMEOUT_MS;
    this.cookie = null;
    this.user = null;
  }

  async #request(path, init = {}) {
    let response;
    try {
      response = await this.fetch(`${this.url}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new TraccarError('unreachable', `Traccar is unreachable (${reason})`);
    }
    return response;
  }

  /** Opens a session; returns the Traccar user. */
  async login() {
    let response;
    if (this.token) {
      response = await this.#request(`/api/session?token=${encodeURIComponent(this.token)}`);
    } else {
      response = await this.#request('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: this.email, password: this.password }).toString(),
      });
    }
    if ([400, 401, 403].includes(response.status)) {
      await response.body?.cancel();
      throw new TraccarError(
        'unauthorized',
        `Traccar refused the ${this.token ? 'token' : 'email or password'} (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new TraccarError('http', `Traccar answered HTTP ${response.status}`, response.status);
    }
    const setCookie = response.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/JSESSIONID=[^;]+/);
    const user = await this.#json(response);
    if (!match) {
      throw new TraccarError('invalid', 'Traccar opened no session (no JSESSIONID cookie)');
    }
    this.cookie = match[0];
    this.user = user;
    return user;
  }

  async #json(response) {
    try {
      return await response.json();
    } catch {
      throw new TraccarError('invalid', 'Traccar sent an answer that is not JSON');
    }
  }

  /** GET a JSON resource, logging in first or again when needed. */
  async get(path) {
    if (!this.cookie) {
      await this.login();
    }
    let response = await this.#request(path, { headers: { Cookie: this.cookie } });
    if (response.status === 401) {
      await response.body?.cancel();
      this.cookie = null;
      await this.login();
      response = await this.#request(path, { headers: { Cookie: this.cookie } });
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new TraccarError('unauthorized', `Traccar refused ${path} (HTTP ${response.status})`);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new TraccarError('http', `Traccar answered HTTP ${response.status} on ${path}`);
    }
    return this.#json(response);
  }

  getServer() {
    return this.get('/api/server');
  }

  getDevices() {
    return this.get('/api/devices');
  }

  /** The latest position of every device the user sees. */
  getPositions() {
    return this.get('/api/positions');
  }

  getGeofences() {
    return this.get('/api/geofences');
  }

  /** The headers of the push socket (the session cookie), after a login. */
  async socketHeaders() {
    if (!this.cookie) {
      await this.login();
    }
    return { Cookie: this.cookie };
  }

  /** Forgets the session: the next request logs in again. */
  resetSession() {
    this.cookie = null;
  }
}

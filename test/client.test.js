// -----------------------------------------------------------------------------
// The REST client and the push link, against the fake Traccar: session by
// token or password, the answers of a real Traccar 6.16.0 to bad credentials
// (400 for a token, 401 with a Java stack trace for a password), one new login
// on an expired session, and errors that never carry a secret.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraccarClient, TraccarError } from '../src/traccar/client.js';
import { PushLink, socketUrl } from '../src/traccar/socket.js';
import { createTraccar, EMAIL, network, PASSWORD, settle, TOKEN } from './helpers/fakeTraccar.js';

function setup(options = {}) {
  const traccar = createTraccar();
  const net = network(traccar);
  const client = new TraccarClient({ url: traccar.url, fetch: net.fetch, ...options });
  return { traccar, net, client };
}

test('a token opens a session, the cookie carries the requests', async () => {
  const { traccar, client } = setup({ token: TOKEN });
  const devices = await client.getDevices();
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Car', 'Phone Alice'],
  );
  assert.equal(traccar.sessionCount, 1);
  assert.equal((await client.getServer()).version, '6.16.0');
  assert.equal(traccar.sessionCount, 1, 'one login for several requests');
  assert.deepEqual(await client.socketHeaders(), { Cookie: `JSESSIONID=${traccar.session}` });
});

test('email and password open a session too', async () => {
  const { client } = setup({ email: EMAIL, password: PASSWORD });
  assert.equal((await client.getGeofences()).length, 2);
});

test('refused credentials are an "unauthorized" error without the secret', async () => {
  for (const options of [
    { token: 'secret-token-value' },
    { email: EMAIL, password: 'secret-password-value' },
  ]) {
    const { client } = setup(options);
    await assert.rejects(client.getDevices(), (err) => {
      assert.ok(err instanceof TraccarError);
      assert.equal(err.code, 'unauthorized');
      assert.doesNotMatch(err.message, /secret-|jakarta/);
      return true;
    });
  }
});

test('an expired session: one new login, the request is retried', async () => {
  const { traccar, client } = setup({ token: TOKEN });
  await client.getDevices();
  traccar.expireSession();
  assert.equal((await client.getPositions()).length, 2);
  assert.equal(traccar.sessionCount, 2);
});

test('an unreachable server is an "unreachable" error', async () => {
  const { traccar, client } = setup({ token: TOKEN });
  traccar.up = false;
  await assert.rejects(client.getDevices(), { code: 'unreachable' });
  const lost = new TraccarClient({
    url: 'http://198.51.100.1:8082',
    token: TOKEN,
    fetch: network().fetch,
  });
  await assert.rejects(lost.getDevices(), /unreachable \(EHOSTUNREACH\)/);
});

test('an answer that is not JSON is an "invalid" error', async () => {
  const client = new TraccarClient({
    url: 'http://192.0.2.10:8082',
    token: TOKEN,
    fetch: async () =>
      new Response('<html>proxy</html>', {
        headers: { 'Set-Cookie': 'JSESSIONID=abc; Path=/' },
      }),
  });
  await assert.rejects(client.getDevices(), { code: 'invalid' });
});

test('the socket URL follows the scheme and the path', () => {
  assert.equal(socketUrl('http://192.0.2.10:8082'), 'ws://192.0.2.10:8082/api/socket');
  assert.equal(socketUrl('https://example.com/traccar'), 'wss://example.com/traccar/api/socket');
});

test('the push link opens with the session cookie, and reconnects after a drop', async () => {
  const { traccar, net, client } = setup({ token: TOKEN });
  const link = new PushLink({
    client,
    createSocket: net.createSocket,
    timings: { reconnectMin: 5, reconnectMax: 20 },
  });
  const frames = [];
  let opens = 0;
  link.on('message', (frame) => frames.push(frame));
  link.on('open', () => {
    opens += 1;
  });
  link.start();
  await settle(20);
  assert.equal(link.live, true);
  assert.equal(opens, 1);
  assert.equal(frames[0].positions.length, 2, 'Traccar greets with the latest positions');
  traccar.push('not json');
  traccar.push({});
  await settle();
  assert.equal(frames.length, 2, 'the bad frame is skipped, the keep-alive kept');
  traccar.dropSockets();
  await settle(40);
  assert.equal(opens, 2);
  link.stop();
  assert.equal(link.live, false);
  assert.equal(traccar.sockets.size, 0);
});

test('a silent socket is considered dead', async () => {
  const { traccar, net, client } = setup({ token: TOKEN });
  const link = new PushLink({
    client,
    createSocket: net.createSocket,
    timings: { reconnectMin: 5, reconnectMax: 20, idleTimeout: 15 },
  });
  let closes = 0;
  link.on('close', () => {
    closes += 1;
  });
  link.start();
  await settle(60);
  link.stop();
  assert.ok(closes >= 1);
  assert.ok(traccar.sessionCount >= 2, 'a new session for each new socket');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConfigured, normalizeConfig, normalizeUrl } from '../src/config.js';

test('the address accepts what users type', () => {
  assert.equal(normalizeUrl('192.0.2.10'), 'http://192.0.2.10:8082');
  assert.equal(normalizeUrl(' 192.0.2.10:8082/ '), 'http://192.0.2.10:8082');
  assert.equal(normalizeUrl('traccar.example.com'), 'http://traccar.example.com:8082');
  assert.equal(normalizeUrl('https://example.com/traccar/'), 'https://example.com/traccar');
  assert.equal(normalizeUrl('http://192.0.2.10:8082/api'), 'http://192.0.2.10:8082');
  assert.equal(normalizeUrl('http://192.0.2.10'), 'http://192.0.2.10');
  assert.equal(normalizeUrl('ftp://192.0.2.10'), null);
  assert.equal(normalizeUrl('http://user:pass@192.0.2.10'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('defaults, bounds and languages', () => {
  const config = normalizeConfig({});
  assert.equal(config.url, null);
  assert.equal(config.invalidUrl, false);
  assert.equal(config.homeRadius, 150);
  assert.equal(config.presenceMaxAge, 30);
  assert.equal(config.language, 'fr');
  assert.equal(isConfigured(config), false);
  const typed = normalizeConfig({
    url: 'nope://',
    home_radius: '2,5',
    presence_max_age: 100000,
    language: 'it',
    password: ' spaced ',
  });
  assert.equal(typed.invalidUrl, true);
  assert.equal(typed.homeRadius, 20);
  assert.equal(typed.presenceMaxAge, 720);
  assert.equal(typed.language, 'fr');
  assert.equal(typed.password, ' spaced ');
});

test('a token, or an email with a password, is required', () => {
  const url = '192.0.2.10';
  assert.equal(isConfigured(normalizeConfig({ url, token: 'x' })), true);
  assert.equal(isConfigured(normalizeConfig({ url, email: 'a@example.com' })), false);
  assert.equal(isConfigured(normalizeConfig({ url, email: 'a@example.com', password: 'p' })), true);
});

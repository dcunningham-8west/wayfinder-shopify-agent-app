import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../dist/config.js';

function withEnv(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, { RETELL_API_KEY: 'k', SHOPIFY_STORE_DOMAIN: 'd', SHOPIFY_ADMIN_TOKEN: 't' }, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

test('simli is configured when both key and face id are set', () => {
  const config = withEnv({ SIMLI_API_KEY: 'sk', SIMLI_FACE_ID: 'face' }, loadConfig);
  assert.deepEqual(config.simli, { apiKey: 'sk', faceId: 'face' });
});

test('simli is off when the face id is missing', () => {
  const config = withEnv({ SIMLI_API_KEY: 'sk', SIMLI_FACE_ID: undefined }, loadConfig);
  assert.equal(config.simli, undefined);
});

test('simli is off when the api key is missing', () => {
  const config = withEnv({ SIMLI_API_KEY: undefined, SIMLI_FACE_ID: 'face' }, loadConfig);
  assert.equal(config.simli, undefined);
});

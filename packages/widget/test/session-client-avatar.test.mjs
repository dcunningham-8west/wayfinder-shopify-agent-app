import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: ['src/session-client.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

const PAGE = { template: 'page', url: '/', epoch: 1, sections: [] };
const CART = { count: 0, lines: [] };
const LEG = { call_leg_id: 'leg', access_token: 'at', call_id: 'c', transport: 'gateway', ice_servers: [] };

function load({ avatar, hidden = false, legBody = LEG }) {
  const bodies = [];
  const storage = new Map([['wayfinder:session', JSON.stringify({ id: 's', token: 't' })]]);
  if (hidden) storage.set('wayfinder:avatar-hidden', '1');
  const context = {
    module: { exports: {} },
    require: nodeRequire,
    process,
    Buffer,
    sessionStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 201, json: async () => legBody };
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(outputFiles[0].text, context);
  const client = new context.module.exports.SessionClient({ backendUrl: 'https://b', socketUrl: 'wss://b', avatar });
  return { client, bodies };
}

test('asks for the avatar when enabled and not hidden', async () => {
  const { client, bodies } = load({ avatar: true });
  await client.startCallLeg(PAGE, CART);
  assert.equal(bodies[0].avatar, true);
});

test('does not ask when the shopper has hidden the avatar', async () => {
  const { client, bodies } = load({ avatar: true, hidden: true });
  await client.startCallLeg(PAGE, CART);
  assert.equal(bodies[0].avatar, undefined);
});

test('does not ask when the merchant has not enabled the avatar', async () => {
  const { client, bodies } = load({ avatar: false });
  await client.startCallLeg(PAGE, CART);
  assert.equal(bodies[0].avatar, undefined);
});

test('passes a granted avatar token through on the leg', async () => {
  const { client } = load({ avatar: true, legBody: { ...LEG, avatar: { session_token: 'tok' } } });
  const leg = await client.startCallLeg(PAGE, CART);
  assert.equal(leg.avatarToken, 'tok');
});

test('a leg without avatar is voice-only, not an error', async () => {
  const { client } = load({ avatar: true });
  const leg = await client.startCallLeg(PAGE, CART);
  assert.equal(leg.callId, 'c');
  assert.equal(leg.avatarToken, undefined);
});

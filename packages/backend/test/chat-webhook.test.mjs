import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { Retell } from 'retell-sdk';
import { toolWebhookPlugin } from '../dist/routes/tool-webhook.js';
import { SessionStore } from '../dist/session/session-store.js';

const API_KEY = 'test-key';

/** The shape spike C1 captured from a Chat Leg's tool call. */
function chatBody(name, args) {
  return JSON.stringify({
    name,
    args,
    chat: { chat_id: 'chat-1', metadata: { session_id: 'sess-1', chat_leg_id: 'sess-1-1' } },
  });
}

async function send(raw, deps) {
  const app = Fastify({ logger: false });
  await app.register(toolWebhookPlugin, { retellApiKey: API_KEY, ...deps });
  try {
    return await app.inject({
      method: 'POST',
      url: '/webhooks/retell/tool',
      headers: { 'content-type': 'application/json', 'x-retell-signature': await Retell.sign(raw, API_KEY) },
      payload: raw,
    });
  } finally {
    await app.close();
  }
}

function deps(overrides = {}) {
  return {
    catalogue: { productDetails: () => undefined },
    destinations: { urlFor: () => undefined },
    actions: { isConnected: () => true, perform: async () => ({ status: 'ok' }) },
    sessions: new SessionStore(),
    ...overrides,
  };
}

test('a chat tool call dispatches a Tool', async () => {
  const response = await send(
    chatBody('get_product_details', { product_id: 'p1' }),
    deps({ catalogue: { productDetails: (id) => ({ product_id: id, title: 'Oud' }) } }),
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, result: { product_id: 'p1', title: 'Oud' } });
});

test('a chat tool call dispatches an Action to the Session in its metadata', async () => {
  const performed = [];
  const response = await send(
    chatBody('scroll_to', { target_id: 'featured' }),
    deps({
      actions: {
        isConnected: () => true,
        perform: async (sessionId, action) => {
          performed.push([sessionId, action.action]);
          return { status: 'ok' };
        },
      },
    }),
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(performed, [['sess-1', 'scroll_to']]);
});

test('an unsigned chat tool call is rejected', async () => {
  const app = Fastify({ logger: false });
  await app.register(toolWebhookPlugin, { retellApiKey: API_KEY, ...deps() });
  const response = await app.inject({
    method: 'POST',
    url: '/webhooks/retell/tool',
    headers: { 'content-type': 'application/json', 'x-retell-signature': 'bad' },
    payload: chatBody('get_product_details', { product_id: 'p1' }),
  });
  await app.close();
  assert.equal(response.statusCode, 401);
});

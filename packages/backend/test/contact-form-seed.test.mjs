import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { registerSessionRoutes } from '../dist/routes/session.js';
import { SessionStore } from '../dist/session/session-store.js';

test('call-leg creation carries declared form targets and Shopify result into the Seed', async () => {
  const app = Fastify({ logger: false });
  const sessions = new SessionStore();
  let createdSeed;
  registerSessionRoutes(app, {
    sessions,
    catalogue: { digest: () => '2 products. Categories: candles.' },
    voice: {
      async createWebCall(seed) {
        createdSeed = seed;
        return { callId: 'call-id', accessToken: 'access-token', transport: 'gateway', iceServers: [] };
      },
    },
  });

  try {
    const created = await app.inject({ method: 'POST', url: '/sessions', payload: {} });
    const handle = created.json();
    const response = await app.inject({
      method: 'POST',
      url: `/sessions/${handle.session_id}/call-legs`,
      headers: { 'x-wayfinder-session-token': handle.session_token },
      payload: {
        page_context: { template: 'page', url: '/pages/contact', epoch: 1, sections: [] },
        action_targets: ['contact-form'],
        form_results: [{ target_id: 'contact-form', status: 'success' }],
        cart: {
          count: 2,
          total: { amount_minor: 12000, currency: 'GBP' },
          lines: [{ line_key: 'line-key', title: 'Lime Basil candle', qty: 2 }],
        },
      },
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(createdSeed.action_targets, ['contact-form']);
    assert.deepEqual(createdSeed.form_results, [{ target_id: 'contact-form', status: 'success' }]);
    assert.deepEqual(createdSeed.cart, {
      count: 2,
      total: { amount_minor: 12000, currency: 'GBP' },
      lines: [{ line_key: 'line-key', title: 'Lime Basil candle', qty: 2 }],
    });
    assert.equal(createdSeed.catalogue_digest, '2 products. Categories: candles.');
  } finally {
    await app.close();
  }
});

test('call-leg creation rejects malformed form metadata', async () => {
  const app = Fastify({ logger: false });
  const sessions = new SessionStore();
  registerSessionRoutes(app, { sessions, catalogue: { digest: () => '' } });

  try {
    const created = await app.inject({ method: 'POST', url: '/sessions', payload: {} });
    const handle = created.json();
    const response = await app.inject({
      method: 'POST',
      url: `/sessions/${handle.session_id}/call-legs`,
      headers: { 'x-wayfinder-session-token': handle.session_token },
      payload: {
        page_context: { template: 'page', url: '/pages/contact', epoch: 1, sections: [] },
        action_targets: [''],
        cart: { count: 0, lines: [] },
      },
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('call-leg creation rejects a missing cart snapshot', async () => {
  const app = Fastify({ logger: false });
  const sessions = new SessionStore();
  registerSessionRoutes(app, { sessions, catalogue: { digest: () => '' } });

  try {
    const created = await app.inject({ method: 'POST', url: '/sessions', payload: {} });
    const handle = created.json();
    const response = await app.inject({
      method: 'POST',
      url: `/sessions/${handle.session_id}/call-legs`,
      headers: { 'x-wayfinder-session-token': handle.session_token },
      payload: { page_context: { template: 'page', url: '/', epoch: 1, sections: [] } },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'invalid_cart_snapshot' });
  } finally {
    await app.close();
  }
});

import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { registerSessionRoutes } from '../dist/routes/session.js';
import { SessionStore } from '../dist/session/session-store.js';

const WEB_CALL = { callId: 'call-id', accessToken: 'access-token', transport: 'gateway', iceServers: [] };

async function harness({ avatar = { mint: async () => ({ grant: { session_token: 'tok' } }) }, withLeg = true } = {}) {
  let now = 1_000_000;
  const app = Fastify({ logger: false });
  registerSessionRoutes(app, {
    sessions: new SessionStore(() => now),
    catalogue: { digest: () => '' },
    voice: { createWebCall: async () => WEB_CALL },
    avatar,
  });
  const handle = (await app.inject({ method: 'POST', url: '/sessions', payload: {} })).json();
  const headers = { 'x-wayfinder-session-token': handle.session_token };
  if (withLeg) {
    await app.inject({
      method: 'POST',
      url: `/sessions/${handle.session_id}/call-legs`,
      headers,
      payload: { page_context: { template: 'page', url: '/', epoch: 1, sections: [] }, cart: { count: 0, lines: [] } },
    });
  }
  return {
    app,
    advance: (ms) => { now += ms; },
    requestToken: (overrides = {}) =>
      app.inject({
        method: 'POST',
        url: `/sessions/${overrides.id ?? handle.session_id}/avatar-token`,
        headers: overrides.headers ?? headers,
      }),
  };
}

test('a live leg gets a token', async () => {
  const h = await harness();
  try {
    const response = await h.requestToken();
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { session_token: 'tok' });
  } finally {
    await h.app.close();
  }
});

test('an unknown session or wrong token is refused', async () => {
  const h = await harness();
  try {
    assert.equal((await h.requestToken({ id: 'nope' })).statusCode, 404);
    assert.equal((await h.requestToken({ headers: { 'x-wayfinder-session-token': 'wrong' } })).statusCode, 404);
    assert.equal((await h.requestToken({ headers: {} })).statusCode, 404);
  } finally {
    await h.app.close();
  }
});

test('no live leg is refused', async () => {
  const h = await harness({ withLeg: false });
  try {
    const response = await h.requestToken();
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), { error: 'no_live_leg' });
  } finally {
    await h.app.close();
  }
});

test('one token per session every 10 s', async () => {
  const h = await harness();
  try {
    assert.equal((await h.requestToken()).statusCode, 200);
    h.advance(9_999);
    assert.equal((await h.requestToken()).statusCode, 429);
    h.advance(1);
    assert.equal((await h.requestToken()).statusCode, 200);
  } finally {
    await h.app.close();
  }
});

test('no simli config is refused', async () => {
  const h = await harness({ avatar: null });
  try {
    const response = await h.requestToken();
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: 'avatar_not_configured' });
  } finally {
    await h.app.close();
  }
});

test('a failed mint is reported as unavailable', async () => {
  const h = await harness({ avatar: { mint: async () => ({ error: 'out_of_minutes_skip' }) } });
  try {
    const response = await h.requestToken();
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: 'avatar_unavailable' });
  } finally {
    await h.app.close();
  }
});

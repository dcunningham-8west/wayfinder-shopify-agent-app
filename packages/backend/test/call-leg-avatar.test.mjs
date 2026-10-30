import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { registerSessionRoutes } from '../dist/routes/session.js';
import { SessionStore } from '../dist/session/session-store.js';

const WEB_CALL = { callId: 'call-id', accessToken: 'access-token', transport: 'gateway', iceServers: [] };

async function createLeg({ voice, avatar, askForAvatar }) {
  const app = Fastify({ logger: false });
  registerSessionRoutes(app, {
    sessions: new SessionStore(),
    catalogue: { digest: () => '' },
    voice: voice ?? { createWebCall: async () => WEB_CALL },
    avatar,
  });
  try {
    const handle = (await app.inject({ method: 'POST', url: '/sessions', payload: {} })).json();
    return await app.inject({
      method: 'POST',
      url: `/sessions/${handle.session_id}/call-legs`,
      headers: { 'x-wayfinder-session-token': handle.session_token },
      payload: {
        page_context: { template: 'page', url: '/', epoch: 1, sections: [] },
        cart: { count: 0, lines: [] },
        ...(askForAvatar === undefined ? {} : { avatar: askForAvatar }),
      },
    });
  } finally {
    await app.close();
  }
}

function minter(result) {
  const fake = { calls: 0, mint: async () => { fake.calls += 1; return result; } };
  return fake;
}

test('a requested and minted avatar rides on the leg response', async () => {
  const response = await createLeg({ avatar: minter({ grant: { session_token: 'tok' } }), askForAvatar: true });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().avatar, { session_token: 'tok' });
});

test('no mint when the request does not ask for the avatar', async () => {
  const avatar = minter({ grant: { session_token: 'tok' } });
  const response = await createLeg({ avatar });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().avatar, undefined);
  assert.equal(avatar.calls, 0);
});

test('no avatar when the backend has no Simli config', async () => {
  const response = await createLeg({ askForAvatar: true });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().avatar, undefined);
});

test('a failed mint leaves the leg succeeding without avatar', async () => {
  const response = await createLeg({ avatar: minter({ error: 'timeout' }), askForAvatar: true });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().call_id, 'call-id');
  assert.equal(response.json().avatar, undefined);
});

test('minting runs alongside create-web-call, not after it', async () => {
  const started = [];
  let releaseVoice;
  const voice = {
    createWebCall: () => {
      started.push('voice');
      return new Promise((resolve) => { releaseVoice = () => resolve(WEB_CALL); });
    },
  };
  const avatar = {
    mint: async () => {
      started.push('avatar');
      assert.deepEqual(started, ['voice', 'avatar'], 'voice should be in flight before mint');
      releaseVoice();
      return { grant: { session_token: 'tok' } };
    },
  };
  const response = await createLeg({ voice, avatar, askForAvatar: true });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(started, ['voice', 'avatar']);
});

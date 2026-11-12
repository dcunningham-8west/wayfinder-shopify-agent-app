import assert from 'node:assert/strict';
import Fastify from 'fastify';
import test from 'node:test';
import { registerSessionRoutes } from '../dist/routes/session.js';
import { SessionStore } from '../dist/session/session-store.js';

const LEG_BODY = {
  page_context: { template: 'page', url: '/', epoch: 1, sections: [] },
  cart: { count: 0, lines: [] },
};

function fakeChat({ reply = 'Hello', hold } = {}) {
  const fake = {
    sent: [],
    ended: [],
    createChat: async () => ({ chatId: `chat-${fake.sent.length}` }),
    complete: async (chatId, content) => {
      fake.sent.push(content);
      if (hold && content !== '[[widget_opened]]') await hold;
      return [{ role: 'agent', text: `${reply}: ${content}` }];
    },
    endChat: async (chatId) => { fake.ended.push(chatId); },
  };
  return fake;
}

async function setup(chat, now = () => Date.now()) {
  const sessions = new SessionStore(now);
  const app = Fastify({ logger: false });
  registerSessionRoutes(app, { sessions, catalogue: { digest: () => '' }, chat });
  const handle = (await app.inject({ method: 'POST', url: '/sessions', payload: {} })).json();
  const headers = { 'x-wayfinder-session-token': handle.session_token };
  const base = `/sessions/${handle.session_id}`;
  return {
    app,
    sessions,
    session: () => sessions.get(handle.session_id),
    createLeg: () => app.inject({ method: 'POST', url: `${base}/chat-legs`, headers, payload: LEG_BODY }),
    send: (leg, content, token = handle.session_token) =>
      app.inject({
        method: 'POST',
        url: `${base}/chat-legs/${leg}/messages`,
        headers: { 'x-wayfinder-session-token': token },
        payload: { content },
      }),
    end: () => app.inject({ method: 'DELETE', url: base, headers }),
  };
}

test('a chat leg opens with the agent and never records the trigger', async () => {
  const chat = fakeChat();
  const t = await setup(chat);
  const response = await t.createLeg();
  assert.equal(response.statusCode, 201);
  assert.deepEqual(chat.sent, ['[[widget_opened]]']);
  assert.equal(response.json().messages.length, 1);
  assert.deepEqual(t.session().transcript.map((turn) => turn.role), ['agent']);
  await t.app.close();
});

test('a message returns the agent reply and records both turns', async () => {
  const t = await setup(fakeChat());
  const leg = (await t.createLeg()).json().chat_leg_id;
  const response = await t.send(leg, 'vanilla please');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { messages: [{ role: 'agent', text: 'Hello: vanilla please' }] });
  assert.deepEqual(
    t.session().transcript.slice(1).map((turn) => turn.role),
    ['shopper', 'agent'],
  );
  await t.app.close();
});

test('a bad token is refused', async () => {
  const t = await setup(fakeChat());
  const leg = (await t.createLeg()).json().chat_leg_id;
  assert.equal((await t.send(leg, 'hi', 'wrong')).statusCode, 404);
  await t.app.close();
});

test('oversize content is refused', async () => {
  const t = await setup(fakeChat());
  const leg = (await t.createLeg()).json().chat_leg_id;
  assert.equal((await t.send(leg, 'a'.repeat(1001))).statusCode, 400);
  await t.app.close();
});

test('a second message while one is pending is a conflict', async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const t = await setup(fakeChat({ hold }));
  const leg = (await t.createLeg()).json().chat_leg_id;
  const first = t.send(leg, 'one');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await t.send(leg, 'two')).statusCode, 409);
  release();
  assert.equal((await first).statusCode, 200);
  await t.app.close();
});

test('a message to a superseded leg is gone', async () => {
  let clock = 0;
  const chat = fakeChat();
  const t = await setup(chat, () => clock);
  const stale = (await t.createLeg()).json().chat_leg_id;
  clock += 10_000;
  await t.createLeg();
  assert.equal((await t.send(stale, 'hi')).statusCode, 410);
  assert.deepEqual(chat.ended, ['chat-0']);
  await t.app.close();
});

test('chat legs are unavailable when chat is not configured', async () => {
  const t = await setup(undefined);
  assert.equal((await t.createLeg()).statusCode, 503);
  await t.app.close();
});

test('ending the Session ends its chat', async () => {
  const chat = fakeChat();
  const t = await setup(chat);
  await t.createLeg();
  assert.equal((await t.end()).statusCode, 204);
  assert.deepEqual(chat.ended, ['chat-0']);
  await t.app.close();
});

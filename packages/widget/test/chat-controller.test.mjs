import assert from 'node:assert/strict';
import { build } from 'esbuild';
import test from 'node:test';
import vm from 'node:vm';

const { outputFiles } = await build({
  entryPoints: ['src/chat.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

function harness({ legs = [], replies = [] } = {}) {
  const context = { module: { exports: {} }, setTimeout, console };
  vm.runInNewContext(outputFiles[0].text, context);

  const thread = [];
  const statuses = [];
  const followed = [];
  const sockets = [];
  let live = false;
  const sessions = {
    handle: { id: 's', token: 't' },
    startChatLeg: async () => legs.shift() ?? { chatLegId: 'leg', messages: [] },
    sendChatMessage: async () => replies.shift() ?? 'failed',
  };
  const chat = new context.module.exports.ChatController({
    sessions,
    ui: {
      setLive: (v) => { live = v; },
      setStatus: (s) => statuses.push(s),
      clearThread: () => { thread.length = 0; },
      appendMessage: (role, text) => thread.push([role, text]),
      setPending: () => {},
    },
    page: {
      pageContext: () => ({ epoch: 1, url: '/', template: 'index', sections: [] }),
      cart: async () => ({ count: 0, lines: [] }),
      actionTargets: () => [],
      formResults: () => [],
      clearFormResults: () => {},
    },
    openSocket: (h) => sockets.push(h.id),
    closeSocket: () => sockets.push('closed'),
    follow: (text) => followed.push(text),
    warn: () => {},
    retryDelayMs: 0,
  });
  return { chat, thread, statuses, followed, sockets, isLive: () => live };
}

test('a leg opens the panel with only its opening message, and connects the socket', async () => {
  const h = harness({ legs: [{ chatLegId: 'l1', messages: [{ role: 'agent', text: 'Hi' }] }] });
  h.thread.push(['agent', 'old']);
  await h.chat.start();
  assert.deepEqual(h.thread, [['agent', 'Hi']]);
  assert.equal(h.isLive(), true);
  assert.deepEqual(h.sockets, ['s']);
  assert.deepEqual(h.followed, ['Hi']);
});

test('a sent message shows the shopper turn, then each reply, following each', async () => {
  const h = harness({
    legs: [{ chatLegId: 'l1', messages: [] }],
    replies: [[{ role: 'agent', text: 'A' }, { role: 'agent', text: 'B' }]],
  });
  await h.chat.start();
  await h.chat.send('vanilla');
  assert.deepEqual(h.thread, [['shopper', 'vanilla'], ['agent', 'A'], ['agent', 'B']]);
  assert.deepEqual(h.followed, ['A', 'B']);
});

test('a busy leg shows one plain notice', async () => {
  const h = harness({ replies: ['busy'] });
  await h.chat.start();
  await h.chat.send('hi');
  assert.equal(h.thread.length, 2);
  assert.equal(h.thread[1][0], 'notice');
});

test('a stale leg starts a new one', async () => {
  const h = harness({
    legs: [{ chatLegId: 'l1', messages: [] }, { chatLegId: 'l2', messages: [{ role: 'agent', text: 'Back' }] }],
    replies: ['stale'],
  });
  await h.chat.start();
  await h.chat.send('hi');
  assert.deepEqual(h.thread, [['agent', 'Back']]);
});

test('a rate-limited leg is retried once', async () => {
  const h = harness({ legs: ['rate_limited', { chatLegId: 'l1', messages: [{ role: 'agent', text: 'Hi' }] }] });
  await h.chat.start();
  assert.deepEqual(h.thread, [['agent', 'Hi']]);
});

test('stopping clears the thread and closes the panel', async () => {
  const h = harness();
  await h.chat.start();
  h.chat.stop();
  assert.equal(h.chat.live, false);
  assert.equal(h.isLive(), false);
});

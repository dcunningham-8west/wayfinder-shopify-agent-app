import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: ['src/avatar.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

function fakeSimli({ startRejects = false, rejections = startRejects ? Infinity : 0 } = {}) {
  const handlers = {};
  const simli = {
    calls: [],
    on: (event, cb) => { handlers[event] = cb; },
    emit: (event, data) => handlers[event]?.(data),
    start: async () => {
      simli.calls.push('start');
      if (rejections-- > 0) throw new Error('slot held');
    },
    stop: async () => { simli.calls.push('stop'); },
    listenToMediastreamTrack: (track) => { simli.calls.push(['listen', track]); },
  };
  return simli;
}

function harness(simliOptions, { token = 'tok2' } = {}) {
  const context = { module: { exports: {} }, require: nodeRequire, process, Buffer, setTimeout, console };
  context.exports = context.module.exports;
  vm.runInNewContext(outputFiles[0].text, context);

  const simli = fakeSimli(simliOptions);
  const audio = { muted: false, volume: 1 };
  const video = {};
  const states = [];
  const created = [];
  const controller = new context.module.exports.AvatarController({
    elements: () => ({ video, audio }),
    createSimli: async (token, v, a) => {
      created.push({ token, v, a });
      return simli;
    },
    agentTrack: () => 'agent-track',
    onState: (state) => states.push(state),
    fetchToken: async () => token ?? undefined,
    retryDelayMs: 0,
  });
  return { controller, simli, audio, video, states, created };
}

test('starting with a token starts simli, then taps the agent track', async () => {
  const h = harness();
  await h.controller.start('tok');
  assert.equal(h.created[0].token, 'tok');
  assert.deepEqual(h.simli.calls, ['start', ['listen', 'agent-track']]);
  assert.deepEqual(h.states, ['starting', 'live']);
});

test("simli's audio element is silenced so voice stays on Retell", async () => {
  const h = harness();
  await h.controller.start('tok');
  assert.equal(h.audio.muted, true);
  assert.equal(h.audio.volume, 0);
  assert.equal(h.created[0].a, h.audio);
});

test('a rejected start leaves the avatar failed', async () => {
  const h = harness({ startRejects: true });
  await h.controller.start('tok');
  assert.equal(h.states.at(-1), 'failed');
  assert.ok(!h.simli.calls.some((c) => Array.isArray(c)));
});

test('a simli error event leaves the avatar failed', async () => {
  for (const event of ['error', 'startup_error']) {
    const h = harness();
    await h.controller.start('tok');
    h.simli.emit(event, 'boom');
    assert.equal(h.states.at(-1), 'failed', event);
  }
});

test('stop stops simli and turns the avatar off', async () => {
  const h = harness();
  await h.controller.start('tok');
  h.controller.stop();
  assert.equal(h.simli.calls.at(-1), 'stop');
  assert.equal(h.states.at(-1), 'off');
});

test('stop with nothing running is harmless', () => {
  const h = harness();
  h.controller.stop();
  assert.deepEqual(h.simli.calls, []);
  assert.deepEqual(h.states, []);
});

test('stop clears a failed avatar back to off', async () => {
  const h = harness({ startRejects: true });
  await h.controller.start('tok');
  h.controller.stop();
  assert.deepEqual(h.states, ['starting', 'failed', 'off']);
});

test('a refused start retries once with a fresh token', async () => {
  const h = harness({ rejections: 1 });
  await h.controller.start('tok');
  assert.deepEqual(h.created.map((c) => c.token), ['tok', 'tok2']);
  assert.deepEqual(h.states, ['starting', 'live']);
});

test('a second refusal leaves the avatar failed', async () => {
  const h = harness({ startRejects: true });
  await h.controller.start('tok');
  assert.equal(h.created.length, 2);
  assert.deepEqual(h.states, ['starting', 'failed']);
});

test('no fresh token means failed without a second attempt', async () => {
  const h = harness({ rejections: 1 }, { token: null });
  await h.controller.start('tok');
  assert.equal(h.created.length, 1);
  assert.deepEqual(h.states, ['starting', 'failed']);
});

test('simli ending the session turns the avatar off', async () => {
  const h = harness();
  await h.controller.start('tok');
  h.simli.emit('stop');
  assert.deepEqual(h.states, ['starting', 'live', 'off']);
  await h.controller.start('tok3');
  assert.equal(h.states.at(-1), 'live');
});

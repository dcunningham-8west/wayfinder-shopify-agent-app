import assert from 'node:assert/strict';
import { build } from 'esbuild';
import test from 'node:test';
import vm from 'node:vm';

const { outputFiles } = await build({
  entryPoints: ['src/mode.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

function load(storage = new Map()) {
  const sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  };
  const context = { module: { exports: {} }, sessionStorage };
  vm.runInNewContext(outputFiles[0].text, context);
  return context.module.exports;
}

test('a fresh tab opens in chat', () => {
  assert.equal(load().readMode(), 'chat');
});

test('a switch to voice survives a page load', () => {
  const storage = new Map();
  load(storage).writeMode('voice');
  assert.equal(load(storage).readMode(), 'voice');
});

test('an unknown stored value falls back to chat', () => {
  assert.equal(load(new Map([['wayfinder:mode', 'live']])).readMode(), 'chat');
});

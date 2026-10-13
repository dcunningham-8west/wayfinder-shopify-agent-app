import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: ['src/cart-snapshot.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

test('reads the current locale cart and projects its contents into the Seed shape', async () => {
  const requests = [];
  const context = {
    module: { exports: {} },
    require: nodeRequire,
    process,
    Buffer,
    window: { Shopify: { routes: { root: '/en-gb/' } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          item_count: 2,
          total_price: 12500,
          currency: 'GBP',
          items: [{
            key: 'line-key',
            title: 'Lime Basil candle - Large',
            product_title: 'Lime Basil candle',
            quantity: 2,
          }],
        }),
      };
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(outputFiles[0].text, context);

  const snapshot = await context.module.exports.readCartSnapshot();

  assert.equal(requests[0].url, '/en-gb/cart.js');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), {
    count: 2,
    total: { amount_minor: 12500, currency: 'GBP' },
    lines: [{ line_key: 'line-key', title: 'Lime Basil candle - Large', qty: 2 }],
  });
});

test('does not turn a failed cart read into an empty-cart snapshot', async () => {
  const context = {
    module: { exports: {} },
    require: nodeRequire,
    process,
    Buffer,
    window: { Shopify: { routes: { root: '/' } } },
    fetch: async () => ({ ok: false, status: 503 }),
  };
  context.exports = context.module.exports;
  vm.runInNewContext(outputFiles[0].text, context);

  await assert.rejects(() => context.module.exports.readCartSnapshot(), /cart read failed: 503/);
});
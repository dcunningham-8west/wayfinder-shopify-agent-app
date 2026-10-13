import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: ['src/action-executor.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});

test('cart action requests and renders Dawn cart sections', async () => {
  const requests = [];
  let renderedState;
  const cartView = {
    getSectionsToRender: () => [{ id: 'cart-drawer' }, { id: 'cart-icon-bubble' }],
    renderContents: (state) => { renderedState = state; },
  };
  const document = {
    querySelector: (selector) => selector === 'cart-notification' ? cartView : null,
    dispatchEvent: () => true,
  };
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const context = {
    module: { exports: {} },
    require: nodeRequire,
    process,
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    document,
    CustomEvent,
    location: {
      href: 'https://store.example/products/candle',
      origin: 'https://store.example',
      pathname: '/products/candle',
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/cart/add.js') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 123,
            sections: { 'cart-drawer': '<div></div>', 'cart-icon-bubble': '<div></div>' },
          }),
        };
      }
      if (url === '/cart.js') {
        return { ok: true, status: 200, json: async () => ({ item_count: 1 }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(outputFiles[0].text, context);

  const result = await context.module.exports.executeAction({
    action: 'add_to_cart',
    variant_id: 'gid://shopify/ProductVariant/123',
    qty: 1,
  });
  const addRequest = requests.find(({ url }) => url === '/cart/add.js');

  assert.deepEqual(JSON.parse(addRequest.options.body).sections, [
    'cart-drawer',
    'cart-icon-bubble',
  ]);
  assert.equal(JSON.parse(addRequest.options.body).sections_url, '/products/candle');
  assert.equal(renderedState.id, 123);
  assert.equal(result.status, 'ok');
  assert.equal(result.cart_count, 1);
});
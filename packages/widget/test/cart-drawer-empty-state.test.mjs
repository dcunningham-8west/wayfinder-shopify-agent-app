import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const drawerSource = await readFile(
  fileURLToPath(new URL('../../theme/assets/cart-drawer.js', import.meta.url)),
  'utf8',
);

test('rendering a non-empty cart clears the empty drawer state before focus trap', () => {
  let CartDrawer;
  const timers = [];
  const listeners = new Map();
  const drawerClasses = classList(['is-empty']);
  const inner = { classList: classList([]) };
  const overlay = { addEventListener() {} };
  const cartContent = { querySelectorAll: () => [] };
  const context = {
    HTMLElement: class {},
    CartItems: class {},
    customElements: {
      define(name, constructor) {
        if (name === 'cart-drawer') CartDrawer = constructor;
      },
    },
    document: {
      body: { classList: { add() {} } },
      getElementById: () => cartContent,
    },
    removeTrapFocus() {},
    setTimeout(callback) { timers.push(callback); },
    trapFocus(container) { container.querySelectorAll('button'); },
  };
  vm.runInNewContext(drawerSource, context);

  const drawer = Object.assign(Object.create(CartDrawer.prototype), {
    classList: drawerClasses,
    querySelector(selector) {
      if (selector === '.drawer__inner') return inner;
      if (selector === '#CartDrawer-Overlay') return overlay;
      if (selector === '.drawer__inner-empty') return null;
      if (selector === '.drawer__close') return {};
      return null;
    },
    getSectionsToRender: () => [],
    addEventListener(name, listener) { listeners.set(name, listener); },
  });

  drawer.renderContents({ id: 123, sections: {} });
  while (timers.length) timers.shift()();

  assert.doesNotThrow(() => listeners.get('transitionend')());
  assert.equal(drawerClasses.contains('is-empty'), false);
});

function classList(initial) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
  };
}
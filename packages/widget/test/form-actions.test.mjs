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

test('fill_form shows valid values and submit_form waits for agent speech', async () => {
  const timers = [];
  const form = new FakeForm();
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: nodeRequire,
    process,
    Buffer,
    console,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
    document: {
      querySelector: () => form,
      querySelectorAll: () => [],
    },
    CSS: { escape: (value) => value },
    Event,
    HTMLElement: FakeElement,
    HTMLFormElement: FakeForm,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    HTMLSelectElement: FakeSelect,
  };
  context.exports = module.exports;
  vm.runInNewContext(outputFiles[0].text, context);
  const { executeAction } = module.exports;

  const premature = await executeAction({ action: 'submit_form', target_id: 'contact-form' });
  assert.equal(premature.status, 'error');
  assert.equal(premature.reason, 'unavailable');

  const prepared = await executeAction({
    action: 'fill_form',
    target_id: 'contact-form',
    fields: { name: 'Alex Morgan', email: 'alex@example.com', body: 'Delivery question.' },
  });
  assert.equal(prepared.status, 'ok');
  assert.equal(prepared.ready, true);
  assert.equal(form.fields.name.value, 'Alex Morgan');
  assert.equal(form.fields.body.value, 'Delivery question.');
  assert.equal(form.dataset.wayfinderPrepared, 'true');
  assert.equal(form.submitted, false);

  const submitting = await executeAction({ action: 'submit_form', target_id: 'contact-form' });
  assert.equal(submitting.status, 'ok');
  assert.equal(submitting.submitting, true);
  assert.equal(form.submitted, false);
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(form.submitted, true);
});

test('fill_form rejects undeclared fields without partially filling the form', async () => {
  const module = { exports: {} };
  const context = makeContext(module, new FakeForm());
  vm.runInNewContext(outputFiles[0].text, context);

  const result = await module.exports.executeAction({
    action: 'fill_form',
    target_id: 'contact-form',
    fields: { name: 'Alex Morgan', hidden_token: 'not allowed' },
  });

  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'unavailable');
  assert.equal(context.form.fields.name.value, '');
});

test('a submitted form rejects later fill and submit actions', async () => {
  const module = { exports: {} };
  const form = new FakeForm();
  form.dataset.wayfinderSubmitted = 'true';
  const context = makeContext(module, form);
  vm.runInNewContext(outputFiles[0].text, context);

  const filled = await module.exports.executeAction({
    action: 'fill_form',
    target_id: 'contact-form',
    fields: { email: 'alex@example.com' },
  });
  const submitted = await module.exports.executeAction({
    action: 'submit_form',
    target_id: 'contact-form',
  });

  assert.equal(filled.status, 'error');
  assert.equal(submitted.status, 'error');
  assert.equal(form.submitted, false);
});

function makeContext(module, form) {
  const context = {
    module,
    exports: module.exports,
    require: nodeRequire,
    process,
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    document: { querySelector: () => form, querySelectorAll: () => [] },
    CSS: { escape: (value) => value },
    Event,
    HTMLElement: FakeElement,
    HTMLFormElement: FakeForm,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    HTMLSelectElement: FakeSelect,
  };
  context.form = form;
  return context;
}

class FakeElement {
  events = [];
  disabled = false;
  dispatchEvent(event) { this.events.push(event.type); }
}

class FakeInput extends FakeElement {
  constructor(type = 'text', required = false) {
    super();
    this.type = type;
    this.required = required;
    this.value = '';
  }
}

class FakeTextArea extends FakeElement {
  value = '';
}

class FakeSelect extends FakeElement {
  value = '';
}

class FakeForm extends FakeElement {
  dataset = { agentAction: 'contact-form', wayfinderPrepared: 'false' };
  submitted = false;
  fields = {
    name: new FakeInput(),
    email: new FakeInput('email', true),
    body: new FakeTextArea(),
  };

  querySelector(selector) {
    const field = selector.match(/data-wayfinder-form-field="([^"]+)"/)?.[1];
    return field ? this.fields[field] ?? null : null;
  }

  reportValidity() {
    return Boolean(this.fields.email.value.includes('@'));
  }

  requestSubmit() { this.submitted = true; }
  scrollIntoView() { this.scrolled = true; }
}
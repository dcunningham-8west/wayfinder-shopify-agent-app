import assert from 'node:assert/strict';
import test from 'node:test';
import { Destinations } from '../dist/destinations/destinations.js';
import { dispatchToolCall } from '../dist/tools/dispatch.js';

function deps() {
  const performed = [];
  const destinations = new Destinations();
  destinations.replace([
    { id: 'page:delivery-options', title: 'Delivery options', url: '/pages/delivery-options' },
  ]);
  return {
    performed,
    deps: {
      catalogue: {},
      destinations,
      sessions: { markAgentNavigation() {} },
      actions: {
        async perform(_session, action) {
          performed.push(action);
          return { status: 'ok', acked: true };
        },
      },
    },
  };
}

test('navigate resolves a listed destination to its real URL', async () => {
  const { deps: d, performed } = deps();
  const outcome = await dispatchToolCall(
    { name: 'navigate', args: { destination_id: 'page:delivery-options' }, sessionId: 's' },
    d,
  );
  assert.equal(outcome.ok, true);
  assert.equal(performed[0].url, '/pages/delivery-options');
});

test('navigate refuses an unlisted destination without touching the page', async () => {
  const { deps: d, performed } = deps();
  const outcome = await dispatchToolCall(
    { name: 'navigate', args: { destination_id: 'page:delivery' }, sessionId: 's' },
    d,
  );
  assert.deepEqual(outcome, { ok: false, error: 'unknown_destination', detail: 'page:delivery' });
  assert.equal(performed.length, 0);
});

test('a guessed url from the agent is ignored in favour of the destination list', async () => {
  const { deps: d, performed } = deps();
  await dispatchToolCall(
    { name: 'navigate', args: { destination_id: 'home', url: '/pages/delivery' }, sessionId: 's' },
    d,
  );
  assert.equal(performed[0].url, '/');
});

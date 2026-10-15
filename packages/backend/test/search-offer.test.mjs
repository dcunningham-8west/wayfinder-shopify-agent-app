import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionStore } from '../dist/session/session-store.js';
import { dispatchToolCall } from '../dist/tools/dispatch.js';

const match = (id) => ({ product_id: id, title: id, handle: id });

function setup(searchResult, sections = []) {
  const sessions = new SessionStore();
  const session = sessions.create();
  session.pageContext = { sections };
  const performed = [];
  const deps = {
    sessions,
    destinations: { urlFor: () => undefined },
    catalogue: {
      search: async () => searchResult,
      previewTiles: (ids) => ids.map((id) => ({ product_id: id, title: id })),
    },
    actions: {
      isConnected: () => true,
      async perform(_s, action) {
        performed.push(action);
        return { status: 'ok' };
      },
    },
  };
  const call = (name, args = {}) => dispatchToolCall({ name, args, sessionId: session.id }, deps);
  return { session, performed, call };
}

const fruity = { match_quality: 'weak', results: [match('a'), match('b')] };
const fruityArgs = { query: 'fruity fragrance', facets: [{ facet: 'scent', values: ['fruity'] }] };

test('a single strong match opens the panel without an offer', async () => {
  const { performed, call } = setup({ match_quality: 'strong', results: [match('a')] });
  const outcome = await call('search_catalogue', { query: 'lime' });
  assert.equal(outcome.result.preview, 'shown');
  assert.equal(outcome.result.offer, undefined);
  assert.equal(performed[0].action, 'show_in_widget');
});

test('a facet-filtered search stages and offers, even when weak', async () => {
  const { performed, call } = setup(fruity);
  const outcome = await call('search_catalogue', fruityArgs);
  assert.equal(outcome.result.preview, 'staged');
  assert.deepEqual(outcome.result.offer, { on_page: 'navigate', ask: true });
  assert.equal(performed.length, 0);
});

test('show_on_page navigates to the filtered collection when no section holds the results', async () => {
  const { performed, call } = setup(fruity);
  await call('search_catalogue', fruityArgs);
  await call('show_on_page');
  assert.deepEqual(performed[0], {
    action: 'navigate',
    destination_id: 'collection:all',
    url: '/collections/all?filter.p.m.custom.scent=fruity',
  });
});

test('show_on_page scrolls to a section already showing the results', async () => {
  const { performed, call } = setup(
    { match_quality: 'strong', results: [match('a'), match('b')] },
    [{ section_id: 'sec-1', kind: 'featured_collection', products: [{ product_id: 'b' }], furniture: [] }],
  );
  const outcome = await call('search_catalogue', { query: 'candles' });
  assert.deepEqual(outcome.result.offer, { on_page: 'scroll', ask: true });
  await call('show_on_page');
  assert.deepEqual(performed[0], { action: 'scroll_to', target_id: 'sec-1' });
});

test('a section whose heading matches but renders none of the results is not a scroll target', async () => {
  const { performed, call } = setup(
    { match_quality: 'strong', results: [match('a'), match('b')] },
    [{ section_id: 'sec-2', kind: 'featured_collection', label: 'Just want candles?', products: [{ product_id: 'z' }], furniture: [] }],
  );
  const outcome = await call('search_catalogue', { query: 'dining candles' });
  assert.deepEqual(outcome.result.offer, { on_page: 'navigate', ask: true });
  await call('show_on_page');
  assert.deepEqual(performed[0], {
    action: 'navigate',
    destination_id: 'search',
    url: '/search?q=dining+candles&type=product',
  });
});

test('choosing the preview makes later broad searches open the panel at once', async () => {
  const { performed, call } = setup(fruity);
  await call('search_catalogue', fruityArgs);
  await call('show_preview');
  assert.equal(performed[0].action, 'show_in_widget');
  const again = await call('search_catalogue', fruityArgs);
  assert.equal(again.result.preview, 'shown');
  assert.equal(again.result.offer, undefined);
});

test('choosing on-page makes later offers skip the question', async () => {
  const { call } = setup(fruity);
  await call('search_catalogue', fruityArgs);
  await call('show_on_page');
  const again = await call('search_catalogue', fruityArgs);
  assert.deepEqual(again.result.offer, { on_page: 'navigate', ask: false });
});

test('offer actions without a staged search touch nothing', async () => {
  const { performed, call } = setup(fruity);
  const outcome = await call('show_on_page');
  assert.equal(outcome.error, 'nothing_staged');
  assert.equal(performed.length, 0);
});

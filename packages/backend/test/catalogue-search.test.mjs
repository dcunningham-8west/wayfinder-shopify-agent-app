import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogueIndex } from '../dist/catalogue/catalogue-index.js';
import { LexicalRanker } from '../dist/catalogue/lexical-ranker.js';

function product(id, title, facets) {
  return {
    product_id: `gid://shopify/Product/${id}`,
    handle: `p-${id}`,
    title,
    url: `/products/p-${id}`,
    facets,
    variants: [],
    min_price_minor: 1000,
  };
}

function index() {
  const catalogue = new CatalogueIndex(new LexicalRanker(), async () => ({ variants: [] }));
  catalogue.replace([
    product(1, 'Nectarine Blossom & Honey Cologne', { fragrance: ['fruity'], maincat: ['colognes'] }),
    product(2, 'Lime Basil & Mandarin Candle', { fragrance: ['citrus'], maincat: ['candle'] }),
  ]);
  return catalogue;
}

test('facet-filtered products are returned even when the query scores them zero', async () => {
  const result = await index().search({
    query: 'something for summer',
    facets: [
      { facet: 'fragrance', values: ['fruity'] },
      { facet: 'maincat', values: ['colognes'] },
    ],
  });

  assert.equal(result.match_quality, 'weak');
  assert.deepEqual(result.results.map((r) => r.handle), ['p-1']);
});

test('no facet match still reports none with an alternative', async () => {
  const result = await index().search({
    query: 'woody colognes',
    facets: [{ facet: 'fragrance', values: ['woody'] }],
  });

  assert.equal(result.match_quality, 'none');
  assert.equal(result.results.length, 0);
});

test('unfiltered zero-score query still reports none', async () => {
  const result = await index().search({ query: 'modern flat' });

  assert.equal(result.match_quality, 'none');
});

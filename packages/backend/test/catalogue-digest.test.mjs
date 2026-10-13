import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogueIndex } from '../dist/catalogue/catalogue-index.js';
import { LexicalRanker } from '../dist/catalogue/lexical-ranker.js';

test('orientation digest reflects indexed categories and facets without volatile facts', () => {
  const catalogue = new CatalogueIndex(new LexicalRanker(), async () => ({ variants: [] }));
  catalogue.replace([
    {
      product_id: 'gid://shopify/Product/1',
      handle: 'lime-candle',
      title: 'Lime Basil candle',
      url: '/products/lime-candle',
      facets: { maincat: ['candle'], mood: ['relaxing'], scent: ['Lime Basil & Mandarin'] },
      variants: [{
        variant_id: 'gid://shopify/ProductVariant/1',
        title: 'Large',
        price: { amount_minor: 2800, currency: 'GBP' },
        available: true,
      }],
      min_price_minor: 2800,
    },
    {
      product_id: 'gid://shopify/Product/2',
      handle: 'wood-candle',
      title: 'Wood Sage candle',
      url: '/products/wood-candle',
      facets: { maincat: ['candle'], fragrance: ['woody'], style: ['modern'] },
      variants: [],
      min_price_minor: 5000,
    },
  ]);

  const digest = catalogue.digest();

  assert.match(digest, /^2 products in the catalogue\./);
  assert.match(digest, /Categories: candle\./);
  assert.match(digest, /Moods: relaxing\./);
  assert.match(digest, /Styles: modern\./);
  assert.match(digest, /Fragrances: woody\./);
  assert.match(digest, /Scents: Lime Basil & Mandarin\./);
  assert.doesNotMatch(digest, /2800|5000|GBP|available|stock/i);
  assert.ok(digest.length <= 1000);
});

test('orientation digest describes an empty index without implying a product match', () => {
  const catalogue = new CatalogueIndex(new LexicalRanker(), async () => ({ variants: [] }));

  assert.equal(catalogue.digest(), 'No products are currently available.');
});
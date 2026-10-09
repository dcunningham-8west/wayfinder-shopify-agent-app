import type { Facet } from '@wayfinder/contracts';
import type { CatalogueProduct } from './types.js';

/**
 * Tags are a facet model, not a tag list: every meaningful tag is `<value> <facet-suffix>`,
 * e.g. "citrus fragrance", "Lime Basil & Mandarin Scent", "candle maincat".
 *
 * `Type` is deliberately ignored — 40 of 52 products are "Home Collection" and the Candles
 * type holds exactly one candle (section 05).
 */

const SUFFIX_TO_FACET: ReadonlyMap<string, Facet> = new Map([
  ['fragrance', 'fragrance'],
  ['mood', 'mood'],
  ['style', 'style'],
  ['scent', 'scent'],
  ['maincat', 'maincat'],
  ['subcat', 'subcat'],
]);

export function parseFacets(tags: readonly string[]): CatalogueProduct['facets'] {
  const facets: CatalogueProduct['facets'] = {};
  for (const tag of tags) {
    const parsed = parseTag(tag);
    if (!parsed) continue; // Title Case display tags ("Gift Sets") are for humans, not queries.
    (facets[parsed.facet] ??= []).push(parsed.value);
  }
  return facets;
}

function parseTag(tag: string): { facet: Facet; value: string } | undefined {
  const trimmed = tag.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace <= 0) return undefined;

  const facet = SUFFIX_TO_FACET.get(trimmed.slice(lastSpace + 1).toLowerCase());
  if (!facet) return undefined;

  return { facet, value: trimmed.slice(0, lastSpace) };
}

export function hasFacetValues(
  product: CatalogueProduct,
  facet: Facet,
  wanted: readonly string[],
): boolean {
  const values = product.facets[facet];
  if (!values) return false;
  const lowered = values.map((v) => v.toLowerCase());
  return wanted.some((w) => lowered.includes(w.toLowerCase()));
}

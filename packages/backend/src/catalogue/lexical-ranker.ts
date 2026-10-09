import type { CatalogueProduct, RankedProduct, Ranker } from './types.js';

/**
 * Stands in until the embeddings decision is made. Token overlap over the title and the
 * facet values — which is less naive than it sounds here, because mood and style are already
 * explicit facets rather than something to infer from prose.
 *
 * What it cannot do is the thing embeddings are for: "something for a modern flat" matches
 * nothing lexically.
 */
export class LexicalRanker implements Ranker {
  async rank(query: string, candidates: CatalogueProduct[]): Promise<RankedProduct[]> {
    const terms = tokenise(query);
    if (terms.length === 0) return [];

    return candidates
      .map((product) => ({ product, score: score(terms, product) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * Named in the title beats merely tagged with it. Without the split, "lime basil" scored a
 * gift set carrying the tag the same as the Lime Basil & Mandarin Candle, and dozens of
 * products tied at a perfect score — which made `exact` meaningless.
 */
const TITLE_WEIGHT = 0.7;
const FACET_WEIGHT = 0.3;

function score(terms: string[], product: CatalogueProduct): number {
  const title = new Set(tokenise(product.title));
  const facets = new Set(Object.values(product.facets).flat().flatMap(tokenise));

  const titleHits = terms.filter((t) => title.has(t)).length / terms.length;
  const facetHits = terms.filter((t) => facets.has(t)).length / terms.length;

  return titleHits * TITLE_WEIGHT + facetHits * FACET_WEIGHT;
}

const NOISE = new Set(['a', 'an', 'the', 'some', 'something', 'one', 'for', 'of', 'and', 'me']);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

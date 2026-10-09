import type { Facet, Money, ProductId, VariantId } from '@wayfinder/contracts';

export interface CatalogueVariant {
  variant_id: VariantId;
  title: string;
  price: Money;
  available: boolean;
}

/** One product as the Index holds it. Note the absence of description and body copy. */
export interface CatalogueProduct {
  product_id: ProductId;
  handle: string;
  title: string;
  url: string;
  /** The six-facet tag model. A facet absent from the map simply has no tags. */
  facets: Partial<Record<Facet, string[]>>;
  variants: CatalogueVariant[];
  min_price_minor: number;
}

/**
 * The ranking seam. Lexical today, embeddings when that choice is made — the Index does not
 * care which, and neither does the tool webhook above it.
 */
export interface Ranker {
  rank(query: string, candidates: CatalogueProduct[]): Promise<RankedProduct[]>;
}

export interface RankedProduct {
  product: CatalogueProduct;
  /** 0–1. Compared against thresholds to produce `match_quality`, never returned raw. */
  score: number;
}

import type {
  CatalogueMatch,
  Facet,
  GetLiveFactsArgs,
  GetLiveFactsResult,
  MatchQuality,
  PreviewTile,
  SearchCatalogueArgs,
  SearchCatalogueResult,
} from '@wayfinder/contracts';
import type { Catalogue } from './catalogue.js';
import { hasFacetValues } from './facets.js';
import type { CatalogueProduct, RankedProduct, Ranker } from './types.js';

const MAX_RESULTS = 5;
const MAX_DIGEST_CHARACTERS = 1000;
const DIGEST_FACETS: readonly [Facet, string][] = [
  ['maincat', 'Categories'],
  ['subcat', 'Subcategories'],
  ['mood', 'Moods'],
  ['style', 'Styles'],
  ['fragrance', 'Fragrances'],
  ['scent', 'Scents'],
];

/**
 * Tier 2, in memory over the whole catalogue. Being in memory is what rules out serverless
 * hosting (section 08), so it is a load-bearing property rather than an optimisation.
 */
export class CatalogueIndex implements Catalogue {
  #products: CatalogueProduct[] = [];

  constructor(
    private readonly ranker: Ranker,
    private readonly liveFactsSource: (args: GetLiveFactsArgs) => Promise<GetLiveFactsResult>,
  ) {}

  /** Replaced wholesale on a webhook rebuild, so a search never sees a half-built index. */
  replace(products: CatalogueProduct[]): void {
    this.#products = products;
  }

  get size(): number {
    return this.#products.length;
  }

  digest(): string {
    if (this.#products.length === 0) return 'No products are currently available.';

    const digest = `${this.#products.length} products in the catalogue.`;
    const summaries = DIGEST_FACETS.flatMap(([facet, label]) => {
      const values = new Map<string, string>();
      for (const product of this.#products) {
        for (const value of product.facets[facet] ?? []) {
          const normalized = value.toLowerCase();
          if (!values.has(normalized)) values.set(normalized, value);
        }
      }
      const sorted = [...values.values()].sort((left, right) => left.localeCompare(right));
      return sorted.length > 0 ? [`${label}: ${sorted.join(', ')}.`] : [];
    });

    return summaries.reduce((result, summary) => {
      if (result.length + summary.length + 1 > MAX_DIGEST_CHARACTERS) return result;
      return `${result} ${summary}`;
    }, digest);
  }

  urlFor(productId: string): string | undefined {
    return this.#products.find((p) => p.product_id === productId)?.url;
  }

  previewTiles(productIds: readonly string[]): PreviewTile[] {
    return productIds.flatMap((id) => {
      const product = this.#products.find((p) => p.product_id === id);
      return product ? [toTile(product)] : [];
    });
  }

  async search(args: SearchCatalogueArgs): Promise<SearchCatalogueResult> {
    // Filter before ranking: facets are exact truth, the ranker is a guess.
    const candidates = this.#products.filter((p) => matchesFilters(p, args));
    const ranked = await this.ranker.rank(args.query, candidates);
    const quality = qualityOf(ranked);

    if (quality === 'none') {
      return { match_quality: 'none', results: [], alternatives: await this.#alternatives(args) };
    }

    return {
      match_quality: quality,
      results: ranked.slice(0, MAX_RESULTS).map((r) => toMatch(r.product)),
    };
  }

  async liveFacts(args: GetLiveFactsArgs): Promise<GetLiveFactsResult> {
    return this.liveFactsSource(args);
  }

  /** One entry, computed here so the agent admits the miss instead of broadening silently. */
  async #alternatives(args: SearchCatalogueArgs): Promise<CatalogueMatch[]> {
    const ignoringFilters = await this.ranker.rank(args.query, this.#products);
    const best = ignoringFilters[0]?.product ?? this.#products[0];
    return best ? [toMatch(best)] : [];
  }
}

/**
 * Coarse buckets, not a score. The thresholds live here rather than in the prompt so that
 * "nothing matched" is a fact the backend states, not a judgement the agent makes.
 */
const EXACT = 0.99;
const STRONG = 0.6;
const WEAK = 0.3;

function qualityOf(ranked: RankedProduct[]): MatchQuality {
  const best = ranked[0]?.score ?? 0;
  if (best >= EXACT) return 'exact';
  if (best >= STRONG) return 'strong';
  if (best >= WEAK) return 'weak';
  return 'none';
}

function matchesFilters(product: CatalogueProduct, args: SearchCatalogueArgs): boolean {
  if (args.max_price_minor !== undefined && product.min_price_minor > args.max_price_minor) {
    return false;
  }
  return (args.facets ?? []).every((f) => hasFacetValues(product, f.facet, f.values));
}

/** Identity only. Prices never leave the Index — a stale price is a confidently wrong answer. */
function toMatch(product: CatalogueProduct): CatalogueMatch {
  return {
    product_id: product.product_id,
    handle: product.handle,
    title: product.title,
    url: product.url,
    scent: product.facets.scent?.[0],
    format: product.facets.maincat?.[0],
  };
}

function toTile(product: CatalogueProduct): PreviewTile {
  const currency = product.variants[0]?.price.currency;
  const prices = new Set(product.variants.map((v) => v.price.amount_minor));
  return {
    product_id: product.product_id,
    title: product.title,
    url: product.url,
    ...(product.image_url ? { image_url: product.image_url } : {}),
    ...(currency ? { price: { amount_minor: product.min_price_minor, currency } } : {}),
    price_varies: prices.size > 1,
  };
}

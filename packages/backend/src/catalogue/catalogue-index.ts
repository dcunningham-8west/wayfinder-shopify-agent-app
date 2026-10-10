import type {
  CatalogueMatch,
  GetLiveFactsArgs,
  GetLiveFactsResult,
  MatchQuality,
  SearchCatalogueArgs,
  SearchCatalogueResult,
} from '@wayfinder/contracts';
import type { Catalogue } from './catalogue.js';
import { hasFacetValues } from './facets.js';
import type { CatalogueProduct, RankedProduct, Ranker } from './types.js';

const MAX_RESULTS = 5;

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

  urlFor(productId: string): string | undefined {
    return this.#products.find((p) => p.product_id === productId)?.url;
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

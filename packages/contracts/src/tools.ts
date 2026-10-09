import { z } from 'zod';
import { Facet, Money, ProductId, VariantId } from './identity.js';

/**
 * Section 05 and 11. A Tool asks and gets an answer, changes nothing the shopper can see.
 *
 * There is exactly **one** catalogue search tool. The prior system's second, overlapping
 * tool created a prompt-routing decision the agent got wrong, leaving voice turns silent for
 * ~10 s. One tool cannot be mis-routed.
 */

export const SearchCatalogueArgs = z
  .object({
    query: z.string().min(1),
    /** Filter before ranking: "something woody under £50" is a facet plus a rank, not a guess. */
    facets: z.array(z.object({ facet: Facet, values: z.array(z.string().min(1)).min(1) })).optional(),
    max_price_minor: z.number().int().positive().optional(),
  })
  .strict();
export type SearchCatalogueArgs = z.infer<typeof SearchCatalogueArgs>;

/**
 * Coarse on purpose. A raw score invites the agent to invent a threshold; four named buckets
 * make "nothing matched" mechanically definable, and `weak` is what triggers confirmation.
 */
export const MatchQuality = z.enum(['exact', 'strong', 'weak', 'none']);
export type MatchQuality = z.infer<typeof MatchQuality>;

/** Identities only. Never prices — a stale price is a confidently wrong answer. */
export const CatalogueMatch = z
  .object({
    product_id: ProductId,
    handle: z.string().min(1),
    title: z.string().min(1),
    url: z.string().min(1),
    scent: z.string().min(1).optional(),
    format: z.string().min(1).optional(),
  })
  .strict();
export type CatalogueMatch = z.infer<typeof CatalogueMatch>;

export const SearchCatalogueResult = z
  .object({
    match_quality: MatchQuality,
    results: z.array(CatalogueMatch).max(5),
    /**
     * Only populated on `none`. Tool-computed so the agent admits the miss and offers one
     * alternative, rather than silently broadening the search.
     */
    alternatives: z.array(CatalogueMatch).max(2).optional(),
  })
  .strict();
export type SearchCatalogueResult = z.infer<typeof SearchCatalogueResult>;

/** Tier 3. Only for a product the shopper has already pointed at. Never used to rank. */
export const GetLiveFactsArgs = z
  .object({ product_id: ProductId, variant_id: VariantId.optional() })
  .strict();
export type GetLiveFactsArgs = z.infer<typeof GetLiveFactsArgs>;

export const GetLiveFactsResult = z
  .object({
    product_id: ProductId,
    variants: z
      .array(
        z
          .object({
            variant_id: VariantId,
            title: z.string().min(1),
            price: Money,
            available: z.boolean(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type GetLiveFactsResult = z.infer<typeof GetLiveFactsResult>;

export const ToolName = z.enum(['search_catalogue', 'get_live_facts']);
export type ToolName = z.infer<typeof ToolName>;

export const TOOL_SCHEMAS = {
  search_catalogue: { args: SearchCatalogueArgs, result: SearchCatalogueResult },
  get_live_facts: { args: GetLiveFactsArgs, result: GetLiveFactsResult },
} as const;

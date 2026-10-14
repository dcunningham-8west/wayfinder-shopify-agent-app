import type {
  GetLiveFactsArgs,
  GetLiveFactsResult,
  GetProductDetailsResult,
  PreviewTile,
  SearchCatalogueArgs,
  SearchCatalogueResult,
} from '@wayfinder/contracts';

/**
 * The seam the Catalogue Index lands behind. Tier 2 is in-memory and embedding-based; tier 3
 * is a live Admin API read. Both are the same shape to a caller, which is what lets the tool
 * webhook be tested without either.
 */
export interface Catalogue {
  /** Compact, current orientation for the agent; no prices or stock. */
  digest(): string;
  search(args: SearchCatalogueArgs): Promise<SearchCatalogueResult>;
  liveFacts(args: GetLiveFactsArgs): Promise<GetLiveFactsResult>;
  /** From the Index; undefined for an unknown id. */
  productDetails(productId: string): GetProductDetailsResult | undefined;
  /** Where a product lives on the storefront, so opening one does not depend on the page. */
  urlFor(productId: string): string | undefined;
  /** Tiles for the Preview Panel, in the order given; unknown ids are dropped. */
  previewTiles(productIds: readonly string[]): PreviewTile[];
}

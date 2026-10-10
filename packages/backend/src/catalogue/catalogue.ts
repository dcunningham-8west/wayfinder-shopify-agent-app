import type {
  GetLiveFactsArgs,
  GetLiveFactsResult,
  SearchCatalogueArgs,
  SearchCatalogueResult,
} from '@wayfinder/contracts';

/**
 * The seam the Catalogue Index lands behind. Tier 2 is in-memory and embedding-based; tier 3
 * is a live Admin API read. Both are the same shape to a caller, which is what lets the tool
 * webhook be tested without either.
 */
export interface Catalogue {
  search(args: SearchCatalogueArgs): Promise<SearchCatalogueResult>;
  liveFacts(args: GetLiveFactsArgs): Promise<GetLiveFactsResult>;
  /** Where a product lives on the storefront, so opening one does not depend on the page. */
  urlFor(productId: string): string | undefined;
}

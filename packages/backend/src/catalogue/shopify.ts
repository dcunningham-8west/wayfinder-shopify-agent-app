import type {
  GetLiveFactsArgs,
  GetLiveFactsResult,
  ProductId,
  VariantId,
} from '@wayfinder/contracts';
import { parseFacets } from './facets.js';
import type { CatalogueProduct } from './types.js';

/** Read-only Admin API access. The backend never writes to Shopify (section 05). */

const API_VERSION = '2026-10';
const PAGE_SIZE = 250;

const PRODUCTS_QUERY = `
  query CatalogueProducts($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        tags
        variants(first: 20) {
          nodes {
            id
            title
            availableForSale
            price
          }
        }
      }
    }
  }`;

interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  tags: string[];
  variants: { nodes: { id: string; title: string; availableForSale: boolean; price: string }[] };
}

interface ProductsPage {
  products: {
    nodes: ShopifyProductNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

export interface ShopifyConfig {
  storeDomain: string;
  adminToken: string;
  currency?: string;
}

export async function fetchCatalogue(config: ShopifyConfig): Promise<CatalogueProduct[]> {
  const products: CatalogueProduct[] = [];
  let cursor: string | null = null;

  do {
    const page: ProductsPage = await graphql<ProductsPage>(config, PRODUCTS_QUERY, { cursor });
    products.push(
      ...page.products.nodes.map((node) => toCatalogueProduct(node, config.currency ?? 'GBP')),
    );
    cursor = page.products.pageInfo.hasNextPage ? page.products.pageInfo.endCursor : null;
  } while (cursor);

  return products;
}

async function graphql<T>(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://${config.storeDomain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.adminToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Shopify Admin API ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };

  // GraphQL reports failures in a 200 body, so a bad token looks like success until here.
  if (payload.errors?.length || !payload.data) {
    throw new Error(`Shopify Admin API: ${payload.errors?.[0]?.message ?? 'no data'}`);
  }

  return payload.data;
}

function toCatalogueProduct(node: ShopifyProductNode, currency: string): CatalogueProduct {
  const variants = node.variants.nodes.map((v) => ({
    variant_id: v.id as VariantId,
    title: v.title,
    price: { amount_minor: toMinorUnits(v.price), currency },
    available: v.availableForSale,
  }));

  return {
    product_id: node.id as ProductId,
    handle: node.handle,
    title: node.title,
    url: `/products/${node.handle}`,
    facets: parseFacets(node.tags),
    variants,
    min_price_minor: Math.min(...variants.map((v) => v.price.amount_minor)),
  };
}

/** Shopify returns decimal strings; parsing to float and multiplying loses pennies. */
export function toMinorUnits(amount: string): number {
  const [whole = '0', fraction = ''] = amount.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

const PRODUCT_QUERY = `
  query LiveFacts($id: ID!) {
    product(id: $id) {
      id
      variants(first: 20) {
        nodes { id title availableForSale price }
      }
    }
  }`;

/** Tier 3: read live, never cached. Price and stock are the facts a stale answer ruins. */
export async function fetchLiveFacts(
  config: ShopifyConfig,
  args: GetLiveFactsArgs,
): Promise<GetLiveFactsResult> {
  const payload = await graphql<{ product: ShopifyProductNode | null }>(config, PRODUCT_QUERY, {
    id: args.product_id,
  });
  if (!payload.product) throw new Error(`Unknown product: ${args.product_id}`);

  const currency = config.currency ?? 'GBP';
  const variants = payload.product.variants.nodes
    .filter((v) => args.variant_id === undefined || v.id === args.variant_id)
    .map((v) => ({
      variant_id: v.id as VariantId,
      title: v.title,
      price: { amount_minor: toMinorUnits(v.price), currency },
      available: v.availableForSale,
    }));

  if (variants.length === 0) throw new Error(`Unknown variant: ${args.variant_id}`);
  return { product_id: payload.product.id as ProductId, variants };
}

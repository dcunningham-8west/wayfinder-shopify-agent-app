import { CartSnapshot, type CartSnapshot as CartSnapshotValue } from '@wayfinder/contracts';

interface ShopifyRoutes {
  routes?: { root?: string };
}

interface AjaxCartLine {
  key?: unknown;
  product_title?: unknown;
  title?: unknown;
  quantity?: unknown;
}

interface AjaxCart {
  item_count?: unknown;
  total_price?: unknown;
  currency?: unknown;
  items?: unknown;
}

export async function readCartSnapshot(): Promise<CartSnapshotValue> {
  const shopify = (window as Window & { Shopify?: ShopifyRoutes }).Shopify;
  const root = shopify?.routes?.root ?? '/';
  const response = await fetch(`${root}cart.js`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`cart read failed: ${response.status}`);

  const cart = (await response.json()) as AjaxCart;
  if (!Array.isArray(cart.items)) throw new Error('cart response has no items');

  const lines = cart.items.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('cart response has an invalid line');
    const line = value as AjaxCartLine;
    return {
      line_key: line.key,
      title: line.title ?? line.product_title,
      qty: line.quantity,
    };
  });

  const totalPrice = cart.total_price;
  const currency = cart.currency;
  const total = typeof totalPrice === 'number' && Number.isSafeInteger(totalPrice) &&
      typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)
    ? { amount_minor: totalPrice, currency }
    : undefined;

  return CartSnapshot.parse({ count: cart.item_count, total, lines });
}
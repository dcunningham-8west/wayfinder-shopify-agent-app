import type { Destination } from '@wayfinder/contracts';

export interface DestinationEntry extends Destination {
  url: string;
}

/** Routes every Dawn store has, so the list is useful before the Admin API answers. */
const FIXED: readonly DestinationEntry[] = [
  { id: 'home', title: 'Home page', url: '/' },
  { id: 'cart', title: 'Cart', url: '/cart' },
  { id: 'search', title: 'Search', url: '/search' },
  { id: 'collections', title: 'All collections', url: '/collections' },
  { id: 'collection:all', title: 'All products', url: '/collections/all' },
];

/** Every place `navigate` may send a shopper. Anything not listed is refused, not guessed. */
export class Destinations {
  #entries: DestinationEntry[] = [...FIXED];

  replace(fetched: readonly DestinationEntry[]): void {
    const ids = new Set(FIXED.map((d) => d.id));
    this.#entries = [...FIXED, ...fetched.filter((d) => !ids.has(d.id))];
  }

  list(): Destination[] {
    return this.#entries.map(({ id, title }) => ({ id, title }));
  }

  urlFor(id: string): string | undefined {
    return this.#entries.find((d) => d.id === id)?.url;
  }
}

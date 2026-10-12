import type { PreviewTile } from '@wayfinder/contracts';

/**
 * Section 06. Identity-level tiles only — every tile is a way *to* the storefront. The active
 * tile follows the agent's speech, so the shopper sees whichever product is being described.
 */

export interface PreviewPanel {
  /** False when nothing renderable arrived; the Action must not report success then (KF-001). */
  show(tiles: PreviewTile[]): boolean;
  hide(): void;
  follow(agentUtterance: string): void;
}

const IGNORED_WORDS = new Set(['the', 'and', 'with', 'for', 'from']);

function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/&/g, ' and ')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]+/g) ?? []
  );
}

/** Words that name one tile and no other; shared words like "gift set" cannot pick a tile. */
function distinctiveWords(tiles: PreviewTile[]): Set<string>[] {
  const perTile = tiles.map(
    (tile) => new Set(words(tile.title).filter((w) => w.length > 2 && !IGNORED_WORDS.has(w))),
  );
  const counts = new Map<string, number>();
  for (const set of perTile) for (const w of set) counts.set(w, (counts.get(w) ?? 0) + 1);
  return perTile.map((set) => new Set([...set].filter((w) => counts.get(w) === 1)));
}

function sameOriginHref(url: string): string | undefined {
  const href = new URL(url, location.origin);
  return href.origin === location.origin ? href.toString() : undefined;
}

function formatPrice(tile: PreviewTile): string {
  if (!tile.price) return '';
  const amount = new Intl.NumberFormat(document.documentElement.lang || undefined, {
    style: 'currency',
    currency: tile.price.currency,
  }).format(tile.price.amount_minor / 100);
  return tile.price_varies ? `From ${amount}` : amount;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function card(tile: PreviewTile, href: string): HTMLElement {
  const article = element('article', 'product-preview-card');
  article.append(element('span', 'product-preview-card__status', 'Now describing'));

  const image = element('div', 'product-preview-card__image');
  if (tile.image_url) {
    const img = element('img', '');
    img.src = tile.image_url;
    img.alt = '';
    img.loading = 'lazy';
    image.append(img);
  }

  const body = element('div', 'product-preview-card__body');
  body.append(element('h4', '', tile.title));

  const footer = element('div', 'product-preview-card__footer');
  footer.append(element('span', 'product-preview-card__price', formatPrice(tile)));
  const link = element('a', 'product-preview-card__link', 'View product');
  link.href = href;
  footer.append(link);
  body.append(footer);

  article.append(image, body);
  return article;
}

export function mountPreviewPanel(root: HTMLElement): PreviewPanel | undefined {
  const panel = root.querySelector<HTMLElement>('.js-preview-panel');
  const inner = root.querySelector<HTMLElement>('.js-preview-panel-inner');
  if (!panel || !inner) return undefined;

  let cards: HTMLElement[] = [];
  let distinctive: Set<string>[] = [];
  let active = -1;

  const setActive = (index: number): void => {
    if (index === active) return;
    cards[active]?.classList.replace('is-active', 'is-viewed');
    active = index;
    const current = cards[index];
    if (!current) return;
    current.classList.remove('is-viewed');
    current.classList.add('is-active');
    inner.scrollTo({ top: current.offsetTop - inner.offsetTop, behavior: 'smooth' });
  };

  const hide = (): void => {
    panel.classList.remove('is-open');
    root.classList.remove('is-preview-open');
  };

  root.querySelector('.js-close-icon')?.addEventListener('click', hide);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  return {
    show(tiles) {
      const renderable = tiles.flatMap((tile) => {
        const href = sameOriginHref(tile.url);
        return href ? [{ tile, href }] : [];
      });
      if (renderable.length === 0) return false;

      const grid = element('div', 'product-preview-grid');
      cards = renderable.map(({ tile, href }) => card(tile, href));
      grid.append(...cards);
      inner.replaceChildren(grid);
      distinctive = distinctiveWords(renderable.map((r) => r.tile));
      active = -1;
      setActive(0);

      panel.classList.add('is-open');
      root.classList.add('is-preview-open');
      return true;
    },

    hide,

    follow(agentUtterance) {
      if (!panel.classList.contains('is-open')) return;
      const spoken = words(agentUtterance);
      let best = -1;
      let bestPosition = -1;
      // The most recently named product wins: one utterance often walks through several.
      spoken.forEach((word, position) => {
        const tile = distinctive.findIndex((set) => set.has(word));
        if (tile >= 0 && position > bestPosition) {
          best = tile;
          bestPosition = position;
        }
      });
      if (best >= 0) setActive(best);
    },
  };
}

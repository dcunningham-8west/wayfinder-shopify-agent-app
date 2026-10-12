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

const IGNORED_WORDS = new Set(['the', 'and', 'with', 'for', 'from', 'this', 'that', 'one']);
/** Spoken names run a few words; a wider window lets the previous product's name leak in. */
const MATCH_WINDOW_WORDS = 6;

function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/&/g, ' and ')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]+/g) ?? []
  ).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

interface Matcher {
  tileWords: Set<string>[];
  /** Rarer across tiles weighs more; a word every tile shares weighs nothing. */
  weight: Map<string, number>;
}

/** The catalogue is a scent × format grid, so tiles often share a scent and differ by one word. */
function buildMatcher(tiles: PreviewTile[]): Matcher {
  const tileWords = tiles.map(
    (tile) => new Set(words(tile.title).filter((w) => w.length > 2 && !IGNORED_WORDS.has(w))),
  );
  const counts = new Map<string, number>();
  for (const set of tileWords) for (const w of set) counts.set(w, (counts.get(w) ?? 0) + 1);
  const weight = new Map<string, number>();
  for (const [w, count] of counts) weight.set(w, Math.log(tiles.length / count));
  return { tileWords, weight };
}

/** The tile named most recently in the utterance, or -1 if none is clearly named. */
function latestNamedTile(matcher: Matcher, utterance: string): number {
  const spoken = words(utterance);
  for (let end = spoken.length; end > 0; end -= 1) {
    const last = spoken[end - 1] ?? '';
    // Only a window ending on a naming word counts, so the match lands where the name was said.
    if (!matcher.weight.get(last)) continue;

    // The word just said picks the candidates; earlier words only separate those that share it.
    const candidates = matcher.tileWords.flatMap((set, i) => (set.has(last) ? [i] : []));
    if (candidates.length === 1) return candidates[0] ?? -1;

    // Widen backwards until one candidate leads: "the smaller 200g" leans on the scent said before.
    for (let start = end - MATCH_WINDOW_WORDS; ; start -= MATCH_WINDOW_WORDS) {
      const window = new Set(spoken.slice(Math.max(0, start), end));
      const scores = candidates.map((i) =>
        [...window].reduce(
          (sum, w) => sum + (matcher.tileWords[i]?.has(w) ? (matcher.weight.get(w) ?? 0) : 0),
          0,
        ),
      );
      const best = Math.max(...scores);
      if (scores.filter((s) => s === best).length === 1) return candidates[scores.indexOf(best)] ?? -1;
      if (start <= 0) break;
    }
  }
  return -1;
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
  let titles: string[] = [];
  let matcher: Matcher = { tileWords: [], weight: new Map() };
  let active = -1;

  const setActive = (index: number): void => {
    if (index === active) return;
    cards[active]?.classList.replace('is-active', 'is-viewed');
    active = index;
    const current = cards[index];
    if (!current) return;
    current.classList.remove('is-viewed');
    current.classList.add('is-active');
    const offset = current.getBoundingClientRect().top - inner.getBoundingClientRect().top;
    inner.scrollTo({ top: inner.scrollTop + offset, behavior: 'smooth' });
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
      matcher = buildMatcher(renderable.map((r) => r.tile));
      titles = renderable.map((r) => r.tile.title);
      active = -1;
      setActive(0);

      panel.classList.add('is-open');
      root.classList.add('is-preview-open');
      return true;
    },

    hide,

    follow(agentUtterance) {
      if (!panel.classList.contains('is-open')) return;
      const named = latestNamedTile(matcher, agentUtterance);
      if (named < 0 || named === active) return;
      console.debug('[wayfinder] preview follows', titles[named]);
      setActive(named);
    },
  };
}

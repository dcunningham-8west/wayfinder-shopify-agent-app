import { PageContext, PageSection } from '@wayfinder/contracts';

/**
 * Section 04. The theme emits this in Liquid at render time; the widget reads it and never
 * scrapes. Name-similarity resolution is what described the wrong product in the prior
 * version, so the DOM is never asked what a product is.
 *
 * Emitted as `application/json` deliberately: it survives the `innerHTML` replacement a
 * Section Rendering API swap performs, where an executable `<script>` would silently not run.
 */

const PAGE_SELECTOR = 'script[type="application/json"][data-wayfinder-page]';
const SECTION_SELECTOR = 'script[type="application/json"][data-wayfinder-section]';

function parse(element: Element): unknown {
  try {
    return JSON.parse(element.textContent ?? '');
  } catch {
    return undefined;
  }
}

/** Bumped on every re-emission, so an Action failure can be explained rather than gated. */
let epoch = 0;

export function readPageContext(): PageContext | undefined {
  const page = document.querySelector(PAGE_SELECTOR);
  if (!page) return undefined;

  const base = parse(page);
  if (typeof base !== 'object' || base === null) return undefined;

  const sections = [...document.querySelectorAll(SECTION_SELECTOR)]
    .map((element) => PageSection.safeParse(parse(element)))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));

  epoch += 1;
  const candidate = { ...(base as object), url: location.pathname, epoch, sections };

  const result = PageContext.safeParse(candidate);
  return result.success ? result.data : undefined;
}

/**
 * One filter click replaces the grid, the count and the pills in a burst. Coalescing over an
 * animation frame means the agent is told once, not told a stutter.
 */
export function observePageContext(onChange: (context: PageContext) => void): () => void {
  let queued = false;

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const context = readPageContext();
      if (context) onChange(context);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

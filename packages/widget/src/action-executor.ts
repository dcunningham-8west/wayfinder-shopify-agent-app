import type { Action, ActionFailure, ActionResult } from '@wayfinder/contracts';
import { readPageContext } from './page-context.js';

/**
 * Section 06. Cart writes run here, through the Ajax Cart API: the cart cookie and the
 * theme's drawer re-render both live in the page, so writing server-side would mean
 * reimplementing both.
 */

type Outcome = ActionResult['outcome'];

const CART_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

function failed(reason: ActionFailure['reason'], message?: string): ActionFailure {
  return { status: 'error', reason, ...(message ? { message } : {}) };
}

/** The agent names a target id and never a selector; the theme owns the mapping. */
function findTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-agent-action="${CSS.escape(targetId)}"]`);
}

function notFound(): ActionFailure {
  const context = readPageContext();
  // The epoch rides along so the agent can say "that one's been filtered out".
  return { status: 'error', reason: 'target_not_found', ...(context ? { page_epoch: context.epoch } : {}) };
}

async function cart(path: string, body: unknown): Promise<Outcome> {
  const response = await fetch(path, {
    method: 'POST',
    headers: CART_HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { description?: string };
    return failed('cart_rejected', detail.description);
  }

  const state = (await fetch('/cart.js', { headers: CART_HEADERS }).then((r) => r.json())) as {
    item_count: number;
  };
  // The drawer is the theme's business; tell it something happened and let it re-render.
  document.dispatchEvent(new CustomEvent('wayfinder:cart-updated'));
  return { status: 'ok', cart_count: state.item_count };
}

function withParams(mutate: (params: URLSearchParams) => void): Outcome {
  const url = new URL(location.href);
  mutate(url.searchParams);
  location.assign(url.toString());
  return { status: 'ok', acked: true };
}

export async function executeAction(action: Action): Promise<Outcome> {
  switch (action.action) {
    case 'navigate':
      // Ack before unloading: a request held open across a page unload dies with the page.
      queueMicrotask(() => location.assign(action.url));
      return { status: 'ok', acked: true };

    case 'open_product': {
      const target = findTarget(action.product_id);
      const href = target?.getAttribute('href');
      if (!href) return notFound();
      queueMicrotask(() => location.assign(href));
      return { status: 'ok', acked: true };
    }

    case 'select_variant': {
      const target = findTarget(action.variant_id);
      const values = target?.dataset.wayfinderOptions?.split('~~');
      if (!values?.length) return notFound();

      // Set what Dawn's picker understands and let it re-render; it owns the swap, not us.
      const picker = document.querySelector('variant-selects, variant-radios');
      const inputs = picker?.querySelectorAll<HTMLSelectElement | HTMLInputElement>(
        'select, input[type="radio"]',
      );
      if (!inputs?.length) return notFound();

      for (const input of inputs) {
        if (input instanceof HTMLSelectElement) {
          const index = [...picker!.querySelectorAll('select')].indexOf(input);
          const value = values[index];
          if (value !== undefined) input.value = value;
        } else if (values.includes(input.value)) {
          input.checked = true;
        }
      }
      inputs[0]?.dispatchEvent(new Event('change', { bubbles: true }));

      const page_context = readPageContext();
      if (!page_context) return failed('unknown', 'the page did not re-emit');
      return { status: 'ok', available: true, page_context };
    }

    case 'add_to_cart':
      return cart('/cart/add.js', { items: [{ id: action.variant_id, quantity: action.qty }] });

    case 'update_cart_line':
      return cart('/cart/change.js', { id: action.line_key, quantity: action.qty });

    case 'apply_filter':
      return withParams((params) => {
        params.delete(`filter.p.m.custom.${action.facet}`);
        for (const value of action.values) {
          params.append(`filter.p.m.custom.${action.facet}`, value);
        }
      });

    case 'sort':
      return withParams((params) => params.set('sort_by', action.order));

    case 'scroll_to': {
      const target = findTarget(action.target_id);
      if (!target) return notFound();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { status: 'ok' };
    }

    case 'submit_form': {
      const form = findTarget(action.target_id);
      if (!(form instanceof HTMLFormElement)) return notFound();
      for (const [name, value] of Object.entries(action.fields)) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = value;
      }
      if (!form.reportValidity()) return failed('validation_failed');
      form.submit();
      return { status: 'ok' };
    }

    case 'show_in_widget':
      document.dispatchEvent(
        new CustomEvent('wayfinder:show-products', { detail: action.product_ids }),
      );
      return { status: 'ok' };
  }
}

import { z } from 'zod';
import { CartLineKey, Facet, Money, ProductId, TargetId, VariantId } from './identity.js';
import { PageContext } from './page-context.js';

/**
 * Section 06. An Action always executes in the browser, always returns an outcome, and never
 * returns product facts. The vocabulary is fixed and typed — deliberately not a generic
 * `perform(target, intent)`, which would move the legal set out of the prompt into data and
 * leave the model guessing what is allowed.
 */

export const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('navigate'), url: z.string().min(1) }),
  z.object({
    action: z.literal('open_product'),
    product_id: ProductId,
    variant_id: VariantId.optional(),
  }),
  z.object({ action: z.literal('select_variant'), variant_id: VariantId }),
  z.object({
    action: z.literal('add_to_cart'),
    variant_id: VariantId,
    qty: z.number().int().positive().max(10),
  }),
  z.object({
    action: z.literal('update_cart_line'),
    line_key: CartLineKey,
    qty: z.number().int().nonnegative().max(10),
  }),
  z.object({
    action: z.literal('apply_filter'),
    facet: Facet,
    values: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal('sort'),
    order: z.enum(['relevance', 'price-asc', 'price-desc', 'title-asc', 'newest', 'best-selling']),
  }),
  z.object({ action: z.literal('scroll_to'), target_id: TargetId }),
  z.object({
    action: z.literal('submit_form'),
    target_id: TargetId,
    fields: z.record(z.string(), z.string()),
  }),
  // Identity-level only: a way *to* the storefront, never a replacement for it.
  z.object({ action: z.literal('show_in_widget'), product_ids: z.array(ProductId).min(1).max(5) }),
]);
export type Action = z.infer<typeof Action>;

export const ActionName = z.enum([
  'navigate',
  'open_product',
  'select_variant',
  'add_to_cart',
  'update_cart_line',
  'apply_filter',
  'sort',
  'scroll_to',
  'submit_form',
  'show_in_widget',
]);
export type ActionName = z.infer<typeof ActionName>;

/** Without this the widget cannot tell a retry from a second add (ticket 012). */
export const IdempotencyKey = z.string().min(1).brand<'IdempotencyKey'>();
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

export const ActionEnvelope = z
  .object({
    type: z.literal('action'),
    envelope_id: z.string().min(1),
    idempotency_key: IdempotencyKey,
    action: Action,
  })
  .strict();
export type ActionEnvelope = z.infer<typeof ActionEnvelope>;

/**
 * Outcomes. Typed per action, plus a fresh Page Context for anything that changed what is on
 * screen — a filter leaving four products is a different conversation to one leaving zero.
 */

const ok = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ status: z.literal('ok'), ...shape }).strict();

export const ActionFailure = z
  .object({
    status: z.literal('error'),
    reason: z.enum([
      'target_not_found',
      'unavailable',
      'validation_failed',
      'cart_rejected',
      'timeout',
      'unknown',
    ]),
    message: z.string().optional(),
    /** Rides along on target_not_found so the agent can say "that one's been filtered out". */
    page_epoch: z.number().int().positive().optional(),
  })
  .strict();
export type ActionFailure = z.infer<typeof ActionFailure>;

const CartOutcome = {
  cart_count: z.number().int().nonnegative(),
  line_total: Money.optional(),
};

const ResultByAction = {
  // Acks only: holding a request open across a page unload would kill it with the page.
  navigate: ok({ acked: z.literal(true) }),
  open_product: ok({ acked: z.literal(true) }),
  select_variant: ok({
    price: Money.optional(),
    available: z.boolean(),
    page_context: PageContext,
  }),
  add_to_cart: ok(CartOutcome),
  update_cart_line: ok(CartOutcome),
  apply_filter: ok({ result_count: z.number().int().nonnegative(), page_context: PageContext }),
  sort: ok({ result_count: z.number().int().nonnegative(), page_context: PageContext }),
  scroll_to: ok({}),
  submit_form: ok({}),
  show_in_widget: ok({}),
} as const;

export const ActionResult = z
  .object({
    type: z.literal('action_result'),
    envelope_id: z.string().min(1),
    action: ActionName,
    outcome: z.union([
      ResultByAction.navigate,
      ResultByAction.select_variant,
      ResultByAction.add_to_cart,
      ResultByAction.apply_filter,
      ResultByAction.scroll_to,
      ActionFailure,
    ]),
  })
  .strict();
export type ActionResult = z.infer<typeof ActionResult>;

/** Narrows `outcome` to the shape that action actually returns. */
export function outcomeSchemaFor(action: ActionName) {
  return z.union([ResultByAction[action], ActionFailure]);
}

/** Live leg only. In Standby the widget just overwrites its copy (section 04). */
export const PageContextUpdate = z
  .object({
    type: z.literal('page_context_update'),
    page_context: PageContext,
    /** True when the shopper did it, not us — the only in-page mutation that matters. */
    shopper_initiated: z.boolean(),
  })
  .strict();
export type PageContextUpdate = z.infer<typeof PageContextUpdate>;

export const ServerMessage = z.discriminatedUnion('type', [ActionEnvelope]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export const ClientMessage = z.discriminatedUnion('type', [ActionResult, PageContextUpdate]);
export type ClientMessage = z.infer<typeof ClientMessage>;

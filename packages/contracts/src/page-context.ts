import { z } from 'zod';
import { Money, ProductId, VariantId } from './identity.js';

/**
 * Section 04. Emitted by Liquid at render time, per section, as
 * `<script type="application/json">`.
 *
 * Every object here is `.strict()` on purpose: the rule "never carries descriptions, body
 * copy or marketing prose" is only real if an emitter that adds one fails to validate.
 */

export const PageContextProduct = z
  .object({
    product_id: ProductId,
    variant_id: VariantId.optional(),
    handle: z.string().min(1),
    title: z.string().min(1),
    url: z.string().min(1),
    position: z.number().int().nonnegative(),
    // On screen already, so denying knowledge would be absurd — but a rendering, not truth.
    price: Money.optional(),
    available: z.boolean().optional(),
  })
  .strict();
export type PageContextProduct = z.infer<typeof PageContextProduct>;

/** Describable and actionable, never product truth (section 04). */
export const Furniture = z
  .object({
    kind: z.enum(['banner', 'form', 'rich_text', 'filters', 'navigation', 'other']),
    label: z.string().min(1).optional(),
  })
  .strict();
export type Furniture = z.infer<typeof Furniture>;

export const PageSection = z
  .object({
    section_id: z.string().min(1),
    kind: z.string().min(1),
    products: z.array(PageContextProduct).default([]),
    furniture: z.array(Furniture).default([]),
  })
  .strict();
export type PageSection = z.infer<typeof PageSection>;

export const PageTemplate = z.enum([
  'index',
  'product',
  'collection',
  'list-collections',
  'search',
  'cart',
  'page',
  'blog',
  'article',
  '404',
]);
export type PageTemplate = z.infer<typeof PageTemplate>;

export const PageContext = z
  .object({
    /** Bumped on every re-emission. Explains Action failures; never gates them (ticket 013). */
    epoch: z.number().int().positive(),
    url: z.string().min(1),
    template: PageTemplate,
    /** The page's primary subject, when it has one. */
    subject: PageContextProduct.optional(),
    collection_handle: z.string().min(1).optional(),
    sections: z.array(PageSection).default([]),
  })
  .strict();
export type PageContext = z.infer<typeof PageContext>;

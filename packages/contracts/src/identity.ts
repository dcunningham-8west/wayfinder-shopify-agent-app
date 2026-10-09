import { z } from 'zod';

/**
 * Identity primitives. Section 04: the page supplies identity, the catalogue supplies facts.
 */

export const ProductId = z.string().min(1).brand<'ProductId'>();
export type ProductId = z.infer<typeof ProductId>;

export const VariantId = z.string().min(1).brand<'VariantId'>();
export type VariantId = z.infer<typeof VariantId>;

/** Theme-declared `data-agent-action` id. The agent never sees a selector (section 06). */
export const TargetId = z.string().min(1).brand<'TargetId'>();
export type TargetId = z.infer<typeof TargetId>;

/** Public by design, and safe in the Seed. Unlike the Session Token (section 06). */
export const SessionId = z.string().min(1).brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionId>;

export const CallLegId = z.string().min(1).brand<'CallLegId'>();
export type CallLegId = z.infer<typeof CallLegId>;

export const CartLineKey = z.string().min(1).brand<'CartLineKey'>();
export type CartLineKey = z.infer<typeof CartLineKey>;

/** Money stays integer minor units; a float price read aloud is a wrong price. */
export const Money = z.object({
  amount_minor: z.number().int(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof Money>;

/** The six-facet tag model (section 05). `Type` is deliberately absent — it is unreliable. */
export const Facet = z.enum(['fragrance', 'mood', 'style', 'scent', 'maincat', 'subcat']);
export type Facet = z.infer<typeof Facet>;

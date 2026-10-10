import { z } from 'zod';
import { CallLegId, CartLineKey, Money, ProductId, SessionId, TargetId } from './identity.js';
import { CatalogueMatch } from './tools.js';
import { PageContext } from './page-context.js';

/** Section 03. */

export const SessionMode = z.enum(['standby', 'live']);
export type SessionMode = z.infer<typeof SessionMode>;

/**
 * Section 11. Replaced wholesale, except when the shopper navigates *into* a member of the
 * set — a plain replace there destroys the shortlist the navigation is acting on.
 * Found by ticket 017's harness.
 */
export const REFERENT_SET_CAPACITY = 8;

export const ReferentSet = z.array(CatalogueMatch).max(REFERENT_SET_CAPACITY);
export type ReferentSet = z.infer<typeof ReferentSet>;

/** Valid for *talking* about the cart. Never valid for computing a mutation. */
export const CartSnapshot = z
  .object({
    count: z.number().int().nonnegative(),
    total: Money.optional(),
    lines: z
      .array(
        z
          .object({
            line_key: CartLineKey,
            title: z.string().min(1),
            qty: z.number().int().positive(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type CartSnapshot = z.infer<typeof CartSnapshot>;

export const SessionState = z
  .object({
    products_discussed: z.array(ProductId).default([]),
    stated_preferences: z.array(z.string()).default([]),
    pending_action: z.string().optional(),
    promises_made: z.array(z.string()).default([]),
  })
  .strict();
export type SessionState = z.infer<typeof SessionState>;

export const SessionSeed = z
  .object({
    session_id: SessionId,
    call_leg_id: CallLegId,
    session_state: SessionState,
    referent_set: ReferentSet,
    /** Conversational texture so the agent resumes mid-thought. Trimmed first. */
    verbatim_tail: z
      .array(z.object({ role: z.enum(['agent', 'shopper']), text: z.string() }).strict())
      .default([]),
    cart: CartSnapshot,
    page_context: PageContext,
    action_targets: z.array(TargetId).default([]),
    catalogue_digest: z.string().optional(),
    /** Lets the agent speak naturally about why the page changed. */
    agent_caused_navigation: z.boolean(),
  })
  .strict();
export type SessionSeed = z.infer<typeof SessionSeed>;

/**
 * Not advisory: above this Retell applies a prompt surcharge and the flat per-leg cost model
 * collapses.
 */
export const SEED_TOKEN_BUDGET = 4000;

/** Everything absent here is never shed — being vague beats being wrong about the screen. */
export const SEED_SHED_ORDER = ['verbatim_tail', 'session_state', 'catalogue_digest'] as const;
export type SheddableSeedComponent = (typeof SEED_SHED_ORDER)[number];

export const TIMING = {
  /** Churn during rapid navigation. */
  settleBeforeLegMs: 2_000,
  /** Retell's undocumented `create-web-call` rate limit. */
  minBetweenLegsMs: 5_000,
  /** The 10 s billing minimum, and runaway cost. */
  idleToStandbyMs: 45_000,
  /** Ticket 014: the backend stores nothing at rest. */
  sessionIdleTtlMs: 30 * 60_000,
} as const;

export const MAX_SESSIONS_IN_MEMORY = 1000;

/**
 * Retell's own defaults are keep-everything-forever, so these are set explicitly on the agent
 * *and* on every Call Leg. Ticket 014.
 */
export const RETELL_DATA_STORAGE = {
  setting: 'everything_except_pii',
  retentionDays: 30,
  piiMode: 'post_call',
  /** All 14 categories: redaction is post-call, so scrubbing everything costs the agent nothing. */
  piiCategories: [
    'person_name',
    'address',
    'email',
    'phone_number',
    'ssn',
    'passport',
    'driver_license',
    'credit_card',
    'bank_account',
    'password',
    'pin',
    'medical_id',
    'date_of_birth',
    'customer_account_number',
  ],
} as const;

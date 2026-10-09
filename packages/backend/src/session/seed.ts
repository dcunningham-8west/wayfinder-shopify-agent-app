import type { CallLegId, PageContext, SessionSeed, TargetId } from '@wayfinder/contracts';
import { SEED_TOKEN_BUDGET } from '@wayfinder/contracts';
import type { Session } from './session-store.js';

/**
 * Section 03. Pure: a Session and a Page Context in, a Seed out. No I/O, which is why this is
 * the cheapest part of the system to test despite being the richest in behaviour.
 */

const VERBATIM_TURNS = 4;

export interface SeedInputs {
  session: Session;
  callLegId: CallLegId;
  pageContext: PageContext;
  actionTargets?: TargetId[];
  catalogueDigest?: string;
}

export interface SeedResult {
  seed: SessionSeed;
  estimatedTokens: number;
  /** What had to go, in the order it went. Empty is the normal case. */
  shed: string[];
}

export function assembleSeed(inputs: SeedInputs): SeedResult {
  const { session, callLegId, pageContext } = inputs;

  const seed: SessionSeed = {
    session_id: session.id,
    call_leg_id: callLegId,
    session_state: session.state,
    referent_set: session.referents,
    verbatim_tail: session.transcript.slice(-VERBATIM_TURNS),
    cart: session.cart,
    page_context: pageContext,
    action_targets: inputs.actionTargets ?? [],
    catalogue_digest: inputs.catalogueDigest,
    agent_caused_navigation: session.agentCausedNavigation,
  };

  return degrade(seed);
}

/**
 * Over budget Retell applies a prompt surcharge and the flat per-leg cost model collapses,
 * so this is a hard limit rather than a guideline.
 *
 * Page Context, Action Targets and the Cart Snapshot are never shed: without them the agent
 * is wrong about the shopper's screen, which is worse than being vague.
 */
function degrade(seed: SessionSeed): SeedResult {
  const shed: string[] = [];

  while (estimateTokens(seed) > SEED_TOKEN_BUDGET) {
    if (seed.verbatim_tail.length > 0) {
      seed.verbatim_tail = seed.verbatim_tail.slice(1);
      if (!shed.includes('verbatim_tail')) shed.push('verbatim_tail');
      continue;
    }
    if (seed.session_state.products_discussed.length > 0) {
      seed.session_state = {
        ...seed.session_state,
        products_discussed: seed.session_state.products_discussed.slice(1),
      };
      if (!shed.includes('session_state')) shed.push('session_state');
      continue;
    }
    if (seed.catalogue_digest !== undefined) {
      seed.catalogue_digest = undefined;
      shed.push('catalogue_digest');
      continue;
    }
    break; // Everything sheddable is gone; what remains is load-bearing.
  }

  return { seed, estimatedTokens: estimateTokens(seed), shed };
}

/** Deliberately crude. A tokeniser would be a dependency for a threshold check. */
export function estimateTokens(seed: SessionSeed): number {
  return Math.ceil(JSON.stringify(seed).length / 4);
}

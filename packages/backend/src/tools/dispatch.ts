import {
  Action,
  ActionName,
  GetLiveFactsArgs,
  GetProductDetailsArgs,
  SearchCatalogueArgs,
  ToolName,
  type ProductId,
  type SessionId,
} from '@wayfinder/contracts';
import type { SafeParseReturnType } from 'zod';
import type { ActionChannel } from '../actions/action-channel.js';
import type { Catalogue } from '../catalogue/catalogue.js';
import type { SessionStore } from '../session/session-store.js';

/**
 * The tool seam, with no HTTP in it. Section 12: this is testable as a plain function call.
 */

export interface ToolCall {
  name: string;
  args: unknown;
  /** From the Call's metadata — an Action has to find the browser that owns this Session. */
  sessionId?: SessionId;
}

export interface ToolDeps {
  catalogue: Catalogue;
  actions: ActionChannel;
  sessions: SessionStore;
}

/** Everything the agent might have to say out loud, including the failures. */
export type ToolOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: string; detail?: string };

export async function dispatchToolCall(call: ToolCall, deps: ToolDeps): Promise<ToolOutcome> {
  const tool = ToolName.safeParse(call.name);
  if (tool.success) return dispatchTool(tool.data, call, deps);

  const action = ActionName.safeParse(call.name);
  if (action.success) return dispatchAction(action.data, call, deps);

  return { ok: false, error: 'unknown_tool', detail: call.name };
}

/** Bounds what showing tiles can add to a search turn; a slow page costs the panel, not speech. */
const PREVIEW_TIMEOUT_MS = 1_500;

async function dispatchTool(name: ToolName, call: ToolCall, deps: ToolDeps): Promise<ToolOutcome> {
  switch (name) {
    case 'search_catalogue': {
      const args = SearchCatalogueArgs.safeParse(call.args);
      if (!args.success) return invalidArguments(args);
      const result = await deps.catalogue.search(args.data);
      const shown = result.results.length > 0 ? result.results : (result.alternatives ?? []);
      const preview = await showPreview(call.sessionId, shown.map((m) => m.product_id), deps);
      return { ok: true, result: { ...result, preview } };
    }
    case 'get_live_facts': {
      const args = GetLiveFactsArgs.safeParse(call.args);
      if (!args.success) return invalidArguments(args);
      return { ok: true, result: await deps.catalogue.liveFacts(args.data) };
    }
    case 'get_product_details': {
      const args = GetProductDetailsArgs.safeParse(call.args);
      if (!args.success) return invalidArguments(args);
      const details = deps.catalogue.productDetails(args.data.product_id);
      if (!details) return { ok: false, error: 'unknown_product', detail: args.data.product_id };
      return { ok: true, result: details };
    }
  }
}

/** The backend shows results itself, so the panel never depends on the agent remembering to. */
async function showPreview(
  sessionId: SessionId | undefined,
  productIds: ProductId[],
  { actions, catalogue }: ToolDeps,
): Promise<'shown' | 'not_shown'> {
  if (!sessionId || productIds.length === 0 || !actions.isConnected(sessionId)) return 'not_shown';
  const tiles = catalogue.previewTiles(productIds);
  if (tiles.length === 0) return 'not_shown';

  const outcome = await actions.perform(
    sessionId,
    { action: 'show_in_widget', product_ids: tiles.map((t) => t.product_id), tiles },
    PREVIEW_TIMEOUT_MS,
  );
  return outcome.status === 'ok' ? 'shown' : 'not_shown';
}

async function dispatchAction(
  name: ActionName,
  call: ToolCall,
  { actions, sessions, catalogue }: ToolDeps,
): Promise<ToolOutcome> {
  if (!call.sessionId) return { ok: false, error: 'no_session', detail: 'call has no session' };

  const action = Action.safeParse({ ...(call.args as object), action: name });
  if (!action.success) return invalidArguments(action);

  if (action.data.action === 'open_product') {
    const url = catalogue.urlFor(action.data.product_id);
    if (!url) return { ok: false, error: 'unknown_product', detail: action.data.product_id };
    action.data.url = url;
  }

  const outcome = await actions.perform(call.sessionId, action.data);

  // The real outcome of a navigate lands in the next leg's Seed, which has to know we caused
  // it — otherwise the agent re-greets a shopper it just moved.
  const causesNavigation =
    action.data.action === 'navigate' ||
    action.data.action === 'open_product' ||
    action.data.action === 'apply_filter' ||
    action.data.action === 'sort' ||
    action.data.action === 'submit_form';
  if (outcome.status === 'ok' && causesNavigation) {
    sessions.markAgentNavigation(call.sessionId);
  }

  return { ok: true, result: outcome };
}

function invalidArguments(parsed: SafeParseReturnType<unknown, unknown>): ToolOutcome {
  const issue = parsed.success ? undefined : parsed.error.issues[0];
  return {
    ok: false,
    error: 'invalid_arguments',
    detail: issue && `${issue.path.join('.')}: ${issue.message}`,
  };
}

/** Retell stringifies the body for the LLM and caps it at 15,000 characters. */
export const RESULT_CHAR_CAP = 15_000;

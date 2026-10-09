import {
  Action,
  ActionName,
  GetLiveFactsArgs,
  SearchCatalogueArgs,
  ToolName,
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
  if (tool.success) return dispatchTool(tool.data, call.args, deps.catalogue);

  const action = ActionName.safeParse(call.name);
  if (action.success) return dispatchAction(action.data, call, deps);

  return { ok: false, error: 'unknown_tool', detail: call.name };
}

async function dispatchTool(
  name: ToolName,
  rawArgs: unknown,
  catalogue: Catalogue,
): Promise<ToolOutcome> {
  switch (name) {
    case 'search_catalogue': {
      const args = SearchCatalogueArgs.safeParse(rawArgs);
      if (!args.success) return invalidArguments(args);
      return { ok: true, result: await catalogue.search(args.data) };
    }
    case 'get_live_facts': {
      const args = GetLiveFactsArgs.safeParse(rawArgs);
      if (!args.success) return invalidArguments(args);
      return { ok: true, result: await catalogue.liveFacts(args.data) };
    }
  }
}

async function dispatchAction(
  name: ActionName,
  call: ToolCall,
  { actions, sessions }: ToolDeps,
): Promise<ToolOutcome> {
  if (!call.sessionId) return { ok: false, error: 'no_session', detail: 'call has no session' };

  const action = Action.safeParse({ ...(call.args as object), action: name });
  if (!action.success) return invalidArguments(action);

  const outcome = await actions.perform(call.sessionId, action.data);

  // The real outcome of a navigate lands in the next leg's Seed, which has to know we caused
  // it — otherwise the agent re-greets a shopper it just moved.
  if (outcome.status === 'ok' && (name === 'navigate' || name === 'open_product')) {
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

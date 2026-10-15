import {
  Action,
  ActionName,
  GetLiveFactsArgs,
  GetProductDetailsArgs,
  SearchCatalogueArgs,
  ToolName,
  type ProductId,
  type SearchCatalogueResult,
  type SessionId,
  type TargetId,
} from '@wayfinder/contracts';
import type { SafeParseReturnType } from 'zod';
import type { ActionChannel } from '../actions/action-channel.js';
import type { Catalogue } from '../catalogue/catalogue.js';
import type { Destinations } from '../destinations/destinations.js';
import type { Session, SessionStore, StagedResults } from '../session/session-store.js';

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
  destinations: Pick<Destinations, 'urlFor'>;
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
      const session = call.sessionId ? deps.sessions.get(call.sessionId) : undefined;
      if (session) session.staged = undefined;

      if (session && isBroad(result, args.data)) {
        const ids = result.results.map((m) => m.product_id);
        if (session.presentation === 'preview') {
          return { ok: true, result: { ...result, preview: await showPreview(session.id, ids, deps) } };
        }
        session.staged = {
          tiles: deps.catalogue.previewTiles(ids),
          onPage: onPageFor(session, ids, args.data),
        };
        const offer = { on_page: session.staged.onPage.kind, ask: session.presentation !== 'on_page' };
        return { ok: true, result: { ...result, preview: 'staged', offer } };
      }

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

/** Section 06, the Offer: several confident results, or any facet-filtered browse. */
function isBroad(result: SearchCatalogueResult, args: SearchCatalogueArgs): boolean {
  if (result.results.length === 0) return false;
  if ((args.facets?.length ?? 0) > 0) return true;
  return result.results.length > 1 && result.match_quality !== 'weak';
}

/** Scroll only to a section rendering a result; a matching heading can hide them behind "View all". */
function onPageFor(
  session: Session,
  ids: ProductId[],
  args: SearchCatalogueArgs,
): StagedResults['onPage'] {
  const wanted = new Set(ids);
  let best: { id: string; overlap: number } | undefined;
  for (const s of session.pageContext?.sections ?? []) {
    const overlap = s.products.filter((p) => wanted.has(p.product_id)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: s.section_id, overlap };
  }
  if (best) return { kind: 'scroll', target_id: best.id as TargetId };

  if (args.facets && args.facets.length > 0) {
    const params = new URLSearchParams();
    for (const f of args.facets) {
      for (const v of f.values) params.append(`filter.p.m.custom.${f.facet}`, v);
    }
    return { kind: 'navigate', destination_id: 'collection:all', url: `/collections/all?${params}` };
  }
  const params = new URLSearchParams({ q: args.query, type: 'product' });
  return { kind: 'navigate', destination_id: 'search', url: `/search?${params}` };
}

/** Resolves the arg-less Offer actions against what the last search staged. */
async function performOffer(
  name: 'show_preview' | 'show_on_page',
  sessionId: SessionId,
  deps: ToolDeps,
): Promise<ToolOutcome> {
  const session = deps.sessions.get(sessionId);
  const staged = session?.staged;
  if (!session || !staged) return { ok: false, error: 'nothing_staged', detail: 'search first' };

  if (name === 'show_preview') {
    const outcome = await deps.actions.perform(sessionId, {
      action: 'show_in_widget',
      product_ids: staged.tiles.map((t) => t.product_id),
      tiles: staged.tiles,
    });
    if (outcome.status === 'ok') session.presentation = 'preview';
    return { ok: true, result: outcome };
  }

  const onPage = staged.onPage;
  const outcome = await deps.actions.perform(
    sessionId,
    onPage.kind === 'scroll'
      ? { action: 'scroll_to', target_id: onPage.target_id }
      : { action: 'navigate', destination_id: onPage.destination_id, url: onPage.url },
  );
  if (outcome.status === 'ok') {
    session.presentation = 'on_page';
    if (onPage.kind === 'navigate' && !('already_here' in outcome)) {
      deps.sessions.markAgentNavigation(sessionId);
    }
  }
  return { ok: true, result: outcome };
}

async function dispatchAction(
  name: ActionName,
  call: ToolCall,
  deps: ToolDeps,
): Promise<ToolOutcome> {
  const { actions, sessions, catalogue, destinations } = deps;
  if (!call.sessionId) return { ok: false, error: 'no_session', detail: 'call has no session' };

  const action = Action.safeParse({ ...(call.args as object), action: name });
  if (!action.success) return invalidArguments(action);

  if (action.data.action === 'show_preview' || action.data.action === 'show_on_page') {
    return performOffer(action.data.action, call.sessionId, deps);
  }

  if (action.data.action === 'navigate') {
    const url = destinations.urlFor(action.data.destination_id);
    if (!url) {
      return { ok: false, error: 'unknown_destination', detail: action.data.destination_id };
    }
    action.data.url = url;
  }

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
  if (outcome.status === 'ok' && causesNavigation && !('already_here' in outcome)) {
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

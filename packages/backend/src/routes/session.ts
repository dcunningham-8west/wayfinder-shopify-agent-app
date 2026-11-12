import {
  ActionTargetIds,
  CartSnapshot,
  CHAT_OPENING_TRIGGER,
  ChatMessageRequest,
  FormSubmissionResults,
  PageContext,
  type AvatarTokenResponse,
  type CallLegResponse,
  type ChatLegId,
  type ChatLegResponse,
  type ChatMessageResponse,
  type SessionId,
} from '@wayfinder/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AvatarMinter } from '../avatar/avatar-minter.js';
import type { Catalogue } from '../catalogue/catalogue.js';
import type { ChatProvider } from '../chat/chat-provider.js';
import type { Destinations } from '../destinations/destinations.js';
import { assembleSeed, continuityMode } from '../session/seed.js';
import type { Session, SessionStore } from '../session/session-store.js';
import type { TranscriptRelay } from '../voice/transcript-relay.js';
import type { VoiceProvider } from '../voice/voice-provider.js';

export interface SessionRoutesOptions {
  sessions: SessionStore;
  catalogue: Pick<Catalogue, 'digest'>;
  destinations?: Pick<Destinations, 'list'>;
  /** Absent until the Retell agent exists; the endpoint says so rather than pretending. */
  voice?: VoiceProvider;
  transcripts?: TranscriptRelay;
  /** Absent when Simli isn't configured; the avatar is then off, not broken. */
  avatar?: Pick<AvatarMinter, 'mint'>;
  /** Absent when `RETELL_CHAT_AGENT_ID` is unset; chat is then off. */
  chat?: ChatProvider;
}

export function registerSessionRoutes(
  app: FastifyInstance,
  { sessions, catalogue, destinations, voice, transcripts, avatar, chat }: SessionRoutesOptions,
): void {
  app.post('/sessions', async (request, reply) => {
    const session = sessions.create();
    const pageContext = PageContext.safeParse((request.body as { page_context?: unknown })?.page_context);
    if (pageContext.success) sessions.setPageContext(session, pageContext.data);

    request.log.info({ session_id: session.id }, 'session created');
    // The token is returned once and held in sessionStorage; it is never logged.
    return reply.code(201).send({ session_id: session.id, session_token: session.token });
  });

  app.get('/sessions/:id/reconnect', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) return reply.code(404).send({ error: 'unknown_session' });
    return { reconnect: sessions.takeAgentReconnect(session) };
  });

  app.delete('/sessions/:id', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) return reply.code(404).send({ error: 'unknown_session' });
    if (session.chat && chat) endChatQuietly(chat, session.chat.chatId, request);
    sessions.end(session);
    return reply.code(204).send();
  });

  app.post('/sessions/:id/avatar-token', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) return reply.code(404).send({ error: 'unknown_session' });
    if (!session.currentLegId) return reply.code(409).send({ error: 'no_live_leg' });
    if (!avatar) return reply.code(503).send({ error: 'avatar_not_configured' });
    if (!sessions.takeAvatarTokenSlot(session)) {
      return reply.code(429).send({ error: 'avatar_token_rate_limited' });
    }

    const minted = await avatar.mint();
    if ('error' in minted) {
      request.log.warn({ session_id: session.id, error: minted.error }, 'avatar mint failed');
      return reply.code(503).send({ error: 'avatar_unavailable' });
    }
    return minted.grant satisfies AvatarTokenResponse;
  });

  app.post('/sessions/:id/call-legs', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) {
      // Covers a deploy that wiped memory, so the widget starts a fresh Session and continues.
      return reply.code(404).send({ error: 'unknown_session' });
    }

    if (!sessions.canCreateLeg(session)) {
      return reply.code(429).send({ error: 'leg_rate_limited' });
    }

    const body = request.body as { avatar?: unknown } | undefined;
    const context = legContext(request, reply, session, sessions);
    if (!context) return reply;

    if (!voice) return reply.code(503).send({ error: 'voice_not_configured' });

    const callLegId = sessions.recordLegCreated(session);
    const { seed, estimatedTokens, shed } = assembleSeed({
      session,
      callLegId,
      pageContext: context.pageContext,
      cart: context.cart,
      catalogueDigest: catalogue.digest(),
      destinations: destinations?.list(),
      actionTargets: context.actionTargets,
      formResults: context.formResults,
    });

    const [call, minted] = await Promise.all([
      voice.createWebCall(seed),
      avatar && body?.avatar === true ? avatar.mint() : undefined,
    ]);
    if (minted && 'error' in minted) {
      request.log.warn({ session_id: session.id, call_leg_id: callLegId, error: minted.error }, 'avatar mint failed');
    }
    session.agentCausedNavigation = false;
    transcripts?.follow(session, callLegId, call.callId);

    request.log.info(
      {
        session_id: session.id,
        call_leg_id: callLegId,
        seed_tokens: estimatedTokens,
        shed,
        continuity: continuityMode(seed),
        replayed_turns: seed.verbatim_tail.length,
        transcript_turns: session.transcript.length,
      },
      'call leg created',
    );

    return reply.code(201).send({
      call_leg_id: callLegId,
      access_token: call.accessToken,
      call_id: call.callId,
      transport: call.transport,
      ice_servers: call.iceServers as CallLegResponse['ice_servers'],
      ...(minted && 'grant' in minted ? { avatar: minted.grant } : {}),
    } satisfies CallLegResponse);
  });

  app.post('/sessions/:id/chat-legs', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) return reply.code(404).send({ error: 'unknown_session' });
    if (!sessions.canCreateLeg(session)) {
      return reply.code(429).send({ error: 'leg_rate_limited' });
    }

    const context = legContext(request, reply, session, sessions);
    if (!context) return reply;

    if (!chat) return reply.code(503).send({ error: 'chat_not_configured' });

    if (session.chat) endChatQuietly(chat, session.chat.chatId, request);
    const legId = sessions.recordLegCreated(session);
    const { seed, estimatedTokens, shed } = assembleSeed({
      session,
      callLegId: legId,
      pageContext: context.pageContext,
      cart: context.cart,
      catalogueDigest: catalogue.digest(),
      destinations: destinations?.list(),
      actionTargets: context.actionTargets,
      formResults: context.formResults,
    });

    const { chatId } = await chat.createChat(seed);
    const leg = { legId, chatId, pending: true };
    session.chat = leg;
    session.agentCausedNavigation = false;
    let messages;
    try {
      // A Retell chat agent never opens on its own; the trigger itself is never recorded.
      messages = await chat.complete(chatId, CHAT_OPENING_TRIGGER);
    } finally {
      leg.pending = false;
    }
    if (session.currentLegId === legId) sessions.appendTurns(session, messages);

    request.log.info(
      {
        session_id: session.id,
        chat_leg_id: legId,
        seed_tokens: estimatedTokens,
        shed,
        continuity: continuityMode(seed),
        replayed_turns: seed.verbatim_tail.length,
        transcript_turns: session.transcript.length,
      },
      'chat leg created',
    );

    return reply
      .code(201)
      .send({ chat_leg_id: legId as string as ChatLegId, messages } satisfies ChatLegResponse);
  });

  app.post('/sessions/:id/chat-legs/:leg/messages', async (request, reply) => {
    const session = authorise(request, sessions);
    if (!session) return reply.code(404).send({ error: 'unknown_session' });

    const parsed = ChatMessageRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_message' });
    if (!chat) return reply.code(503).send({ error: 'chat_not_configured' });

    const leg = session.chat;
    const legParam = (request.params as { leg: string }).leg;
    if (!leg || leg.legId !== legParam || session.currentLegId !== leg.legId) {
      return reply.code(410).send({ error: 'leg_not_current' });
    }
    if (leg.pending) return reply.code(409).send({ error: 'completion_pending' });
    if (!sessions.takeChatMessageSlot(session)) {
      return reply.code(429).send({ error: 'message_rate_limited' });
    }

    leg.pending = true;
    let messages;
    try {
      messages = await chat.complete(leg.chatId, parsed.data.content);
    } finally {
      leg.pending = false;
    }
    if (session.currentLegId === leg.legId) {
      sessions.appendTurns(session, [{ role: 'shopper', text: parsed.data.content }, ...messages]);
    }

    return { messages } satisfies ChatMessageResponse;
  });
}

interface LegContext {
  pageContext: PageContext;
  cart: CartSnapshot;
  actionTargets: ActionTargetIds;
  formResults: FormSubmissionResults;
}

/** Shared by both leg routes; on failure the 400 is already sent. */
function legContext(
  request: FastifyRequest,
  reply: FastifyReply,
  session: Session,
  sessions: SessionStore,
): LegContext | undefined {
  const body = request.body as
    | { page_context?: unknown; action_targets?: unknown; form_results?: unknown; cart?: unknown }
    | undefined;
  const pageContext = PageContext.safeParse(body?.page_context);
  const actionTargets = ActionTargetIds.safeParse(body?.action_targets ?? []);
  const formResults = FormSubmissionResults.safeParse(body?.form_results ?? []);
  const cart = CartSnapshot.safeParse(body?.cart);
  if (!actionTargets.success || !formResults.success) {
    void reply.code(400).send({ error: 'invalid_form_context' });
    return undefined;
  }
  if (!cart.success) {
    void reply.code(400).send({ error: 'invalid_cart_snapshot' });
    return undefined;
  }
  if (pageContext.success) sessions.setPageContext(session, pageContext.data);
  if (!session.pageContext) {
    void reply.code(400).send({ error: 'page_context_required' });
    return undefined;
  }
  return {
    pageContext: session.pageContext,
    cart: cart.data,
    actionTargets: actionTargets.data,
    formResults: formResults.data,
  };
}

/** Retell ends idle chats itself; a failed end only costs an idle timeout. */
function endChatQuietly(chat: ChatProvider, chatId: string, request: FastifyRequest): void {
  chat.endChat(chatId).catch((error: unknown) => request.log.warn({ error }, 'end chat failed'));
}

function authorise(request: FastifyRequest, sessions: SessionStore): Session | undefined {
  const id = (request.params as { id?: string }).id;
  const token = request.headers['x-wayfinder-session-token'];
  if (!id || typeof token !== 'string') return undefined;
  return sessions.resume(id as SessionId, token);
}

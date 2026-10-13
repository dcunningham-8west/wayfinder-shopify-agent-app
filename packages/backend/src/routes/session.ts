import {
  ActionTargetIds,
  CartSnapshot,
  FormSubmissionResults,
  PageContext,
  type SessionId,
} from '@wayfinder/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { assembleSeed, continuityMode } from '../session/seed.js';
import type { Session, SessionStore } from '../session/session-store.js';
import type { TranscriptRelay } from '../voice/transcript-relay.js';
import type { VoiceProvider } from '../voice/voice-provider.js';

export interface SessionRoutesOptions {
  sessions: SessionStore;
  /** Absent until the Retell agent exists; the endpoint says so rather than pretending. */
  voice?: VoiceProvider;
  transcripts?: TranscriptRelay;
}

export function registerSessionRoutes(
  app: FastifyInstance,
  { sessions, voice, transcripts }: SessionRoutesOptions,
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
    sessions.end(session);
    return reply.code(204).send();
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

    const body = request.body as {
      page_context?: unknown;
      action_targets?: unknown;
      form_results?: unknown;
      cart?: unknown;
    };
    const pageContext = PageContext.safeParse(body?.page_context);
    const actionTargets = ActionTargetIds.safeParse(body?.action_targets ?? []);
    const formResults = FormSubmissionResults.safeParse(body?.form_results ?? []);
    const cart = CartSnapshot.safeParse(body?.cart);
    if (!actionTargets.success || !formResults.success) {
      return reply.code(400).send({ error: 'invalid_form_context' });
    }
    if (!cart.success) return reply.code(400).send({ error: 'invalid_cart_snapshot' });
    if (pageContext.success) sessions.setPageContext(session, pageContext.data);
    if (!session.pageContext) {
      return reply.code(400).send({ error: 'page_context_required' });
    }

    if (!voice) return reply.code(503).send({ error: 'voice_not_configured' });

    const callLegId = sessions.recordLegCreated(session);
    const { seed, estimatedTokens, shed } = assembleSeed({
      session,
      callLegId,
      pageContext: session.pageContext,
      cart: cart.data,
      actionTargets: actionTargets.data,
      formResults: formResults.data,
    });

    const call = await voice.createWebCall(seed);
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
      ice_servers: call.iceServers,
    });
  });
}

function authorise(request: FastifyRequest, sessions: SessionStore): Session | undefined {
  const id = (request.params as { id?: string }).id;
  const token = request.headers['x-wayfinder-session-token'];
  if (!id || typeof token !== 'string') return undefined;
  return sessions.resume(id as SessionId, token);
}

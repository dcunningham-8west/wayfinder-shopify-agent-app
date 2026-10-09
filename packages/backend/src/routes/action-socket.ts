import { ClientMessage, type SessionId } from '@wayfinder/contracts';
import type { FastifyInstance } from 'fastify';
import type { ActionChannel } from '../actions/action-channel.js';
import type { SessionStore } from '../session/session-store.js';

/**
 * The widget holds this open for the life of a Call Leg. Rate limiting lives on Call Leg
 * creation, not here — sockets are cheap, Call Legs cost money (ticket 012).
 */

export interface ActionSocketOptions {
  sessions: SessionStore;
  actions: ActionChannel;
}

export function registerActionSocket(
  app: FastifyInstance,
  { sessions, actions }: ActionSocketOptions,
): void {
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/sessions/:id/socket',
    { websocket: true },
    (socket, request) => {
      // A browser cannot set headers on a WebSocket handshake, so the token rides in the
      // query. Never log this URL.
      const session = sessions.resume(request.params.id as SessionId, request.query.token ?? '');
      if (!session) {
        socket.close(4401, 'unknown_session');
        return;
      }

      actions.attach(session.id, socket);
      socket.on('close', () => actions.detach(session.id, socket));

      socket.on('message', (data: Buffer) => {
        const message = parse(data);
        if (!message) {
          request.log.warn({ session_id: session.id }, 'unparseable client message');
          return;
        }

        if (message.type === 'action_result') {
          actions.accept(message);
          return;
        }
        sessions.setPageContext(session, message.page_context);
      });
    },
  );
}

function parse(data: Buffer): ClientMessage | undefined {
  try {
    const parsed = ClientMessage.safeParse(JSON.parse(data.toString()));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

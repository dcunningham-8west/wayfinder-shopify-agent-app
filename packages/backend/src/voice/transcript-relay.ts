import type { CallLegId } from '@wayfinder/contracts';
import type { FastifyBaseLogger } from 'fastify';
import type { ActionChannel } from '../actions/action-channel.js';
import type { Session, SessionStore } from '../session/session-store.js';
import { monitorCall } from './call-monitor.js';

/**
 * One live transcript per Call Leg: stored for the next leg's Seed, and the latest line pushed
 * to the widget for subtitles and the Preview Panel. Logs ids only (ticket 014).
 */
export class TranscriptRelay {
  constructor(
    private readonly apiKey: string,
    private readonly sessions: SessionStore,
    private readonly actions: ActionChannel,
    private readonly log: FastifyBaseLogger,
  ) {}

  follow(session: Session, callLegId: CallLegId, callId: string): void {
    let lastSent = '';
    monitorCall(this.apiKey, callId, {
      onTranscript: (turns) => {
        if (!this.sessions.setLegTranscript(session, callLegId, turns)) return;
        const latest = turns.at(-1);
        if (!latest) return;
        const key = `${latest.role}:${latest.text}`;
        if (key === lastSent) return;
        lastSent = key;
        this.actions.notify(session.id, { type: 'transcript_update', turn: latest });
      },
      onError: (message) =>
        this.log.warn({ session_id: session.id, call_leg_id: callLegId, message }, 'transcript monitor failed'),
    });
  }
}

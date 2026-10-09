import { randomUUID } from 'node:crypto';
import {
  ActionEnvelope,
  ActionResult,
  type Action,
  type ActionFailure,
  type IdempotencyKey,
  type SessionId,
} from '@wayfinder/contracts';

/**
 * Section 06. Retell resolves tool calls server-side, but every Action runs in the browser.
 * This is the gap-crossing: push an Envelope, wait for the Result, and only then answer.
 *
 * The alternative — letting the widget watch Retell's event stream — is a broadcast, not a
 * conversation: the backend would have said "done" before the page attempted anything.
 */

/** Under the tool's 8 s timeout, so the agent hears our error rather than Retell's. */
export const ACTION_TIMEOUT_MS = 6_000;

export type ActionOutcome = ActionResult['outcome'];

/** One socket per Session. A second connection replaces the first — a reload is not a fork. */
export interface ActionSocket {
  send(data: string): void;
  close(): void;
}

interface Pending {
  resolve: (outcome: ActionOutcome) => void;
  timer: NodeJS.Timeout;
}

export class ActionChannel {
  readonly #sockets = new Map<SessionId, ActionSocket>();
  readonly #pending = new Map<string, Pending>();

  attach(sessionId: SessionId, socket: ActionSocket): void {
    this.#sockets.get(sessionId)?.close();
    this.#sockets.set(sessionId, socket);
  }

  detach(sessionId: SessionId, socket: ActionSocket): void {
    if (this.#sockets.get(sessionId) === socket) this.#sockets.delete(sessionId);
  }

  isConnected(sessionId: SessionId): boolean {
    return this.#sockets.has(sessionId);
  }

  /**
   * Resolves with a failure rather than rejecting: every outcome here is something the agent
   * has to say out loud, and an exception is not speakable.
   */
  async perform(sessionId: SessionId, action: Action): Promise<ActionOutcome> {
    const socket = this.#sockets.get(sessionId);
    if (!socket) return failure('unknown', 'the page is not connected');

    const envelope: ActionEnvelope = {
      type: 'action',
      envelope_id: randomUUID(),
      // The widget no-ops a repeat: without this a retried add double-charges (ticket 012).
      idempotency_key: randomUUID() as IdempotencyKey,
      action,
    };

    return new Promise<ActionOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(envelope.envelope_id);
        resolve(failure('timeout'));
      }, ACTION_TIMEOUT_MS);

      this.#pending.set(envelope.envelope_id, { resolve, timer });
      try {
        socket.send(JSON.stringify(envelope));
      } catch {
        this.#settle(envelope.envelope_id, failure('unknown', 'the page went away'));
      }
    });
  }

  /** Late and unknown results are dropped: the agent has already spoken. */
  accept(result: ActionResult): void {
    this.#settle(result.envelope_id, result.outcome);
  }

  #settle(envelopeId: string, outcome: ActionOutcome): void {
    const pending = this.#pending.get(envelopeId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(envelopeId);
    pending.resolve(outcome);
  }
}

function failure(reason: ActionFailure['reason'], message?: string): ActionFailure {
  return { status: 'error', reason, ...(message ? { message } : {}) };
}

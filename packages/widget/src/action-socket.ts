import {
  ServerMessage,
  type ActionResult,
  type PageContext,
  type TranscriptTurn,
} from '@wayfinder/contracts';
import { executeAction } from './action-executor.js';
import type { WidgetConfig } from './config.js';
import type { SessionHandle } from './session-client.js';

/**
 * Section 06. Open for the life of a Call Leg. The backend waits on this before answering
 * Retell, which is what lets the agent speak a truthful outcome rather than a hopeful one.
 */

/** Idle proxies and sleeping tabs drop sockets; the Call Leg outlives them. */
const RETRY_MS = [500, 1_000, 2_000, 5_000, 10_000] as const;

export class ActionSocket {
  #socket?: WebSocket;
  #handle?: SessionHandle;
  #attempt = 0;
  #retry?: ReturnType<typeof setTimeout>;
  /** Repeats are no-ops: without this a retried add after a dropped socket double-charges. */
  readonly #seen = new Set<string>();
  #onTranscript?: (turn: TranscriptTurn) => void;

  constructor(private readonly config: WidgetConfig) {}

  onTranscript(handler: (turn: TranscriptTurn) => void): void {
    this.#onTranscript = handler;
  }

  open(handle: SessionHandle): void {
    this.close();
    this.#handle = handle;
    this.#connect();
  }

  #connect(): void {
    const handle = this.#handle;
    if (!handle) return;

    const url = `${this.config.socketUrl}/sessions/${handle.id}/socket?token=${encodeURIComponent(handle.token)}`;
    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
    });

    socket.addEventListener('message', (event) => {
      void this.#dispatch(event.data as string);
    });

    socket.addEventListener('close', (event) => {
      if (this.#socket !== socket) return;
      this.#socket = undefined;
      // 4401 means the session is gone; retrying would only fail the same way.
      if (event.code === 4401) return this.close();
      this.#scheduleRetry();
    });
  }

  #scheduleRetry(): void {
    if (!this.#handle || this.#retry) return;
    const delay = RETRY_MS[Math.min(this.#attempt++, RETRY_MS.length - 1)]!;
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      this.#connect();
    }, delay);
  }

  close(): void {
    this.#handle = undefined;
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close();
  }

  sendPageContext(pageContext: PageContext, shopperInitiated: boolean): void {
    this.#send({
      type: 'page_context_update',
      page_context: pageContext,
      shopper_initiated: shopperInitiated,
    });
  }

  async #dispatch(raw: string): Promise<void> {
    let message;
    try {
      message = ServerMessage.parse(JSON.parse(raw));
    } catch {
      return;
    }

    if (message.type === 'transcript_update') {
      this.#onTranscript?.(message.turn);
      return;
    }
    const envelope = message;

    if (this.#seen.has(envelope.idempotency_key)) return;
    this.#seen.add(envelope.idempotency_key);

    const outcome = await executeAction(envelope.action);
    const result: ActionResult = {
      type: 'action_result',
      envelope_id: envelope.envelope_id,
      action: envelope.action.action,
      outcome,
    };
    this.#send(result);
  }

  #send(message: unknown): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(JSON.stringify(message));
  }
}

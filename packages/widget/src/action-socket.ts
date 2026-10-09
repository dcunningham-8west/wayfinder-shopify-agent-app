import { ActionEnvelope, type ActionResult, type PageContext } from '@wayfinder/contracts';
import { executeAction } from './action-executor.js';
import type { WidgetConfig } from './config.js';
import type { SessionHandle } from './session-client.js';

/**
 * Section 06. Open for the life of a Call Leg. The backend waits on this before answering
 * Retell, which is what lets the agent speak a truthful outcome rather than a hopeful one.
 */

export class ActionSocket {
  #socket?: WebSocket;
  /** Repeats are no-ops: without this a retried add after a dropped socket double-charges. */
  readonly #seen = new Set<string>();

  constructor(private readonly config: WidgetConfig) {}

  open(handle: SessionHandle): void {
    this.close();
    const url = `${this.config.socketUrl}/sessions/${handle.id}/socket?token=${encodeURIComponent(handle.token)}`;
    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener('message', (event) => {
      void this.#handle(event.data as string);
    });
  }

  close(): void {
    this.#socket?.close();
    this.#socket = undefined;
  }

  sendPageContext(pageContext: PageContext, shopperInitiated: boolean): void {
    this.#send({
      type: 'page_context_update',
      page_context: pageContext,
      shopper_initiated: shopperInitiated,
    });
  }

  async #handle(raw: string): Promise<void> {
    let envelope;
    try {
      envelope = ActionEnvelope.parse(JSON.parse(raw));
    } catch {
      return;
    }

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

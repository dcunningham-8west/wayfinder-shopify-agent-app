import type { CartSnapshot, ChatAgentMessage, FormSubmissionResult, PageContext, TargetId } from '@wayfinder/contracts';
import type { ChatLeg, LegRefusal, MessageRefusal } from './session-client.js';

/** Section 14. One Chat Leg per page load; the thread shows only the current leg. */

export interface ChatDeps {
  sessions: {
    startChatLeg(
      pageContext: PageContext,
      cart: CartSnapshot,
      actionTargets: TargetId[],
      formResults: FormSubmissionResult[],
    ): Promise<ChatLeg | LegRefusal>;
    sendChatMessage(chatLegId: string, content: string): Promise<ChatAgentMessage[] | MessageRefusal>;
    readonly handle: { id: string; token: string } | undefined;
  };
  ui: {
    setLive(live: boolean): void;
    setStatus(text: string): void;
    clearThread(): void;
    appendMessage(role: 'agent' | 'shopper' | 'notice', text: string): void;
    setPending(pending: boolean): void;
  };
  page: {
    pageContext(): PageContext | undefined;
    cart(): Promise<CartSnapshot>;
    actionTargets(): TargetId[];
    formResults(): FormSubmissionResult[];
    clearFormResults(results: FormSubmissionResult[]): void;
  };
  openSocket(handle: { id: string; token: string }): void;
  closeSocket(): void;
  follow(text: string): void;
  warn(message: string, detail?: unknown): void;
  /** Retried once after this on a rate-limited leg; rapid navigation hits the backend's gap. */
  retryDelayMs: number;
}

const NOTICES = {
  busy: 'One moment, I am still answering.',
  failed: 'Sorry, that did not send. Please try again.',
} as const;

export class ChatController {
  #legId: string | undefined;
  #starting = false;
  #generation = 0;

  constructor(private readonly deps: ChatDeps) {}

  get live(): boolean {
    return this.#legId !== undefined;
  }

  async start(): Promise<void> {
    if (this.#starting) return;
    const { ui, page, sessions } = this.deps;
    const pageContext = page.pageContext();
    if (!pageContext) {
      this.deps.warn('chat start aborted: no valid page context');
      ui.setStatus('UNAVAILABLE');
      return;
    }

    this.#starting = true;
    const generation = ++this.#generation;
    this.#legId = undefined;
    ui.setStatus('CONNECTING');
    try {
      const formResults = page.formResults();
      const cart = await page.cart();
      let leg = await sessions.startChatLeg(pageContext, cart, page.actionTargets(), formResults);
      if (leg === 'rate_limited') {
        await new Promise((resolve) => setTimeout(resolve, this.deps.retryDelayMs));
        if (generation !== this.#generation) return;
        leg = await sessions.startChatLeg(pageContext, cart, page.actionTargets(), formResults);
      }
      if (generation !== this.#generation) return;
      if (typeof leg === 'string') {
        this.deps.warn('chat leg refused', leg);
        ui.setStatus('UNAVAILABLE');
        return;
      }
      page.clearFormResults(formResults);

      this.#legId = leg.chatLegId;
      const handle = sessions.handle;
      if (handle) this.deps.openSocket(handle);
      ui.clearThread();
      ui.setLive(true);
      ui.setStatus('ONLINE');
      this.#render(leg.messages);
    } catch (error) {
      this.deps.warn('chat start failed', error);
      if (generation === this.#generation) ui.setStatus('UNAVAILABLE');
    } finally {
      this.#starting = false;
    }
  }

  async send(text: string): Promise<void> {
    const { ui, sessions } = this.deps;
    const legId = this.#legId;
    if (!legId) return;

    ui.appendMessage('shopper', text);
    ui.setPending(true);
    let result: ChatAgentMessage[] | MessageRefusal;
    try {
      result = await sessions.sendChatMessage(legId, text);
    } catch (error) {
      this.deps.warn('chat send failed', error);
      result = 'failed';
    } finally {
      ui.setPending(false);
    }
    if (legId !== this.#legId) return;

    if (Array.isArray(result)) return this.#render(result);
    if (result === 'stale') {
      // The thread restarts with the new leg's opening; the shopper's message was not heard.
      this.#legId = undefined;
      return this.start();
    }
    ui.appendMessage('notice', result === 'busy' ? NOTICES.busy : NOTICES.failed);
  }

  stop(): void {
    this.#generation += 1;
    this.#legId = undefined;
    this.deps.closeSocket();
    this.deps.ui.clearThread();
    this.deps.ui.setLive(false);
  }

  #render(messages: ChatAgentMessage[]): void {
    for (const message of messages) {
      this.deps.ui.appendMessage('agent', message.text);
      this.deps.follow(message.text);
    }
  }
}

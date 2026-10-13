import type { FormSubmissionResult, PageContext, TargetId } from '@wayfinder/contracts';
import type { WidgetConfig } from './config.js';

/**
 * Section 03. The browser carries a session id and a token, nothing else — the backend owns
 * the transcript, which is what lets Replay Policy change without a storefront release.
 */

const STORAGE_KEY = 'wayfinder:session';
const AGENT_NAVIGATION_KEY = 'wayfinder:agent-navigation';
const AGENT_NAVIGATION_TTL_MS = 30_000;

export interface SessionHandle {
  id: string;
  token: string;
}

export interface CallLeg {
  callLegId: string;
  accessToken: string;
  callId: string;
  transport: string;
  iceServers: RTCIceServer[];
}

export type LegRefusal = 'rate_limited' | 'voice_not_configured' | 'unknown_session' | 'failed';

function remembered(): SessionHandle | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<SessionHandle>;
    return parsed.id && parsed.token ? { id: parsed.id, token: parsed.token } : undefined;
  } catch {
    return undefined;
  }
}

export function markAgentNavigation(): void {
  try {
    sessionStorage.setItem(AGENT_NAVIGATION_KEY, String(Date.now()));
  } catch {
    // Without sessionStorage the Session cannot survive the page load either.
  }
}

export function takeAgentNavigationMarker(): boolean {
  try {
    const raw = sessionStorage.getItem(AGENT_NAVIGATION_KEY);
    sessionStorage.removeItem(AGENT_NAVIGATION_KEY);
    const markedAt = Number(raw);
    const age = Date.now() - markedAt;
    return Number.isFinite(markedAt) && age >= 0 && age <= AGENT_NAVIGATION_TTL_MS;
  } catch {
    return false;
  }
}

export class SessionClient {
  #handle = remembered();

  constructor(private readonly config: WidgetConfig) {}

  get handle(): SessionHandle | undefined {
    return this.#handle;
  }

  async shouldReconnect(): Promise<boolean> {
    const handle = this.#handle;
    if (!handle) return false;

    const response = await fetch(`${this.config.backendUrl}/sessions/${handle.id}/reconnect`, {
      headers: { 'x-wayfinder-session-token': handle.token },
    });
    if (response.status === 404) return true;
    if (!response.ok) throw new Error(`reconnect check failed: ${response.status}`);

    const body = (await response.json()) as { reconnect?: unknown };
    return body.reconnect === true;
  }

  /** `sessionStorage`, not `localStorage`: a Session is a visit, not an identity. */
  #remember(handle: SessionHandle): void {
    this.#handle = handle;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handle));
    } catch {
      // A blocked storage API costs continuity across navigation, not the conversation.
    }
  }

  async ensure(pageContext?: PageContext): Promise<SessionHandle> {
    if (this.#handle) return this.#handle;

    const response = await fetch(`${this.config.backendUrl}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page_context: pageContext }),
    });
    if (!response.ok) throw new Error(`session create failed: ${response.status}`);

    const body = (await response.json()) as { session_id: string; session_token: string };
    const handle = { id: body.session_id, token: body.session_token };
    this.#remember(handle);
    return handle;
  }

  /**
   * A 404 means a deploy wiped the Session. Starting a fresh one silently is the point:
   * the shopper must not have to click to start again.
   */
  async startCallLeg(
    pageContext: PageContext,
    actionTargets: TargetId[] = [],
    formResults: FormSubmissionResult[] = [],
    retried = false,
  ): Promise<CallLeg | LegRefusal> {
    const handle = await this.ensure(pageContext);

    const response = await fetch(`${this.config.backendUrl}/sessions/${handle.id}/call-legs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-wayfinder-session-token': handle.token,
      },
      body: JSON.stringify({ page_context: pageContext, action_targets: actionTargets, form_results: formResults }),
    });

    if (response.status === 404) {
      this.forget();
      // Still inside the click, so the retry keeps the gesture the microphone needs.
      if (retried) return 'unknown_session';
      return this.startCallLeg(pageContext, actionTargets, formResults, true);
    }
    if (response.status === 429) return 'rate_limited';
    if (response.status === 503) return 'voice_not_configured';
    if (!response.ok) return 'failed';

    const body = (await response.json()) as {
      call_leg_id: string;
      access_token: string;
      call_id: string;
      transport: string;
      ice_servers: RTCIceServer[];
    };
    return {
      callLegId: body.call_leg_id,
      accessToken: body.access_token,
      callId: body.call_id,
      transport: body.transport,
      iceServers: body.ice_servers,
    };
  }

  forget(): void {
    this.#handle = undefined;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do; the next create will overwrite it.
    }
  }

  async end(): Promise<void> {
    const handle = this.#handle;
    this.forget();
    if (!handle) return;

    const response = await fetch(`${this.config.backendUrl}/sessions/${handle.id}`, {
      method: 'DELETE',
      headers: { 'x-wayfinder-session-token': handle.token },
      keepalive: true,
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`session end failed: ${response.status}`);
    }
  }
}

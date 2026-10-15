import { randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  CallLegId,
  PageContext,
  PageContextProduct,
  PreviewTile,
  ReferentSet,
  SessionId,
  SessionState,
  TargetId,
  TranscriptTurn,
} from '@wayfinder/contracts';
import { MAX_SESSIONS_IN_MEMORY, REFERENT_SET_CAPACITY, TIMING } from '@wayfinder/contracts';

/**
 * Section 03 and ticket 014: the backend stores nothing at rest. A Session is a process-local
 * object with an idle TTL, and losing one is a defined state rather than an error.
 */

export interface Session {
  id: SessionId;
  /** Never logged, never in the Seed. Distinct from the id, which is public by design. */
  token: string;
  state: SessionState;
  referents: ReferentSet;
  transcript: TranscriptTurn[];
  pageContext?: PageContext;
  agentCausedNavigation: boolean;
  agentReconnectPending: boolean;
  legCount: number;
  currentLegId?: CallLegId;
  /** Where the current leg's turns begin in `transcript`; earlier turns belong to past legs. */
  legTranscriptStart: number;
  lastLegCreatedAt?: number;
  lastSeenAt: number;
  /** The last search's results awaiting the shopper's answer to the Offer. */
  staged?: StagedResults;
  /** Sticky for the Session once the shopper picks how to see results. */
  presentation?: 'preview' | 'on_page';
}

export interface StagedResults {
  tiles: PreviewTile[];
  onPage:
    | { kind: 'scroll'; target_id: TargetId }
    | { kind: 'navigate'; destination_id: string; url: string };
}

export class SessionStore {
  readonly #sessions = new Map<SessionId, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  create(): Session {
    this.#evict();
    const session: Session = {
      id: randomUUID() as SessionId,
      token: randomUUID(),
      state: { products_discussed: [], stated_preferences: [], promises_made: [] },
      referents: [],
      transcript: [],
      agentCausedNavigation: false,
      agentReconnectPending: false,
      legCount: 0,
      legTranscriptStart: 0,
      lastSeenAt: this.now(),
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  /**
   * An unknown or expired id is not an error — a deploy wipes memory mid-session, and the
   * shopper must not have to click to start again.
   */
  resume(id: SessionId, token: string): Session | undefined {
    const session = this.#sessions.get(id);
    if (!session) return undefined;
    if (this.#isExpired(session)) {
      this.#sessions.delete(id);
      return undefined;
    }
    if (!matches(session.token, token)) return undefined;
    session.lastSeenAt = this.now();
    return session;
  }

  /** Replaced wholesale, except when the shopper navigates into a member (section 11). */
  setReferents(session: Session, referents: ReferentSet): void {
    session.referents = referents.slice(0, REFERENT_SET_CAPACITY);
  }

  setPageContext(session: Session, pageContext: PageContext): void {
    const onScreen = productsOf(pageContext);
    const landedWithinSet =
      session.referents.length > 0 &&
      onScreen.every((p) => session.referents.some((r) => r.product_id === p.product_id));

    // Lowest-priority source: what is on screen is what "the second one" means by default.
    if (!landedWithinSet) {
      this.setReferents(session, onScreen.map(toReferent));
    }
    session.pageContext = pageContext;
    session.lastSeenAt = this.now();
  }

  get(id: SessionId): Session | undefined {
    return this.#sessions.get(id);
  }

  /** Set by the agent's own navigate, read by the next leg's Seed so it does not re-greet. */
  markAgentNavigation(id: SessionId): void {
    const session = this.#sessions.get(id);
    if (session) {
      session.agentCausedNavigation = true;
      session.agentReconnectPending = true;
    }
  }

  takeAgentReconnect(session: Session): boolean {
    const pending = session.agentReconnectPending;
    session.agentReconnectPending = false;
    return pending;
  }

  end(session: Session): void {
    if (this.#sessions.get(session.id) === session) this.#sessions.delete(session.id);
  }

  /** Replaces the current leg's turns; false for a leg that has since been superseded. */
  setLegTranscript(session: Session, legId: CallLegId, turns: TranscriptTurn[]): boolean {
    if (session.currentLegId !== legId) return false;
    session.transcript.splice(session.legTranscriptStart, Infinity, ...turns);
    session.lastSeenAt = this.now();
    return true;
  }

  /** Enforced here, not on the socket: sockets are cheap, Call Legs cost money. */
  canCreateLeg(session: Session): boolean {    const last = session.lastLegCreatedAt;
    return last === undefined || this.now() - last >= TIMING.minBetweenLegsMs;
  }

  recordLegCreated(session: Session): CallLegId {
    session.legCount += 1;
    session.lastLegCreatedAt = this.now();
    session.lastSeenAt = this.now();
    const legId = `${session.id}-${session.legCount}` as CallLegId;
    session.currentLegId = legId;
    session.legTranscriptStart = session.transcript.length;
    return legId;
  }

  get size(): number {
    return this.#sessions.size;
  }

  #isExpired(session: Session): boolean {
    return this.now() - session.lastSeenAt > TIMING.sessionIdleTtlMs;
  }

  /** A bounded Map is the whole retention policy. Nothing is written down to grow. */
  #evict(): void {
    for (const [id, session] of this.#sessions) {
      if (this.#isExpired(session)) this.#sessions.delete(id);
    }
    while (this.#sessions.size >= MAX_SESSIONS_IN_MEMORY) {
      const oldest = this.#sessions.keys().next();
      if (oldest.done) break;
      this.#sessions.delete(oldest.value);
    }
  }
}

function productsOf(pageContext: PageContext): PageContextProduct[] {
  const inSections = pageContext.sections.flatMap((s) => s.products);
  return pageContext.subject ? [pageContext.subject, ...inSections] : inSections;
}

function toReferent(product: PageContextProduct): ReferentSet[number] {
  return {
    product_id: product.product_id,
    handle: product.handle,
    title: product.title,
    url: product.url,
  };
}

function matches(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

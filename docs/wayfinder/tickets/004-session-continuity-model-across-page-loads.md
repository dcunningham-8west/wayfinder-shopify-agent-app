---
id: 004
title: Session continuity model across page loads
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [001]
---

# Session continuity model across page loads

Part of [the map](../map.md)

## Question

The call dies on every navigation and the widget reconnects, resuming from the RetellAI
transcript. Pin down the model that makes this feel like one conversation.

- What is the unit of continuity — a RetellAI conversation, or our own Session entity that
  owns a series of calls? What is it keyed by, and where does that key live across page
  loads (cookie, sessionStorage, cart token)?
- What state is server-held vs reconstructed per page? Transcript, shopper intent, pending
  action, last-mentioned products.
- What ends a session: tab close, idle timeout, explicit stop, checkout entry?
- What does the shopper hear and see during the reconnect gap? Is the gap masked, and what
  happens if reconnect fails?
- If the agent itself triggered the navigation, does it need to know that on reconnect so it
  can speak about the page it just opened?
- Does this need an ADR? Likely yes — hard to reverse and surprising without context.

Expected output: a named continuity model, glossary terms for its parts, and the
reconnect sequence written out step by step.

## Resolution

### The model: Reconnect-with-replay, server-seeded

A **Session** is a tab-scoped conversation that owns a series of **Call Legs**. Navigation
ends a leg and the widget opens the next one; the Session is what makes the legs feel like
one conversation. The backend owns the Session; the browser carries only its id.

Named parts are in [the Glossary](../../Glossary.md): Session, Call Leg, Handoff,
Session Seed, Cart Snapshot.

### Why the call dies at all

A full page load tears down the document, the JS context, and the WebRTC peer connection.
No Retell primitive survives that ([ticket 001](./001-retellai-web-call-capability-surface.md)
found no resume primitive), so continuity means replaying, not resuming.

**Alternative considered and rejected:** suppress navigation entirely — intercept link
clicks, fetch via the Section Rendering API, swap content, `history.pushState` — so the
document never unloads and the call never drops. Rejected: bolting a SPA router onto a
Dawn-derived theme from an app embed means owning every breakage (analytics, back/forward,
third-party scripts, theme JS bound to `DOMContentLoaded`), and a single missed form post or
server redirect drops the call anyway, so the reconnect path is still required. All cost, no
removal of the thing it was meant to remove.

### Silent resume, and the constraint that buys it

v1 resumed **silently** — no click needed on the new page — and this is a requirement, not a
nicety. It works because the mic permission grant persists **per origin**, so the new page's
`getUserMedia` resolves without a prompt or fresh user activation.

That is load-bearing and constrains later tickets: the widget must run on the **store's own
origin**. A cross-origin iframe would lose the grant and reintroduce a click on every page.

### Transcript ownership moves to the backend

v1 made the browser the source of truth: transcript captured live from Retell `update`
events, flattened to `Agent: … / User: …` text, held in `sessionStorage`, posted to
`/api/create-call` on the next page. It was forced — `stopCall()` on unload does not reach
Retell in time for the call's transcript to be written, so there is nothing server-side to
fetch at reconnect.

The new model keeps **live client capture** (same constraint still applies) but moves
**ownership** to the backend:

- On `pagehide`, the widget `navigator.sendBeacon`s the transcript snapshot to the backend,
  keyed by session id. `sendBeacon` is designed to survive unload and is more reliable than
  v1's synchronous save.
- The next page sends only the **session id** to call-creation. The backend builds the seed.

Rationale is the seam, not the storage. **Replay policy** — full transcript vs summary vs
last-N-turns vs structured state — is deliberately left open; growth over a long browse is a
real concern but tuning it is deferred until it is observed to bite. Deferral is only cheap
if policy lives in the backend, where it changes without a theme release racing a cached
client. Secondary wins: transcripts become available for analytics and debugging, and the
agent stops trusting a shopper-editable `sessionStorage` blob for what was already said.

### Session lifetime

**Tab-scoped and short-lived.** Closing the tab or idling out ends the Session, and the
shopper starts fresh. Accepted explicitly: the conversation is not shopper-scoped and does
not persist across days, which keeps conversation history out of long-lived pseudonymous
storage.

The **cart** is the thing that persists, keyed by Shopify's cart token, so a returning
shopper finds their cart intact while the agent genuinely starts fresh.

### Cart Snapshot: conversational, never authoritative

The backend fetches the cart at call-leg start and injects a **Cart Snapshot** into the
seed, so the agent opens each leg knowing what is in the cart without spending a tool call
inside a turn. Because a leg starts on every navigation, snapshot staleness is bounded to a
single page view.

The rule that must hold:

- **Talking** about the cart — use the snapshot. No tool call, no in-turn latency.
- **Changing** the cart — read the live cart, merge, then write. Never compute a mutation
  from the snapshot.

The snapshot is not a replica (consistent with the map's read-through-and-merge note); it is
a hint with a known expiry. The failure mode to prompt against is the agent narrating a
stale snapshot as fact: state contents freely, but re-read if the shopper disputes them or
asks for a change. Cart write mechanics belong to
[ticket 007](./007-storefront-action-vocabulary-and-dom-boundary.md).

### The reconnect gap

Dead window: unload → new document → create-call → access token → WebRTC handshake. Masked
by a **visible text status** in the widget ("Reconnecting…"), as in v1. No bridging speech,
no earcon.

The gap is floored by backend latency, which ties this to
[ticket 011](./011-backend-hosting-and-cold-start-floor.md): a cold-starting service turns a
one-second gap into a conversation-breaking one.

**Reconnect failure UX is deliberately not decided here** — it is a visual-design question
best answered against a real widget UI. Moved to the map's fog.

### Reconnect sequence

1. Agent decides to navigate, or the shopper clicks a link.
2. Widget captures the live transcript from Retell `update` events (ongoing, not at unload).
3. On `pagehide`: `sendBeacon` the transcript snapshot plus navigation intent to the backend
   under the session id; `stopCall()`. The leg ends.
4. Browser unloads. Document, JS context, and peer connection are destroyed.
5. New page loads; widget reads the session id from `sessionStorage`.
6. Widget posts `{ sessionId, pageUrl, pageTitle }` to call-creation and shows
   "Reconnecting…".
7. Backend loads the Session, applies replay policy to the transcript, fetches the cart for
   a fresh Cart Snapshot, and assembles the Session Seed — including whether the agent
   itself caused this navigation, so it can speak to the page it opened rather than
   re-orienting.
8. Backend creates the Retell web call with the seed and returns an access token.
9. Widget calls `startCall`. Mic permission is already granted for the origin, so audio
   resumes with no gesture.
10. Agent opens with a short bridging line and continues the topic — never mentioning
    transcripts, sessions, or reconnection.

### Consequences

- Widget must be same-origin with the storefront (rules out cross-origin iframe widgets).
- Backend needs session storage that survives between requests, which interacts with the
  hosting choice in ticket 011.
- Replay policy is a backend concern and an explicit later tuning point, not a gap.
- An ADR is warranted: the rejected SPA alternative and the per-origin permission constraint
  are both surprising without context.

Written up as [ADR-0001](../../adr/0001-reconnect-with-replay-voice-continuity.md).


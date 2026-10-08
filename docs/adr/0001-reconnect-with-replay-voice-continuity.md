# ADR-0001: Reconnect-with-replay for voice continuity across page loads

- **Status:** Accepted, amended 2026-10-07 by
  [ticket 009](../wayfinder/tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)
  (see Amendment)
- **Date:** 2026-10-07
- **Deciders:** operator, via
  [ticket 004](../wayfinder/tickets/004-session-continuity-model-across-page-loads.md)

## Context

The assistant is a voice widget on a multi-page Shopify storefront. Shoppers navigate
constantly, and the agent itself navigates them ("let me show you that one").

A full page load destroys the document, the JS context, and the WebRTC peer connection
carrying the RetellAI web call.
[Ticket 001](../wayfinder/tickets/001-retellai-web-call-capability-surface.md) established
that RetellAI has **no resume primitive**: a call cannot be reattached, only replaced.

So on every navigation the conversation is technically destroyed, while the shopper expects
it to continue uninterrupted.

A working v1 exists (three repos; see
[ticket 003](../wayfinder/tickets/003-gather-existing-retellai-assets-and-store-access.md))
whose approach resumed silently and felt good, but which made the **browser** the source of
truth for conversation history.

## Decision

Adopt **reconnect-with-replay, server-seeded**.

A **Session** is a tab-scoped conversation owned by the backend. It owns a series of **Call
Legs** — one RetellAI web call each. Navigation ends a leg; the widget opens the next.

- The widget captures the transcript live from Retell `update` events and, on `pagehide`,
  `navigator.sendBeacon`s a snapshot to the backend keyed by session id.
- The browser carries **only the session id**, in `sessionStorage`.
- The backend assembles the **Session Seed** for each new leg: replayed transcript, a
  **Cart Snapshot**, the current page, and whether the agent caused the navigation.
- The agent opens each leg with a short bridging line and never mentions transcripts,
  sessions, or reconnection.
- The reconnect gap is masked by a visible text status in the widget.

Session lifetime is **tab-scoped**: tab close or idle timeout ends it. The Shopify cart,
keyed by its cart token, is the thing that persists.

## Alternatives considered

### Suppress navigation entirely (rejected)

Intercept link clicks, fetch the next page via Shopify's Section Rendering API, swap content
in, update the URL with `history.pushState`. The document never unloads, so the call never
drops — no replay, no gap, no continuity problem at all.

Rejected. Bolting a SPA router onto a Dawn-derived theme from an app embed means owning
every resulting breakage: analytics, back/forward, third-party scripts expecting a fresh
document, and theme JS bound to `DOMContentLoaded`. Worse, it does not remove the thing it
exists to remove — one missed form post or server-side redirect still drops the call, so the
reconnect path must be built anyway. All of the cost, none of the elimination.

### Keep transcript ownership in the browser (rejected)

What v1 did: flatten the transcript to text, hold it in `sessionStorage`, post it to
call-creation on the next page.

Rejected on the **seam**, not on storage. Replay policy — full history vs summary vs
last-N-turns vs structured state — will need tuning as conversations lengthen. If the
browser owns the transcript, every such change is a storefront release racing a cached
client. If the backend owns it, policy changes server-side alone.

Secondary: a `sessionStorage` blob is shopper-editable, and the agent should not treat
attacker-controlled text as "what we already said".

### Shopper-scoped, long-lived sessions (rejected)

Key the Session to the cart token or a companion cookie so a shopper returning tomorrow is
remembered. Rejected as scope the product does not need, and it would store conversation
history against a pseudonymous identifier for days, pulling retention and privacy questions
forward with no matching benefit. The persistent cart already supplies continuity of
*intent* without claiming memory of the *conversation*.

## Consequences

### The widget must be same-origin with the storefront

v1's silent resume — no click needed on the new page — works because the microphone
permission grant persists **per origin**, so the new document's `getUserMedia` resolves
without a prompt or fresh user activation.

Silent resume is a requirement, so this is binding: a cross-origin iframe widget would lose
the grant and reintroduce a click on **every** navigation. Widget architecture decisions
must respect it.

### Transcript capture stays client-side even though ownership moves

`stopCall()` on unload does not reach Retell in time for the call's transcript to be
written, so there is nothing server-side to fetch at reconnect. The client snapshot is the
only reliable copy. Ownership moved; capture could not.

### The backend needs session storage, and cannot cold-start

Sessions must survive between requests, and the reconnect gap is floored by backend
latency. A spun-down free tier turns a one-second gap into a conversation-breaking one. See
[ticket 011](../wayfinder/tickets/011-backend-hosting-and-cold-start-floor.md).

### The Cart Snapshot is a hint, not a replica

Each leg is seeded with cart contents so the agent can discuss the cart without a tool call
inside a turn, with staleness bounded to one page view. Mutations must still read the live
cart, merge, then write — the cart can change via the theme UI or another tab.

### Replay policy is deliberately unresolved

Transcript growth over a long browse is a real concern. It is left open as a backend tuning
point rather than solved speculatively.

### Reconnect failure UX is deferred

What the shopper sees when a reconnect fails outright is a visual-design question, deferred
until a widget UI exists. Tracked in the map's fog.

## Amendment (2026-10-07, ticket 009)

Cost analysis changed two things in the decision above.

### Not every navigation opens a Call Leg

The original sequence assumed navigation → end leg → open leg. It now reads navigation →
end leg → **Standby**. A leg opens only when the **agent** caused the navigation, the
shopper was **mid-turn**, or a **click or browser-local VAD** wakes it. A live leg idles out
to Standby after 45 s of silence.

Silent browsing therefore costs nothing and shows nothing — and the reconnect gap, with its
"Reconnecting…" status, disappears from the common path. It survives only for the
agent-caused navigation, which is where it mattered.

Consequently the Handoff beacon fires **only when a leg was live**.

VAD listening begins only after the click-to-start CTA has opened a Session, preserving
"click-to-start, not always-listening".

### Replay policy is no longer open

The "deliberately unresolved" consequence above is closed. The Session Seed carries
**Session State** — products discussed, stated preferences, pending action, outstanding
promises — plus the **last ~4 turns verbatim**, inside a hard **4,000-token** Seed budget
chosen to stay below Retell's prompt surcharge cliff.

The seam argument that justified backend ownership is unchanged and is what made this
tunable without a storefront release.

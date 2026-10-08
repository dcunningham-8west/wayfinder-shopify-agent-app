---
title: Open questions
---

# 09 — Open questions

Part of [the spec](./README.md).

Nothing here is hidden or forgotten. Each item is triaged into one of three kinds, because
they are not the same kind of problem and must not be worked the same way.

---

## A. Blocks the build — architectural, must be decided first

Changing any of these later would change contracts, storage, or the tool vocabulary. They
are the remaining work on [the map](../wayfinder/map.md).

### A1. Security of the mutation surface — **highest priority**

[Ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md) moved
cart writes into the browser, so the exposed surface is the Action Envelope side channel: an
**unauthenticated storefront visitor holding a WebSocket that can be told to mutate a cart.**

Needs a threat model and an abuse/rate-limit story. Specifically: what authenticates a socket
to a Session, what stops one shopper's socket from acting on another's Session, and what
bounds the volume of Actions a single Session can drive.

Nothing downstream is safe to build until this is closed.

### A2. In-page mutation and Page Context staleness

Section Rendering API swaps ("load more") change the page without a navigation, so the
emitted Page Context goes stale with no reconnect to refresh it.

Narrowed by ticket 007 — filter and sort now return a fresh Page Context in their Action
Result — leaving only swaps **the agent did not cause**. The fix likely changes the Page
Context contract, so it must precede build.

### A3. Transcript and analytics retention, and data residency

What is stored, where, and for how long. Determines backend storage, so it is architectural.

Carries a live edge from [ticket 011](../wayfinder/tickets/011-backend-hosting-and-cold-start-floor.md):
the demo audience is European, Retell is **US-only AWS**, and the backend is US-East.
EU residents' transcripts leave the EEA **by design**, through two hops. This needs a
deliberate answer, not a discovered one.

### A4. Latency budget

End-to-end target per turn, and which hops get the budget.

Floored by ticket 011 at **~40 ms** (tool-only call) / **~220 ms** (Action) of backend round
trip, excluding backend work and Shopify API calls. Ticket 011 also hands this a knob:
per-tool `timeout_ms`, configurable 1–600 s, paired with `speak_during_execution` for
anything slow. Constrains tool design, so it precedes build.

### A5. Disambiguation behaviour

What the agent does when a request matches many products, or none. Interacts directly with
the Action vocabulary and with the Catalogue Index's 3–5 result shape, so it is contract-level,
not prompt-level.

---

## B. Needs a prototype before it can be answered

Deciding these on paper would be guessing.

### B1. Testing strategy

How a voice agent plus DOM driving gets tested deterministically.

This cannot be designed in the abstract — it depends on what is actually observable at each
seam. Chart as a `prototype` ticket, as
[ticket 005](../wayfinder/tickets/005-page-context-extraction-strategy.md) did for the Liquid
emitters.

---

## C. The build decides these — constrained, not open

**These are deliberately not tickets.** The map's destination is "done when nothing
*architectural* is left to decide," and a button colour or a barge-in threshold is not
architecture. Charting them as planning tickets would mean the map never terminates.

The build agent decides each against the constraints listed.

### C1. Widget UI and the Preview Panel

Constraints already fixed:
- Must express a **Standby** state (ticket 009).
- Owns browser-local VAD (ticket 009).
- Preview Panel carries **identity-level tiles only**, each linking out to the storefront;
  it is a way *to* the product page, never a replacement (ticket 007).
- Starting point, not a blank page: [`agent-app.css`](../wayfinder/prototypes/010-widget-css/agent-app.css),
  vendored from the prior v3 widget. Keep or rework.
- Open within: how the panel appears, cycles, and dismisses — the behaviour of `show_in_widget`.

### C2. Agent persona and prompt content

The *authoring model* is fixed (ticket 010): four hand-authored files — `identity`, `voice`,
`guardrails`, `continuity` — with all tool-facing text generated from `contracts`. The
**content** of those four files is build work.

Note `guardrails` is load-bearing: ticket 007 placed confirmation-before-mutation in the
prompt **only**.

### C3. Voice UX details

Barge-in, confirmation before cart mutations, error recovery when an Action fails on the page.
Constrained by C2's `guardrails` and by the Action Result contract.

### C4. Reconnect failure UX

What the shopper sees and hears when a reconnect fails outright. Deferred from ticket 004
specifically because it is best answered against a real widget; it graduates with C1.

### C5. Accessibility

The widget's own a11y and its interaction with screen readers. A voice assistant that is
itself inaccessible is a contradiction worth taking seriously, but it is design work against
a real UI, not an architectural decision.

---

## Carry-forwards from closed tickets

Not open questions — decisions already made that must be re-checked against reality.

- **Catalogue scale.** Ticket 006 assumes **~100 products** and says reopen at thousands.
  The catalogue is being hand-built from real client lists; **record the final count** and
  re-validate. See [section 05](./05-catalogue.md).
- **Theme sections.** Tickets 005 and 007 were written against the *old* store's
  Dawn-structured sections. Re-verify both against the new store's actual theme once pulled.
- **`timeout_ms` is not 5 s.** The prior system's 5 s bound was a configured choice, not a
  platform limit. Recorded explicitly so nobody "fixes" a slow tool by raising it — a long
  timeout converts a clean error into silence the shopper sits through.
- **Shipping questions resolve to nothing.** Ticket 010 cut policy/FAQ answering. "How much
  is shipping" is a *shopping* question that now hits no tool. Revisit if the agent stonewalls.

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

### A1. Security of the mutation surface — **closed**

Closed by [ticket 012](../wayfinder/tickets/012-security-of-the-mutation-surface.md).
Summarised in [section 06](./06-tools-and-actions.md).

The structural parts are decided and belong in `contracts`: a **Session Token** distinct from
the public Session Id, an **idempotency key** on every Action Envelope, and the **Call Leg
creation endpoint** as the single chokepoint for metering. **Retell webhook signature
verification** was found missing in the process — a public unauthenticated endpoint driving
backend work, previously unmentioned anywhere in this spec.

What remains is operational, not architectural: ceiling values and rate-limit thresholds,
deliberately unset because there is no real traffic to set them against. The mechanisms and
the enforcement point are built; only the constants wait. The storefront password is the real
control until then, and ticket 012 lists what must be true before it comes off.

### A2. In-page mutation and Page Context staleness — **closed**

Closed by [ticket 013](../wayfinder/tickets/013-page-context-staleness-on-in-page-mutation.md).
Summarised in [section 04](./04-page-context.md).

The premise shrank on contact with the theme: **there is no "load more"** — Dawn paginates
with real links. Exactly one interaction changes the visible product set without navigating,
a **shopper-driven facet filter or sort**, and ticket 007 had already closed the agent-caused
half.

The fix falls out of ticket 005's design: because Page Context is emitted **per section by
Liquid**, a Section Rendering API swap returns a freshly-emitted Page Context with the new
markup. The widget notices it with a `MutationObserver` over a `<script type="application/json">`
block. Delivered over the Action Envelope socket when a leg is live, and free in Standby. A
facet change does **not** wake a leg.

### A3. Transcript and analytics retention, and data residency — **closed**

Closed by [ticket 014](../wayfinder/tickets/014-transcript-retention-and-data-residency.md).
Summarised in [section 08](./08-deployment-and-operations.md).

**The backend stores nothing at rest** — Sessions live in process memory, so there is no
retention policy, no backup, and no erasure request to service. Retell keeps the conversation
on our terms: `everything_except_pii`, **30 days**, all PII categories redacted, set
explicitly on every Call Leg because the platform default is keep-forever.

The EEA transfer is real and is **disclosed** — one line beneath the click-to-start CTA, plus
Retell's self-serve DPA with SCCs. Operational logs carry no conversation content.

### A4. Latency budget — **closed**

Closed by [ticket 015](../wayfinder/tickets/015-latency-budget-per-turn.md).
Specified in [section 10](./10-latency.md).

Three budgets by turn type — **1.0 s / 1.5 s / 2.0 s at p50** for conversational, tool and
Action turns — against Retell's documented ~600 ms floor. Our backend gets **300 ms p90** of
it; the rest is Retell's, tuned by config rather than code.

The governing rule is not a number: **anything over ~2.5 s must speak while it works.**

`timeout_ms` drops from the 120,000 ms default to **8,000**, `max_retry` stays **0**, and
`responsiveness: 1` becomes a build-time assertion — `0.8` would silently add 1.5 s to every
turn. Verified post-demo from `get-call`'s `latency` object, which reports p50/p90 per
component.

### A5. Disambiguation behaviour — **closed**

Closed by [ticket 016](../wayfinder/tickets/016-disambiguation-behaviour.md).
Specified in [section 11](./11-disambiguation.md).

The catalogue is a **scent × format grid**, so the dominant ambiguity is format, not identity:
**same scent → ask one closed question; different scent → show two or three.** The search tool
returns a coarse `match_quality` (`exact`/`strong`/`weak`/`none`) rather than a raw score,
which is what makes "no results" mechanically definable. A **Referent Set** in Session State
resolves "the second one" across Call Leg boundaries; tools accept ids only.

---

## B. Needs a prototype before it can be answered

Deciding these on paper would be guessing.

### B1. Testing strategy — **closed**

Closed by [ticket 017](../wayfinder/tickets/017-testing-strategy-for-voice-plus-dom.md).
Specified in [section 12](./12-testing.md).

**Everything below the microphone is ordinary software.** A
[seam harness](../wayfinder/prototypes/017-testing/seam-harness.html) drove the whole system
through seven scenarios with no audio, no mic grant and no LLM — which is the answer.

Four seams, the richest of which (the Session state machine) touches no I/O at all. The
harness **found a real bug on its first run**: the Referent Set's replace rule destroyed the
shortlist on navigation, so "add the second one" resolved to nothing.

Conversation quality and latency are **explicitly not covered**.

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

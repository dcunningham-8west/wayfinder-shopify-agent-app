---
title: Session lifecycle
---

# 03 — Session lifecycle

Part of [the spec](./README.md). Decided in
[ticket 004](../wayfinder/tickets/004-session-continuity-model-across-page-loads.md),
[ticket 009](../wayfinder/tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md),
and [ADR-0001](../adr/0001-reconnect-with-replay-voice-continuity.md).

Terms — Session, Call Leg, Standby, Handoff, Session Seed, Session State, Replay Policy,
Cart Snapshot — are defined in [the glossary](../Glossary.md) and used precisely here.

## The governing constraint

RetellAI exposes **no resume primitive**. A web call cannot survive a page load, and tool
calls resolve server-side only ([ticket 001](../wayfinder/tickets/001-retellai-web-call-capability-surface.md)).

Therefore continuity is **reconnect-with-replay**: the Session is a backend-owned fiction
assembled across a series of short Call Legs. The shopper perceives one conversation; the
system runs several calls.

## State machine

```
          click-to-start
   none ──────────────────► STANDBY ◄──────────────┐
                               │                   │
                   wake trigger│                   │ 45 s silence
                               ▼                   │ or navigation
                            LIVE LEG ──────────────┘
```

**Standby is the resting state.** A navigation lands in Standby. A Call Leg opens only on a
wake trigger:

1. The agent itself caused the navigation.
2. The shopper was mid-turn when the page changed.
3. The shopper clicks the widget.
4. Browser-local VAD detects speech.

A live leg returns to Standby after **45 s** of silence.

VAD listening exists **only after** the shopper has started a Session with the click-to-start
CTA, and **audio never leaves the page while in Standby**. This is not always-listening.

## Ownership

| Owned by the backend | Held by the browser |
| --- | --- |
| Session id → Session State | The session id, in `sessionStorage` |
| Full transcript | Nothing else |
| Replay Policy | |
| Idle and inter-leg timers | |

The browser carries **only a session id**. It never holds the transcript. This is what makes
Replay Policy changeable without a storefront release.

The backend holds all of it **in process memory only** — no database
([ticket 014](../wayfinder/tickets/014-transcript-retention-and-data-residency.md)). Sessions
expire after **30 min idle**, the process caps at **1,000 Sessions**, and a session id the
backend no longer recognises **silently starts a fresh Session** rather than erroring. A
deploy therefore costs a shopper their history, not their call.

## Handoff

On `pagehide`, **and only if a leg was live**, the widget beacons its transcript snapshot to
the backend. Navigations made in Standby carry nothing — the session id is already in
`sessionStorage`.

Use the beacon API, not a normal request: the page is unloading and an ordinary fetch is not
guaranteed to complete.

## Session Seed

Assembled server-side and injected into every new Call Leg. Contents:

| Component | Purpose | Sheddable |
| --- | --- | --- |
| Session State | Derived facts: products discussed, stated preferences, pending action, promises made | Oldest first, 2nd |
| Referent Set | What "that one" and "the second one" currently mean ([section 11](./11-disambiguation.md)) | **Never** |
| Last ~4 turns verbatim | Conversational texture so the agent resumes mid-thought | Trim first |
| Cart Snapshot | Talking about the cart | **Never** |
| Page Context | What is on screen | **Never** |
| Action Target registry | What can be acted on | **Never** |
| Catalogue Digest | Catalogue shape, no tool call needed | Dropped last |
| Agent-caused-navigation flag | Lets the agent speak naturally about why the page changed | **Never** |

### Hard budget: under 4,000 tokens

Not advisory. Above this, Retell applies a prompt surcharge and the flat per-leg cost model
in [ticket 009](../wayfinder/tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)
collapses.

**Degradation order when the Seed is over budget:** trim the verbatim tail → drop oldest
Session State → drop the Catalogue Digest. Page Context, Action Targets, and the Cart
Snapshot are never shed; without them the agent is wrong about the shopper's screen, which
is worse than being vague.

## Timing guards

| Guard | Value | Protects against |
| --- | --- | --- |
| Settle delay before opening a leg | **2 s** | Churn during rapid navigation |
| Minimum between leg creations | **~5 s** | Retell's undocumented `create-web-call` rate limit |
| Idle timeout to Standby | **45 s** | The 10 s billing minimum, runaway cost |

## The Cart Snapshot rule

The Cart Snapshot is valid for **talking** about the cart and **never** for computing a
mutation.

Every cart write reads the live cart, merges, then writes — in the browser, via the Ajax Cart
API. The Snapshot may be seconds stale; the shopper may have changed the cart in another tab.
Computing a mutation from it would silently destroy their changes.

## Known constraints

- **The widget must be same-origin.** Silent resume depends on the per-origin microphone
  grant; an iframe on another origin re-prompts on every leg, which destroys the illusion of
  one conversation.
- **The reconnect gap is masked by a text status**, not by audio.
- **SPA-style navigation suppression was considered and rejected** — see ticket 004.
- **Reconnect failure UX is deliberately unspecified** — see
  [section 09](./09-open-questions.md), item C4.

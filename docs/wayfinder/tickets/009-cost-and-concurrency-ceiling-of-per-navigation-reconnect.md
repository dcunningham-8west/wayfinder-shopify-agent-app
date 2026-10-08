---
id: 009
title: Cost and concurrency ceiling of per-navigation reconnect
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [004]
---

# Cost and concurrency ceiling of per-navigation reconnect

Part of [the map](../map.md)

## Question

Graduated from fog by ticket 001. Reconnecting per page load has a price that rises the
longer a shopper browses, and the default ceiling is low.

- Every navigation starts a new billed call, possibly against a billing floor. At
  $0.07–$0.31/min, what does a realistic browsing session cost, and is that acceptable
  against the store's average order value?
- Replayed transcript counts toward the >4,000-token prompt surcharge, so cost per minute
  climbs through the session. Does the transcript get summarised or truncated rather than
  replayed whole? That trades cost against continuity — ticket 004's model decides what can
  safely be dropped.
- The 32,768 prompt-token cap is a hard wall. What happens to a very long session?
- RetellAI defaults to 20 concurrent calls, shared. Is that enough for this store's peak
  traffic, and what does the widget do when the pool is exhausted?
- There is no published rate limit on `create-web-call`; per-page reconnect stresses it
  hardest. Confirm with RetellAI support before committing.
- Controls to decide: per-session minute cap, idle disconnect, and whether the widget stays
  disconnected until the shopper speaks again.

Expected output: a per-session cost estimate, the transcript-replay policy, and the set of
cost/concurrency guards.

## Resolution

### Standby is the resting state; a Call Leg is the exception

The ticket assumed the thing to optimise was the cost of a leg. The real finding is that
**most navigations should not open a leg at all**.

A navigation lands the Session in **Standby**: no call, no billing, session state held by
the backend. A leg opens only when there is something to say or hear:

- the **agent** caused the navigation ("let me show you that one") — it reconnects and
  speaks, because that is the only moment where silence would feel broken;
- the shopper was **mid-turn** when the page changed;
- the shopper **wakes** it, by click or by browser-local VAD.

A shopper browsing ten pages in silence pays nothing and sees nothing. This removes the
reconnect gap from the common path entirely, since there is no reconnect to mask.

A live leg idles out to Standby after **45 s** of silence either side.

**VAD only runs once a Session exists.** The first leg still requires the click-to-start
CTA, so a shopper who never engages is never listened to — the map's "click-to-start, not
always-listening" decision stands unchanged. Audio never leaves the page while in Standby.

### 4,000 tokens is a hard budget, not a slope

Retell's prompt surcharge is a cliff: above 4,000 tokens, billed duration is multiplied by
`tokens / 4000`. Rather than accept a cost that climbs monotonically through a session, the
**entire Session Seed is budgeted under 4,000 tokens** — base prompt, tool descriptions,
Catalogue Digest, Page Context, Action Target registry, Cart Snapshot, and replay together.

Cost per leg is therefore roughly flat, and the 32,768-token hard wall is never approached.
"What happens to a very long session" stops being a question.

### Replay policy: structured state plus a short verbatim tail

Resolves the policy [ticket 004](./004-session-continuity-model-across-page-loads.md)
deliberately left open.

The transcript was never the thing worth replaying — the **derived facts** are. The Seed
carries **Session State**: products discussed, stated preferences, pending action, and any
promise the agent made. Plus the **last ~4 turns verbatim**, so a bridging line sounds like
it follows from what was actually just said.

Rejected: full transcript (blows the budget, and grows), summary-only (loses the exact
words the shopper just used), last-N-only (loses facts established early and referred to
late).

Structured state is bounded in size, auditable, and resistant to the agent reciting a stale
price or cart line as fact.

### The budget is enforced, and degrades in a fixed order

The backend's seed assembler meters the assembled Seed and **degrades rather than rejects**:

1. trim the verbatim tail,
2. drop oldest Session State,
3. drop the Catalogue Digest.

Page Context, the Action Target registry, and the Cart Snapshot are **never** shed — they
are what keeps the agent from hallucinating.

Exceeding the budget is **logged as an event**, not silently trimmed. It is the signal that
the Session State model is leaking.

### Guards against the billing floor and the undocumented rate limit

Retell charges a **10 s minimum** when the agent speaks first with a dynamic opening, and
publishes **no rate limit** for `create-web-call`. Rapid link-clicking is the worst case for
both. Guards:

- **2 s settle delay** before opening a leg after a navigation;
- **~5 s minimum interval** between leg creations within a Session.

This engineers around the unknown rate limit instead of blocking on RetellAI support, and
the guard is wanted regardless. Standby-by-default already removes most of this traffic.

### Caps and concurrency, sized for a dev store

The store is a prototype surface, not public, so peak-traffic sizing does not apply.

- **5 billed minutes per Session**, enforced in the backend before `create-web-call`.
- **$2/day workspace spend ceiling**, same enforcement point.
- Concurrency: the default **20** shared slots is ~10× what a demo needs. Buy nothing; no
  burst.
- On pool exhaustion or a 429: **fail quiet** — one backoff retry, then a disabled widget
  state with a short message. Never a retry loop.

Hitting the per-session cap winds down gracefully rather than cutting out.

### Cost estimate

A 10-minute browse with ~3 minutes of actual speech, blended $0.15/min, Seed under budget so
no surcharge:

| | Per engaged session |
| --- | --- |
| Speech (~3 min) | ~$0.45 |
| Leg floors (agent-caused navigations) | ~$0.10 |
| **Total** | **~$0.55** (~$1.20 at Retell's top-of-range pricing) |

The naive model this ticket feared — call held open for the whole browse, full transcript
replayed, surcharge climbing past 1.5× — lands at **$2.25–$4.65**. Roughly a 4× cut, and
most of it comes from Standby rather than from the replay policy.

Accepted as acceptable for the prototype.

### Consequences

- **Amends [ADR-0001](../../adr/0001-reconnect-with-replay-voice-continuity.md).** Its
  reconnect sequence assumed every navigation opens a leg and replays transcript. Both are
  now false.
- Ticket 004's Handoff narrows: the transcript snapshot is beaconed **only when a leg was
  live**. Standby navigations beacon nothing; the session id in `sessionStorage` suffices.
- Ticket 004's "replay policy is an open tuning point" is now closed.
- The widget needs a Standby visual state, which lands with the widget UI still in the
  map's fog.
- Browser-local VAD is a new widget responsibility, and a privacy claim the widget must be
  able to defend: no audio leaves the page outside a live leg.
- 45 s idle and the 2 s/5 s guards are first guesses, to be retuned against a real agent.

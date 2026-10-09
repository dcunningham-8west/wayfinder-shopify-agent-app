---
id: 015
title: Latency budget per turn
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Latency budget per turn

Part of [the map](../map.md). Raised as
[spec section 09, item A4](../../spec/09-open-questions.md).

## Question

[Ticket 011](011-backend-hosting-and-cold-start-floor.md) established the **floor**:
~40 ms of backend round trip for a tool-only call, ~220 ms for an Action, excluding backend
work and any Shopify API call. It did not establish the **ceiling**, or how the budget is
divided.

Undecided: the end-to-end target from end-of-speech to start-of-speech, and which hops get
which share — Retell STT/LLM/TTS, backend tool work, Shopify Ajax/Storefront calls, the
Action Envelope round trip, and [ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)'s
2 s settle delay and ~5 s floor between leg creations, which sit on the reconnect path
rather than the turn path and may need their own budget.

Ticket 011 hands this a knob: per-tool `timeout_ms`, configurable 1–600 s, paired with
`speak_during_execution` for anything slow. Deciding the budget decides which tools get a
filler phrase and which must stay synchronous — so it constrains tool design in `contracts`
and precedes build.

## Resolution

**Three budgets by turn type, and the realisation that we control about a fifth of a turn.**

Specified in [section 10](../../spec/10-latency.md), a new spec section — the first since the
spec was assembled. Justified because "how fast must this be" is a question every build agent
will ask, and three numbers scattered across two existing sections would be buried.

### The research made this measurable rather than speculative

| Fact | Consequence |
| --- | --- |
| Retell floor **~600 ms**; published example p50 800 / p90 1200 | A real baseline to budget against |
| `get-call` returns `latency.{e2e,asr,llm,tts}` with p50/p90/p95/p99/min/max **and raw values** | The budget is verifiable after the fact, for free |
| `timeout_ms` default **120,000 ms** | Two minutes of a mute agent, by default |
| `responsiveness` default 1; **`0.8` adds 1.5 s to every turn** | A silent config field larger than our whole backend allowance |
| Fast Tier: 1.5× cost, 25% faster, **50% less variance** | Not value now, but the named fix for *stuttering* |
| No published ms per model or TTS provider | Model choice must be measured, not reasoned |

We use Retell's own LLM rather than Custom LLM, so the per-turn websocket RTT that dominates
Retell's own best-practice guidance does not apply here at all.

### The budget

| Turn type | p50 | p90 |
| --- | --- | --- |
| Conversational | 1.0 s | 1.5 s |
| Tool turn | 1.5 s | 2.2 s |
| Action turn | 2.0 s | 3.0 s |

Chasing phone-support numbers (~800 ms) was rejected: it would mean buying Fast Tier and
accepting a weaker model for a demo that needs neither. **Browsing is not an emergency call.**

The governing rule is not a number: **anything expected to exceed ~2.5 s must speak while it
works.** A shopper tolerates "let me check that" indefinitely; they do not tolerate silence.

### Division

Our tool handler gets **300 ms p90**, against ticket 011's ~40 ms network floor — deliberately
generous so a Shopify Admin call fits without the budget becoming fiction. Everything else is
Retell's.

This is the uncomfortable finding worth stating plainly: **tuning Retell's config matters more
than optimising our code.** The code allowance is nearly an order of magnitude above its floor;
the config fields are not.

### Configuration

Agent: `responsiveness: 1`, `transcription_mode: optimize_for_speed`, Cartesia or ElevenLabs
Flash voice, smallest model that holds the conversation, **no Fast Tier yet**.

Tools: `timeout_ms: 8000`, `max_retry: 0`, `speak_during_execution` only where p90 warrants it.
`max_retry` stays 0 because worst case is `timeout × (retries+1)` — a doubled wait is worse
than a clean failure in conversation. Filler speech is not free: speaking time adds to the
turn, so it is for genuinely slow tools, not reassurance everywhere.

### Diagnostic, not a gate — with one exception

Nothing is blocked by missing the budget: there is no CI that can measure a voice turn, and
what is testable at all is still open ([ticket 017](017-testing-strategy-for-voice-plus-dom.md)).

**`responsiveness: 1` is asserted at build time** in the `retell` package. Not because it is
the largest cost, but because it is a *silent* one — nobody will ever attribute a sluggish demo
to a config field they did not know existed.

Verified by a **post-demo latency check** ([section 08](../../spec/08-deployment-and-operations.md)):
Retell's `e2e` against our own logged handler duration. Two numbers from two sides of the
boundary make a miss attributable instead of a mystery.

### The US-West question, closed with a threshold

Ticket 014's `us-west-2` finding gets a trigger rather than a lingering doubt: **test US-West
only if tool-turn p90 misses by more than 300 ms *and* handler timing is clean.** Region is a
20 ms-scale question against a 2.2 s budget; redeploying to chase it would be motion rather
than progress. If the handler is fine and the budget still misses, the suspects are the model
and TTS choices long before geography.

### Recorded in

[Section 10](../../spec/10-latency.md), with tool fields cross-referenced from
[section 06](../../spec/06-tools-and-actions.md) and the check procedure in
[section 08](../../spec/08-deployment-and-operations.md). No ADR: easily reversed, and the
numbers are expected to move once measured.

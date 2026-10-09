---
title: Latency
---

# 10 — Latency

Part of [the spec](./README.md). Decided in
[ticket 015](../wayfinder/tickets/015-latency-budget-per-turn.md).

## The budget

Measured as Retell measures it: **user stops speaking → agent starts speaking**.

| Turn type | p50 | p90 |
| --- | --- | --- |
| Conversational (no tool) | **1.0 s** | 1.5 s |
| Tool turn (search, live facts) | **1.5 s** | 2.2 s |
| Action turn (cart write, filter) | **2.0 s** | 3.0 s |

**p50** is what it feels like; **p90** is what goes wrong in front of a client.

> **The rule that matters more than the numbers:** anything expected to exceed **~2.5 s must
> speak while it works.** A shopper tolerates "let me check that" indefinitely. They do not
> tolerate silence.

Retell's documented floor is **~600 ms** before our backend does anything, with a published
example deployment at p50 800 ms / p90 1200 ms. Browsing is not an emergency call: chasing
phone-support numbers would mean paying for Fast Tier and accepting a weaker model, for a
demo that does not need either.

## Division: we control about a fifth of a turn

ASR, LLM and TTS are Retell's. Only the tool handler is ours.

| Hop | Owner | Allowance |
| --- | --- | --- |
| ASR → LLM → TTS | Retell | The remainder; tuned by config, not code |
| Network to backend | Render/Retell | ~40 ms ([section 08](./08-deployment-and-operations.md)) |
| **Tool handler, end to end** | **Us** | **300 ms p90** |

300 ms against a ~40 ms network floor is deliberately generous — it leaves room for a Shopify
Admin call without the budget becoming fiction. It also makes the honest point: **tuning
Retell's config matters more than optimising our code.**

## Agent configuration

Lives in the `retell` package.

| Field | Value | Why |
| --- | --- | --- |
| `responsiveness` | **`1`** | The most dangerous default in the API — `0.8` silently adds **1.5 s to every turn**, more than our entire backend allowance |
| `transcription_mode` | `optimize_for_speed` | Accuracy mode waits longer for context |
| Voice | Cartesia, or ElevenLabs Flash | Lowest documented synthesis latency |
| Model | Smallest that holds the conversation | "Smaller models respond faster"; no per-model ms is published, so this is measured, not assumed |
| Fast Tier | **Not yet** | 1.5× cost is poor value at demo volume |

**Keep Fast Tier in mind for one specific symptom:** it cuts latency variance by ~50%. If the
demo stutters *unpredictably* rather than consistently slowly, that is the fix.

`responsiveness: 1` is the one **build-time assertion** in the `retell` package — see
*Enforcement* below.

## Tool configuration

Cross-referenced from [section 06](./06-tools-and-actions.md).

| Field | Value | Why |
| --- | --- | --- |
| `timeout_ms` | **8,000** | Default is **120,000** — two minutes of a mute agent |
| `max_retry` | **0** | Worst case is `timeout × (retries+1)`; a doubled wait is worse than a clean failure |
| `speak_during_execution` | Only where p90 warrants it | Filler is not free — speaking time adds to the turn |
| `speak_after_execution` | `true` (default) | Except `navigate`, which is fire-and-forget |

Overridable per tool, but only with a recorded reason.

8 s is far past any healthy call and short enough that failure becomes a **spoken apology**
rather than an abandoned shopper. On the current design only live price/stock lookups touch
Shopify; catalogue search is in-memory and should never need filler speech.

Note also: Retell truncates a tool response at **15,000 characters** before it reaches the
LLM. Not a latency limit, but a wire limit worth designing under.

## Measurement

`get-call` returns a `latency` object per call — `e2e`, `asr`, `llm`, `tts`,
`knowledge_base` — each with p50/p90/p95/p99/min/max and the raw values.

**Post-demo latency check** (operator procedure, [section 08](./08-deployment-and-operations.md)):

1. Pull `get-call` for the session's Call Legs.
2. Compare `e2e` p50/p90 against the budget above.
3. Compare against our own handler timing, logged separately.

Two numbers from two sides of the boundary make a miss **attributable**: if `e2e` is bad while
`llm` is fine and the handler is 50 ms, the problem is TTS or ASR — not us.

## Enforcement

**The budget is a diagnostic, not a gate.** There is no CI that can measure a voice turn, and
what is testable at all is still open ([ticket 017](../wayfinder/tickets/017-testing-strategy-for-voice-plus-dom.md)).

One exception: **`responsiveness: 1` is asserted at build time.** Not because it is the
largest cost, but because it is a *silent* one — nobody will ever attribute a sluggish demo to
a config field they did not know existed.

## The US-West question

[Ticket 014](../wayfinder/tickets/014-transcript-retention-and-data-residency.md) found
Retell's recordings in `us-west-2` while the backend sits in US-East.

**Test US-West only if tool-turn p90 misses by more than 300 ms *and* handler timing is
clean.** Region is a 20 ms-scale question against a 2.2 s budget. The threshold exists so the
question is closed rather than lingering: if the handler is fine and the budget still misses,
the suspects are the model and TTS choices above, long before geography.

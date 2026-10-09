---
title: Testing
---

# 12 — Testing

Part of [the spec](./README.md). Decided in
[ticket 017](../wayfinder/tickets/017-testing-strategy-for-voice-plus-dom.md), which built a
[seam harness](../wayfinder/prototypes/017-testing/seam-harness.html) to find out what is
actually observable.

## The rule

> **Everything below the microphone is ordinary software. Test it as such.**

The non-deterministic hop — Retell's ASR, LLM and TTS — sits in the middle of every path, which
makes "test the voice agent" look impossible. It isn't, because **nothing we built is the voice
part.** Remove the microphone and what remains is a JSON request, a typed socket message, a
rendered template and an in-memory state machine. All four are deterministic.

The harness proved this by driving the entire system through seven scenarios with no audio, no
mic grant, and no LLM.

## The four seams

| Seam | What crosses it | Testable as |
| --- | --- | --- |
| **Tool webhook** | JSON request → JSON response | Plain HTTP test. No voice |
| **Action Envelope** | Typed message → Action Result | Socket test, backend and widget separately |
| **Liquid emission** | Rendered Page Context + Action Target registry | Assertion against a rendered theme |
| **Session state machine** | Standby ↔ Live Leg, Seed assembly, Referent Set | Pure unit test — no I/O at all |

The fourth is the one worth noticing: Session, Standby, Seed budget and Referent Set involve
**no network and no browser**. The most behaviour-rich part of the design is the cheapest part
to test.

## Scenario tests

The harness walkthroughs are the integration suite. Each is a scenario that is hard to reason
about on paper, and each maps to a decision that would otherwise regress silently:

| Scenario | Guards |
| --- | --- |
| Point in one leg, act in the next | Referent Set across Call Legs ([11](./11-disambiguation.md)) |
| Shopper filters mid-call | Page Context epoch + update ([04](./04-page-context.md)) |
| Filtering in Standby is free | No wake, no billing ([03](./03-session-lifecycle.md)) |
| Weak and absent matches | `match_quality` behaviours ([11](./11-disambiguation.md)) |
| Retry does not double-add | Idempotency key ([06](./06-tools-and-actions.md)) |
| Seed budget degrades in order | 4,000-token budget and shed order ([03](./03-session-lifecycle.md)) |
| Deploy mid-session | Unknown session id is a defined state ([08](./08-deployment-and-operations.md)) |

Every one of these runs without audio.

## What is not tested, and is not pretended to be

**Conversation quality.** Whether the agent sounds natural, confirms at the right moment, or
picks the right tool is a property of the prompt and the model. [Section 06](./06-tools-and-actions.md)
already accepts that confirmation is enforced in the prompt, not mechanically — so confirmation
*regressions* are caught by rehearsal, not CI.

**Latency.** [Section 10](./10-latency.md) makes the budget a diagnostic checked after a demo
from `get-call`, because no CI can measure a voice turn.

Stating both plainly is the point. A suite that claimed to cover them would be worse than one
that doesn't.

## Build-time checks

Two assertions, both cheap, both guarding silent failures:

- **Action Target registry** — every target id the vocabulary can name exists in the theme
  ([section 06](./06-tools-and-actions.md)). Possible only because the theme and the contract
  share a repo.
- **`responsiveness: 1`** — a config field that silently adds 1.5 s per turn
  ([section 10](./10-latency.md)).

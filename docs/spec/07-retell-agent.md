---
title: Retell agent
---

# 07 — Retell agent

Part of [the spec](./README.md). Decided in
[ticket 001](../wayfinder/tickets/001-retellai-web-call-capability-surface.md) and
[ticket 010](../wayfinder/tickets/010-prior-art-reuse-boundary.md).

## Platform facts that shape everything

| Fact | Consequence |
| --- | --- |
| Tool calls resolve **server-side only** — the browser can observe but never answer | The Action Envelope side channel exists ([section 06](./06-tools-and-actions.md)) |
| **No resume primitive** | Continuity means replaying transcript ([section 03](./03-session-lifecycle.md)) |
| SDK **v3** — v2 end-of-life 2026-10-18 | Build on v3 |
| Custom function `timeout_ms`: **1,000–600,000 ms, default 120,000** | See below |
| Retell runs **US-only on AWS** | Backend region follows it ([section 08](./08-deployment-and-operations.md)) |
| Prompt surcharge above ~4,000 tokens | The Session Seed budget |

### `timeout_ms` is a design knob, not a platform limit

The prior system ran a 5 s timeout, and that number was mistaken for a Retell constraint. It
was a configured choice.

**Do not "fix" a slow tool by raising its timeout.** A long timeout converts a clean error
into tens of seconds of a shopper sitting in silence. `speak_during_execution` covers a few
seconds, not fifty. Set `timeout_ms` per tool against the latency budget
([section 09](./09-open-questions.md), item A4), and make slow paths fast rather than patient.

## A fresh agent

New Retell agent, new LLM, new tool set. The prior agent and its ids stay **frozen and
untouched** as the fallback assistant — its CI still fires on those ids, so reusing them
would clobber the fallback.

Nothing from the prior agent is load-bearing. See
[ticket 010](../wayfinder/tickets/010-prior-art-reuse-boundary.md).

## Prompt authoring

### Generated from `contracts`

All **tool-facing** prompt content is generated: tool name, when to use it, when *not* to,
and the Action vocabulary table. It is authored as **prose fields on the Zod schemas**, so a
tool and its guidance are edited in one place.

**This exists to kill a specific failure.** If `general_tools` were generated from
`contracts` while `general_prompt` was hand-written, one `llm.update` call would carry two
sources that can disagree — the prompt describing a seam the tool no longer has. That is
precisely the one failure the prior system recorded: general product language routed to a
slow collection lookup, ~10 s of silence.

A CI name-check would not catch it, because the names stay valid while the *guidance* goes
stale. Generation makes the disagreement structurally impossible.

### Hand-authored — four files

Only what generation cannot know:

| File | Holds |
| --- | --- |
| `identity` | Persona, tone, proactivity — when it offers vs waits |
| `voice` | Barge-in, brevity, how to speak a product |
| `guardrails` | Refusals, and **confirmation-before-mutation** |
| `continuity` | Do not re-greet on a new Call Leg; how to treat replayed turns |

`guardrails` is **load-bearing**: confirmation is enforced in the prompt only
([section 06](./06-tools-and-actions.md)). There is no mechanical gate behind it.

Content of these four files is build work, constrained but not specified
([section 09](./09-open-questions.md), item C2).

### Deleted from the prior structure

- `07_dom_guidance` — the agent never touches the DOM, so there is nothing to guide.
- `01_catalog_guidance`, `02_cart_guidance`, `03_policy_guidance` — collapse into generated
  tool guidance. Policy is out of scope entirely.

Eight hand-authored files become four.

## Sync pipeline

**Port the shape, rewrite the code.** The prior pipeline's shape was right; its
implementation is a trivial concatenate-and-push against SDK v3.

```
push to main (prompts/**, contracts/**)
  → CI: generate from contracts
  → concatenate four authored files + generated tool text
  → llm.update(LLM_ID, { general_prompt, general_tools })
```

One-way. Nothing reads back from the Retell dashboard. The agent and LLM ids are **pinned as
secrets**, not discovered.

Build ordering matters: `contracts` generation must run before the sync, or the push carries
stale tool text.

## Tool surface

Deliberately small. See [section 05](./05-catalogue.md) and
[section 06](./06-tools-and-actions.md) for the full shape.

- **Catalogue search** — one tool, returning 3–5 identities. One, not several: the prior
  system's second overlapping catalogue tool created a routing decision the agent got wrong.
- **Live facts** — price and stock for an already-identified product.
- **Actions** — the ten-item vocabulary, resolved through the Action Envelope.

Deleted from the prior nine-tool set: `get_collection_products` (routing failure) and
`search_shop_policies_and_faqs` (out of scope — logged risk: "how much is shipping" now
resolves to nothing).

## Seed injection

The Session Seed is assembled **server-side** and injected per Call Leg
([section 03](./03-session-lifecycle.md)).

Server-side assembly is what lets Replay Policy change without a storefront release — the
browser carries only a session id and never holds the transcript.

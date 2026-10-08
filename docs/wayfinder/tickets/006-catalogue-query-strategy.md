---
id: 006
title: Catalogue query strategy
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [002]
---

# Catalogue query strategy

Part of [the map](../map.md)

## Question

How does the agent answer catalogue questions — the ones answerable purely from product
data, as distinct from on-screen questions (ticket 005)?

- Live Storefront API / Storefront MCP per request, a pre-built index, or both?
- Shoppers speak fuzzily ("something warmer but not wool"). Does the structured API reach
  that, or is a semantic index required? If required: what is indexed, how is it synced,
  and what is the staleness tolerance?
- Price, stock, and variant availability must be live. Which facts are never served from an
  index?
- Does the agent call the catalogue directly as a RetellAI function, or through our
  backend? What does the backend add — shaping, ranking, caching, guardrails?
- What shape comes back? A voice agent cannot read twenty results aloud. How many, ranked
  how, and how does a result become something the shopper sees on screen?

Expected output: the query path(s), the division of labour between live and indexed, and
the result contract.

## Resolution

**Chosen: orientation digest in the seed, plus a semantic search tool, plus live detail on
demand.** Three tiers, each with a job the others cannot do.

### Scale, which decides everything else

~100 products, rarely changing. Small enough that the entire catalogue lives in the
backend's memory and a semantic index over it is ~100 vectors. No external search service,
no sync pipeline, no staleness architecture. If the catalogue ever reaches thousands this
decision must be reopened — nothing here degrades gracefully, it just stops fitting.

### The governing principle: show, don't recite

A shop assistant walks you to the shelf; they do not read the price list aloud. Reciting is
what a system does when it cannot show anything, and it is worse in voice, where the shopper
can neither skim nor re-read — a spoken list of five products with prices is unlistenable
and immediately forgotten.

So the agent names two or three things, puts them on screen, and stops. Detail is **pulled**
by the shopper, never pushed by the agent.

This is the operator's observation from testing v1, and it does real architectural work: it
is what makes volatile data cheap (see Tier 3).

### Tier 1 — Catalogue Digest, in the Session Seed

A compact orientation summary (~300 tokens): collections, product types, tags, rough
counts. Assembled by the backend, injected into the Session Seed alongside transcript replay
and Page Context ([ADR-0001](../../adr/0001-reconnect-with-replay-voice-continuity.md)).

Answers "do you sell candles?" and "what sorts of things do you have?" **with no tool call
at all** — zero network hops inside the voice turn. This is a direct fix for the recorded v1
failure, not a mitigation of it.

**Carries no prices and no stock levels.** A stale price band is a confidently wrong answer
about the one fact shoppers care most about. Identity and shape only.

Rejected alternative: a **full** digest of all 100 products (~3,000 tokens), which would
remove the search tool entirely. Rejected on cost — a Call Leg starts on every navigation,
so a ten-page browse pays the tokens ten times (see
[ticket 009](./009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)) — and
because it degrades silently as the catalogue grows.

### Tier 2 — semantic search tool

For anything specific or fuzzy ("something warmer but not wool"). Backend-hosted, called by
RetellAI as a custom function.

- Backend holds the full catalogue in memory with an embedding per product over title,
  description, type, tags, and collection membership.
- Cosine match in-process. ~100 vectors, so sub-millisecond; the latency is the network hop
  and nothing else.
- Returns a **small, ranked set — 3 to 5 — of identity**: id, handle, title. Shaped for
  showing, not for reading aloud.
- Rebuilt on Shopify product webhooks, with a periodic poll as a safety net. At this
  catalogue size a full rebuild is cheap enough that incremental updates are not worth the
  complexity.

Structured Storefront API filtering cannot reach fuzzy intent, which is why this is semantic
rather than keyword.

### Tier 3 — live detail, on demand only

Price, variants, and stock are fetched live, for **one product the shopper has already
pointed at**, and only when they ask. Never prefetched, never spoken unprompted.

Because of *show, don't recite*, volatile data stops being a staleness problem and becomes a
narrow, cheap, on-demand call. This is why Tiers 1 and 2 are allowed to be approximate.

### What this deletes

**`get_collection_products` does not exist in the new vocabulary.**

The recorded v1 failure — "What candles do you sell?" routing to collection lookup and
leaving the voice turn silent for ~10 seconds — was caused by prompt-based routing between
two overlapping tools. The prompt had to teach the model to tell "general category intent"
from "visible collection intent", and it could not do so reliably.

[Ticket 005](./005-page-context-extraction-strategy.md) removes the overlap at its source:
questions about a visible section are answered from the Page Context already in the seed,
which names the collection and lists its exact products. The agent only consults the
catalogue for things **not on screen**. Two tools with fuzzy boundaries become one tool and
one seed field with no boundary at all.

Prompt-based disambiguation between similar tools is now a recognised failure mode for this
project, not just a v1 bug.

### Query path

All catalogue access goes **through our backend**, never RetellAI → Shopify directly. The
backend holds the index, owns ranking and result shaping, bounds result size, enforces the
no-price-in-search rule, and is the only place where changing any of that does not require a
theme release or a Retell re-sync.

### Deferred

How many products the agent names aloud before it becomes a list, and the exact phrasing of
the show-then-stop behaviour, are persona and voice-UX concerns already in the map's fog.


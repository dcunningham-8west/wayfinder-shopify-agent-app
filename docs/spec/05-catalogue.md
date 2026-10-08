---
title: Catalogue
---

# 05 — Catalogue

Part of [the spec](./README.md). Decided in
[ticket 006](../wayfinder/tickets/006-catalogue-query-strategy.md).

## The rule

> **Show, don't recite.**

The agent names two or three things, puts them on screen, and stops — like a shop assistant
walking you to a shelf, not reading the price list aloud. Detail is pulled by the shopper,
never pushed by the agent.

This is also an architectural licence: because volatile facts are only ever fetched for a
product the shopper has **already pointed at**, the Digest and Index are allowed to be
approximate.

## Three tiers

| Tier | Answers | Cost | Freshness |
| --- | --- | --- | --- |
| **Catalogue Digest** | "What sort of things do you sell?" | **No tool call** — it is in the Seed | Rebuilt per Session |
| **Catalogue Index** | "Show me something woody" | One tool call, in-memory | Rebuilt on webhook |
| **Live facts** | "How much is that one?" | One tool call, live API | Real time |

The tiers exist to keep the common case free. Shape questions are the most frequent and the
least volatile, so they cost nothing.

### Tier 1 — Catalogue Digest

A compact orientation summary injected into the Session Seed. **No prices, no stock levels.**

That omission is deliberate: a stale price is a confidently wrong answer about the fact
shoppers care most about. Shape is stable; prices are not.

Budget: **~300 tokens**. First component shed if the Seed exceeds 4,000
([section 03](./03-session-lifecycle.md)).

### Tier 2 — Catalogue Index

In-memory, embedding-based, over the full catalogue. Behind **one** semantic search tool.

- Returns **3–5 ranked identities**. Never prices.
- Rebuilt on Shopify product webhooks, with a periodic poll as a safety net.
- **In-memory is load-bearing**: it is the single constraint that rules out serverless and
  edge hosting ([section 08](./08-deployment-and-operations.md)).

One tool, not several. The prior system's `get_collection_products` was deleted precisely
because having two overlapping catalogue tools created a prompt-routing decision the agent
got wrong — general category language routed to a slow collection lookup, leaving the voice
turn silent for ~10 s. One tool cannot be mis-routed.

### Tier 3 — Live facts

Price and stock, fetched **only** for a product the shopper has already identified. Never
used for browsing, never used to rank.

## The actual catalogue

Target store: `wayfinder-voice-bot-store.myshopify.com`.

| Measure | Value |
| --- | --- |
| Products | 52 |
| Variants | 57 (47 single-variant) |
| Vendor | Jo Malone London (single) |
| Price range | £28 – £525 |
| `Product Category` | **empty on all 52** — Shopify's standard taxonomy unused |

**Well inside ticket 006's ~100-product assumption.** The in-memory Index design holds; the
"reopen at thousands" trigger is far away.

### Tags are a facet model, not a tag list

The 80 tags decompose into **six facets** plus a display layer. This is the most important
catalogue fact in the spec, and it **improves** on what ticket 006 assumed.

| Facet | Suffix | Values |
| --- | --- | --- |
| Fragrance | `* fragrance` | citrus, floral, lightfloral, fruity, woody, spicy, warmambery, specialedition |
| Mood | `* mood` | relaxing, romantic, uplifting, cosy, fresh, welcoming, upbeat |
| Style | `* style` | british, decadent, eclectic, minimalist, modern, relaxed, timeless |
| Scent | `* Scent` | ~17 named scents (Lime Basil & Mandarin, Wood Sage & Sea Salt, Pomegranate Noir, …) |
| Main category | `* maincat` | candle, home, colognes, bathbody, travel, mens, gifts |
| Sub category | `* subcat` | candles, colognes, bodycare, specialeditions |

Plus a Title Case **display** layer (Candles, Bath & Body, Gift Sets, Luxury Candles, …)
intended for humans, not for querying.

**Why this matters.** *Mood* and *style* are how people actually shop by voice — "something
relaxing", "something for a modern flat". Those are ordinarily the hardest intents to serve,
because they require inferring vibe from prose. Here they are **explicit, queryable facets**.

Two consequences:

1. **The Digest is structured, not flat.** It emits facet *names* and their value lists, not
   80 loose tags. A flat dump would blow the 300-token budget and be useless; a faceted
   summary fits in roughly 230 tokens and tells the agent what questions it can answer.
2. **The Index can filter before it ranks.** "Something woody under £50" becomes a facet
   filter plus a semantic rank, not a pure embedding guess. Better precision, cheaper.

### Data hygiene — fixed

- Three spellings of the gifts tag (`gift maincat`, `gifts maincat`, `all gifts maincat`)
  were consolidated to `gifts maincat`. Shopify treats tag spellings as unrelated, so a
  gifts collection built on one would have silently missed products on another.

### Data hygiene — outstanding

- **`Type` is unreliable as a facet.** 40 of 52 products are `Home Collection`; `Candles` has
  exactly one product while dozens of candles sit under `Home Collection`; `townhouse
  collection` is lowercase where everything else is Title Case. **The Digest and Index should
  ignore `Type` and use tags.**
- **`Product Category` is empty**, so Shopify's standard taxonomy gives no free signal.
- **Size values are not machine-comparable** — `30ml, 200g`, `Various`, `2 x 65g`. Fine for
  display; the agent cannot sort or compare by size.

## Collections

Automated collections driven by tag conditions, so they maintain themselves as products are
added.

Collections are not only merchandising here — they are **navigation targets**. Ticket 007's
`navigate` Action needs real URLs to send a shopper to; without collections the agent can
only ever search inside the widget, never walk the shopper to a shelf. That would undercut
*show, don't recite* as a design.

The `maincat` facet defines the collection set.

## Source of truth

Catalogue reads use the **Shopify Admin API**, read-only (`read_products`, `read_inventory`).

The backend never writes to Shopify through the Admin API. Cart writes happen in the
browser via the Ajax Cart API ([section 06](./06-tools-and-actions.md)). Credential details
in [section 08](./08-deployment-and-operations.md).

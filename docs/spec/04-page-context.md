---
title: Page context
---

# 04 — Page context

Part of [the spec](./README.md). Decided in
[ticket 005](../wayfinder/tickets/005-page-context-extraction-strategy.md).

## The rule

> **The page supplies identity. The catalogue supplies facts.**

Page Context says *which* product is on screen. It never says what the product is like.
Descriptions, claims, and prose come from the catalogue, looked up by id.

This exists to kill a specific bug. The prior version resolved products by **name
similarity** against what it could scrape, and confidently described the wrong product.
Removing name-similarity resolution from the path removes that entire failure class — not by
prompting the agent to be careful, but by never giving it the chance.

## Emitted by Liquid, at render time

Page Context is emitted by the **theme**, in Liquid, when the page renders. Not scraped from
the DOM, not fetched.

Liquid has the data already, authoritatively, with no round trip and no parsing. Scraping
would reintroduce exactly the guesswork this design removes.

### Two layers

| Layer | Source | Gives |
| --- | --- | --- |
| **Template-level** | Liquid globals (`product`, `collection`, `template`) | Which page this is, and its primary subject |
| **Per-section** | A section-level emitter | Which products are visible, in which section, in what order |

The per-section layer is the one that matters and the one **an app embed structurally cannot
replicate** — an embed cannot see inside a section's render scope. This is a direct reason
the widget is theme-integrated rather than an app embed, and it supersedes
[ticket 002](../wayfinder/tickets/002-shopify-storefront-integration-surfaces.md)'s
app-embed conclusion.

Working prototypes: [prototypes/005-page-context](../wayfinder/prototypes/005-page-context/).

## Payload

**Carries:** ids, handles, titles, positions, price, availability.

**Never carries:** descriptions, body copy, marketing prose, or anything the agent might quote
as product truth.

Price and availability are present because they are on screen already — the shopper can see
them, so the agent denying knowledge would be absurd. They are a *rendering* of the page, not
a source of catalogue truth; volatile facts are confirmed via the live-facts tool
([section 05](./05-catalogue.md)).

## Merchandise and Furniture

Every page splits in two:

- **Merchandise** — anything with a catalogue identity: products, collections, search
  results. The agent reasons about these by **looking facts up**.
- **Furniture** — banners, forms, rich text, filters, navigation. The agent may describe
  these structurally and act on them, but **never treats them as product truth**.

The split is what lets the agent answer "what's on this page?" without inventing product
claims from a hero banner's marketing copy.

## Lifecycle

Read by the widget on load, carried into the **Session Seed**, and sent **once per Call Leg**.
It is never shed from the Seed.

## Staleness — a known gap

Section Rendering API swaps ("load more") change the page without a navigation, so no new
Call Leg opens and the emitted Page Context goes stale.

Partially closed by [ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md):
filter and sort Actions return a **fresh Page Context in their Action Result**. That covers
every swap the agent caused.

Swaps the **shopper** caused remain unsolved, and the fix likely changes this contract. See
[section 09](./09-open-questions.md), item A2.

## Theme compatibility

Verified against the target store: **Jo Malone Candle Theme**, Shopify generated-data tooling,
Dawn-structured — `card-product.liquid`, `cart-drawer.liquid`, `buy-buttons.liquid`,
`main-product.liquid`, `main-collection-product-grid.liquid` all present across 52 sections,
60 snippets, 13 templates.

Ticket 005's emitters apply without revision.

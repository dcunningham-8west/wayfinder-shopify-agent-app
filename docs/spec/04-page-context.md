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

It is also **re-emittable mid-leg** — see below.

## Staleness — closed

Decided in [ticket 013](../wayfinder/tickets/013-page-context-staleness-on-in-page-mutation.md).

The theme was surveyed rather than assumed, and the premise shrank. There is **no "load
more"** in this theme — Dawn paginates with real links, which are navigations. Of everything
that mutates the DOM without navigating, exactly one thing changes the visible **product
set**: a **facet filter or sort the shopper performed themselves**. Everything else is chrome
(cart drawer, quick-add, pickup availability) or metadata on a product already on screen
(variant selection).

[Ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md) had
already closed the agent-caused half, via a fresh Page Context in the Action Result.

### The page re-emits itself

Because Page Context is emitted **per section, in Liquid, at render time**, a Section
Rendering API swap asks Shopify to render that section again — so **the response already
contains a freshly-emitted Page Context**. The new truth arrives attached to the markup that
replaced the old. Nothing is computed, diffed, or scraped.

| Mechanism | Why |
| --- | --- |
| Emitted as `<script type="application/json">` | Survives `innerHTML` replacement; an executable `<script>` would silently not run |
| Widget watches with a `MutationObserver` | Theme-agnostic — catches facets, lazy recommendations, anything Dawn re-renders later |
| Updates coalesced over one animation frame | One filter click replaces grid, count and pills in a burst; otherwise the agent narrates a stutter |

Dawn's `facets.js` publishes no event, so the alternative was monkey-patching
`FacetFiltersForm` — rejected as coupling to Dawn internals for a single feature.

### Delivery depends on Standby

| State | Delivery |
| --- | --- |
| **Live leg** | `page_context_update` pushed over the Action Envelope socket |
| **Standby** | Overwrite the widget's in-memory copy; the next Session Seed carries it |

The Standby path costs nothing. A facet change is **not** a wake trigger
([section 03](./03-session-lifecycle.md)) — opening a billed leg for a shopper who clicked a
checkbox and never spoke is the cost pattern Standby exists to prevent.

A **pull** model (`get_page_context` on demand) was rejected: it makes freshness a prompt
judgement, the failure class [section 05](./05-catalogue.md) deleted.

### Epoch

Page Context carries a monotonic **epoch per section**; the page-level epoch is the max. It
does **not** gate Actions — see [section 06](./06-tools-and-actions.md).

### Payload of an update

Full replacement of the affected section, plus a short `change_summary`
(`"filtered to Mood: Relaxing — 7 of 52 products"`). The section keeps ids correct; the
summary is what the agent reasons with. The agent is told **silently** — it may reference the
change when relevant, but never announces it.

**Consequence:** the 4,000-token Seed budget must be enforced **on update**, not only at Seed
construction.

### Scope

Lazy-loaded **product recommendations are** Page Context — genuinely on screen, and a prime
voice question. The **predictive-search dropdown is not** — transient and keyboard-driven;
treating it as page content invites the agent to describe a list that has vanished.

## Theme compatibility

Verified against the target store: **Jo Malone Candle Theme**, Shopify generated-data tooling,
Dawn-structured — `card-product.liquid`, `cart-drawer.liquid`, `buy-buttons.liquid`,
`main-product.liquid`, `main-collection-product-grid.liquid` all present across 52 sections,
60 snippets, 13 templates.

Ticket 005's emitters apply without revision.

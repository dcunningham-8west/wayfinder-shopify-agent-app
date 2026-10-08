---
id: 005
title: Page context extraction strategy
type: prototype
mode: HITL
state: closed
assignee: agent
blocked_by: [002]
---

# Page context extraction strategy

Part of [the map](../map.md)

## Question

The shopper can ask about anything they can see — collections, banners, forms, filters,
promos — none of which the catalogue data knows about. How does the agent learn what is on
screen?

Build a cheap, rough prototype against a real page from the store and react to it. Compare:

1. Shopify page metadata plus hand-authored extractors producing a typed `PageContext`.
2. A trimmed DOM or accessibility-tree dump handed to the model raw.
3. A hybrid: typed core (page type, products, cart) plus a bounded raw region for chrome.

Judge on: does the agent answer on-screen questions correctly, token cost per turn, how
badly it breaks when the theme changes, and how much hand-authoring each page type needs.

Open sub-questions to settle alongside:

- Is `PageContext` sent once at call start, or refreshed mid-call when the page mutates
  without navigating (filters, modals, infinite scroll)?
- How big is it allowed to get?
- Does the same structure double as the target map for DOM driving, or is that separate?

Expected output: a linked prototype asset, a chosen strategy, and the `PageContext` shape.

## Resolution

**Chosen: option 1, render-time extraction in Liquid** — a typed Page Context emitted by the
theme itself. Prototype:
[docs/wayfinder/prototypes/005-page-context](../prototypes/005-page-context/README.md).

### Root cause of the v1 hallucinations

v1's agent invented products because it was asked for **facts it did not have**.
`get_collection_products(collection_name)` resolved a collection by name, by similarity; when
the match missed, the model filled the silence. Ungrounded page state, not a prompt problem.

### Governing principle

> **The page supplies identity. The catalogue supplies facts.**

The page emits ids, handles, titles, positions, price, availability — never descriptions, and
nothing the agent should quote as product truth beyond name and price. Every real fact is a
catalogue lookup keyed by an id the page supplied. No name-similarity resolution exists
anywhere in the path, so the v1 failure is structurally unreachable: identifiers are real, or
there are none.

### Why render-time Liquid beats the alternatives

- **`templates/*.json` (the operator's suggestion)** — rejected. It is template
  *configuration*, not rendered *state*: it says "show 4 from `jo-malone-candle-collection`"
  but not which 4 rendered, in what order, or whether one sold out. Blind to pagination,
  filters, and search. It is also theme source, not served to the browser, so it would have
  to be copied to the backend and kept in sync with the live theme.
- **DOM / accessibility-tree dump (option 2)** — rejected as the primary source. Expensive
  per turn, brittle against theme changes, and it invites the agent to read product facts off
  the screen. Usable as a *fallback for identity only* (Dawn's cards link to
  `/products/{handle}`, so handles are recoverable), never as a source of truth.
- **Liquid at render time** — the theme already holds exact, authoritative state. Zero
  inference, zero scraping, no drift possible because the emitter is handed the same product
  list the section loops over.

Unlocked by the map note that **the theme is ours to edit**. This is the concrete payoff of
that decision.

### Shape: two layers

| Layer | Rendered | Sees | Blind to |
| --- | --- | --- | --- |
| **Template context** | once, from `theme.liquid` | `product`, `collection`, `search`, `cart` globals — what page this *is* | sections composed onto the page |
| **Section context** | one `{% render %}` per merchandise section | exactly the products that section rendered, post-limit | nothing, within its section |

The second layer is why an app embed block is insufficient: an embed runs in the layout and
cannot enumerate a template's sections, so it is blind on a homepage carrying three
`featured-collection` sections — exactly the case that failed in v1.

### Transport

The widget reads `#agent-page-context` plus every `.agent-section-context` on load,
assembles one Page Context, and sends it with the session id to call creation. The backend
folds it into the **Session Seed**
([ADR-0001](../../adr/0001-reconnect-with-replay-voice-continuity.md)), so page awareness
rides the continuity path rather than inventing a second mechanism.

**Sent once per Call Leg**, answering the ticket's first sub-question. Because a leg starts
on every navigation, page context refreshes per page for free — no polling.

### Size

Identity-only keeps it small: roughly 4KB for a 50-product collection page. No hard cap set;
if it bites, truncate the product list and state the true total, which the emitter already
carries. Deliberately not solved speculatively.

### Scope boundaries

- **Furniture** — banners, forms, rich text — is **not** emitted here. Those need
  affordances, not facts, and belong to
  [ticket 007](./007-storefront-action-vocabulary-and-dom-boundary.md). Page context has two
  layers in the domain sense: *merchandise* (grounded in the catalogue) and *furniture*
  (described structurally, acted on, never reasoned about as product truth).
- Whether this doubles as the DOM-driving target map is left to ticket 007; the section
  emitter already carries `dom_id`, which is the obvious hook.

### Deferred

In-page mutation — filters, "load more", Section Rendering API swaps — makes the emitted JSON
stale *within* a page, with no reconnect to refresh it. Operator judged this edge enough to
defer. Moved to the map's fog.


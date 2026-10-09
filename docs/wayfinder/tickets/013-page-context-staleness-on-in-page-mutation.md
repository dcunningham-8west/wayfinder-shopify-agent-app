---
id: 013
title: Page Context staleness on in-page mutation
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Page Context staleness on in-page mutation

Part of [the map](../map.md). Raised as
[spec section 09, item A2](../../spec/09-open-questions.md).

## Question

[Ticket 005](005-page-context-extraction-strategy.md) emits the Page Context at **render
time** from Liquid, and [ticket 004](004-session-continuity-model-across-page-loads.md)
sends it once per Call Leg inside the Session Seed. Both assume the page is a fixed
artifact for the life of a leg.

The Section Rendering API breaks that assumption: "load more", quick-add, cart drawer
updates and infinite scroll swap markup **without a navigation**, so no reconnect fires and
the agent keeps reasoning over a page that no longer exists. [Ticket 007](007-storefront-action-vocabulary-and-dom-boundary.md)
narrowed it — filter and sort return a fresh Page Context in their Action Result — leaving
swaps **the agent did not cause**, which is also where the Action Target registry goes stale.

Undecided: whether the page pushes a refreshed Page Context mid-leg (and over what channel,
given the Action Envelope socket already exists), whether the agent pulls on demand via a
tool, or whether Page Context carries a version/epoch the backend checks before acting —
and what happens to an Action naming a target id that the swap removed. The answer likely
changes the Page Context contract in `contracts`, so it must precede build.

## Resolution

**The page re-emits itself; the widget just has to notice.**

### The premise was wrong, in a useful way

The theme was surveyed before any design was attempted. The Jo Malone Candle Theme is a
faithful Dawn with **no bespoke DOM-mutation code**, and the headline example — "load more" —
**does not exist in it**. Dawn paginates with real `<a>` links, which are navigations, which
already open a fresh Page Context. `show-more.js` only toggles facet-option visibility.

Of everything that mutates the DOM without navigating, exactly one thing changes the visible
**product set**: a **facet filter or sort the shopper performed themselves**. Everything else
is chrome (cart drawer, cart notification, quick-add modal, pickup availability) or metadata
on a product already on screen (variant selection swaps price/SKU/inventory only).

Two edge cases sit outside that: product recommendations lazy-load real product cards on
scroll via IntersectionObserver, and predictive search shows real products in a transient
dropdown.

So the gap was never general page staleness. It was one interaction, and ticket 007 had
already closed the agent-caused half of it.

### The mechanism falls out of ticket 005

[Ticket 005](005-page-context-extraction-strategy.md) emits Page Context **per section, in
Liquid, at render time**. Dawn's facet code re-renders through the Section Rendering API,
which asks Shopify to render that same section again — so **the response already contains a
freshly-emitted Page Context**. Nobody has to compute, diff, or scrape the new truth; it
arrives attached to the markup that replaced the old.

That reduces the problem from "track page state" to "notice an element changed":

- Page Context is emitted as **`<script type="application/json">`**, not an executable
  `<script>`. A JSON block survives `innerHTML` replacement intact, where an executable one
  would silently fail to run — a difference that decides the whole design.
- The widget watches the section containers with a **`MutationObserver`** and re-reads the
  block. Generic by construction: it catches facet swaps, lazy-loaded recommendations, and
  anything Dawn re-renders in future, with no per-feature wiring.
- Updates are **coalesced over one animation frame**. A single filter click replaces the
  grid, the result count and the facet pills in a burst; without coalescing, one click would
  emit three Page Context updates and the agent would narrate a stutter.

Dawn's `facets.js` publishes no event and exposes no hook, so monkey-patching
`FacetFiltersForm` was the alternative. Rejected: it couples us to Dawn's internals for a
single feature, where the observer is both theme-agnostic and future-proof.

### Delivery, and the Standby problem

[Ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md) makes Standby
the resting state, so most of the time there is **no live Call Leg and no socket to push to**.
The answer splits by state:

| State | Delivery |
| --- | --- |
| **Live leg** | A `page_context_update` pushed over the existing Action Envelope socket |
| **Standby** | Overwrite the widget's in-memory Page Context; the next Session Seed carries it |

The Standby path costs **nothing** — no network, no call, no tokens. A facet change is
explicitly **not** a wake trigger: opening a billed leg for a shopper who clicked a checkbox
and never spoke is the exact cost pattern ticket 009 exists to kill.

A **pull** model — a `get_page_context` tool the agent calls when it suspects staleness — was
rejected outright. It makes freshness a prompt judgement, which is the failure class
[ticket 006](006-catalogue-query-strategy.md) deleted when it removed prompt-routing between
catalogue tools. The agent must never have to decide whether it is looking at a real page.

### Epoch: per section, and only for explanation

Page Context carries a monotonic **epoch, per section**, with the page-level epoch derived as
the max. Section-level is what actually changes, and it lets a failure name *which* region
went stale; a page-wide counter would mark the entire Page Context suspect every time a
recommendations strip lazy-loaded below the fold.

The epoch does **not** gate Actions. An Action naming a target that a swap removed is still
**attempted**, and ticket 007's existing `target_not_found` result fires. Pre-emptive
rejection at the backend was rejected: most of a grid survives a filter, so the backend's
snapshot would block Actions that are perfectly valid. **The page is the authority on its own
DOM** — it always knows better than a server-side copy. The epoch mismatch rides along on the
failure so the agent can say "that one's been filtered out" instead of a bare apology.

### What the update carries

Full replacement of the **affected section**, plus a short **`change_summary`**
(`"filtered to Mood: Relaxing — 7 of 52 products"`). Deltas were rejected as a diffing problem
nobody needs at 52 products. The full section keeps ids correct; the `change_summary` is what
the agent actually reasons with.

Consequence for ticket 009: the **4,000-token Seed budget must be enforced on update, not only
at Seed construction**, or a long-running session can drift past the surcharge cliff one
section at a time.

### The agent is told silently

The fresh context is delivered without obligation to speak. The agent may reference the change
when relevant ("those seven are all under £60") but never announces it. An agent that narrates
every click is intolerable; one that cannot see the shopper filtered is worse.

### Scope

Recommendations **are** Page Context — they are genuinely on screen, and "what else is like
this?" is a prime voice question. The predictive-search dropdown is **not**: transient,
keyboard-driven, and a shopper mid-dropdown is not talking. Treating it as page content would
invite the agent to describe a list that has already vanished.

### Recorded in

[Section 04](../../spec/04-page-context.md) and [section 06](../../spec/06-tools-and-actions.md).
No ADR: this refines ticket 005's lifecycle rather than reversing a decision, and the
rationale reads naturally in the spec.

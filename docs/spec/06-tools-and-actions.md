---
title: Tools and actions
---

# 06 — Tools and actions

Part of [the spec](./README.md). Decided in
[ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md).

## The rule

> **A Tool asks and gets an answer. An Action does something to the page.
> The agent never touches the DOM.**

- A **Tool** resolves entirely backend-side, returns facts, changes nothing the shopper can
  see.
- An **Action** always executes in the browser, always returns an outcome, never returns
  product facts.

**There is no third category.** If it touches the shopper's screen or cart, it is an Action.
`navigate` is an Action with a known side effect — ending the Call Leg — not a special kind.

This is the rule that stops the vocabulary drifting. Every proposed addition must land on one
side.

## Transport: the Action Envelope

Retell resolves tool calls **server-side only**, but every Action executes in the browser.
The decision has to cross that gap.

The widget opens a **WebSocket to the backend for the life of a Call Leg**. The backend
pushes an **Action Envelope**, waits for the widget's **Action Result**, and only then
answers Retell.

```
agent → Retell → backend ──Envelope──► widget → DOM / Ajax Cart API
                    ▲                     │
                    └────Action Result────┘
                    │
              then answers Retell
```

**Why not let the widget observe tool calls on the Retell SDK event stream?** Because that is
a broadcast, not a conversation. The backend would have already told Retell "done" before the
browser attempted anything — so a sold-out variant becomes a confidently false statement with
no path to correct it. The side channel costs one connection per leg and a round trip; it
buys truthful speech and a failure path.

**`navigate` is the one exception.** The widget acks *before* unloading and the backend
answers Retell with "navigating". Holding a request open across a page unload would kill it
with the page. The real outcome arrives in the next leg's Session Seed, which already records
whether the agent caused the navigation ([section 03](./03-session-lifecycle.md)).

## The DOM boundary: Action Targets

The same Liquid that emits Page Context emits an **Action Target registry** —
`data-agent-action` attributes on actionable things, with ids the Page Context declares.

**The agent names a target id. It never sees or sends a selector.**

This repeats [section 04](./04-page-context.md)'s move: the page declares what it is; the
agent never guesses.

Rejected alternatives:
- **A separately-maintained selector map** — drifts from the theme by construction.
- **Runtime DOM inspection** — burns tokens on markup the agent should not reason about.

Viable only because the theme is owned and fixed for this build.

### Breakage is caught twice

| Check | When | Why it matters |
| --- | --- | --- |
| **Build-time assertion** — every target the contract declares is still emitted in the Liquid | CI | **The one that matters.** Catches it before a shopper does |
| Runtime `target_not_found` result | Live | Logged and apologised for — but a hit means a shopper already met it |

The build check is an ordinary test because [ticket 008](../wayfinder/tickets/008-monorepo-layout-and-shared-contract-package.md)
put the theme and the contract in one repo.

## The vocabulary

Fixed and typed — **not** a generic `perform(target, intent)`. A runtime-declared vocabulary
moves the legal set out of the prompt and into data, leaving the model to guess what is
allowed.

This table is what the `contracts` package holds.

| Action | Args | Executes | Returns |
|---|---|---|---|
| `navigate` | `url` | browser | ack only; outcome arrives in next leg's Seed |
| `open_product` | `product_id`, `variant_id?` | browser | ack only (it is a navigate) |
| `select_variant` | `variant_id` | browser (target) | price, availability, fresh Page Context |
| `add_to_cart` | `variant_id`, `qty` | browser (Ajax) | cart count, line total |
| `update_cart_line` | `line_key`, `qty` | browser (Ajax) | cart count, line total |
| `apply_filter` | `facet`, `values[]` | browser (URL) | result count, fresh Page Context |
| `sort` | `order` | browser (URL) | result count, fresh Page Context |
| `scroll_to` | `target_id` | browser (target) | ok / `target_not_found` |
| `submit_form` | `target_id`, `fields` | browser (target) | ok / validation errors |
| `show_in_widget` | `product_ids[]` | browser (widget) | ok — behaviour deferred |

### Notes on specific actions

**Cart writes run in the browser**, through the Ajax Cart API. The cart cookie and the
theme's cart-drawer re-render both live in the page; writing server-side via the cart token
means reimplementing both. Cart mutation is just another Action, not a special backend path.

The Cart Snapshot remains **never valid for computing a mutation**
([section 03](./03-session-lifecycle.md)).

**`apply_filter` and `sort` are implemented as URL construction**, not by clicking facet
controls — Dawn drives both through query parameters and the Section Rendering API. The agent
speaks in facets; the widget builds URLs.

The facet vocabulary comes from the catalogue's six-facet tag model
([section 05](./05-catalogue.md)), so "show me the woody ones" is a filter, not a search.

## Action Results

**Timeouts, retries and filler speech** for every tool are specified in
[section 10](./10-latency.md): `timeout_ms: 8000`, `max_retry: 0`, and
`speak_during_execution` only where it is earned.

**Typed per action**, plus a **fresh Page Context** for any Action that changes what is on
screen.

A filter leaving four products is a different conversation than one leaving zero, and the
agent cannot know which unless told. This also closes part of the staleness gap: the swap
that invalidates Page Context is the same call that returns the new one.

### Stale targets are attempted, not rejected

An Action naming a target that an in-page swap removed is **still sent to the page**, and
`target_not_found` fires. The Page Context epoch ([section 04](./04-page-context.md)) does
**not** gate Actions.

Pre-emptive rejection at the backend was rejected in
[ticket 013](../wayfinder/tickets/013-page-context-staleness-on-in-page-mutation.md): most of
a grid survives a filter, so a server-side snapshot would block Actions that are perfectly
valid. **The page is the authority on its own DOM.** The epoch mismatch rides along on the
failure, so the agent can say "that one's been filtered out" rather than apologise blindly.

## The Preview Panel

`show_in_widget` is **reserved in the vocabulary now** so the contract knows it exists; its
behaviour is deferred to the build ([section 09](./09-open-questions.md), item C1).

The feature: the agent slides up a panel of product tiles and narrates them in turn, sparing
the shopper a tour of product pages. This is something the storefront cannot do, because the
storefront cannot talk.

One constraint is fixed now so the deferred design cannot go wrong:

> The panel is **identity-level only** — image, title, price, link — and every tile's action
> is `open_product`. It is a way *to* the storefront, never a replacement for it.

One source of visual truth.

## Confirmation

> **Confirm when the agent proposes. Execute when the shopper asks.**

The trigger is **who proposed the action**, not what kind it is. "Shall I take you to the
candles?" is good when the agent thought of it and irritating when the shopper just asked.

Where the shopper asked but the agent had to *infer* which thing, it confirms by **echoing**
rather than asking permission — "adding the Lime Basil & Mandarin one". Money changes the
tone, not the rule.

**Extended by [section 11](./11-disambiguation.md):** confirm when the agent proposed the
product **or** when the search returned `match_quality: weak`. A `none` match never acts.

**Enforced in the prompt, not mechanically.** A backend gate would mean re-deriving intent
from a transcript — a second, worse LLM problem — and a `confirmed: true` argument is a box
the model ticks reflexively.

This makes the `guardrails` prompt file load-bearing ([section 07](./07-retell-agent.md)),
and makes confirmation regressions the testing strategy's problem
([section 09](./09-open-questions.md), item B1).

## Security

Cart writes happen in the browser, driven over a WebSocket held by an **unauthenticated
storefront visitor**. Closed by
[ticket 012](../wayfinder/tickets/012-security-of-the-mutation-surface.md):

- A socket binds to a Session with a **Session Token** — minted at Session creation, held in
  `sessionStorage`, **never logged and never in the Seed**. Distinct from the Session Id,
  which is public by design.
- Every Action Envelope carries an **idempotency key**; the widget no-ops repeats. Without
  it, retrying an unacked Action after a dropped socket double-adds to the cart.
- Rate limiting lives at the **Call Leg creation endpoint**, not the socket — sockets are
  cheap, Call Legs cost money.

See [section 08](./08-deployment-and-operations.md) for what remains operational.

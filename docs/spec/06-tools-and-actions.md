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
| `fill_form` | `target_id`, `fields` | browser (target) | ready / validation errors |
| `submit_form` | `target_id` | browser (target) | submission pending |
| `show_in_widget` | `product_ids[]` | browser (widget) | ok — behaviour deferred |
| `show_preview` | — | browser (widget) | ok / `unavailable`; pushes the backend's staged tiles |
| `show_on_page` | — | browser (target or URL) | ok / `target_not_found`; backend resolves to `scroll_to` or `navigate` |

### Notes on specific actions

**`scroll_to` targets sections and on-page products.** Every section that emits Page Context
also carries `data-agent-action` equal to its `section_id`, so the agent scrolls by naming a
section id it already holds. One id, emitted in one place — the target and the context cannot
drift. Product cards remain targets by product id.

**Cart reads and writes run in the browser**, through the locale-aware Ajax Cart API. Before
each Call Leg, the widget reads `/cart.js` and sends the validated Cart Snapshot to the
backend for the Seed. The same-origin request carries the shopper's cart cookie; the backend
does not fetch or own that cart. Cart mutation is just another Action, not a special backend
path.

Shopify applies `add.js` to the existing cart and merges matching lines according to its
documented semantics. `update_cart_line` targets the current line key. Neither action
computes its mutation from the Cart Snapshot, which remains **never valid for computing a
mutation** ([section 03](./03-session-lifecycle.md)).

**`apply_filter` and `sort` are implemented as URL construction**, not by clicking facet
controls — Dawn drives both through query parameters and the Section Rendering API. The agent
speaks in facets; the widget builds URLs.

### Contact form

The Contact form is the first declared form target (`contact-form`). Its stable field keys are
`name`, `email`, `phone`, and `body`; the theme marks exactly which controls may be filled.
`fill_form` places values in the visible controls and runs browser validation without
submitting. The agent summarizes the message and asks permission. Only a clear yes permits
`submit_form`, which uses the native Shopify form submission after the agent finishes speaking.

Shopify returns to the Contact page with a success or error result. The theme emits that
result into the next Session Seed, so the agent reports success only when Shopify confirms it.
The form target and result are included only when that form exists on the current page.

**`open_product` does not go through the Action Target registry.** The agent names a
`product_id`; the backend resolves it to the canonical storefront URL from the Catalogue and
fills it into the Envelope. The registry only covers what is **on the current page**, and a
searched product usually is not — the product page is the one destination the DOM cannot reach,
because arriving there is the point ([KF-002](../known-failures.md)).

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

### Behaviour (decided in the build)

- **The backend decides what may be shown; the shopper decides how.** Every
  `search_catalogue` **stages** its results (or its `alternatives` on `none`) as tiles in
  Session State. Whether they are pushed immediately depends on the Offer below.
  `show_in_widget` stays out of the agent's tool set; the agent's only route to the panel is
  `show_preview`, which takes **no arguments** and pushes the staged tiles — so the agent can
  never send the wrong ids ([KF-001](../known-failures.md)). The search result carries
  `preview: "shown" | "not_shown" | "staged"` — the agent's only evidence of panel state.

### The Offer: show now, or take you there

The panel is one way to see products, not the only one. For broad results the agent offers a
choice instead of forcing the panel:

> "We have a selection of fruity fragrances. I can show some now, or take you to them?"

| Search result | Behaviour |
| --- | --- |
| Single `exact` / `strong` product | **No offer.** Panel opens immediately, as before |
| Several results, or **any facet-filtered search** (regardless of `match_quality`) | **Offer** |
| `weak`, no facets | **No offer.** Panel opens immediately; the agent clarifies by voice ([section 11](./11-disambiguation.md)) |
| `none` | Admit it, offer one alternative ([section 11](./11-disambiguation.md)) |

Facet-filtered searches always get the Offer because the ranker scores titles lexically: a
browse that passed its facet filter exactly can still be reported as `weak`.

**The backend computes the Offer** and returns it on the search result:
`offer: { on_page: "scroll" | "navigate", ask: boolean }`. The target and URL stay in
Session State; the agent never sees or sends them.

- **"Show me now"** → `show_preview`.
- **"Take me there"** → `show_on_page`, which the backend resolves to `scroll_to` when a
  section on the current page **renders** at least one of the results (overlapping product
  ids; a matching heading is not enough, since a carousel shows only part of its collection).
  Otherwise `navigate` to a **filtered collection URL**
  (`/collections/all?filter.p.m.custom.<facet>=<value>`, as `apply_filter` builds), or to
  `/search?q=` when the search had no facets.
- **The shopper already said how** ("show me the fruity ones", "take me to the candles") →
  skip the Offer and act. *Execute when the shopper asks.*
- **The choice is sticky for the Session.** Once the shopper picks one, later broad searches
  apply it: `preview` pushes the panel at once; `on_page` returns `ask: false` and the agent
  calls `show_on_page` without asking. Held on the backend Session, so it survives Call Legs;
  it does not outlive the Session. The shopper can still ask for the other way at any time.
- **Bounded cost.** The push waits at most 1.5 s; a slow or absent page costs the panel, never
  the search answer.
- **Cycling follows speech.** The tile whose distinctive title words the agent most recently
  spoke becomes active; previously active tiles dim. Words shared by every tile ("gift set")
  cannot select one.
- **Dismissed** by its close button, Escape, the call ending, or the next search replacing it.
- **Honest outcome.** The widget reports `ok` only if the panel actually rendered.

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

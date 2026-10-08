---
id: 007
title: Storefront action vocabulary and the DOM-driving boundary
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [001, 002, 005]
---

# Storefront action vocabulary and the DOM-driving boundary

Part of [the map](../map.md)

## Question

The agent both emits defined actions and drives the DOM. Draw the line and name the set.

- Enumerate the action vocabulary: navigate, open product, add to cart, change variant,
  apply filter, sort, show results in the widget, scroll to element, open a form, etc.
  Each with its arguments.
- Which of these are theme-independent app actions, and which require touching the theme's
  DOM? What is the rule for deciding, so the set does not drift?
- For the DOM half: configured selector map for this one store, generic Shopify-markup
  heuristics, or runtime inspection? How is a stale selector detected and reported?
- Where does an action execute — browser only, backend only, or either? Cart writes in
  particular: AJAX cart in the page, or backend via the cart token?
- What does an action return to the agent so it can speak about the outcome, and what
  happens on failure?
- Which actions need shopper confirmation before they fire?

Expected output: the typed action vocabulary, the browser/backend split, and the
DOM-driving approach with its failure mode.

## Resolution

**The agent never touches the DOM. The theme declares what is actionable, and every Action
runs in the browser.**

### The Tool / Action split

The rule that stops the set drifting:

- A **Tool** asks and gets an *answer*. Resolves entirely backend-side, returns facts,
  changes nothing the shopper can see. Catalogue search, product detail.
- An **Action** *does something to the page*. Always executes in the browser, always
  returns an outcome, never returns product facts.

There is no "either" category: if it touches the shopper's screen or cart, it is an Action.
`navigate` is an Action with a known side effect — ending the Call Leg — not a third kind.

### Transport: the Action Envelope

Per ticket 001 a Retell tool call resolves server-side only, but every Action executes in
the browser, so the decision has to cross from backend to page. The widget opens a
**side channel** (WebSocket) to the backend for the life of a Call Leg. The backend pushes
an **Action Envelope** down it, waits for the widget's **Action Result**, and only then
answers Retell.

Rejected: letting the widget *observe* tool calls on the Retell SDK event stream. That is a
broadcast, not a conversation — the backend would have already told Retell "done" before
the browser tried, so a sold-out variant becomes a confidently false statement with no path
to correct it. The side channel costs one connection per leg and a round trip of latency,
and buys truthful speech plus a failure path.

`navigate` is the one exception: the widget acks **before** unloading and the backend
answers Retell with "navigating". Holding a request open across a page unload would kill it
with the page; the real outcome arrives in the next leg's Session Seed, which per ticket 004
already records whether the agent caused the navigation.

### The DOM boundary: Action Targets

The same Liquid that emits Page Context also emits an **Action Target** registry —
`data-agent-action` attributes on the things worth acting on, with ids the Page Context
declares. The agent names a target id; it never sees or sends a selector.

This repeats ticket 005's move — *the page declares what it is, the agent never guesses* —
and it converts a stale selector from a silent runtime failure into something caught while
editing the theme. Rejected: a separately-maintained selector map (drifts from the theme by
construction) and runtime DOM inspection (burns tokens on markup the agent should not reason
about). Viable only because the theme is owned and fixed for this build.

Breakage is caught twice: a **build-time check** asserting every target the contract
declares is still emitted in the Liquid, and a runtime `target_not_found` result that is
logged and apologised for. The build check is the one that matters; a runtime hit means a
shopper already met it. (Ticket 008 put the theme and the contract in one repo, so this is
an ordinary test.)

### The vocabulary

Fixed and typed, not a generic `perform(target, intent)`. A runtime-declared vocabulary
moves the legal set out of the prompt and into data, leaving the model to guess at what is
allowed. This table is what ticket 008's shared contract package holds.

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

**Cart writes run in the browser**, through the Ajax Cart API. The cart cookie and the
theme's cart-drawer re-render both live in the page; writing server-side via the cart token
means reimplementing both. Cart mutation is just another Action, not a special backend path.
Per ticket 004 the Cart Snapshot is still never valid for computing the mutation.

**`apply_filter` and `sort` stay agent-facing but are implemented as URL construction**, not
by clicking facet controls — Dawn drives both through query parameters and the Section
Rendering API. The agent speaks in filters; the widget builds URLs.

**Action Results are typed per action**, plus a fresh Page Context for any Action that
changes what is on screen. A filter leaving four products is a different conversation than
one leaving zero, and the agent cannot know which unless told. This also covers the in-page
staleness the Section Rendering API introduces: the swap that invalidates Page Context is
the same call that returns the new one.

### Showing products in the widget

`show_in_widget` is reserved in the vocabulary now so the contract knows it exists; its
design is deferred. The feature is a **Preview Panel**: the agent slides up a panel of
product tiles and narrates them in turn, sparing the shopper a tour of product pages. This
is something the storefront cannot do, because the storefront cannot talk.

One constraint fixed now so the deferred design cannot go wrong: the panel is
identity-level only — image, title, price, link — and every tile's action is
`open_product`. It is a way *to* the storefront, never a replacement for it, so there stays
one source of visual truth.

### Confirmation

**Confirm when the agent proposes; execute when the shopper asks.** The trigger is who
proposed the action, not what kind of action it is: "shall I take you to the sofas?" is good
when the agent thought of it and irritating when the shopper just asked for it. Where the
shopper asked but the agent had to *infer* which thing, it confirms by echoing rather than
asking permission — "adding the navy linen one". Money changes the tone, not the rule.

Enforced in the prompt, not mechanically. A backend gate would mean re-deriving intent from
a transcript — a second, worse LLM problem — and a `confirmed: true` argument is a box the
model ticks reflexively. Regressions are the testing strategy's problem.


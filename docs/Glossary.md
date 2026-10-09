# Glossary

Terms used across the voice shopping assistant. Each term means exactly one thing; prefer
these words in code, prompts, tickets, and conversation.

## Session

A single shopper's conversation with the assistant, **scoped to a browser tab** and owned by
the backend. It survives navigation and owns a series of Call Legs. It ends on tab close or
idle timeout, and does not persist across days.

Not the same as a Retell call, and not the same as a Shopify cart.

## Call Leg

One RetellAI web call within a Session. A page navigation ends the current leg and the
widget opens the next one. Legs are the technical unit; the Session is the conversational
unit the shopper perceives.

A leg is the **exception, not the rule** — see Standby.

## Standby

A Session with no live Call Leg: no call, no billing, state held by the backend. The
resting state of the system. A navigation lands in Standby; a leg opens only when the agent
caused the navigation, the shopper was mid-turn, or a click or browser-local VAD wakes it.
A live leg returns to Standby after 45 s of silence.

VAD listening exists only once a Session has been started by the click-to-start CTA. Audio
never leaves the page while in Standby.

## Handoff

The act of carrying a Session across a page load: the widget beacons its transcript snapshot
to the backend as the page unloads, and the next page presents the session id to start the
next Call Leg.

The beacon is sent **only when a leg was live**. Navigations made in Standby carry nothing
but the session id already in `sessionStorage`.

## Session Seed

What the backend injects into a new Call Leg so the agent can continue mid-conversation:
Session State, the last ~4 turns verbatim, the Cart Snapshot, the Page Context, the Action
Target registry, and whether the agent itself caused the navigation. Assembled server-side,
so replay policy can change without a storefront release.

Hard-budgeted under **4,000 tokens** to stay below Retell's prompt surcharge.

## Session State

The derived facts the backend carries between Call Legs in place of the raw transcript:
products discussed, stated preferences, pending action, and any promise the agent made.
Bounded in size and auditable, unlike a transcript.

## Replay Policy

The backend's rule for turning a stored transcript into the conversational portion of a
Session Seed. Settled: **Session State plus the last ~4 turns verbatim**. When the Seed
exceeds its token budget it degrades in a fixed order — trim the verbatim tail, then drop
oldest Session State, then drop the Catalogue Digest. Page Context, Action Targets, and the
Cart Snapshot are never shed.

## Cart Snapshot

A read-only view of the shopper's Shopify cart, injected into the Session Seed at the start
of each Call Leg. Valid for **talking** about the cart; never valid for computing a
mutation. Not a replica — cart writes always read the live cart, merge, then write.

## Page Context

What the agent knows about the page the shopper is looking at: which page it is, and which
products are visible on it. Emitted by the theme in Liquid at render time, read by the
widget on load, and carried into the Session Seed.

Carries **identity only** — ids, handles, titles, positions, price, availability. Never
descriptions or anything the agent should quote as product truth. Governed by: *the page
supplies identity, the catalogue supplies facts.*

Re-emitted when the page changes beneath the shopper — see Page Context Update.

## Page Context Update

A replacement Page Context for a single section, delivered mid-Session when an in-page swap
changes what is on screen without a navigation. Carries the affected section in full plus a
`change_summary` the agent reasons with.

The agent receives it silently: it may reference the change, but never announces it.

## Epoch

A monotonic version on a section's Page Context, incremented each time that section
re-renders. The page-level epoch is the highest of them.

It **explains** failures rather than preventing them: a stale target produces a normal
failure, and the epoch mismatch says why. The page, not the backend, is the authority on
what is currently on it.

## Merchandise / Furniture

The two halves of a page. **Merchandise** is anything with a catalogue identity — products,
collections, search results — which the agent reasons about by looking facts up.
**Furniture** is everything else on screen — banners, forms, rich text, filters — which the
agent can describe structurally and act on, but never treats as product truth.

## Referent Set

The resolved identities of whatever the shopper could currently mean by "that one" or "the
second one". Held in Session State, carried in the Session Seed, and **replaced wholesale**
rather than accumulated.

Populated by the newest salient set — search results, what the widget is showing, or the
products on screen. Survives Call Leg boundaries, because the shopper may point in one leg
and act in the next.

Navigating *into* a member of the set keeps the set, rather than replacing it.

## Match Quality

How well a search result answers what was asked: `exact`, `strong`, `weak`, or `none`.

Coarse by design. A raw similarity score invites invented thresholds; four words map onto
four behaviours — act, act, confirm, admit.

## Catalogue Digest

A compact orientation summary of the whole catalogue — collections, product types, tags,
rough counts — injected into the Session Seed. Lets the agent answer questions about the
*shape* of the catalogue with no tool call.

Carries no prices and no stock levels, deliberately: a stale price is a confidently wrong
answer about the fact shoppers care most about.

## Catalogue Index

The backend's in-memory, embedding-based index over the full catalogue, behind the semantic
search tool. Returns ranked **identity** (3–5 products), never prices. Rebuilt on Shopify
product webhooks with a periodic poll as a safety net.

## Tool

Something the agent asks and gets an **answer** to — catalogue search, product detail.
Resolves entirely backend-side, returns facts, changes nothing the shopper can see.

## Action

Something the agent **does to the page** — navigating, filtering, adding to cart. Always
executes in the browser, always returns an outcome, never returns product facts.

The boundary with Tool is the rule that stops the vocabulary drifting: if it touches the
shopper's screen or cart, it is an Action.

## Action Target

A place on the page the agent is allowed to act on, declared by the theme in Liquid
alongside the Page Context and named by id. The agent names a target; it never sees a
selector and never inspects markup.

## Action Envelope

One Action in flight from the backend to the widget, answered by an **Action Result**. Needed
because Retell resolves tool calls server-side while every Action executes in the browser.

## Preview Panel

A panel inside the widget showing product tiles the agent narrates in turn. Carries identity
only, and every tile leads to the storefront — a way *to* the real product page, never a
replacement for it.

## Show, don't recite
The agent names two or three things, puts them on screen, and stops — like a shop assistant
walking you to a shelf rather than reading the price list aloud. Detail is pulled by the
shopper, never pushed by the agent.

Also an architectural rule: because volatile facts are only ever fetched for a product the
shopper has already pointed at, the Digest and Index are allowed to be approximate.

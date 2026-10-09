---
id: 013
title: Page Context staleness on in-page mutation
type: grilling
mode: HITL
state: open
assignee:
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

---
id: 016
title: Disambiguation behaviour
type: grilling
mode: HITL
state: open
assignee:
blocked_by: []
---

# Disambiguation behaviour

Part of [the map](../map.md). Raised as
[spec section 09, item A5](../../spec/09-open-questions.md).

## Question

[Ticket 006](006-catalogue-query-strategy.md) returns **3–5 identities** from the search
tool and forbids reciting the catalogue; [ticket 007](007-storefront-action-vocabulary-and-dom-boundary.md)
gives the agent Actions that need **one** target. The gap between those two is
disambiguation, and nothing specifies it.

Undecided: what the agent does when a request matches many products (read the shortlist
aloud? `show_in_widget` and let the shopper point? narrow by one of the six facets?), when
it matches none (offer the nearest facet neighbour? admit the gap?), and when it matches
one but only weakly. Also undecided: whether a shortlist is **state** the backend holds
across turns — so "the second one" resolves — and if so whether that state survives a Call
Leg boundary via ticket 009's Session State.

Contract-level, not prompt-level: it likely changes the search tool's result shape, adds a
referent to Session State, and interacts with the Action vocabulary.

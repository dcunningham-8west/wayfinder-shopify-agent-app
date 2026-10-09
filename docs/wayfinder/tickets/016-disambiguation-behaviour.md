---
id: 016
title: Disambiguation behaviour
type: grilling
mode: HITL
state: closed
assignee: agent
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

## Resolution

**Same scent, different format → ask. Different scent → show.**

Specified in [section 11](../../spec/11-disambiguation.md).

### The catalogue reframed the question

52 products, ~17 named scents, 7 `maincat` values — a **scent × format grid**. "Lime Basil &
Mandarin" is plausibly a candle, a cologne, a body wash and a travel size.

So the dominant ambiguity here is **not "which product?" but "which format?"** The shopper has
already named the thing precisely; they just have not said what they want it as. That inverts
the expected design: the common case needs a **question**, not a list.

The two cases need opposite handling, and because the facets are explicit the test is
**mechanical rather than a prompt judgement**:

| Matches vary by | Behaviour |
| --- | --- |
| `Scent` | Browsing — name two or three, `show_in_widget`, stop |
| `maincat` only | One closed question: "the candle or the cologne?" |

Reading four formats of one scent aloud sounds like a database.

*(Inferred from facet counts in [section 05](../../spec/05-catalogue.md), not from product
data — worth confirming against the real store before build.)*

### `match_quality`, not a score

The search tool returns `exact` / `strong` / `weak` / `none`.

An embedding search always returns *something*: without this there is no mechanical definition
of "no results", and "do you sell bicycles?" would yield five candles presented in earnest. A
raw float was rejected because it invites the prompt to invent thresholds; four words map onto
four behaviours.

This is the part that makes the ticket contract-level rather than prompt-level.

### Nothing matches: admit, then offer one

Admit it plainly — with 52 products, "we don't have that" is frequent and legitimate, and must
be sayable without embarrassment. **Never broaden silently**, which is how an agent
confidently recommends something nobody asked for while the shopper never learns the gap
exists.

The single alternative is **computed by the tool**, not reasoned by the prompt: the query
already resolves to facet values, so relaxing the most specific facet and re-ranking is a
lookup. Cheap enough to keep; if it reads badly, one prompt line is deleted rather than a
mechanism unpicked.

### The Referent Set

What "that one" and "the second one" currently mean. In Session State, capacity ~8,
**replaced wholesale** rather than accumulated, populated by search results → `show_in_widget`
→ current Page Context.

- **Page Context must populate it.** "Tell me about the third one" on a collection page refers
  to the *screen*, not to anything the agent said.
- **Replacement, not accumulation.** An accumulating set makes ordinals ambiguous across time;
  a stale referent is worse than an absent one.
- **It must survive Call Leg boundaries.** Standby means a shopper can be shown three candles,
  click one, land on a new page, and say "add that one" in a *different leg* — the single most
  likely sentence in the demo.

Without it, ordinals are resolved by the model re-reading its own prose: the name-similarity
guessing ticket 005 removed from the path.

### One addressing scheme: ids

The agent resolves ordinals by reading the numbered Referent Set in the Seed. **Tools and
Actions accept ids only.** Ordinal arguments would put a second addressing scheme in
`contracts` and create two ways to name a product — precisely the shape of the prior system's
routing bug.

### Confirmation gains a second axis

Ticket 007 triggered confirmation on **who proposed** the action. Now: confirm when the agent
proposed **or** when the match is `weak`; `none` never acts. One short turn prevents the worst
available demo outcome — the wrong product silently in the cart.

### Recorded in

[Section 11](../../spec/11-disambiguation.md), with Referent Set and Match Quality added to the
[glossary](../../Glossary.md), the Seed table in [section 03](../../spec/03-session-lifecycle.md),
the tool shape in [section 05](../../spec/05-catalogue.md), and the confirmation rule in
[section 06](../../spec/06-tools-and-actions.md). No ADR: it extends existing decisions rather
than trading one off against another.

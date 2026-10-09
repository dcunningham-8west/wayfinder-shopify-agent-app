---
title: Disambiguation
---

# 11 — Disambiguation

Part of [the spec](./README.md). Decided in
[ticket 016](../wayfinder/tickets/016-disambiguation-behaviour.md).

## The rule

> **Same scent, different format → ask. Different scent → show.**

This catalogue is a **scent × format grid**: ~17 named scents across 7 `maincat` values
([section 05](./05-catalogue.md)). So the dominant ambiguity is **not "which product?" but
"which format?"** — the shopper has already named the thing precisely; they simply have not
said whether they want it as a candle or a cologne.

The two cases need opposite handling, and the facets make the test mechanical rather than a
prompt judgement:

| Matches vary by | Behaviour |
| --- | --- |
| **`Scent`** | Browsing. Name two or three, `show_in_widget`, stop |
| **`maincat` only** (same scent) | One closed question: *"the candle or the cologne?"* |

Reading four formats of the same scent aloud is the failure mode. It sounds like a database,
and the shopper already told us what they wanted.

## Match quality

The search tool returns a coarse **`match_quality`**, not a raw score:

| Value | Meaning | Behaviour |
| --- | --- | --- |
| `exact` | Named product or scent | Act |
| `strong` | Confident semantic match | Act |
| `weak` | Plausible but uncertain | **Confirm by name before acting** |
| `none` | Nothing matches | Admit it, offer one alternative |

An embedding search always returns *something*. Without `match_quality` there is no mechanical
definition of "no results" — the tool would hand back five products for "do you sell
bicycles?" and the agent would present them.

**Coarse on purpose.** A raw float invites the prompt to invent thresholds; four words map
directly onto four behaviours. This is why disambiguation is a `contracts` concern and not a
prompt concern.

## Nothing matches

**Admit it, then offer one facet-neighbour alternative. Never broaden silently.**

> "We don't have a vanilla one — the warm amber ones are closest. Want to hear them?"

With 52 products, "we don't have that" is a frequent and legitimate answer that must be
sayable without embarrassment. Silent broadening is how an agent confidently recommends
something the shopper never asked for, while the shopper never learns the gap exists.

The alternative is **computed by the tool, not the prompt**: the query already resolves to
facet values, so relaxing the most specific facet and re-ranking is a lookup, not inference.
When `match_quality` is `none`, the result carries a short `alternatives` array. If it reads
badly in practice, one prompt line is deleted — no mechanism is unpicked.

## The Referent Set

The resolved identities of whatever the shopper could currently mean by "that one" or "the
second one". Held in Session State, so it **survives Call Leg boundaries**.

| Property | Value |
| --- | --- |
| Capacity | ~8 |
| Update | **Replaced wholesale**, never accumulated |
| Populated by | Search results → `show_in_widget` → current Page Context (priority order) |

**Page Context must populate it.** A shopper on a collection page saying "tell me about the
third one" means the *screen*, not anything the agent said.

**Replacement, not accumulation.** An accumulating set makes ordinals ambiguous across time;
the newest salient set is almost always the intended one, and a stale referent is worse than
an absent one.

**Exception — navigating *within* the set keeps it.** If the page the shopper lands on is
already a member of the current Referent Set, the set is **kept, not replaced**.

Found by [ticket 017](../wayfinder/tickets/017-testing-strategy-for-voice-plus-dom.md)'s
harness, which failed on the first scenario it ran. A plain wholesale replace means the
shopper is shown four formats, clicks one, and the resulting product page — Page Context of
**one** product — overwrites the shortlist they were about to act on. "Add the second one"
then resolves to nothing. **The navigation destroys the referent it is navigating to.**

**Surviving legs is non-negotiable.** Standby means a shopper can be shown three candles,
click one, land on a new page, and say "add that one" in a *different Call Leg* — the single
most likely sentence in the whole demo.

Without this, "the second one" is resolved by the model re-reading its own prose, which is the
name-similarity guessing [section 04](./04-page-context.md) exists to remove from the path.

## Ordinals resolve in the agent; tools take ids

The Referent Set rides in the Session Seed as a short numbered list, so mapping "the second
one" to an id is **reading a list, not guessing**.

**Tools and Actions accept ids only.** Letting them take ordinals would put a second
addressing scheme into `contracts` and create two ways to name a product — which is precisely
how the prior system's tool-routing bug arose. One addressing scheme: ids.

## Confirmation, extended

[Section 06](./06-tools-and-actions.md) turns confirmation on **who proposed** the action.
Match quality adds a second axis:

> Confirm when the **agent** proposed the product, **or** when the match is `weak`.

`none` never acts at all. "Adding the Wood Sage & Sea Salt candle — is that the one?" costs one
short turn and prevents the worst available demo outcome: the wrong product silently in the
cart.

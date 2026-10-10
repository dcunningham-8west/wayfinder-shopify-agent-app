# Known failures

Conversation defects found testing the agent by voice, and what was done about them.

**Why this file exists.** [Ticket 017](./wayfinder/tickets/017-testing-strategy-for-voice-plus-dom.md)
put conversation quality **explicitly outside** the automated suite: everything below the
microphone is ordinary software and is tested as such, but whether the agent said something
untrue is a judgement an operator makes while talking to it. This is where those judgements are
written down, so a fix is not re-derived and a regression is recognised.

One entry per defect, newest last. A good outcome is logged only when it settles something we
were unsure of.

**Classification** is one of: **prompt** (what the agent was told), **contract** (the tool or
action surface), **data** (the catalogue), **architecture** (the design is wrong).

---

## KF-001 — The agent narrates showing products, and nothing appears

- **Found:** 2026-10-10
- **Class:** contract, and prompt
- **Status:** fixed, unverified

### Observed

```
User:  "I'm looking for a gift"
       → search_catalogue
Agent: "Looking at gifts"
       → show_in_widget  → ok
Agent: "I've shown two gift sets: Lime Basil & Mandarin for something fresh, or
        Pomegranate Noir for a deeper scent. Which feels closer?"
User:  "The lime basil one please"
Agent: "Showing this candle now"          (no action called)
```

Both claims were false. Nothing changed on screen either time.

### Diagnosis

**Two separate defects that look like one.**

**The first is a contract defect.** The Preview Panel is a deliberate deferral
([spec section 06](./spec/06-tools-and-actions.md), open question C1): `show_in_widget` was
reserved in the vocabulary so the contract would know it exists, with its behaviour left to the
build. But reserving it in `contracts` also **published it to the agent** — `toolDefinitions()`
mapped every `ActionName` into the Retell tool set — and the widget's handler dispatches a
`wayfinder:show-products` DOM event that **nothing is listening for**, then returns
`{ status: 'ok' }`.

So the agent called a tool that reported success and produced nothing. It was not hallucinating;
it was told it had worked. **A deferred action that still answers `ok` is worse than no action at
all** — it converts a missing feature into a lying agent.

**The second is a prompt defect, and it would have survived fixing the first.** The closing line
had no action behind it at all. The guardrails forbade inventing *products* but said nothing
about inventing *deeds*, and "do not invent" read as a rule about facts. The shopper is looking
at the screen, so this is the most immediately visible failure mode the agent has.

### Resolution

- `UNOFFERED_ACTIONS` in [action-definitions.ts](../packages/contracts/src/action-definitions.ts)
  holds `show_in_widget`, and `toolDefinitions()` filters it out. The vocabulary, the schema and
  the widget handler all stay — the agent simply is not offered an action the product cannot
  perform yet. Delete the entry when the panel ships.
- New guardrail, **"Never narrate something you have not done"**, in
  [30-guardrails.md](../packages/retell/prompts/30-guardrails.md). It also tells the agent
  plainly that describing aloud and `open_product` are the only two options, so it does not
  reach for a third.

Requires `npm run sync --workspace packages/retell` to take effect.

### Open

The second line should probably have been an `open_product` rather than nothing. Whether the
agent now *opens* the chosen product, rather than just not claiming to, is the thing to watch on
the next run — the guardrail tells it to, but that is persuasion, not a mechanism.

### Lesson

**Deferring a feature means not offering it, not offering it as a no-op.** Worth checking the
rest of the vocabulary for actions whose handler returns `ok` without doing anything.

---

## KF-002 — `open_product` fails for any product not already on the page

- **Found:** 2026-10-10
- **Class:** architecture, and contract
- **Status:** fixed, unverified
- **Follows:** KF-001 — the guardrail worked; this is the next failure behind it.

### Observed

```
User:  "I'd like something as a gift."
       → search_catalogue
Agent: "The Lime Basil & Mandarin gift set is fresh and bright. The Pomegranate Noir
        gift set is deeper and more luxurious. Which one suits them better?"
User:  "The lime one please"        (transcribed "the line one")
       → open_product
(nothing happens, then silence)
User:  "Are you still there?"
Agent: "I'm here. I couldn't open that gift set just now — would you like me to try again?"
User:  "Yes please"
       → open_product
(nothing happens, then silence)
```

Progress on KF-001: the agent no longer claims to have done something. It called the action and
said nothing, which is honest — and worse to sit through.

### Diagnosis

**Not the misheard word.** "Line" for "lime" is a red herring: tools take **ids only**
([ticket 016](./wayfinder/tickets/016-disambiguation-behaviour.md)), the agent resolved the
referent correctly, and it retried with the same id and failed identically. A transcription
error would have produced the *wrong* product, not no product.

**The real cause is a gap between two decisions that were each right on their own.**

[Ticket 007](./wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md) ruled that
the agent names **target ids, never selectors**, and the widget resolves them against the Action
Target registry the theme emits — a registry of what is **on the current page**.
[Ticket 006](./wayfinder/tickets/006-catalogue-query-strategy.md) made `search_catalogue` answer
from an **in-memory index of the whole catalogue**, which is the point: the shopper should not
have to be looking at a product to ask about it.

So `search_catalogue` returns products that are, by design, usually **not on the page**, and
`open_product` could only reach products that were. A shopper on the home page asking for a gift
hits this on the very first action. The product page is the one destination the agent cannot
reach through the DOM, because arriving there is the whole point.

**The silence is a second, separate defect.** `speak_after_execution` was `false` for
`open_product` on the reasoning that a navigate's outcome arrives in the next leg's Seed, so
there is nothing to narrate. True when it succeeds. When it fails, the agent is handed an error
and told not to speak. Retell's unresponsive-user reminder does not rescue this: it fires after
**agent speech** followed by user silence, and here the agent never spoke.

### Resolution

- `open_product` gains a **server-filled `url`**. The backend resolves `product_id` through
  `Catalogue.urlFor()` and puts the canonical storefront URL in the Action Envelope; the widget
  navigates to it and falls back to the on-page link only for a product already in view. A
  product id that the catalogue does not know is now `unknown_product` — a real error, not a
  phantom target.
- `SERVER_FILLED` in [action-definitions.ts](../packages/contracts/src/action-definitions.ts)
  keeps `url` out of the agent's tool definition, so the vocabulary the model sees is unchanged:
  it still names ids only.
- `variant_id` rides through as `?variant=`, which it previously had no way to express.
- `speak_after_execution` is now **true for every action except `navigate`**
  ([sync.ts](../packages/retell/src/sync.ts)). An action that cannot speak its own failure
  delivers that failure as silence.

### Lesson

**Two correct decisions can leave a gap between them that neither owns.** The DOM boundary and
the whole-catalogue index were both right; nobody asked what happens when the agent wants to act
on something the index knows and the page does not. Worth checking the rest of the vocabulary for
the same assumption — `select_variant`, `scroll_to` and `submit_form` are genuinely about the
current page, so they are fine, but that is now a claim rather than an oversight.

**A silent failure path is a design decision, not an omission.** Every action should be asked:
if this fails, who tells the shopper?

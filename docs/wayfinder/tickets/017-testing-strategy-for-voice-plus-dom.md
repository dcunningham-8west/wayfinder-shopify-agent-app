---
id: 017
title: Testing strategy for voice plus DOM driving
type: prototype
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Testing strategy for voice plus DOM driving

Part of [the map](../map.md). Raised as
[spec section 09, item B1](../../spec/09-open-questions.md).

## Question

How does a system whose inputs are speech and whose outputs are DOM mutations get tested
deterministically? The non-deterministic hop (Retell's LLM) sits in the middle of every
path, so the question is really **where the seams are and what each one makes observable**.

Candidate seams, all already in the design: the tool webhook (a JSON request the backend
answers, testable without voice), the Action Envelope over the WebSocket (a typed message
the page consumes, testable without a backend), the Liquid-emitted Page Context and Action
Target registry (testable against a rendered theme — ticket 007 already puts a target check
in CI), and the Session Seed budget from ticket 009 (an assertion, not a test of behaviour).

This cannot be designed on paper: it depends on what is actually observable at each seam.
Prototype it, as [ticket 005](005-page-context-extraction-strategy.md) did for the Liquid
emitter — build the thinnest harness that drives one real end-to-end path and see which
seams hold.

Blocked by [013](013-page-context-staleness-on-in-page-mutation.md) and
[016](016-disambiguation-behaviour.md): both change contracts the harness would assert
against. _Both now closed — this ticket is on the frontier._

## Resolution

**Everything below the microphone is ordinary software.**

Specified in [section 12](../../spec/12-testing.md).
Asset: [`prototypes/017-testing/seam-harness.html`](../prototypes/017-testing/seam-harness.html)
— a single file, double-click to run.

### What was built

The whole system with the voice removed: Session, Standby, Call Legs, Seed budget, Page Context
epochs, the Referent Set, match quality, idempotency and Action Results, simulated in memory
and driven by buttons. Seven guided walkthroughs for the scenarios that are hard to reason
about on paper.

It answered the question by **existing**: if the design were only testable through conversation,
the harness could not have been built. It was, in one file, with no audio, no mic grant and no
LLM.

### The four seams

| Seam | Testable as |
| --- | --- |
| Tool webhook | Plain HTTP test |
| Action Envelope | Socket test, each end separately |
| Liquid emission | Assertion against a rendered theme |
| Session state machine | **Pure unit test — no I/O at all** |

The fourth is the surprise: Session, Standby, Seed assembly and the Referent Set touch neither
network nor browser. **The most behaviour-rich part of the design is the cheapest part to
test.**

### It found a real bug on its first run

Walkthrough 1 — "point in one leg, act in the next", the most likely sentence in the demo —
**failed**. `add the second one` resolved to nothing.

Ticket 016 said the Referent Set is *replaced wholesale*, and Page Context populates it. So:
shopper is shown four formats → clicks one → the product page's Page Context (one product)
overwrites the shortlist → the ordinal has nothing to resolve against. **The navigation
destroys the referent it is navigating to.**

Fix: if the landing page is already a member of the current set, the set is **kept, not
replaced**. [Section 11](../../spec/11-disambiguation.md) amended. All seven walkthroughs then
passed.

This is precisely why the ticket was typed `prototype` rather than `grilling`. Three sessions
of careful reasoning produced the rule; ten seconds of running it broke the rule.

### A second, smaller finding

After a deploy, the harness required a fresh click-to-start. The spec says an unknown session
id *silently starts a fresh Session* — which must mean **the widget continues without a new
click**, since the per-origin mic grant survives a backend restart. If the shopper has to
re-click after every deploy, continuity breaks visibly. Worth an explicit test at build time.

### What is deliberately not tested

**Conversation quality** and **latency**. Section 06 already enforces confirmation in the
prompt rather than mechanically, and section 10 already makes latency a post-demo diagnostic.
Stating both plainly is the point — a suite claiming to cover them would be worse than one
that does not.

### Build-time checks

Two, both guarding *silent* failures: the Action Target registry against the theme, and
`responsiveness: 1`.

### Recorded in

[Section 12](../../spec/12-testing.md), with the Referent Set correction in
[section 11](../../spec/11-disambiguation.md) and the [glossary](../../Glossary.md).

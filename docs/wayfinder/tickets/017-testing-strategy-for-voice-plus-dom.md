---
id: 017
title: Testing strategy for voice plus DOM driving
type: prototype
mode: HITL
state: open
assignee:
blocked_by: [013, 016]
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
against.

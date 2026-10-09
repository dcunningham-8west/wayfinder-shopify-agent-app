---
id: 015
title: Latency budget per turn
type: grilling
mode: HITL
state: open
assignee:
blocked_by: []
---

# Latency budget per turn

Part of [the map](../map.md). Raised as
[spec section 09, item A4](../../spec/09-open-questions.md).

## Question

[Ticket 011](011-backend-hosting-and-cold-start-floor.md) established the **floor**:
~40 ms of backend round trip for a tool-only call, ~220 ms for an Action, excluding backend
work and any Shopify API call. It did not establish the **ceiling**, or how the budget is
divided.

Undecided: the end-to-end target from end-of-speech to start-of-speech, and which hops get
which share — Retell STT/LLM/TTS, backend tool work, Shopify Ajax/Storefront calls, the
Action Envelope round trip, and [ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)'s
2 s settle delay and ~5 s floor between leg creations, which sit on the reconnect path
rather than the turn path and may need their own budget.

Ticket 011 hands this a knob: per-tool `timeout_ms`, configurable 1–600 s, paired with
`speak_during_execution` for anything slow. Deciding the budget decides which tools get a
filler phrase and which must stay synchronous — so it constrains tool design in `contracts`
and precedes build.

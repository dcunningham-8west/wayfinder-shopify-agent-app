---
id: 014
title: Transcript retention and data residency
type: grilling
mode: HITL
state: open
assignee:
blocked_by: []
---

# Transcript retention and data residency

Part of [the map](../map.md). Raised as
[spec section 09, item A3](../../spec/09-open-questions.md).

## Question

[Ticket 004](004-session-continuity-model-across-page-loads.md) makes the backend the
**owner of the transcript** — continuity depends on it — and
[ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md) replays
Session State plus the last ~4 turns into every new leg. Nothing yet says where that lives,
for how long, or what else is kept.

Undecided: the store (in-process memory, Redis, Postgres) and what that implies for
restarts and for [ticket 011](011-backend-hosting-and-cold-start-floor.md)'s single Render
service; the retention window for a live Session versus anything kept afterwards; whether
analytics are a separate, longer-lived record from the continuity transcript; and whether
audio is retained at all or only text.

Carries a live edge: the demo audience is European, Retell is **US-only AWS**, and the
backend is US-East, so EU residents' voice and transcripts leave the EEA through two hops
**by design**. That needs a deliberate answer — a disclosure, a retention ceiling, or an
accepted risk written down — not a discovered one.

Architectural because it determines backend storage.

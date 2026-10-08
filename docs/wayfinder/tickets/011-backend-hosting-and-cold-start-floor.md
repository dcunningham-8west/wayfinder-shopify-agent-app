---
id: 011
title: Backend hosting and the cold-start latency floor
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Backend hosting and the cold-start latency floor

Part of [the map](../map.md)

## Question

The new backend deploys as a **new service**, leaving the existing Render service
untouched as a rollback-to-demo fallback. Where it deploys is open: a second Render
service, or a different provider entirely.

This is a latency decision, not a cost one. RetellAI resolves tool calls server-side
during a live voice turn, so every hop is inside the shopper's conversational pause.
Render's free tier spins services down after idle and cold-starts in tens of seconds,
which is unusable for a tool call — and the existing deployment already runs
`get_collection_products` with a 5s Retell timeout against a ~2s backend bound.

Decide:

- Hard requirement: no cold start, or an always-warm tier. What does that cost?
- Provider: Render paid, or somewhere with better cold-start / edge characteristics.
- Does the backend need to be geographically near RetellAI's inference region, the
  Shopify store, or neither?
- Does the SSE channel (`/api/events` in the existing design) constrain the provider?
  Some edge runtimes cap long-lived connections. Ticket 007 made this load-bearing: the
  Action Envelope side channel is a per-Call-Leg WebSocket, and a cart write now blocks on
  a round trip over it, so a provider that cannot hold the socket cannot host this design.
- One service for both tool webhooks and SSE, or split?

Interacts with the latency budget, still in the fog: this ticket sets the floor that
budget has to fit inside.

## Resolution

**Render Starter, one service, US-East.** A second Render service on a fresh URL, paid tier,
single process serving both the Retell tool webhooks and the per-Call-Leg WebSocket. The
existing free-tier service stays untouched as the rollback-to-demo fallback.

### The free tier is disqualified — but not for the reason assumed

The ticket framed this as a 5 s Retell timeout against a cold start. That framing was wrong.
Ticket 001's research records custom-function `timeout_ms` as configurable **1,000–600,000 ms,
default 120,000**. The old `get_collection_products` 5 s bound was a configured choice, not a
platform limit.

So a cold start is not a hard failure. It is worse: it is a *configurable-into-success* failure.
Raising `timeout_ms` converts a clean error into tens of seconds of a shopper hearing silence,
and `speak_during_execution` can cover a few seconds of that, nowhere near fifty.
**Recorded explicitly so nobody later "fixes" a cold start by raising the timeout.**

The operator's evidence that the free tier "didn't interfere" in the prototype is an artifact of
how it was exercised: during a dev session the service is hit constantly, so the operator was
always their own warm-up request. The spin-down lands on the first shopper after an idle gap —
the demo scenario, and the one never experienced.

**Ticket 009 makes this strictly worse.** Standby means most navigations open no Call Leg at all,
so the service idles *more* of the time by design. The chattiness that incidentally kept it warm
is exactly what 009 removed.

$7/mo for no-spin-down is the price of the design working, not a cost optimisation.

### Serverless and edge are ruled out by state, not by sockets

Four closed tickets each demand a long-lived, memory-resident process:

- Ticket 004 — the backend owns the transcript and Session State across Call Legs.
- Ticket 006 — an **in-memory semantic index** over the catalogue.
- Ticket 007 — a **per-Call-Leg WebSocket**, with cart writes blocking on a round trip.
- Ticket 009 — Standby, idle timers, and inter-leg floors.

The WebSocket alone would not disqualify edge runtimes — Cloudflare Durable Objects hold sockets
fine. The **in-memory index** is the disqualifier: a runtime that scales to zero rebuilds it on
every cold start, and one that scales out holds N divergent copies of session state. The design
wants exactly one warm process. That is a persistent container.

### Region: US-East

Retell runs its core services and voice infrastructure **entirely on US-based AWS**, with no
European presence (confirmed by the operator against Retell's docs; ticket 001's research had
found no published region). The demo audience is in Europe.

Counting only hops that fall inside a voice turn:

| Path | US-East backend | EU-West backend |
| --- | --- | --- |
| Tool-only call (search, live price/stock) | Retell→backend→Retell ≈ **40 ms** | ≈ **180 ms** |
| Action call (cart write, filter) | Retell→backend→browser→backend→Retell ≈ **220 ms** | ≈ **200 ms** |

Actions are a wash — the Atlantic is crossed exactly once whichever side the backend sits on.
Tool-only calls are the asymmetric case and the common one, since ticket 006's search tier and
live price/stock fetch involve no browser leg at all. EU-West would make the common path ~4×
worse to win ~20 ms on the rarer one. Shopify's Admin API being US-hosted pushes the same way.

**Latency floor for later budgeting: ~40 ms backend round trip for a tool-only call, ~220 ms for
an Action**, excluding backend work and any Shopify API call. Shopper-perceived turn latency adds
Retell's own `e2e` on top, which explicitly excludes the Retell→browser hop.

### One service, not split

Tool webhooks and the WebSocket share session state, the transcript, and the in-memory index.
Splitting them inserts a network hop between things that must agree, for no gain at this scale.
Revisit only if the index outgrows one process.

### Carry-forwards

- **Data residency.** EU shoppers plus US-only voice infrastructure means EU residents'
  transcripts leave the EEA by design — through Retell, and now through a US-East backend. Not a
  latency question; belongs to the map's *Transcript and analytics retention* gap.
- **`timeout_ms` per tool** is now an open design knob, not a fixed 5 s. Whoever specifies the
  latency budget should set it per tool against this floor, and pair long calls with
  `speak_during_execution`.
- **Render region naming:** Ohio or Virginia. Either satisfies US-East; pick at provisioning.

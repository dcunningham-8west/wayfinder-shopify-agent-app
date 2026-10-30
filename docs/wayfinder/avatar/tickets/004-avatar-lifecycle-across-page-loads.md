---
id: 004
title: Avatar lifecycle across page loads
type: grilling
mode: HITL
state: closed
assignee: dcunningham
blocked_by: [001]
---

## Question

The Retell call reconnects on every page load (see
[ADR 0001](../../../adr/0001-reconnect-with-replay-voice-continuity.md)). How does the avatar
session start, end, and restart alongside it, and how are minutes kept from being wasted
between pages?

## Resolution

- **Start:** on every call leg, both the initial one and reconnects, right after
  `client.start(leg)` resolves. The avatar never gates voice. A leg without an `avatar` token
  stays voice-only.
- **End:**
  - On `pagehide`: fire-and-forget `simli.stop()` in the existing handler. The token's
    `maxIdleTime` of 30 s is the backstop.
  - When the call ends (`ui.onEnd` or `call_ended`): stop straight away.
  - When the shopper hides the avatar: stop, as decided in Avatar integration architecture.
- **Slot still held:** if the new start is refused because the previous session hasn't
  closed, retry once after about 2 s, then stay voice-only for that leg.
- **Hidden flag:** stored in `sessionStorage` as `wayfinder:avatar-hidden`, so it lasts for
  the visit. If it is set, no token is requested and no session starts.
- **Silence:** the avatar keeps running while the agent is silent, because a restart costs
  2–2.7 s. Minutes are limited by the call ending, the hide control and `maxSessionLength`;
  that value belongs to the cost-guardrails fog.
- **Startup gap:** reserve the space with a static still of the face, which the live video
  replaces. No layout jump. How the placeholder looks belongs to the visual-detail fog.

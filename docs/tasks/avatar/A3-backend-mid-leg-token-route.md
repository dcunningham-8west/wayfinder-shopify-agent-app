---
id: A3
title: Backend mid-leg avatar token route
state: closed
assignee:
blocked_by: [A2]
---

Spec: [13-avatar.md](../../spec/13-avatar.md), section "Backend → Mid-leg token route".

## Build

`POST /sessions/:id/avatar-token`:
- Requires `x-wayfinder-session-token` and a live Call Leg.
- Rate limit: 1 per Session every 10 s; 429 above that.
- Uses the `AvatarProvider` from A2, including the out-of-minutes skip.

## Done when

Tests cover:
- 401/404 without a valid session.
- Refusal when there is no live leg.
- 429 inside the 10 s window.
- Success returns a token.

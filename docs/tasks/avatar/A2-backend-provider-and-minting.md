---
id: A2
title: Backend avatar provider and call-leg minting
state: open
assignee:
blocked_by: [A1]
---

Spec: [13-avatar.md](../../spec/13-avatar.md), section "Backend → Minting".

## Build

- `backend/src/avatar/`: an `AvatarProvider` interface (mirroring `voice/voice-provider.ts`)
  plus a Simli implementation.
  - `POST https://api.simli.ai/compose/token` with header `x-simli-api-key`.
  - Token config: `handleSilence: false`, `maxSessionLength: 600`, `maxIdleTime: 30`.
- Call-leg route: when the request has `avatar: true` and config is present, mint **in
  parallel** with `create-web-call`, with a 3 s cap. Add `avatar` to the response only on
  success.
- Out of minutes: an in-memory flag that skips minting for 1 h.
- Never log the key or tokens.

## Done when

Tests cover each of these:
- Minting is skipped when either env var is missing.
- Minting is skipped when the request doesn't ask for the avatar.
- A mint timeout or failure leaves the leg succeeding without `avatar`.
- The 1 h skip after "no minutes left".
- Voice latency is unchanged.

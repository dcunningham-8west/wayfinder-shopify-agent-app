---
id: A1
title: Avatar contracts and config
state: closed
assignee:
blocked_by: []
---

Spec: [13-avatar.md](../../spec/13-avatar.md), sections "Contracts" and "Configuration".

## Build

- `contracts`: zod schemas for:
  - The call-leg request, with `avatar?: boolean`.
  - The call-leg response, with optional `avatar: { session_token }`. Move the response
    shape, which `session-client.ts` currently types inline, into contracts.
  - The mid-leg token response, `{ session_token }`.
- `backend/config.ts`: optional `SIMLI_API_KEY` and `SIMLI_FACE_ID`.
- `widget/session-client.ts`: use the contracts types.

## Done when

- The schemas are tested.
- A missing `avatar` field parses as voice-only.
- Nothing changes in behaviour.

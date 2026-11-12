---
id: C4
title: Backend chat legs
state: closed
assignee:
blocked_by: [C2]
---

Spec: [14-chat.md](../../spec/14-chat.md), section "Architecture".

## Build

- `backend/src/chat/`: a `ChatProvider` interface (`createChat`, `complete`, `endChat`) and a
  Retell implementation, mirroring `voice/voice-provider.ts`. `createChat` passes the same
  `promptVariables(seed)` and `metadata { session_id, chat_leg_id }` as `createWebCall`.
- `POST /sessions/:id/chat-legs`: build the Seed as the call-leg route does, end the previous
  Chat Leg, create the chat, run the opening turn (C1), record it, return it.
- `POST /sessions/:id/chat-legs/:leg/messages`: token-authorised; rate-limited per Session;
  `409` if a completion is already pending on the leg; `410` if the leg is not current. Calls
  `complete`, appends shopper and agent turns to `session.transcript`, returns agent messages.
- Tool webhook: accept the chat payload shape found in C1, resolving the Session from the
  same `metadata.session_id`. Signature check unchanged.
- `DELETE /sessions/:id` ends the active Chat Leg.

## Done when

- Route tests cover: happy path, bad token, oversize content, concurrent message `409`, stale
  leg `410`, chat disabled `503`.
- A webhook test with a C1-captured chat body dispatches a Tool and an Action.
- Voice routes and tests are unchanged.

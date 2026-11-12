---
id: C2
title: Chat contracts and config
state: open
assignee:
blocked_by: [C1]
---

Spec: [14-chat.md](../../spec/14-chat.md), sections "Changes per package" and "Configuration".

## Build

- `contracts`:
  - `Channel` enum: `chat`, `voice`.
  - Chat-leg request: the same body as the call-leg request.
  - Chat-leg response: `{ chat_leg_id, messages }`.
  - Message request: `{ content }`, 1–1,000 chars.
  - Message response: `{ messages: { role: 'agent', text }[] }`.
- `backend/config.ts`: optional `RETELL_CHAT_AGENT_ID`. Absent means chat is off and the
  chat routes return `503`.
- `.env.example`: `RETELL_CHAT_AGENT_ID`, `RETELL_CHAT_LLM_ID`.
- Spec 08 secrets table: add both rows; add Render to `RETELL_AGENT_ID`.

## Done when

- The schemas are tested, including the content length limits.
- Nothing changes in behaviour.

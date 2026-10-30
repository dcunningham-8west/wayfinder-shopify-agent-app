---
id: 005
title: Simli credential handling
type: grilling
mode: HITL
state: closed
assignee: dcunningham
blocked_by: [001]
---

## Question

How do the Simli API key and face ID reach a session without exposing the key? Options
include a backend token endpoint mirroring Retell's, configuration, and the contracts that
would change.

## Resolution

- **Config:** optional `SIMLI_API_KEY` and `SIMLI_FACE_ID` in `config.ts`, like
  `RETELL_AGENT_ID`. If either is missing, the avatar is off: no `avatar` on the call leg, and
  no error.
- **First token:** comes on the call-leg response, as decided in Avatar integration
  architecture. It is minted in parallel with Retell's `create-web-call` with a 3 s cap. If
  minting fails or times out, the leg still succeeds without `avatar` and the failure is logged.
  Voice is never delayed by Simli.
- **Mid-leg token:** a new `POST /sessions/:id/avatar-token` route that requires
  `x-wayfinder-session-token` and a live call leg. It is used when the shopper shows the avatar
  again after hiding it, and for the one retry when the slot is still held. Rate limit: 1 per
  session every 10 s. Its response schema lives in `contracts`.
- **Per-token caps:** `maxIdleTime: 30` and `maxSessionLength`, whose value belongs to the
  cost-guardrails fog.
- **Secrets hygiene:** never log the API key or session tokens; log error codes only. The key
  lives only in the Render env and a gitignored `.env`. Rotate it if it leaks.

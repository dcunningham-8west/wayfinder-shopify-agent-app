---
id: 007
title: Avatar cost guardrails
type: grilling
mode: HITL
state: closed
assignee: dcunningham
blocked_by: []
---

## Question

What `maxSessionLength` does each Simli token carry? What happens when the free tier's minutes
run out? Is the avatar the first thing switched off when a limit is hit, and do we need a cap
per session or per day beyond Simli's own?

## Resolution

- **`maxSessionLength`:** 600 s. When it is reached, the avatar ends and voice carries on. The
  shopper can show it again through the mid-leg token route.
- **Minutes exhausted:** when Simli returns its "no minutes left" error, the backend keeps an
  in-memory flag and skips minting for 1 hour. Call legs go voice-only.
- **Our own caps:** none for now. The free tier's 50 min a month is the ceiling. Revisit when
  moving to a paid plan.
- **Concurrency:** 1 session at a time, so a second shopper at the same time gets no avatar.
  This is a known limit of the free tier, and the spec must state it.
- **Drop order:** the avatar is always the first thing dropped. Voice is never degraded or
  delayed to keep it running.

---
id: C1
title: Retell chat spike
state: closed
assignee:
blocked_by: []
---

Spec: [14-chat.md](../../spec/14-chat.md), section "Unverified (spike C1)". HITL: needs a
real chat agent and spends a little Retell credit.

## Find out

Using a throwaway script against `RETELL_CHAT_AGENT_ID`, with one custom tool pointed at a
request-capture URL:

1. The exact tool webhook body for a chat: the top-level key (`call`, `chat`, other), where
   `metadata` and the chat id sit, and that `X-Retell-Signature` verifies the same way.
2. Whether a chat agent can open the conversation without shopper content. If not, confirm
   the fallback (a fixed trigger string) works and does not appear as a shopper turn the agent
   reacts to oddly.
3. The `chat_cost` breakdown of a short chat: what is billed, and whether
   `llm_token_surcharge` appears.
4. Completion latency for a turn with and without a tool call.

## Done when

- The four answers are written into the "Unverified" section of 14-chat.md, which is renamed
  to record them as facts.
- Any change to the design they force is made in 14-chat.md.
- No repo code is changed.

---
id: 001
title: RetellAI web-call capability surface
type: research
mode: AFK
state: closed
assignee: agent
blocked_by: []
---

# RetellAI web-call capability surface

Part of [the map](../map.md)

## Question

What does RetellAI's browser/web-call surface actually give us, and what does it cost us?
The whole architecture hangs on these answers.

1. **Function-call event delivery.** When the agent invokes a custom function, can the
   browser client observe that call and its arguments directly (client SDK event), or does
   it only reach our backend webhook? If both, what are the ordering and timing guarantees?
2. **Returning results.** Can a function result be produced client-side and fed back to the
   agent, or must every function resolve server-side?
3. **Conversation resume across page loads.** How is an existing conversation's transcript
   retrieved and injected into a new call? Is there a first-class resume/continuation
   primitive, or is replaying transcript into the prompt the only route? What is the cost
   and latency of doing this on every page navigation?
4. **State carried between calls.** Dynamic variables, metadata, and anything else that can
   be attached at call start and read back later.
5. **Agent configuration as code.** How prompt + function schemas are versioned and
   deployed (API, CLI, dashboard-sync), since a repo package will own them.
6. **Limits.** Latency characteristics, concurrency, pricing model, and any hard caps that
   would bite a per-page-reconnect design.

Prefer RetellAI's own documentation and API reference as sources. Record findings with
links; flag anything that is inference rather than documented fact.

## Resolution

Full findings: [retellai-web-call-capability-surface.md](../research/retellai-web-call-capability-surface.md)

1. **Function-call events reach the browser as observation only.** The v3 client SDK has no
   tool hook; tool calls surface as `tool_call_invocation` / `tool_call_result` items on the
   one-way monitor WebSocket. Relative ordering against the backend webhook is undocumented.
2. **Results resolve server-side only.** A custom function is an HTTPS endpoint (15k char
   cap, 120s default timeout) or a Retell sandbox code tool. No client-side resolution.
   `update-live-call` can inject context mid-call but needs an API key.
3. **No first-class resume.** `create-web-call` takes no previous-call or transcript field;
   `current_state` / `current_node_id` carry position, not content. Contact memory is
   phone/SMS only. Resume means replaying the transcript via
   `retell_llm_dynamic_variables` (strings only) or `pre_session_tools`.
4. **State carriers**: `metadata` (arbitrary object, 50kB), `retell_llm_dynamic_variables`
   (string k/v), `agent_version` / tag, `agent_override`, `current_state`. Read back in the
   custom-function `call` object, Get Call, and webhooks.
5. **Config as code**: REST CRUD on agent + response engine, drafts → publish → environment
   tags, with TS/Python SDKs, a CLI, and an MCP server. No declarative format and no drift
   detection — keeping repo and dashboard in sync is our problem.
6. **Limits**: 20 concurrent calls by default (shared pool), 1h call cap, 32,768 prompt
   token cap, $0.07–$0.31/min billed per second, public key + allowed domains + optional
   reCAPTCHA.

### Consequences for the map

- **The agent cannot call a function the browser resolves.** Driving the storefront UI
  needs either a Retell → backend → browser → backend round trip inside the function
  timeout, or the browser acting on the monitor socket while the backend returns
  immediately — which relies on undocumented ordering and gives the agent no confirmation
  the action succeeded. This is now the central constraint on ticket 007.
- **Cost compounds with session length.** Per-navigation reconnect bills a new call each
  time, and the replayed transcript counts toward the >4,000-token prompt surcharge. Hard
  ceiling at 32,768 tokens.
- **Build on v3 from day one.** `RetellWebClient` and `/v2/create-web-call` die 2026-10-18.
  v3 removed agent-speaking state; audio levels only.
- **No published rate limit on `create-web-call`** — confirm with Retell before committing
  to per-page reconnect.

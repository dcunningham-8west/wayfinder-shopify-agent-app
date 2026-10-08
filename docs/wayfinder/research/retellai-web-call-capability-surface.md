# RetellAI web-call capability surface

Research for [ticket 001](../tickets/001-retellai-web-call-capability-surface.md).

Sources are RetellAI's own docs and API reference (`docs.retellai.com`, OpenAPI spec revision
`2026-10-04-3cbc602`) plus `retellai.com/pricing`. The `retell-client-js-sdk` GitHub index was
unavailable during this session, so SDK claims come from the docs' SDK reference pages, not from
reading SDK source. Anything not stated by a source is marked **[inference]** or
**[unanswered]**.

Date of research: 2026-10-06.

---

## 1. Function-call event delivery

**The browser cannot receive a function call as an actionable event. It can only observe it.**

- Custom functions are HTTP calls from Retell's servers to a URL you host. Retell "sends a request
  to your URL with the function's arguments and waits for your response before continuing."
  The endpoint must be publicly reachable; localhost, private IP ranges and cloud metadata
  addresses are blocked (SSRF protection).
  — <https://docs.retellai.com/build/single-multi-prompt/custom-function>
- The v3 browser client (`RetellClient.createWebCall()`) exposes exactly these hooks:
  `onStatus`, `onAudio`, `onEnd`, `onError`, `onTranscript`, `onNodeTransition`. There is no
  function/tool-call hook.
  — <https://docs.retellai.com/deploy/web-call#handle-call-events>
- Tool calls *are* visible to the browser, but only as transcript items. With `transcript: true`,
  the SDK opens the monitor-call WebSocket and `onTranscript` receives items that include
  `tool_call_invocation` (fields: `tool_call_id`, `name`, `arguments` as a stringified JSON
  object, `type`) and `tool_call_result` (`tool_call_id`, `content`, `successful`).
  — <https://docs.retellai.com/api-references/monitor-call-websocket#transcript-item-spec>
- That WebSocket is strictly one-way: "Your application opens this connection and Retell sends
  events on it. Your application doesn't send anything back." No config, ping or ack.
  — <https://docs.retellai.com/api-references/monitor-call-websocket>
- Browsers can authenticate it directly with a public key passed as the WebSocket subprotocol
  `["bearer", "public_key_..."]`; the SDK does this for you when `transcript: true`.
  — <https://docs.retellai.com/api-references/monitor-call-websocket#authentication>

### Ordering and timing guarantees

- Items carry a stable `id` and a `time_sec` (seconds from call start). "When an id arrives again,
  the new item replaces the old one." Sort by `time_sec`, keep arrival order for ties.
- **The initial snapshot can arrive *after* the first `transcript_updated` events.** Retell
  requests the snapshot from the call's server after the connection opens. Apply replace-by-id to
  both.
- The webhook side gives `call_started`, `call_ended`, `call_analyzed`, and optionally
  `transcript_updated`. There is no documented ordering guarantee between the custom-function HTTP
  request and the monitor-socket `tool_call_invocation` item.
  — <https://docs.retellai.com/api-references/monitor-call-websocket#event-flow>,
  <https://docs.retellai.com/api-references/create-agent> (`webhook_events` enum)
- **[inference]** The invocation item almost certainly appears on the socket at roughly the same
  moment the HTTP request is dispatched, but since the docs state no relative ordering, a design
  that needs "browser saw the call before the backend answered it" is racing on undocumented
  behaviour.
- Transcript text "can change as a turn progresses and does not mark exact speaking boundaries",
  and there is no finalization flag.
  — <https://docs.retellai.com/deploy/web-call#enable-live-transcripts>

### Hard cap worth noting

Max **5 monitor connections per call** (dashboard viewers count). A 6th is rejected with close
code 4008. Also, the call must be `ongoing` — connecting too early gives close code 4004.
— <https://docs.retellai.com/api-references/monitor-call-websocket#connection-limits>

---

## 2. Returning results

**Every function must resolve server-side (or in Retell's own sandbox). There is no documented
client-side function-result channel.**

- Custom function: your HTTP endpoint returns 2xx; the body (string, buffer, JSON, blob) is
  stringified and handed to the LLM. Only a JSON object can populate response variables.
  Result capped at **15,000 characters** by default.
  — <https://docs.retellai.com/build/single-multi-prompt/custom-function#request-and-response-spec>
- Code tool: JavaScript executed in Retell's sandbox (`maxLength: 20000` chars of code,
  `timeout_ms` 5,000–60,000). Still server-side from the browser's point of view.
  — <https://docs.retellai.com/api-references/create-agent> (`CodeTool` schema)
- Timeouts: custom function `timeout_ms` 1,000–600,000 ms, default 120,000. `max_retry` 0–5,
  default 0, exponential backoff, timeout applies *per attempt*.
  — same source
- If the user interrupts while a function runs, **the request is not cancelled** — it runs to
  completion and its response variables are still saved. Side effects must be idempotent.
  — <https://docs.retellai.com/build/single-multi-prompt/custom-function#faq>
- Requests are signed with `X-Retell-Signature` (HMAC-SHA256 over the raw body, verified with your
  API key). Retell's outbound IP is `100.20.5.228`.
  — same source

### The one mid-call write path from outside

`PATCH /v2/update-live-call/{call_id}` accepts `call_control.additional_context` (free text
appended to the transcript with role `injected` and fed into the next agent response) and
`call_control.trigger_response` (interrupt/nudge the agent), plus
`fields_to_override.override_dynamic_variables`. **This requires an API key, so it is a
server-side call, not something the browser can do.**
— <https://docs.retellai.com/api-references/update-live-call>

**[inference]** The only way to make the agent call a function whose *result depends on the
browser* is a round trip: Retell → your backend → (some transport you build) → browser → back to
your backend → HTTP response to Retell. That adds a full browser round trip inside the function's
timeout budget. Retell documents no primitive for this.

---

## 3. Conversation resume across page loads

**There is no first-class resume/continuation primitive for web calls.**

- `POST /v3/create-web-call` accepts `agent_id`, `agent_version`, `agent_override`, `metadata`,
  `retell_llm_dynamic_variables`, `current_node_id` (conversation-flow agents only) and
  `current_state` (Retell LLM with states only). There is **no** `previous_call_id`, `transcript`,
  or `resume` field.
  — <https://docs.retellai.com/api-references/create-web-call>
- `current_state` / `current_node_id` let you *start at a stage*, which restores position in a
  flow but not conversational content.
  — same source
- **Contact memory explicitly does not cover this case.** "Automatic saving supports phone calls
  and SMS chats. Web calls and web chats don't automatically save contact memory." Memory is keyed
  by phone number, capped at 2,000 characters, and costs $0.005 per save.
  — <https://docs.retellai.com/features/contact-memory>
- So the documented route is: fetch the prior transcript (`GET /v2/get-call/{call_id}`, or buffer
  it client-side from the monitor socket) and inject it into the new call's prompt via
  `retell_llm_dynamic_variables`. Dynamic variables work in agent prompts and tool descriptions.
  All values must be **strings**; nested JSON is not supported ("flatten the object into individual
  string variables").
  — <https://docs.retellai.com/build/dynamic-variables>

### What each page navigation costs

| Cost | Value | Source |
| --- | --- | --- |
| A new billed call | $0.07–$0.31/min blended; billed to the second | <https://www.retellai.com/pricing> |
| Minimum charge | 10 s minimum if the agent speaks first with a *dynamic* opening message | <https://docs.retellai.com/accounts/billing-exceptions> |
| Prompt-length surcharge | Billed duration × (prompt tokens ÷ 4,000) once prompt exceeds 4,000 tokens. **The replayed transcript counts toward this**, as do tool descriptions and tool-call history. | same |
| A concurrency slot | Web calls draw from the same pool as phone calls | <https://docs.retellai.com/deploy/web-call#faq> |
| Reconnect latency | Mic permission + WebRTC setup; `createWebCall()` returns `connecting`, then `live`, and "audio may take a moment to connect after `live`" | <https://docs.retellai.com/deploy/web-call> |

**No number is published for web-call connection setup time.** [unanswered] The published latency
metrics (`e2e`, `asr`, `llm`, `tts`) measure *turn* latency, not call establishment, and `e2e`
explicitly "does not account for network trip time from the Retell server to the user's frontend."
— <https://docs.retellai.com/reliability/check-actual-latency>

**[inference]** This is the most expensive part of the planned architecture. Each navigation pays
mic/WebRTC setup, a possible 10 s billing floor, and a prompt that grows monotonically with the
replayed transcript — meaning per-minute cost rises the longer the shopper browses. Beyond ~4,000
tokens of accumulated transcript, every subsequent minute is billed at a multiple.

### Mitigation the docs do support

`pre_session_tools` (max 15) run as a dependency graph during session setup, before the agent's
first message, and their outputs are injected as dynamic variables. On calls the graph gets one
minute; anything slower finishes in the background and no longer reaches the prompt. This is the
documented hook for "fetch the prior transcript and inject it" without a client round trip.
— <https://docs.retellai.com/api-references/create-agent> (`pre_session_tools`)

---

## 4. State carried between calls

Settable at call start (`POST /v3/create-web-call`, also exposed through `createWebCall()`):

| Field | Shape | Notes |
| --- | --- | --- |
| `metadata` | arbitrary object | "For storage purpose only… Not used for processing." Retrievable later from the call object. |
| `retell_llm_dynamic_variables` | `{ [string]: string }` | Injected into prompt and tool descriptions. Strings only. |
| `agent_version` | number or tag string | `latest`, `latest_published`, or an environment tag. Tag resolution also applies that tag's dynamic variables. |
| `agent_override` | object | Per-call override of agent / retell_llm / conversation_flow config. |
| `current_state`, `current_node_id` | string | Start mid-flow. |

— <https://docs.retellai.com/api-references/create-web-call>

Readable later:

- Inside a custom function: the request body's `call` object carries `call_id`, `agent_id`,
  `metadata`, `retell_llm_dynamic_variables`, `call_type: "web_call"`, `transcript`,
  `transcript_object`, `transcript_with_tool_calls`, and `latency`.
  — <https://docs.retellai.com/build/single-multi-prompt/custom-function#request-and-response-spec>
- After the call: `GET /v2/get-call/{call_id}` and the `call_ended` / `call_analyzed` webhooks.
  — <https://docs.retellai.com/deploy/web-call#after-the-call>

Mutable mid-call (API key, server-side):
`fields_to_override.override_dynamic_variables` (delta only; `null` clears overrides),
`fields_to_override.metadata` (**max 50 kB**), `data_storage_setting` (cannot be loosened).
— <https://docs.retellai.com/api-references/update-live-call>

Precedence for dynamic variables, lowest to highest: agent defaults → environment-tag values →
contact fields → request values → values collected during the conversation (extraction tools, tool
`response_variables`) → `update-live-call` overrides.
— <https://docs.retellai.com/build/dynamic-variables#where-values-come-from>

Useful built-ins: `{{call_id}}`, `{{call_type}}` (`web_call`), `{{session_duration_ms}}`,
`{{current_time_*}}`, `{{current_node}}`, `{{current_agent_state}}`.
— same source

Note: `{{user_number}}`, `{{direction}}` and all contact variables are **phone-only**, so
identifying a returning shopper is entirely on us.

---

## 5. Agent configuration as code

Everything is REST-first; there is no declarative file format or dashboard-sync tool documented.

- **Resources:** an agent references a *Response Engine* — `retell-llm` (`llm_id` + `version`),
  `conversation-flow` (`conversation_flow_id` + `version`), or `custom-llm`
  (`llm_websocket_url`). Each has full CRUD:
  `create-agent` / `update-agent` / `publish-agent-version` / `create-agent-version` /
  `list-agent-versions`, and `create-retell-llm` / `update-retell-llm` / etc.
  — <https://docs.retellai.com/api-references/create-agent>,
  <https://docs.retellai.com/llms.txt>
- **Function schemas live on the agent/LLM.** `CustomTool` carries `name`, `url`, `description`,
  `method`, `headers`, `query_params`, `parameters` (raw JSON Schema, `type: "object"` required),
  `response_variables`, `speak_during_execution`, `speak_after_execution`, `timeout_ms`,
  `max_retry`, `args_at_root`. Tool names: `[a-zA-Z0-9_-]`, max 64 chars, no spaces, unique across
  everything visible to the LLM at a given moment.
  — <https://docs.retellai.com/api-references/create-agent> (`CustomTool`)
- **Versioning:** versions start at V0; a new version is a *draft* (editable), publishing makes it
  read-only. Environment tags (`prod`, `staging` by default, max 10 per agent) point at a version,
  and each tag can carry its own dynamic-variable values. `agent_version` on a call accepts a tag
  name, `latest`, `latest_published`, or a number.
  — <https://docs.retellai.com/agent/version>,
  <https://docs.retellai.com/api-references/create-web-call> (`AgentVersionReference`)
- **Tooling:** official TypeScript and Python SDKs (`retell-sdk`, `retell`), a CLI
  (`npm i -g @retell-ai/retell-cli`, Node 22+, `retell auth login`, `retell list-agents`), and an
  MCP server at `mcp.retellai.com`.
  — <https://docs.retellai.com/get-started/cli>, <https://docs.retellai.com/get-started/sdk>,
  <https://docs.retellai.com/get-started/mcp-server>
- API keys support read/edit permission scopes per area (Build, Monitor, Deploy).
  — <https://docs.retellai.com/accounts/manage-api-keys>

**[inference]** A repo package owning prompt + function schemas would be a thin wrapper over
`update-agent` / `update-retell-llm` + `create-agent-version` + `publish-agent-version`, with
`prod`/`staging` tags as the deploy pointer. Retell publishes no drift-detection or
dashboard-to-repo export; a dashboard edit would silently diverge from the repo. That is our
problem to solve, not theirs.

---

## 6. Limits

| Limit | Value | Source |
| --- | --- | --- |
| Concurrency (default, pay-as-you-go) | **20 concurrent calls per workspace**; web calls share the pool with inbound/outbound phone | <https://docs.retellai.com/deploy/concurrency> |
| Extra concurrency | $8 / concurrent call / month | <https://www.retellai.com/pricing> |
| Burst | Optional; limit is min(3× limit, limit + 300); **+$0.10/min for the whole call** | <https://docs.retellai.com/deploy/concurrency#concurrency-burst> |
| Over limit without burst | Outbound/web calls rejected | same |
| Max call duration | 1 hour default, 2 hours max (`max_call_duration_ms`, min 60,000) | same + create-agent schema |
| End on silence | `end_call_after_silence_ms`, default 600,000 (10 min), min 10,000 | create-agent schema |
| Max prompt tokens (Retell LLM) | **32,768**; longer prompts rejected at create/update | <https://docs.retellai.com/deploy/concurrency#max-prompt-token-length> |
| Prompt billing cliff | >4,000 tokens scales billed duration by `tokens / 4000` | <https://docs.retellai.com/accounts/billing-exceptions> |
| Custom-function result | 15,000 characters | custom-function doc |
| Code tool | 20,000 chars of code, 5–60 s timeout | create-agent schema |
| Pre-session tool graph | max 15 tools, **1 minute budget** on calls | create-agent schema |
| Monitor WebSocket | 5 connections per call | monitor-call-websocket doc |
| `metadata` via update-live-call | 50 kB | update-live-call doc |
| Contact memory | 2,000 chars; **not saved for web calls** | contact-memory doc |
| Price | $0.07–$0.31/min; example mix: Retell infra $0.055 + TTS $0.015 + LLM $0.064–$0.32 | <https://www.retellai.com/pricing> |
| Billing granularity | Per second, no per-call rounding up; silence is billed | same |
| Latency (turn) | `e2e` measured user-stop-talking → agent-start-talking; excludes Retell→browser network hop. No published SLA. | <https://docs.retellai.com/reliability/check-actual-latency> |
| CPS | Per-telephony-provider; no documented CPS limit for web calls | <https://docs.retellai.com/deploy/concurrency> |

**[unanswered]** No published rate limit on `POST /v3/create-web-call` itself. The API returns 429
`"Account rate limited, please throttle your requests"` but no number is documented. A
per-page-navigation design hammers this endpoint; worth confirming with Retell support.

**Browser-side auth:** web calls use a **public key** with an allowed-domain list and optional
reCAPTCHA v3 (default score threshold 0.5). API keys must stay server-side.
— <https://docs.retellai.com/accounts/public-keys>

**Migration note:** `RetellWebClient` and `POST /v2/create-web-call` are deprecated as of
**2026-10-18**. Build on `RetellClient` / `v3` from the start. v3 dropped `agent_start_talking`,
`agent_stop_talking`, `isAgentTalking`, the `metadata` event, and the `turntaking` field — "exact
speaking boundaries and finalized-sentence events are not available."
— <https://docs.retellai.com/deprecation-notice/2026/09-30_create_web_call_v2>

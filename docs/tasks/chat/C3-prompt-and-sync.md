---
id: C3
title: Chat prompt and sync
state: closed
assignee:
blocked_by: [C1]
---

Spec: [14-chat.md](../../spec/14-chat.md), sections "Prompt" and "Retell chat API".

## Build

- `retell/prompts/20-chat.md`: short written replies, plain text, name each product described,
  the same greeting and resumption behaviour. Include the C1 opening-trigger rule if C1 needed
  the fallback.
- `buildPrompt(mode)`: voice includes `20-voice.md`, chat includes `20-chat.md`; everything else
  is shared.
- `sync.ts` pushes both:
  - Voice: unchanged.
  - Chat: `llm.update(RETELL_CHAT_LLM_ID)` with the chat prompt and the same tools, without
    `speak_during_execution`; then update the chat agent with `post_chat_analysis_model` set to
    the agent's model (or analysis off), `end_chat_after_silence_ms: 120000`, and the
    `RETELL_DATA_STORAGE` settings.
- `.github/workflows/sync-retell.yml`: pass `RETELL_CHAT_AGENT_ID` and `RETELL_CHAT_LLM_ID`.

## Done when

- A sync run updates both agents; the log shows both prompt sizes.
- The voice prompt is byte-identical to before.
- A test asserts the chat prompt omits `20-voice.md` and the voice prompt omits `20-chat.md`.

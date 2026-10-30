---
id: 006
title: Avatar visuals and failure states
type: prototype
mode: HITL
state: closed
assignee: dcunningham
blocked_by: []
---

## Question

How does the avatar look at the top of the widget panel, and what does the shopper see in
each state? Settle:

- Size.
- The startup still.
- Idle and listening.
- The hide/show control.
- How it sits alongside subtitles.
- What the shopper sees when Simli fails, is refused, or times out. The fallback itself is
  already decided: the call goes voice-only. This question is only about how that looks.

## Resolution

The base layout is variant A, the portrait. The avatar area keeps the same size in every state,
so nothing in the panel jumps (as decided in Avatar lifecycle across page loads).

- **Size:** full width inside the panel (330 px panel, 20 px padding), square, rounded corners,
  at the top under the header.
- **Starting:** the portrait space shows a still of the face with a small spinner and a
  "CONNECTING" label, borrowing B's look.
- **Idle and speaking:** the live video. It replaces the waveform while the avatar is shown.
  Subtitles sit below, as they do today.
- **Hidden:** a new avatar button in `control-buttons-group`, next to subtitles. Hiding stops
  the session and the panel goes back to today's voice-only layout, with the waveform.
- **Failed (refused, timed out, or dropped mid-call):** the portrait greys out with a
  "VOICE ONLY" label, borrowing B's treatment. There is no layout change, and voice carries on.

Prototype: [prototypes/006-avatar-visuals/index.html](../prototypes/006-avatar-visuals/index.html)

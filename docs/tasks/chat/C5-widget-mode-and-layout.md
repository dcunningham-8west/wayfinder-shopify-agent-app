---
id: C5
title: Widget mode and layout
state: closed
assignee:
blocked_by: [C2]
---

Spec: [14-chat.md](../../spec/14-chat.md), section "Widget", decisions 2, 3, 5, 6 and 7.

## Build

- Mode state: `wayfinder:mode` in `sessionStorage`; absent means `chat`.
- The toggle button next to `.mute-btn` and `.subtitles-btn`, visible in both modes.
- Chat layout: `.transcript-preview` always shown; a text input and send button below it;
  `.mute-btn`, `.subtitles-btn` and the avatar hidden.
- Voice layout: unchanged.
- On toggle: `DELETE /sessions/:id`, clear `wayfinder:session`, set the mode, re-render.
  Switching to voice waits for the shopper to press the mic button.
- Theme markup changes, if the widget snippet owns this markup.

## Done when

- A fresh tab opens in chat; a toggle to voice survives a page load.
- Voice mode looks and behaves exactly as before.
- Chat mode shows no mic, subtitles or avatar controls.

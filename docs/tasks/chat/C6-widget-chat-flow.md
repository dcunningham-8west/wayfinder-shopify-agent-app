---
id: C6
title: Widget chat flow
state: open
assignee:
blocked_by: [C4, C5]
---

Spec: [14-chat.md](../../spec/14-chat.md), sections "Architecture" and "Widget", decisions 4,
8 and 9.

## Build

- `widget/src/chat.ts`: start a Chat Leg on open, and on every page load while a chat Session
  exists; open the panel if it is closed; show only that leg's opening message.
- Send: append the shopper's message, disable the input, show a typing indicator, `POST` the
  message, render each agent message, re-enable.
- Render message text with `textContent`, never `innerHTML`.
- Call `preview.follow(text)` once per agent message.
- The Action socket connects in chat mode exactly as in voice.
- Errors (`409`, `410`, network): one plain message in the thread; `410` starts a new leg.

## Done when

- On the dev store: a chat search shows tiles in the preview panel and highlights the named
  product; add to cart works; a navigate Action lands on the new page with a new agent message
  and no old messages shown.
- Toggling to voice and back starts fresh each time.
- Voice behaviour is unchanged.

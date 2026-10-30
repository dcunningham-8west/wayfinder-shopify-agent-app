---
id: A6
title: Widget avatar visuals and button
state: closed
assignee:
blocked_by: [A5]
---

Spec: [13-avatar.md](../../spec/13-avatar.md), section "Visuals". Reference:
[006-avatar-visuals prototype](../../wayfinder/avatar/prototypes/006-avatar-visuals/index.html).

## Build

- Theme markup and CSS for the portrait: square, full width, under `panel-header`. It
  replaces `waveform-container` while the avatar is shown.
- States, all at the same size so nothing jumps:
  - Starting: a still, a spinner and "CONNECTING".
  - Live: the video.
  - Failed: the face greyed out with "VOICE ONLY".
- Hidden: today's voice-only layout.
- An `avatar-btn` after `subtitles-btn`, using `bindToggle` with the
  `wayfinder:avatar-hidden` key and the labels "Hide avatar" and "Show avatar".
- Hide and show call into `avatar.ts`.

## Done when

- Every state matches the prototype.
- The hidden setting persists across page loads within the visit.

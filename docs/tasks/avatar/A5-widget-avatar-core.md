---
id: A5
title: Widget avatar core
state: closed
assignee:
blocked_by: [A1, A2, A4]
---

Spec: [13-avatar.md](../../spec/13-avatar.md), sections "Audio tap" and "Widget lifecycle".
Reference prototype: branch `proto/avatar-go-no-go`, `packages/widget/prototype-avatar/`.

## Build

- `widget/src/avatar.ts`, with `simli-client` imported lazily as a separate chunk.
- `simli-client` becomes a real dependency (in the prototype it was only a dev dependency).
- The call-leg request sends `avatar: true` when `config.avatar` is set and the hidden flag
  isn't.
- After `voice.start(leg)` resolves, if `leg.avatar` exists: create the `SimliClient`
  (`livekit`, `audioBufferSize: 800`) and call `start()`.
- Tap the agent track from the gateway transport's `pc.getReceivers()` and pass it to
  `listenToMediastreamTrack`.
- Mute Simli's `<audio>`.
- Call `stop()` on `pagehide`, on call end, and when the shopper hides the avatar.
- Any Simli error leaves the avatar in the failed state; voice is untouched.

## Done when

- A live call shows a lip-syncing face on the dev store.
- Voice start time is unchanged.
- Bundle size is unchanged when the avatar is off.
- A Simli failure leaves voice working.

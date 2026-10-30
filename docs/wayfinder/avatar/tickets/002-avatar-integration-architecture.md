---
id: 002
title: Avatar integration architecture
type: grilling
mode: HITL
state: closed
assignee: dcunningham
blocked_by: [001]
---

## Question

Which integration path do we choose: avatar fed in the browser, a server-side bridge, or
replacing Simli? Also, which existing modules (widget, backend, contracts) change?

## Resolution

- **Path:** the browser `simli-client`. If the go/no-go prototype fails, replace Simli; the
  server-side bridge is not possible.
- **Audio tap:** tap `RetellWebClient.analyzerComponent.analyser` into a
  `MediaStreamDestination` and pass it to `listenToMediastreamTrack` (`handleSilence: false`).
  If that fails, intercept the `RTCPeerConnection` track. No SDK fork. Accept the lock to the
  legacy `RetellWebClient` (the 3.x SDK).
- **Double audio:** mute Simli's `audioEl`. Retell's playback stays as it is.
- **Token:** each call leg carries the token. The `POST /sessions/:id/call-legs` response gains
  optional `avatar: { session_token }`; no `avatar` field means voice-only. The call-leg
  response schema moves into `contracts/session.ts` as zod.
- **Enablement:** the theme checkbox sets `window.__WAYFINDER__.avatar`. The widget sends
  `avatar: true` on the call-leg request, and only then does the backend mint a token. The
  face ID and API key live only in backend env.
- **Startup:** voice never waits for the avatar. The avatar attaches when `start()` resolves.
  If the avatar fails, voice is untouched.
- **Hide control:** hiding stops the Simli session to save minutes. The hidden state persists
  across page loads, so a hidden avatar is never started on the next leg. Showing it again
  mints a new token.
- **Modules:**
  - widget: a new `avatar.ts`, lazy-loaded through the existing esbuild code splitting.
  - backend: a new `avatar/` module with an `AvatarProvider` interface, mirroring
    `voice/voice-provider.ts`, plus a Simli implementation.
  - contracts: the call-leg response schema.
  - theme: the checkbox setting and the `__WAYFINDER__.avatar` flag.

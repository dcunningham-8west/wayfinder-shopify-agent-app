---
id: 001
title: Simli and Retell integration surface
type: research
mode: AFK
state: closed
assignee:
blocked_by: []
---

## Question

How can a Simli avatar lip-sync to a Retell web call's agent audio? Find out:

- What integration paths Simli offers, such as a browser SDK fed with PCM audio, a LiveKit or
  WebRTC bridge, or an official Retell integration.
- Whether the Retell web SDK exposes the agent's raw audio, or whether its playback can be
  intercepted.
- How Simli authenticates: can a short-lived session token be minted server-side so the API
  key stays off the browser?
- How long a Simli session takes to start, given that the call reconnects on every page.
- How much lip-sync delay Simli adds.
- What the free tier allows: 50 minutes, plus any limits on concurrent sessions or features.

## Resolution

Use the browser SDK `simli-client`. There is no official Retell integration. Retell's `audio`
event gives analyser snapshots, not PCM. To get continuous agent audio, tap the exposed
`AnalyserNode` into a `MediaStreamDestination` and pass it to `listenToMediastreamTrack`. This is
unverified and relies on the deprecated `RetellWebClient.analyzerComponent`. Retell can't be
told not to play the audio. The simplest fix is to mute Simli's audio, which leaves the lips
lagging the voice.

- **Auth:** the server calls `POST https://api.simli.ai/compose/token` with header
  `x-simli-api-key`. Only the session token goes to the browser.
- **Audio:** PCM16, 16 kHz, mono.
- **Free tier:** 50 min/month, 1 concurrent session, template avatars only.
- **Unknown:** startup time, lip-sync lag, how minutes are billed, and the token's lifetime.
  These need a prototype.

Findings: [simli-retell-integration-surface.md](../research/simli-retell-integration-surface.md)

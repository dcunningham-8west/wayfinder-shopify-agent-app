# Simli and Retell integration surface

Research for [ticket 001](../tickets/001-simli-retell-integration-surface.md). Sources checked
2026-10-29: `simli-client` 3.2.0, `retell-client-js-sdk` 3.0.3 (the widget pins `^3.0.2` and uses
the deprecated `RetellWebClient`, see `packages/widget/src/voice.ts`).

## Summary

- **Viable path:** run the browser SDK `simli-client` next to the Retell web call, and feed it
  the agent's audio from the browser. There is no official Retell integration.
- **Retell has no PCM feed.** The `audio` event only gives analyser snapshots. To get a
  continuous stream, tap the `AnalyserNode` that Retell exposes, or intercept the LiveKit
  remote track. Both rely on SDK internals.
- **Double audio:** Retell plays agent audio through an `<audio>` element that LiveKit creates
  and the app can't reach. Retell has no "don't play" option. See options below.
- **Auth:** the server mints a short-lived session token with
  `POST https://api.simli.ai/compose/token`, using the `x-simli-api-key` header. Only the token
  goes to the browser.
- **Audio format:** PCM16, 16 kHz, mono. This is the only supported input.
- **Free tier:** 50 min/month, 1 concurrent session, template avatars only.
- **Unknowns:** startup time, lip-sync latency, token TTL, and whether minutes are billed per
  started session or per second. These need a measured prototype.

## 1. Simli integration paths

Source: <https://docs.simli.com/> and <https://docs.simli.com/llms.txt>

| Path | Where it runs | Fit |
| - | - | - |
| JavaScript SDK (`simli-client`) | Browser | **Best fit.** Simli's docs say to use it "when the avatar's audio is already in the browser" (<https://docs.simli.com/api-reference/javascript>). |
| LiveKit Agents | Python agent in *your* LiveKit room | No fit. Retell owns its LiveKit room (`wss://retell-ai-4ihahnq7.livekit.cloud`), and we can't add a Simli agent to it. |
| Pipecat / Python SDK | Server | No fit. Retell's audio isn't on our server. |
| Raw WebRTC (custom JS client) | Browser | A fallback if we need to fork the SDK (<https://docs.simli.com/api-reference/simli-webrtc>). |

- **Official Retell integration:** none. Simli's doc index lists LiveKit, Pipecat, OpenAI
  Realtime and ElevenLabs samples, and no Retell sample. Retell's web call docs don't mention
  avatars or Simli.
- **`simli-client` API**, from <https://github.com/simliai/simli-client>:
  - `new SimliClient(session_token, videoEl, audioEl, iceServers|null, logLevel, "livekit"|"p2p")`
    LiveKit is the default since 3.2.0. P2P needs ICE servers from
    `POST /compose/ice`, which also uses the API key, so it would need a second server route.
  - `start()` resolves when the first video frame is on screen.
  - `sendAudioData(Uint8Array)` sends PCM16, 16 kHz, mono. Simli suggests chunks of about
    6000 bytes.
  - `sendAudioDataImmediate`.
  - `ClearBuffer()` stops the avatar's speech, for example on an interruption.
  - `listenToMediastreamTrack(track)` streams a WebRTC or mic track. The SDK converts it to
    PCM16 for you. Chunks default to 3000 samples, which is 187.5 ms.
  - `listenToAudioElement(el)` captures an `<audio>` element **and mutes it locally**. You hear
    the audio through Simli's `audioEl` instead.
  - Events: `start`, `stop`, `error`, `startup_error`, `speaking`, `silent`, `warning`, and
    others.
  - A client runs one session only. Each reconnect needs a new token and a new `SimliClient`.
    In this app, that means every page navigation.
  - Set `handleSilence: false` when streaming continuous audio through
    `listenToMediastreamTrack` or `listenToAudioElement`. Set it to `true` (the default) for
    bursts sent with `sendAudioData`.

## 2. Retell web SDK: access to the agent's audio

Sources: <https://docs.retellai.com/deploy/web-call>,
<https://github.com/RetellAI/retell-client-js-sdk>,
[`src/livekit-transport.ts`](https://raw.githubusercontent.com/RetellAI/retell-client-js-sdk/main/src/livekit-transport.ts),
[`src/legacy/retell-web-client.ts`](https://raw.githubusercontent.com/RetellAI/retell-client-js-sdk/main/src/legacy/retell-web-client.ts)

- **`emitRawAudioSamples` does not give a PCM stream.** The `audio` event emits a
  `Float32Array` from `AnalyserNode.getFloatTimeDomainData()`, sampled once per
  `requestAnimationFrame`. The README says: "analyser samples taken on animation frames, not
  continuous PCM". Retell's docs say it is meant for visualisation. It can't drive Simli
  directly.
- **The agent track is internal.** In the LiveKit transport, `TrackSubscribed` with
  `trackName === "agent_audio"` calls `track.attach()` with no arguments. LiveKit then creates a
  detached `<audio>` element. Neither the element nor the `Room` is exposed.
- **What is exposed:** in the legacy `RetellWebClient`, `analyzerComponent` is public once
  `call_ready` fires, and only when `emitRawAudioSamples: true`. It contains `analyser`, an
  `AnalyserNode` wired to the agent's remote track. `CallSession` in 3.x has the same analyser
  internally. **Unverified:** whether `CallSession` exposes the analyser publicly.
- **Ways to get continuous agent PCM in the browser** (all unverified, so prototype them):
  1. **Tap the analyser (preferred).** Under the Web Audio spec, an `AnalyserNode` passes its
     input through to its output. Then:
     `analyser.connect(ctx.createMediaStreamDestination())`, take `.stream.getAudioTracks()[0]`,
     and pass it to `simli.listenToMediastreamTrack(track)`.
     This uses only public objects. Risk: it depends on `analyzerComponent` staying in the
     SDK, which is removed in 4.0 along with `RetellWebClient`.
  2. **Intercept the remote track.** Wrap `RTCPeerConnection` or the `HTMLMediaElement.srcObject`
     setter before the call starts, so you can catch the agent's `MediaStreamTrack`. This is
     fragile and global.
  3. **Fork or patch the SDK** to expose the `RemoteAudioTrack`. The SDK is open source, but
     we would have to keep the fork up to date.
- **Sample rate:** the `audio.sampleRate` option sets the mic capture rate only. The agent's
  remote track arrives as WebRTC Opus, decoded at the `AudioContext` rate (usually 48 kHz).
  `listenToMediastreamTrack` resamples to 16 kHz. If we use `sendAudioData` instead, we must
  resample ourselves.
- **Muting Retell's playback to avoid double audio:** Retell has no API or option for this.
  `playbackDeviceId` only picks the output device. Options:
  - a. Hide the Retell element. Path 2 can catch it and mute it. With path 1 there is no handle
    to it.
  - b. **Mute Simli's `audioEl`** and keep Retell's playback. This is the simplest option and
    has no double audio. The cost is that the video lags the voice by Simli's processing delay,
    which is unknown (§4).
  - c. Patch the SDK so it doesn't call `track.attach()`.
  - Note: `listenToAudioElement` mutes the element it captures, but we can't pass it Retell's
    detached element without path 2.
- **Gateway transport:** 3.x also has a `GatewayTransport` that doesn't use LiveKit. The
  findings above cover LiveKit only, which is the default for `RetellWebClient`. Which
  transport `createWebCall` uses is **unknown**.

## 3. Simli auth

Sources: <https://docs.simli.com/api-reference/javascript>,
<https://docs.simli.com/api-reference/compose-session-token>,
<https://github.com/simliai/simli-client>

- **Server side:** `generateSimliSessionToken({ apiKey, config })` (Node 18+), or a raw
  `POST https://api.simli.ai/compose/token` with header `x-simli-api-key: <key>` and a JSON
  body:
  - `faceId`
  - `maxSessionLength`: seconds, default 3600
  - `maxIdleTime`: seconds, default 300
  - `handleSilence`
  - `audioInputFormat`: `"pcm16"` only
  - Trinity-2 framing fields

  The response is `{ session_token, warnings }`.
- **Browser:** gets only the `session_token`. It connects with `wss://api.simli.ai` by default.
- **P2P mode:** also needs `POST /compose/ice`, which uses the key. So P2P means a second server
  route. LiveKit mode needs only the token.
- Simli warns: "Anyone who can reach your token route can start a session on your account."
  The route needs rate limiting or a session check.
- `maxSessionLength` and `maxIdleTime` are our cost guardrails, set per token.
- Errors include `SESSION_TOKEN_EXPIRED`, invalid face, no minutes left, and rate limit. A
  token request with no minutes left throws, so the fallback can trigger before any browser
  work starts.
- **Unknown:** the token's lifetime before use, and whether a token is single-use. The SDK
  implies one session per token.

## 4. Startup time and latency

- **Startup:** **unknown.** No figure is published in the docs or SDK. What is documented:
  - `start()` resolves at the first video frame.
  - A single attempt times out after 15 s.
  - Network failures retry with backoff of 1, 2, 4, 8 then 16 s, up to 10 times.

  Each page navigation costs one token request plus one `start()`. Measure both.
- **Lip-sync latency:** **unknown.** No figure in the primary docs. The P2P docs only say it
  "can save a little latency" compared with LiveKit. There is also a capture delay: chunks of
  3000 samples add about 187.5 ms before Simli receives the audio. `audioBufferSize` can be
  lowered.
- **Audio format:** PCM16 LE, 16 kHz, mono. Simli says it is the only supported format.

## 5. Free tier

Source: <https://www.simli.com/pricing>

- 50 minutes/month, $0.
- 1 concurrent session. Reconnecting on navigation must `stop()` the old client before the new
  one `start()`s. If the old session is still alive, the new one may be refused.
- Template avatars only. Custom avatars start at Hobby ($10/mo). Check whether the existing
  face ID is a template or custom face.
- **Unknown:**
  - What counts as a billable minute: rounding, and whether idle time counts. The pricing FAQ
    exists, but its answers weren't in the fetched page.
  - Whether a session left open after a page unload keeps billing until `maxIdleTime` runs out.

## Open questions for a prototype

1. Does tapping the analyser on `RetellWebClient.analyzerComponent` give a clean continuous
   stream into `listenToMediastreamTrack`?
2. Measure the gap from the token request to the first frame, and how long voice-to-lips lag
   is.
3. Is the lag acceptable with Retell's audio audible and Simli's muted (option 2b)? If not,
   which way of muting Retell should we use?
4. Does closing the old Simli session on `pagehide` free the single concurrent slot in time for
   the next page?

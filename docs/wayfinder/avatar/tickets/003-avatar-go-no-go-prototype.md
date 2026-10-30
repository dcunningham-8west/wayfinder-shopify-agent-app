---
id: 003
title: Avatar go/no-go prototype
type: prototype
mode: HITL
state: closed
assignee: dcunningham
blocked_by: [002]
---

## Question

Does the chosen path actually show the Simli face lip-syncing to the Retell agent at the top
of the widget, with acceptable delay? Keep total Simli usage to a few minutes of the 50-minute
free tier.

## Resolution

**Go on Simli.** The lips move on every turn. The sync is imperfect but acceptable.

- **Audio tap (replaces the tap chosen in ticket 002):** the live call leg uses Retell's
  `gateway` transport, not LiveKit. Take the agent track from the transport's private
  `pc.getReceivers()` and pass it to `listenToMediastreamTrack`. It worked first time. The
  analyser tap wasn't needed.
- **Audio stays on Retell, with Simli muted (Q3 confirmed).** Playing Simli's audio synced the
  lips slightly better, but the audio quality was worse. It would also make Simli a single
  point of failure for the voice and add Simli's lag to every reply. The cost is the same
  either way: both services bill for the whole call.
- **Simli `audioBufferSize`:** 800 samples, down from the default of 3000.
- **Startup:** 0.5–0.65 s to mint the token, then 1.3–2.2 s to the first frame, so 2.0–2.7 s
  in total. Start voice first; the avatar appears later.
- **Restart:** `stop()` takes about 70 ms, and a new session starts straight away within the
  1-session limit. The agent track survives the Simli restart.
- **Not measured:** the exact lip-sync lag. The legacy gateway client emitted no
  `agent_start_talking`, and Simli emitted no `speaking`.
- **Usage:** about 2.5 min of the free tier.

Prototype: branch `proto/avatar-go-no-go`, commit `ec3a410`, in
`packages/widget/prototype-avatar/`. Not pushed.

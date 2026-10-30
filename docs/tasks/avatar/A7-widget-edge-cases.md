---
id: A7
title: Widget avatar edge cases
state: open
assignee:
blocked_by: [A3, A6]
---

Spec: [13-avatar.md](../../spec/13-avatar.md), section "Widget lifecycle".

## Build

- **Slot still held:** if `start()` is refused, wait about 2 s, get a fresh token from
  `POST /sessions/:id/avatar-token`, and retry once. Otherwise go to the failed state for this
  leg.
- **Show again after hiding:** get a token from the mid-leg route and start.
- **`maxSessionLength` reached:** Simli stops and voice continues. The shopper can show the
  avatar again.

## Done when

Each case has been exercised on the dev store, sparingly because of the free-tier minutes,
or covered by a unit test with a stubbed `SimliClient`.

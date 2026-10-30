---
label: wayfinder:map
title: Animated avatar for the voice assistant
---

# Animated avatar for the voice assistant

## Destination

A spec addendum (`docs/spec/13-avatar.md`) handed to build agents: an animated, lip-synced
avatar shown at the top of the existing widget during a Retell call. Done when nothing
architectural is left to decide.

## Notes

- Domain: RetellAI web calls, Simli real-time avatars, the widget (`packages/widget`), the theme
  (`packages/theme`), and the base spec in [`docs/spec/`](../../spec/README.md).
- Skills every session should consult: `grilling`, `domain-modeling`. Add `research` or
  `prototype` depending on the ticket type.
- Tracker: local markdown, same conventions as [the parent README](../README.md). Tickets are in
  [`tickets/`](./tickets/).
- Planning only. Exception: `task` tickets and the go/no-go prototype.

### Settled before charting

- **Retell is fixed. Simli is preferred but replaceable** if the integration turns out to be poor.
- **The avatar is an optional layer.** If it's off or fails, the widget falls back to the
  current voice-only experience.
- **Merchant switch:** an "Enable avatar" checkbox in the theme editor settings.
- **Shopper switch:** a hide/show control during the call, modelled on the existing subtitles
  toggle.
- **Desktop first.**
- **Placement:** inside the widget panel, at the top.
- **Cost:** Simli free tier only (50-minute cap). The first goal is to prove it works. Every
  prototype must spend minutes sparingly.
- **The face ID is a Simli template avatar**, which works on the free tier. A template avatar is
  enough for this effort; a custom avatar would need a paid plan.
- Simli API key and face ID are already obtained. The key is a secret: it must never reach
  the browser as-is or be committed.

## Decisions so far

- [Simli and Retell integration surface](./tickets/001-simli-retell-integration-surface.md): use browser `simli-client` fed from Retell's agent `AnalyserNode` (unverified tap), API key stays on server via `/compose/token`, free tier is 1 concurrent session; startup and lip-sync lag still unknown
- [Avatar integration architecture](./tickets/002-avatar-integration-architecture.md): browser `simli-client` with Simli's audio muted; the token rides on the call-leg response only when the avatar is enabled; voice never waits; hide stops the session; new widget `avatar.ts`, backend `avatar/` provider, schema in contracts
- [Avatar go/no-go prototype](./tickets/003-avatar-go-no-go-prototype.md): go; tap the gateway transport's `pc` receiver (not the analyser); audio stays on Retell; buffer 800; about 2–2.7 s to the first frame; restart frees the session slot
- [Avatar lifecycle across page loads](./tickets/004-avatar-lifecycle-across-page-loads.md): start on every call leg after voice; stop on `pagehide`, on call end and on hide, with a 30 s idle backstop; one retry if the slot is held; hidden flag in `sessionStorage`; a still holds the space during startup
- [Simli credential handling](./tickets/005-simli-credential-handling.md): optional env vars, avatar off if missing; token minted in parallel with Retell with a 3 s cap, falling back to voice-only; session-gated `POST /sessions/:id/avatar-token` for re-show and retry, limited to 1 per 10 s; never log secrets
- [Avatar cost guardrails](./tickets/007-avatar-cost-guardrails.md): `maxSessionLength` 600 s; when minutes run out, skip minting for 1 h; no caps of our own on the free tier; 1 concurrent session is a known limit; the avatar is always dropped first
- [Avatar visuals and failure states](./tickets/006-avatar-visuals-and-failure-states.md): full-width square portrait at the top, replacing the waveform; the same space in every state, so nothing jumps; a still with a spinner during startup; failure greys it with "VOICE ONLY"; hiding returns the voice-only layout; new avatar button next to subtitles
- [Write the avatar spec addendum](./tickets/008-write-avatar-spec-addendum.md): written as [13-avatar.md](../../spec/13-avatar.md); destination reached

## Not yet specified

## Out of scope

- [Mobile avatar support](./tickets/009-mobile-avatar-support.md): this effort is desktop first; mobile needs its own effort once bandwidth and CPU costs are known.

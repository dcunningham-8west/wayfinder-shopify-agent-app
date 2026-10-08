---
label: wayfinder:map
title: Voice shopping assistant — architecture spec
---

# Voice shopping assistant — architecture spec

## Destination

A written architecture spec, handed off to build agents, for a voice-based AI shopping
assistant on a single Shopify store: a click-to-start widget present on every storefront
page (not checkout), voice via RetellAI, able to answer catalogue questions, answer
questions about what is on screen, drive the storefront UI, and read/write the shopper's
existing cart. Done when nothing architectural is left to decide.

**The spec now exists: [`docs/spec/`](../spec/README.md).** All eleven charted tickets are
closed and assembled into it. What remains is in
[section 09](../spec/09-open-questions.md), triaged into what blocks the build (5 items),
what needs a prototype (1), and what the build decides for itself (5).

## Notes

- Domain: Shopify storefront development, RetellAI voice agents, monorepo architecture.
- Skills every session should consult: `grilling`, `domain-modeling`. Add `research` or
  `prototype` per ticket type.
- Tracker: local markdown (see [README](./README.md)). GitHub CLI blocked by ITS.
- Single operator; no concurrent sessions expected.
- Planning only. Produce decisions, not deliverables. Exception: `task` tickets.

### Settled before charting

- Destination is a spec, not a build.
- Single store, not a distributable multi-tenant app.
- Click-to-start, not always-listening.
- UI interaction is **both** a defined action vocabulary **and** direct DOM driving.
- Brain lives in RetellAI's agent with custom-function webhooks; existing Retell agent
  assets are reference only, a fresh agent is acceptable. _(Softened by ticket 003: the
  prior art is a complete three-repo system; the reuse boundary is now ticket 010.)_
- **Clean slate, old stack frozen.** New Retell agent, new tool/function set designed from
  scratch, and a new backend service on a new URL. The existing agent, tools, and Render
  service are left untouched as a fallback to the current working assistant. Nothing in the
  prior art is load-bearing, so it informs the new design without constraining it.
- **The only fixed constraints are Shopify as the storefront and RetellAI as the voice
  tech.** Everything else — backend language, hosting, data stores, widget architecture,
  tool vocabulary, continuity mechanism — is chosen on merit, from scratch where that is
  better. Prior art is evidence, never obligation.
- **The theme is ours to edit.** The storefront repo is owned and the store is a dev store,
  so injection is not limited to an app embed block. Liquid in the theme is a first-class
  integration surface. This relaxes ticket 002's app-embed conclusion, which held for a
  distributable app; it does not hold for this single-store effort.
- **A new dev store, not `voice-bot-store.myshopify.com`.** _(Ticket 010.)_ Ticket 008's
  theme-as-repo-package would overwrite the theme carrying the frozen fallback widget, so the
  two cannot share a store. Catalogue hand-built from real client product lists rather than
  Shopify's generated filler. Supersedes ticket 003's store facts.
  _**Now created:** `wayfinder-voice-bot-store.myshopify.com`, Jo Malone Candle Theme 1.0.0,
  verified Dawn-structured — so tickets 005 and 007 transfer without revision. Theme lives in
  `packages/theme`._
- Call does **not** survive navigation: the widget reconnects per page and resumes from
  the RetellAI transcript. Prototyped by the operator and confirmed working.
- One cart only — Shopify's, keyed by the browser cart token. The agent read-throughs it
  and merges; it never keeps a replica or a session-scoped cart.
- Monorepo, with RetellAI config, Shopify extension, and backend service as packages.
  _(Revised by ticket 008: **one repo, five packages**, the theme among them — which required
  disconnecting the Shopify GitHub integration. "Extension" is also the wrong word now; the
  widget is theme-integrated, not an app embed.)_

## Decisions so far

<!-- one line per closed ticket -->

- [RetellAI web-call capability surface](./tickets/001-retellai-web-call-capability-surface.md):
  tool calls resolve **server-side only** — the browser can observe them but never answer
  them; there is no resume primitive, so continuity means replaying transcript; build on
  SDK v3, as v2 dies 2026-10-18.
- [Shopify storefront integration surfaces](./tickets/002-shopify-storefront-integration-surfaces.md):
  app embed block is the only viable injection route and runs unsandboxed; cart writes must
  go through the Ajax Cart API / `Shopify.actions.updateCart` to hit the shopper's real
  cart; Storefront MCP is gone, replaced by UCP.
- [Gather existing RetellAI assets and store access](./tickets/003-gather-existing-retellai-assets-and-store-access.md):
  prior art is **three readable repos** — agent prompts/tools, backend with canonical
  contracts, and the theme itself carrying three widget generations; sync is one-way
  GitHub Actions → `llm.update`; store is the dev store `voice-bot-store.myshopify.com`
  on a Dawn-structured generated theme, which doubles as the prototyping surface.
- [Session continuity model across page loads](./tickets/004-session-continuity-model-across-page-loads.md):
  **reconnect-with-replay, server-seeded** — a tab-scoped Session owns a series of Call
  Legs; the backend owns the transcript (beaconed on `pagehide`) and the browser carries
  only a session id; silent resume depends on the per-origin mic grant, so the widget must
  be same-origin; a Cart Snapshot seeds each leg for talking but never for mutating; the
  gap is masked by a text status. SPA-style navigation suppression rejected.
  Recorded as [ADR-0001](../adr/0001-reconnect-with-replay-voice-continuity.md).
- [Page context extraction strategy](./tickets/005-page-context-extraction-strategy.md):
  **the page supplies identity, the catalogue supplies facts** — a typed Page Context
  emitted at render time by Liquid, in two layers (template-level from the globals, plus a
  per-section emitter that an app embed structurally cannot replicate), carrying ids and
  handles but never descriptions. Sent once per Call Leg inside the Session Seed. Kills the
  v1 hallucinations by removing name-similarity resolution from the path.
- [Catalogue query strategy](./tickets/006-catalogue-query-strategy.md): **show, don't
  recite** — three tiers: a ~300-token Catalogue Digest in the seed (no prices) answering
  shape questions with no tool call, an in-memory semantic index behind one search tool
  returning 3–5 identities, and live price/stock fetched only for a product the shopper
  already pointed at. Deletes `get_collection_products` and the prompt-routing failure that
  came with it. Assumes ~100 products; reopen if the catalogue reaches thousands.
  _**Confirmed against the real store:** 52 products, 57 variants, £28–£525 — well inside the
  assumption. The 80 tags turned out to be a **six-facet model** (fragrance, mood, style,
  scent, maincat, subcat), which improves the design: mood and style are how people shop by
  voice, and they are explicit facets rather than inferred vibe. See
  [spec section 05](../spec/05-catalogue.md)._
- [Storefront action vocabulary and the DOM-driving boundary](./tickets/007-storefront-action-vocabulary-and-dom-boundary.md):
  **the agent never touches the DOM** — a Tool answers, an Action acts, and every Action
  runs in the browser. The theme emits an Action Target registry beside the Page Context, so
  the agent names target ids, never selectors; breakage is caught by a build-time check in
  CI. A ten-action typed vocabulary, carried backend→page as an Action Envelope
  over a per-leg WebSocket so the agent speaks real outcomes; `navigate` alone is
  fire-and-forget. Cart writes go through the Ajax Cart API in the page. Confirmation turns
  on who proposed the action, enforced in the prompt only.
- [Monorepo layout and the shared contract package](./tickets/008-monorepo-layout-and-shared-contract-package.md):
  **one repo, five packages** — `contracts`, `backend`, `widget`, `retell`, `theme`; everything
  depends on `contracts`, which depends on nothing. `contracts` authors **Zod schemas only** and
  generates every other form of itself: TS types, Retell's `functions.json`, and the Liquid
  emitters, since generation is the only bridge Liquid can cross. The Shopify GitHub integration
  is **disconnected** so the theme can live in the repo; CI pushes via the Shopify CLI instead,
  making `shopify theme dev` the development loop at the cost of Admin theme edits. Spec lands
  in `docs/spec/`. Recorded as [ADR-0002](../adr/0002-single-repo-with-generated-contracts.md).
- [Cost and concurrency ceiling of per-navigation reconnect](./tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md):
  **Standby is the resting state** — most navigations open no Call Leg at all; one opens only
  when the agent caused the navigation, the shopper was mid-turn, or a click/local VAD wakes it,
  and a live leg idles out after 45 s. The Session Seed is hard-budgeted under **4,000 tokens**
  to stay below Retell's surcharge cliff, so cost per leg is flat and the 32k wall is moot.
  Replay policy closed: **Session State plus the last ~4 turns verbatim**. A 2 s settle delay and
  ~5 s floor between leg creations guard the 10 s billing minimum and the undocumented
  `create-web-call` rate limit. ~$0.55 per engaged session, a ~4× cut. Amends ADR-0001.
- [Prior-art reuse boundary](./tickets/010-prior-art-reuse-boundary.md): **one file ports,
  everything else is reference** — `agent-app.css` is the only real asset; the handoff, SSE,
  tool artifact, and all three widget generations are superseded by tickets 004/006/007/008.
  `known-failures.md` held a single entry, already fixed by 006. Prompt authoring is rebuilt,
  not ported: tool-facing text is **generated from `contracts`** (prose fields on the Zod
  schemas), leaving four hand-authored files — identity, voice, guardrails, continuity.
  `search_shop_policies_and_faqs` is **cut**. A **new dev store** is created, because 008's
  theme-as-package would otherwise overwrite the frozen fallback; catalogue hand-built from
  real client product lists.
- [Backend hosting and the cold-start latency floor](./tickets/011-backend-hosting-and-cold-start-floor.md):
  **Render Starter, one service, US-East** — paid tier because a cold start is not a clean
  error but tens of seconds of silence, and ticket 009's Standby makes the service idle *more*.
  Serverless and edge are ruled out by the **in-memory index**, not by the socket. Region follows
  Retell, which is US-only AWS: tool-only calls are the common, asymmetric path, so US-East wins
  even with European shoppers. **Floor: ~40 ms for a tool-only call, ~220 ms for an Action.**
  Corrects a standing misconception — `timeout_ms` is configurable 1–600 s (default 120 s), so
  the old 5 s bound was a choice, not a platform limit.

## Not yet specified

- **Agent persona and prompt design** — tone, proactivity, when it offers vs waits. Ticket 010
  fixed the *authoring model* (four hand-authored files; tool text generated from `contracts`)
  but not the content.
- **Disambiguation behaviour** — what the agent does when a request matches many products,
  or none. Likely interacts with the action vocabulary.
- **Latency budget** — end-to-end target per turn, and which hops get the budget.
  Floored by ticket 011 at ~40 ms (tool-only) / ~220 ms (Action) of backend round trip.
  Ticket 011 also hands this a knob: per-tool `timeout_ms`, paired with `speak_during_execution`
  for anything slow.
- **Voice UX details** — barge-in, confirmation before cart mutations, error recovery
  when an action fails on the page.
- **Widget UI and the Preview Panel** — the widget's visual design, and with it the
  behaviour of `show_in_widget`: how the panel of narrated product tiles appears, cycles,
  and dismisses. Ticket 007 reserved the action and fixed the panel to identity-level tiles
  linking out to the storefront; everything else waits on the UI existing. Ticket 009 adds a
  **Standby** state the widget must express, and browser-local VAD as a widget responsibility.
  Ticket 010 gives it a starting point rather than a blank page: the v3 widget's
  [`agent-app.css`](./prototypes/010-widget-css/agent-app.css) is vendored in as the look-and-feel
  to keep or rework.
- **Reconnect failure UX** — what the shopper sees and hears when a reconnect fails
  outright. Deferred from ticket 004: best answered against a real widget UI, so it
  graduates alongside the widget design above.
- **In-page mutation and Page Context staleness** — "load more" and other Section Rendering
  API swaps change the page without a navigation, so the emitted Page Context goes stale
  with no reconnect to refresh it. Narrowed by ticket 007: filter and sort now return a
  fresh Page Context in their Action Result, leaving only swaps the agent did not cause.
- **Security of the mutation surface** — _closed by
  [ticket 012](./tickets/012-security-of-the-mutation-surface.md)._ Splits structural from
  operational: build every mechanism now, set no thresholds. **Session Token** separate from
  the public Session Id (an identifier that doubles as a credential leaks wherever it is
  logged); **idempotency key** per Action Envelope (retrying an unacked Action double-adds —
  a bug that only shows up on flaky connections, i.e. in demos); chokepoint at **Call Leg
  creation**, not the socket, which co-locates abuse guards with ticket 009's cost guards.
  Found a hole nobody was looking at: the **Retell tool webhook had no signature
  verification**. Ceiling values deliberately unset — no traffic to set them against.
- **Testing strategy** — how a voice agent plus DOM driving gets tested deterministically.
- **Transcript and analytics retention** — what is stored, where, and for how long. Ticket 011
  adds a residency edge: the demo audience is European, but Retell is US-only AWS and the backend
  is US-East, so EU residents' transcripts leave the EEA by design.
- **Accessibility** — the widget's own a11y, and its interaction with screen readers.

## Out of scope

- Checkout, post-purchase, and customer-account surfaces.
- Policy and FAQ answering. _(Ticket 010 cut `search_shop_policies_and_faqs` as edge-case.
  Risk logged there: "how much is shipping" now hits nothing.)_
- Multi-tenant distribution, App Store listing, merchant onboarding, billing.
- Order history and personalization beyond the current session and cart.
- Always-listening / wake-word activation.

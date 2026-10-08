---
title: Architecture
---

# 02 — Architecture

Part of [the spec](./README.md). Decided in
[ticket 008](../wayfinder/tickets/008-monorepo-layout-and-shared-contract-package.md) and
[ADR-0002](../adr/0002-single-repo-with-generated-contracts.md).

## One repo, five packages

```
wayfinder-shopify-agent-app/
├── package.json            # workspace root
├── docs/
│   ├── spec/               # this spec — the handoff artefact
│   ├── adr/                # binding decisions
│   ├── Glossary.md         # ubiquitous language
│   └── wayfinder/          # the map and its tickets — rationale
└── packages/
    ├── contracts/          # Zod schemas only. Depends on nothing.
    ├── backend/            # one warm process: Tools, Session, Index, WebSocket
    ├── widget/             # in-page: mic, Call Legs, Action execution
    ├── retell/             # prompt sources + sync pipeline
    └── theme/              # the Shopify theme (shopify theme pull target)
```

**Every package depends on `contracts`. `contracts` depends on nothing.** That acyclicity is
the point; it is what makes the contract authoritative rather than negotiated.

## `contracts` generates, it does not merely declare

`contracts` authors **Zod schemas only** and generates every other form of itself:

| Generated artefact | Consumed by | Why generated |
| --- | --- | --- |
| TypeScript types | `backend`, `widget` | Single source for both ends of every wire |
| Retell `functions.json` | `retell` | Tool schemas must match what the backend serves |
| Tool-facing prompt text | `retell` | Prevents prompt/tool drift — see below |
| Liquid emitters | `theme` | **Generation is the only bridge Liquid can cross** |

The Liquid row is the forcing one. Liquid cannot import a type, so a hand-written emitter
and a Zod schema would silently diverge. Generation is not a convenience here; it is the
only mechanism available.

### Prompt text is generated too

Tool-facing prompt content — name, when to use, when *not* to use, and the Action vocabulary
table — is authored as **prose fields on the Zod schemas** and generated into the prompt.

This exists to kill a specific failure class. If `general_tools` were generated from
`contracts` while `general_prompt` was hand-written, a single `llm.update` call would carry
two sources that can disagree: the prompt can describe a seam the tool no longer has. That is
precisely the one failure the prior system recorded. A CI name-check would not catch it,
because the names stay valid while the *guidance* goes stale.
See [ticket 010](../wayfinder/tickets/010-prior-art-reuse-boundary.md).

## Build ordering

`contracts` generation must run **before** any dependent package builds. The workspace tool
must enforce this rather than relying on developer discipline. Dependents consume generated
output; they never read Zod schemas directly.

## Theme deployment

The Shopify↔GitHub integration is **disconnected and must stay disconnected.** It expects the
theme at the repo root, cannot address `packages/theme`, and fights CI for ownership of the
same files.

- **Into the repo:** `shopify theme pull --path packages/theme`, once, at setup.
- **Out of the repo:** CI pushes via the Shopify CLI.
- **Development loop:** `shopify theme dev`.
- **Cost, accepted knowingly:** the Admin theme code editor stops being authoritative — CI
  overwrites it. Admin remains the source of truth for *content* (products, collections,
  pages, menus); theme *code* lives in the repo.

## Data flow

Two paths, and they are not symmetric.

**Tool call** — answers a question, touches nothing:

```
agent → Retell (server-side) → backend → [Index | Shopify Admin API] → backend → agent
```

**Action** — changes the shopper's screen or cart:

```
agent → Retell → backend → WebSocket → widget → DOM / Ajax Cart API
                                           ↓
                              Action Result → backend → agent
```

The Action path exists because Retell resolves tool calls **server-side only** — the browser
can observe them but never answer them
([ticket 001](../wayfinder/tickets/001-retellai-web-call-capability-surface.md)). The
WebSocket is the side channel that lets a browser-executed Action return a real outcome, so
the agent speaks what actually happened rather than what it hoped would happen.

## Why the backend is one warm stateful process

Four decisions each independently require it:

- Owns the transcript and Session State across Call Legs ([ticket 004](../wayfinder/tickets/004-session-continuity-model-across-page-loads.md))
- Holds the **in-memory Catalogue Index** ([ticket 006](../wayfinder/tickets/006-catalogue-query-strategy.md))
- Holds a per-Call-Leg WebSocket ([ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md))
- Runs Standby idle timers and inter-leg floors ([ticket 009](../wayfinder/tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md))

The Index is the hard constraint. A runtime that scales to zero rebuilds it on every cold
start; one that scales out holds N divergent copies of Session State. **Serverless and edge
runtimes are ruled out** — by state, not by sockets. See
[section 08](./08-deployment-and-operations.md).

## Secrets

Never committed. `.gitignore` must cover `.env` and `.shopify/` **before** the theme is first
pulled — a leaked store password or Admin API token is only truly fixed by rotation.

| Secret | Used by | Held in |
| --- | --- | --- |
| Retell API key, agent id, LLM id | `retell` sync, `backend` | CI secrets + local `.env` |
| Shopify Admin API token | `backend` | CI secrets + local `.env` |
| Shopify CLI auth | theme push | CI secrets |
| Storefront password | operator only | Not recorded anywhere |

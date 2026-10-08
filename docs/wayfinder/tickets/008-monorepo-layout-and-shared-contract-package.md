---
id: 008
title: Monorepo layout and the shared contract package
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [005, 007]
---

# Monorepo layout and the shared contract package

Part of [the map](../map.md)

## Question

Settle the repo structure once the contracts it carries are known.

- Confirm the package split. Proposed four, against the operator's three:
  - `retell` — prompt and function schemas as versioned config, not runtime code
  - `extension` — the Shopify theme app extension and widget
  - `backend` — the service RetellAI's custom functions call
  - `contracts` — action vocabulary, `PageContext`, function schemas, shared types,
    imported by all three
  Is the fourth package earning its place, or is it premature?
- Does the RetellAI function schema generate from `contracts`, or is it hand-kept in sync?
  Drift here is a silent production failure.
- Tooling: package manager, workspace tool, build, TypeScript config strategy.
- How the `retell` package deploys to the RetellAI dashboard, given the existing repo
  already pipes to it (facts from ticket 003).
- Local development loop: how is the widget exercised against a real store page?
- Where the spec lands, and the deployment target for the backend.

Expected output: the package list with each one's responsibility, the dependency
direction, and the toolchain.

## Resolution

**One repo, five packages, and a contract that generates every form of itself.**

### The shape

```
wayfinder/                        (pnpm workspaces, TypeScript throughout)
├── packages/
│   ├── contracts/     Zod schemas: action vocabulary, PageContext, Action
│   │                  Envelope, Session Seed. Depends on nothing.
│   │                  Generates: TS types, functions.json, Liquid emitters.
│   ├── backend/       Retell tool webhooks, Action Envelope socket,
│   │                  Catalogue Index + Digest, Session/transcript store.
│   ├── widget/        Voice UI, Retell browser SDK, Action execution,
│   │                  Preview Panel, handoff beacon.
│   ├── retell/        Layered prompt markdown + generated functions.json.
│   │                  Deploys via llm.update in CI.
│   └── theme/         The Dawn-structured theme. Page Context + Action
│                      Target emitters. Deploys via shopify theme push.
└── docs/
    ├── spec/          The architecture spec (this map's destination).
    ├── adr/           Decisions.
    └── wayfinder/     The map and its tickets — the reasoning record.
```

Dependency direction: everything points at `contracts`; `contracts` points at nothing.
`theme` consumes `widget`'s build output and `contracts`' generated Liquid but imports
neither as code — generation is the only bridge Liquid can cross.

### Why one repo, and the constraint that nearly forbade it

Ticket 007 produced an action vocabulary **three parties must agree on at once**: the Retell
function schema declares it, the backend validates it, the widget executes it. The prior art
shows the failure mode of maintaining that agreement by hand — nine tools across three
repos, unversioned routes, contracts living as prose in a `docs/` folder. A shared contract
only works if changing it is a single commit, which means a single repo.

The obstacle was the theme. Shopify's Admin "Connect to GitHub" integration syncs a branch
whose **root is the theme**, which a monorepo by definition has not got. That constraint
was accepted, then **dropped**: the integration's real value is two-way sync, carrying
merchant theme-editor edits back into the repo, and there is no merchant here. One operator,
a dev store, a theme written in VS Code. The constraint was being paid for a benefit never
consumed.

### Deployment inverts

**The GitHub integration is disconnected.** Instead of Shopify pulling from GitHub, CI
pushes to Shopify with the Shopify CLI, authenticated by a Theme Access password held as a
GitHub secret. Three jobs on push to `main`: deploy backend, `shopify theme push`,
`llm.update`.

The theme job is the interesting one: build the widget bundle → generate Liquid emitters
from `contracts` → run ticket 007's Action Target check → write output into
`packages/theme/assets/` → push. Generated artifacts are never committed, because the deploy
is a push rather than a commit.

**Cost, accepted:** no backward path from Admin, so theme-editor edits are silently
overwritten on next deploy. Standing rule — *the theme is code; edit it in VS Code, never in
Admin*, and section configuration changes are made in the JSON template files. Cheap on a
single-operator dev store; **unacceptable on a live merchant store**, so this reverses if
the destination is ever redrawn.

**Benefit, and the real reason to switch:** `shopify theme dev` serves the real store —
real products, real cart — from the working copy with hot reload. The feedback loop for a
widget tweak goes from *commit → push → wait for Shopify's pull* to *save → look*. For work
this visual and this iterative, that compounds.

### Contracts generate, they do not mirror

`contracts` authors **Zod schemas** and nothing else. From them: TypeScript types for
backend and widget, JSON Schema for Retell's `functions.json`, Liquid emitter snippets for
the theme, and runtime validation at both ends — all from one definition, so the type, the
wire format, and the thing Retell is told are provably one object. Hand-keeping any of these
in sync was rejected outright: silent drift between a tool schema and the route implementing
it is precisely the prior art's failure.

The Liquid seam is the subtle one. Tickets 005 and 007 put Page Context and Action Target
emission in Liquid, which cannot import a type. So the emitter snippets are **generated and
rendered**, with theme sections calling `{% render %}` on them, and widget-side runtime
validation as the net. One CI job emits bundle and snippets together, so they cannot
disagree.

### Smaller settlements

- **Route versioning**: HTTP routes stay **unversioned** — one repo deploys everything at
  once, so there is no skew to manage. The Action Envelope **socket carries a protocol
  version in its handshake**, because a shopper can hold an open socket across a deploy;
  that is the one place skew genuinely exists, and a stale widget should be rejected cleanly
  rather than misread.
- **The `retell` package** keeps the prior art's shape — layered prompt markdown
  concatenated in fixed order, CI sync via `llm.update` — but the tools half is generated
  from `contracts` instead of hand-written. Answered narrowly; the wider reuse question
  stays with ticket 010.
- **The spec lands in `docs/spec/`**, assembled from the closed tickets once the map is
  done. The tickets record *why*, in thinking order, with rejected options attached; a build
  agent needs *what*, organised by component. Same content, different cut — the tickets
  remain the reasoning record.
- **Backend deployment target** is ticket 011's, not this one's.

Recorded as [ADR-0002](../../adr/0002-single-repo-with-generated-contracts.md).


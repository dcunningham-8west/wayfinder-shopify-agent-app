# Monorepo

One repository, five packages. Decided in
[ADR-0002](./adr/0002-single-repo-with-generated-contracts.md) and
[ticket 008](./wayfinder/tickets/008-monorepo-layout-and-shared-contract-package.md).

## The rule

> **Everything depends on `contracts`. `contracts` depends on nothing.**

The dependency graph is a star, not a web. The one shared vocabulary is authored once, as Zod
schemas, and everything else is generated from it or validated against it.

```
          ┌──────────────┐
          │  contracts   │  ← Zod schemas; no dependencies
          └──────┬───────┘
     ┌───────┬───┴───┬────────┐
  backend  widget  retell   theme
```

## Packages

| Package | Status | What it is |
| --- | --- | --- |
| [`packages/contracts`](../packages/contracts) | scaffolded | Zod schemas for Page Context, the Action vocabulary, tool args/results, and the Session Seed |
| [`packages/backend`](../packages/backend) | scaffolded | Fastify server: tool webhooks, Action Envelope socket, Session State, Catalogue Index |
| `packages/widget` | not started | In-page client: Retell SDK, Standby/wake, Page Context observer, Action execution |
| `packages/retell` | not started | Agent configuration and prompt files, versioned as code |
| [`packages/theme`](../packages/theme) | existing | The Shopify theme. Emits Page Context and the Action Target registry in Liquid |

`packages/theme` has no `package.json`, so the root `workspaces` array lists packages
explicitly rather than globbing `packages/*`.

## Why one repo

Three things only work because the theme and the contract ship together:

- **Build-time Action Target assertion** — every target id the contract declares is still
  emitted in the Liquid ([section 06](./spec/06-tools-and-actions.md)). Across two repos this
  check cannot exist, and breakage is found by a shopper instead.
- **Page Context emitters** stay in step with the schema that parses them
  ([section 04](./spec/04-page-context.md)).
- **Tool definitions** reach Retell from the same source the backend validates against, so
  the agent cannot be offered a tool the backend does not implement.

## Generated from `contracts`

Authored once as Zod; emitted as:

- TypeScript types for the backend and widget
- Retell `functions.json` tool definitions
- Liquid emitter snippets for the theme
- Tool-facing prompt text

**Generated output is committed**, so a checkout builds without a generation step and a drift
shows up as a diff in review.

## Commands

Run from the repo root:

```
npm install
npm run build        # contracts first, then backend — order comes from the workspaces array
```

Render builds the same way: `npm ci && npm run build`, started with
`npm start --workspace packages/backend`. Root Directory stays **blank** — building inside a
package fails without the root lockfile and hoisted `node_modules`.

## Conventions

- Node >= 22, TypeScript 5.7, strict, `NodeNext` ESM — so intra-package imports carry a `.js`
  extension.
- No `dotenv`. Node 22 loads `--env-file`. `.env.example` holds keys, `.env` holds values and
  is gitignored.
- On Windows, PowerShell's execution policy blocks `npm.ps1` — use `npm.cmd`.

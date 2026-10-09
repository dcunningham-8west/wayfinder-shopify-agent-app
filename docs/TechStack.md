# Tech Stack

Choices and their reasons. Where a choice is load-bearing, the reason is recorded — a stack
entry without a reason is the first thing to get swapped out by accident.

## At a glance

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript 5.7, strict | `NodeNext` ESM, `noUncheckedIndexedAccess` |
| Runtime | Node >= 22 | Native `--env-file` and `--watch`; no `dotenv`, no `nodemon` |
| Package management | npm workspaces | Explicit `workspaces` array, not `packages/*` |
| Schemas | Zod 3 | Single source for types, tool definitions and runtime validation |
| Server | Fastify 5 | HTTP tool webhooks + the Action WebSocket in one process |
| Hosting | Render, Starter tier, US-East | **One warm process.** See below |
| Voice | RetellAI, SDK v3 | Retell's own LLM, not Custom LLM. v2 is EOL 2026-10-18 |
| Catalogue | In-memory embedding index | 52 products; rebuilt on Shopify webhooks |
| Commerce | Shopify Admin API (read-only) + Ajax Cart API (browser) | The backend never writes to Shopify |
| Storefront | Shopify theme, Dawn-structured | Jo Malone Candle Theme 1.0.0 |

Full deployment and credential detail: [spec section 08](./spec/08-deployment-and-operations.md).

## The load-bearing choices

**One warm process.** The Catalogue Index lives in memory, and so does Session State
([ticket 014](./wayfinder/tickets/014-data-retention-and-residency.md) — the backend stores
nothing at rest). That single fact rules out serverless and edge hosting. It is ruled out **by
state, not by sockets**; WebSockets are servable at the edge.

**Starter tier, not free.** Free-tier cold start is tens of seconds — which in a voice product
is tens of seconds of *silence*. Must be upgraded before any voice test.

**US-East.** Counting only the hops inside a voice turn, Retell runs entirely on US-based AWS,
and Shopify's Admin API is US-hosted. Co-locating with the frequent hop beats co-locating with
the rare one, even though the demo audience is European.

**Retell's own LLM, not Custom LLM.** Custom LLM would put a websocket round trip on every
turn. The cost is that prompt and tool config live in Retell's configuration rather than our
code — which is why `packages/retell` versions them as files
([spec section 07](./spec/07-retell-agent.md)).

**Zod, not hand-written types.** The schema is the contract: it generates TypeScript types,
Retell's `functions.json`, Liquid emitter snippets and tool-facing prompt text. Hand-written
types would let the four drift apart silently.

**Cart writes in the browser.** The cart cookie and the theme's cart-drawer re-render both live
in the page; writing server-side via the cart token means reimplementing both.

## Deliberately absent

| Not used | Because |
| --- | --- |
| A database | Nothing is stored at rest. 30-minute idle TTL on an in-process `Map` |
| `dotenv` | Node 22 loads `--env-file` natively |
| A bundler, for now | The widget will need one; nothing else does yet |
| An ORM, a queue, a cache | No persistence to map, no jobs to queue, nothing slow enough to cache |
| Shopify app framework / app embed | An embed cannot see inside a section's render scope, which Page Context needs ([spec section 04](./spec/04-page-context.md)) |

Each absence is a decision, not an omission. Adding any of them should be an ADR.

## Local development

```
npm install
npm run build
npm run dev --workspace packages/backend
```

On Windows, PowerShell's execution policy blocks `npm.ps1` — use `npm.cmd`.

---
title: Deployment and operations
---

# 08 — Deployment and operations

Part of [the spec](./README.md). Decided in
[ticket 011](../wayfinder/tickets/011-backend-hosting-and-cold-start-floor.md) and
[ADR-0002](../adr/0002-single-repo-with-generated-contracts.md).

## Hosting

**Render Starter tier, one service, US-East.** A new service on a fresh URL; the prior
free-tier service stays untouched as the rollback-to-demo fallback.

### Why paid, specifically

Not cost optimisation — the free tier is **disqualified**.

Free services spin down after idle and cold-start in tens of seconds. Because `timeout_ms` is
configurable up to 600 s ([section 07](./07-retell-agent.md)), a cold start is not a clean
error — it is tens of seconds of a shopper hearing **silence**, which is worse.

**Standby makes this worse, not better.** Most navigations open no Call Leg at all
([section 03](./03-session-lifecycle.md)), so the service idles *more* of the time by design.
The chattiness that would incidentally keep it warm is exactly what ticket 009 removed.

Any evidence that the free tier "worked fine" in prototyping is an artifact of testing: during
a dev session the service is hit constantly, so the developer is always their own warm-up
request. The cold start lands on the first shopper after an idle gap.

### Why not serverless or edge

Ruled out **by state, not by sockets**. WebSockets are servable at the edge; the
**in-memory Catalogue Index** is the disqualifier.

- Scale-to-zero rebuilds the Index on every cold start.
- Scale-out holds N divergent copies of Session State.

The design wants exactly **one warm process**. That is a persistent container.

### Region: US-East

Retell runs its core services and voice infrastructure **entirely on US-based AWS**, with no
European presence. The demo audience is in Europe.

Counting only hops inside a voice turn:

| Path | US-East backend | EU-West backend |
| --- | --- | --- |
| Tool-only call (search, live facts) | **~40 ms** | ~180 ms |
| Action call (cart write, filter) | ~220 ms | ~200 ms |

Actions are a wash — the Atlantic is crossed exactly once whichever side the backend sits on.
Tool-only calls are the asymmetric case **and the common one**, since catalogue search and
live facts involve no browser leg. EU-West would make the common path ~4× worse to win ~20 ms
on the rarer one. Shopify's Admin API being US-hosted pushes the same way.

### Latency floor

**~40 ms** backend round trip for a tool-only call; **~220 ms** for an Action. Excludes
backend work and any Shopify API call.

Shopper-perceived turn latency adds Retell's own `e2e` on top, which explicitly excludes the
Retell→browser hop. The latency budget is built on this floor
([section 09](./09-open-questions.md), item A4).

## One service, not split

Tool webhooks and the Action WebSocket share Session State, the transcript, and the Index.
Splitting inserts a network hop between things that must agree, for no gain at this scale.

Revisit only if the Index outgrows one process.

## Theme deployment

| Direction | Mechanism |
| --- | --- |
| Into the repo | `shopify theme pull --path packages/theme` (once, at setup) |
| Out of the repo | CI, via Shopify CLI |
| Development loop | `shopify theme dev` |

**The Shopify↔GitHub integration must stay disconnected.** It expects the theme at the repo
root, cannot address `packages/theme`, and fights CI for ownership of the same files.

Accepted cost: Admin's theme code editor is no longer authoritative — CI overwrites it. Admin
remains the source of truth for **content** (products, collections, pages, menus).

## Credentials

### Shopify Admin API — legacy custom app

Read-only: `read_products`, `read_inventory`. The backend never writes to Shopify; cart writes
happen in the browser ([section 06](./06-tools-and-actions.md)).

**Created as a legacy custom app, deliberately.** This is a documented debt, so the reasoning
matters:

Shopify retired new legacy custom apps on 2026-01-01, directing developers to the Dev
Dashboard. That path was attempted first and **does not fit a headless backend**: it issues
short-lived **online** user tokens (`shpua_`, ~24 h) rather than offline app tokens
(`shpat_`, non-expiring). The Dev Dashboard is built around embedded apps acting on behalf of
a logged-in merchant. A backend service has no logged-in user.

A manual OAuth exchange was also attempted and yielded `shpua_` — confirming the access mode
is a property of the app, not the request.

**Consequences, recorded rather than discovered later:**

- Legacy custom apps are **disabled once a store is transferred to a merchant**. This store is
  a Partner-owned development store, so the restriction does not currently bite.
- If this work moves to a client's real store, **the credential must be rebuilt** on whatever
  the supported path is then. That is a migration task, not a surprise.
- A token with a `shpua_` prefix is the wrong one. It will work for a day and then fail with
  401s — a failure mode that looks fine right up until it doesn't.

### Where secrets live

The distinction that matters: **GitHub secrets are for what CI does; Render env vars are for
what the running service does.** An Admin token in GitHub secrets never reaches the backend at
runtime.

| Secret | Lives in | Why |
| --- | --- | --- |
| `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_STORE_DOMAIN` | **Render env vars** | Needed at runtime |
| `RETELL_WEBHOOK_SECRET` | **Render env vars** | Verifies the tool webhook ([ticket 012](../wayfinder/tickets/012-security-of-the-mutation-surface.md)) |
| `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_LLM_ID` | **GitHub secrets** | CI pushes prompts via `llm.update` |
| Shopify CLI theme token | **GitHub secrets** | CI pushes the theme |
| All of the above | **Local `.env`**, gitignored | Development |
| Storefront password | **Operator only** | Never needed by code |

`.gitignore` must cover `.env` and `.shopify/` **before** the theme is first pulled. A leaked
token is only truly fixed by rotation.

## Webhooks

The Catalogue Index rebuilds on **Shopify product webhooks**, with a periodic poll as a safety
net ([section 05](./05-catalogue.md)). Webhook API version: **2026-10**.

## Cost model

~**$0.55 per engaged session** — roughly a 4× reduction against per-navigation reconnect,
achieved by Standby plus the 4,000-token Seed budget keeping per-leg cost flat.

Guards: 2 s settle delay before opening a leg, ~5 s floor between leg creations, 45 s idle
timeout. These protect the 10 s billing minimum and Retell's undocumented `create-web-call`
rate limit.

## Target environment

| | |
| --- | --- |
| Store | `wayfinder-voice-bot-store.myshopify.com` (Shopify development store) |
| Theme | Jo Malone Candle Theme 1.0.0 — Shopify generated-data, **Dawn-structured** |
| Catalogue | 52 products, 57 variants, £28–£525 |
| Backend | Render Starter, US-East, new URL |
| Voice | RetellAI, new agent + LLM, SDK v3 |
| Shoppers | Europe |

Supersedes [ticket 003](../wayfinder/tickets/003-gather-existing-retellai-assets-and-store-access.md)'s
store facts, which described the now-frozen prior store.

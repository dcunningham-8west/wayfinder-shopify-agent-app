# ADR-0002: Single repo with generated contracts, and CLI-pushed theme deploys

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** operator, via
  [ticket 008](../wayfinder/tickets/008-monorepo-layout-and-shared-contract-package.md)

## Context

The action vocabulary settled in
[ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md) must
be agreed on by three parties at once: the RetellAI function schema declares it, the backend
validates it, the widget executes it. The Page Context from
[ticket 005](../wayfinder/tickets/005-page-context-extraction-strategy.md) adds a fourth
party — Liquid in the theme, which produces the contract but cannot import a type.

The prior art shows what hand-maintained agreement costs: nine tools across three repos,
unversioned routes, and canonical contracts kept as prose in a `docs/` folder
([ticket 003](../wayfinder/tickets/003-gather-existing-retellai-assets-and-store-access.md)).
Drift between a declared tool schema and the route implementing it is a silent production
failure.

A shared contract only pays off if changing it is a single commit. That argues for one repo.
Against it stood a hard Shopify constraint: the Admin "Connect to GitHub" integration — how
the store is currently wired — syncs a branch whose **root is the theme**, which a monorepo
by definition has not got.

## Decision

**One repo.** Five packages: `contracts`, `backend`, `widget`, `retell`, `theme`.
Everything depends on `contracts`; `contracts` depends on nothing.

`contracts` authors **Zod schemas and nothing else**, generating every other form of itself:
TypeScript types for backend and widget, JSON Schema for Retell's `functions.json`, Liquid
emitter snippets for the theme, and runtime validation at both ends. Generation is the only
bridge Liquid can cross, so the emitters that produce Page Context and Action Targets are
generated and `{% render %}`ed rather than hand-written.

To get the theme into the repo, the **GitHub integration is disconnected** and deploys
invert: CI pushes to Shopify with the Shopify CLI, authenticated by a Theme Access password
held as a GitHub secret, rather than Shopify pulling from GitHub.

Consequent rule: **the theme is code; edit it in VS Code, never in Shopify Admin.** Section
configuration changes are made in the JSON template files.

## Alternatives considered

### Three repos plus a shared package (rejected)

Keep the prior art's split and publish `contracts` as a versioned library each repo depends
on. Rejected because it makes changing one argument name a publish-and-bump across three
repos, and because generation across a repo boundary means committing generated artifacts
into repos that do not own them. The cost lands on exactly the operation the contract exists
to make cheap.

### A runtime mediator service (rejected)

An early framing imagined a fourth service the others communicate through. Rejected: it adds
a network hop inside the shopper's conversational pause, where
[ticket 011](../wayfinder/tickets/011-backend-hosting-and-cold-start-floor.md) is already
fighting for milliseconds, and it does not address the actual problem. Three codebases
disagreeing about what `add_to_cart` takes is a types problem, not a traffic problem.

### Keep the GitHub integration, theme stays its own repo (rejected)

Viable, and the shape this ticket first proposed: the monorepo holds everything typed, the
theme repo stays Shopify-connected and becomes a publish target, with CI committing the
widget bundle and generated Liquid into it. Rejected once the integration's value was
examined — its distinguishing feature is **two-way** sync, carrying merchant theme-editor
edits back to the branch, and there is no merchant. One operator, a dev store, a theme
written in an editor. The constraint was being paid for a benefit never consumed.

## Consequences

- Admin theme-editor edits have no path back and are overwritten on next deploy. Acceptable
  for a single-operator dev store; **unacceptable on a live merchant store**, so this
  reverses if the destination is redrawn to include merchant-owned themes.
- `shopify theme dev` becomes the development loop: the real store, real cart, hot reload
  from the working copy. The feedback cycle for a widget change drops from a commit-and-wait
  to a save.
- Deploys are three CI jobs on push to `main` — backend, `shopify theme push`, `llm.update`.
  Because they ship together, HTTP routes need no versioning; only the Action Envelope
  socket carries a protocol version, since a shopper can hold one open across a deploy.

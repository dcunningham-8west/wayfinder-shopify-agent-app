# ADR-0003: esbuild for the widget bundle, output into the theme

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** operator

## Context

[TechStack](../TechStack.md) listed a bundler under **Deliberately absent**, with the note that
the widget would eventually need one and that adding it should be an ADR. The widget now exists,
so this is that ADR.

Three constraints shape the choice, and none of them are about build speed:

- **The voice SDK is large and usually unused.** `retell-client-js-sdk` is only needed once a
  shopper clicks to start. Most page views never do, so the SDK must be a separate chunk loaded
  on demand, not part of the first-paint payload.
- **The asset must be served by Shopify, not by us.** The widget is theme-integrated
  ([ADR-0002](./0002-single-repo-with-generated-contracts.md)); putting a third-party CDN in
  front of the code that requests the microphone adds a failure mode and a DNS lookup to the
  one interaction the product exists for.
- **There is no app to dev-server.** The development loop is `shopify theme dev`, which serves
  the theme. A bundler's dev server has nothing to serve here, so HMR and the module graph
  niceties are worth nothing to us.

## Decision

**esbuild, invoked from a 24-line [`build.mjs`](../../packages/widget/build.mjs), no framework
around it.** Code splitting on, ESM output, `es2022`, minified, sourcemapped.

**Output lands in `packages/theme/assets/`.** The bundle is built by CI immediately before the
Shopify CLI push, so the widget and the theme ship as one deploy and the asset Shopify serves
always matches the source in that commit. It is **not committed**: a generated file tracked in
git drifts from its source the first time someone pushes without building.

Shopify's CDN then serves it from the storefront's own origin — which the mic permission model
requires anyway ([ADR-0001](./0001-reconnect-with-replay-voice-continuity.md): silent resume
depends on the per-origin grant).

Splitting is the load-bearing setting, not an optimisation: `wayfinder-widget.js` is the
always-loaded shell, and the voice SDK lands in a hashed `wayfinder-voice-*.js` chunk pulled in
by dynamic import at click time.

`--watch` mode exists so the widget rebuilds alongside `shopify theme dev`.

## Alternatives considered

### Vite (rejected)

The default reflex, and it would work. Rejected because everything Vite adds over esbuild is for
an application with an HTML entry point and a dev server — neither of which exists here. It uses
Rollup for production builds, so the output would differ from what the dev server runs, and the
config to suppress the HTML handling and emit a bare library bundle is longer than the esbuild
script it replaces.

### No bundler, plain ES modules in the theme (rejected)

Shopify can serve ES modules, so hand-written `import` statements would technically run.
Rejected because the widget imports `@wayfinder/contracts` and `retell-client-js-sdk` from
`node_modules`, which the browser cannot resolve, and because TypeScript is not optional here:
the contract types are the whole point of `contracts`.

### Shopify's own asset pipeline (rejected)

Shopify compiles nothing. `{{ 'file.js' | asset_url }}` serves what you upload. There is no
pipeline to use.

## Consequences

- `packages/theme/assets/wayfinder-*.js` is **generated and gitignored**. Edit
  `packages/widget/src/`, never the asset. A theme push that skipped the widget build ships a
  theme with no widget in it, so the push lives in a workflow that always builds first.
- Chunk filenames are content-hashed, so stale chunks accumulate in `assets/` and want an
  occasional clean.
- The 10 KB suggested asset budget is exceeded. It is a suggestion, and the split keeps the
  always-loaded half small.
- If the widget ever grows a framework with its own build requirements, revisit — but that would
  be a bigger decision than the bundler.

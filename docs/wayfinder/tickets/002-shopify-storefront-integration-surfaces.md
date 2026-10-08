---
id: 002
title: Shopify storefront integration surfaces
type: research
mode: AFK
state: closed
assignee: agent
blocked_by: []
---

# Shopify storefront integration surfaces

Part of [the map](../map.md)

## Question

What are the supported ways to put our widget on every storefront page, read the page, read
the catalogue, and mutate the cart — and what are the constraints on each?

1. **Widget injection.** Theme app extension app-embed block: does it reliably render on
   every template, and how is checkout excluded? What are the alternatives (script tag,
   theme edit) and why would we pick one over app-embed?
2. **Sandboxing.** Does an app embed run with full DOM access to the host page, or is it
   constrained? This decides whether direct DOM driving is even possible.
3. **Catalogue reads.** Storefront API vs the Storefront MCP server: what each exposes,
   auth model, rate limits, and whether MCP is production-ready for a single store. Does
   either support semantic/fuzzy product search, or only structured filters?
4. **Cart.** The AJAX Cart API vs Storefront API cart mutations: which one shares the
   shopper's existing browser cart token, so our writes merge into the cart they already
   have rather than creating a second one.
5. **Page metadata available client-side.** Template/page type, current product or
   collection JSON, `ShopifyAnalytics` / `meta` objects — what is reliably present on a
   standard Dawn-derived theme, and what is theme-dependent.
6. **Navigation.** What Shopify themes do on navigation (full page load vs any built-in
   soft navigation), since the widget reconnects per page.

Prefer Shopify's own developer documentation. Record findings with links; flag inference.

## Resolution

Full findings: [shopify-storefront-integration-surfaces.md](../research/shopify-storefront-integration-surfaces.md)

1. **App embed block is the only real option.** Injects into the host document, works on
   vintage and OS 2.0, scoped by `enabled_on` / `disabled_on`. Checkout exclusion is
   platform-enforced. Script tags are deprecated (dead 2027-03-01); theme code edits break
   the upgrade path.
2. **No sandbox.** Plain first-party JS in the storefront document, so full DOM driving is
   possible. But Shopify now ships `window.Shopify.actions` and `shopify:` events as the
   sanctioned replacement for DOM and fetch hacking.
3. **Catalogue**: Storefront MCP has been removed, replaced by UCP Storefront Catalog MCP
   at `/api/ucp/mcp` (free-text query + intent, needs a hosted agent profile). Storefront
   GraphQL remains, tokenless or tokened. Predictive Search is a free, same-origin,
   typo-tolerant lexical option. Whether UCP is semantic is unconfirmed.
4. **Cart**: the Ajax Cart API owns the shopper's session cart and merges on `add.js`;
   prefer `Shopify.actions.updateCart` so the theme refreshes its own UI. The Storefront
   API cart and UCP Cart MCP are *separate* carts — never use them for in-session writes.
5. **Page metadata**: reliable are `window.Shopify.routes.root`, `Shopify.actions`,
   `shopify-section-*` wrappers, the Section Rendering API, and `shopify-features`.
   `shopify:page:view` is theme-dispatched, so not guaranteed. `meta` / `ShopifyAnalytics`
   come from `content_for_header`, which Shopify says not to parse. Dawn's own JSON script
   tags went unconfirmed — the repo index was unreachable.
6. **Navigation**: multi-page, fresh document per navigation, no soft nav. Shopify injects
   speculation rules, so a prerender may boot the widget on a page never visited.

### Consequences for the map

- Drop Storefront MCP in favour of UCP; re-scope ticket 006 accordingly.
- Cart writes go through the Ajax Cart API / `Shopify.actions.updateCart` only.
- Lead with `Shopify.actions` and `shopify:` events; keep raw DOM driving as the fallback.
  This softens ticket 007's boundary question into "when do we fall back".
- Guard on `document.prerendering` so prerender does not start a billed call.
- 10 KB suggested JS budget for the embed means a thin loader, not the whole widget.

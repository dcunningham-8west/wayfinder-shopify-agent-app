---
id: 003
title: Gather existing RetellAI assets and store access
type: task
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Gather existing RetellAI assets and store access

Part of [the map](../map.md)

## Question

Nothing to decide — later tickets are blocked until these facts and credentials exist.
Checklist for the operator:

- [ ] URL of the GitHub repo holding the existing RetellAI prompt + function set, and
      whether this agent can read it.
- [ ] Note how that repo pipes to/from the RetellAI dashboard (direction, trigger, tooling).
- [ ] Confirm the Shopify store: URL, theme name, and whether it is Dawn-derived.
- [ ] Confirm a development store or theme preview exists for safe prototyping.
- [ ] Record where RetellAI and Shopify credentials live (location only — never the values).

## Resolution

All three existing repos are readable by this agent (verified by clone). The prior build
is a **three-repo system**, not a single Retell asset set.

### Repos

| Role | Repo | Owns |
| --- | --- | --- |
| Retell agent | `dcunningham-8west/shopify-mcp-ui-agent` | layered prompts `prompts/00_identity..07_dom_guidance.md`, tool artifact `tools/functions.json`, sync script |
| Backend | `dcunningham-8west/retell-voice-backend` | tool runtime, canonical contracts in `docs/contracts/` (`retell-tools.md`, `http-api.md`) |
| Storefront | `dcunningham-8west/shopify-voice-bot-store` | the theme itself, agent UI, Retell browser client, session handoff, SSE consumption |

### Repo → RetellAI pipeline (one-way)

Push to `main` touching `prompts/**`, `tools/**`, `scripts/**`, or `package.json` fires
`.github/workflows/deploy-prompt.yml`, which runs `scripts/sync-agent.js`: concatenates the
eight prompt files in fixed order with `---` separators, loads `tools/functions.json`, and
calls `retell-sdk` v3 `llm.update(RETELL_LLM_ID, { general_prompt, general_tools })`.
Nothing reads back from the dashboard. The agent was created blank in the dashboard; its
agent and LLM ids are pinned as secrets, not discovered.

### Existing tool surface (9 custom tools)

All POST to `https://retell-voice-backend.onrender.com/api/shopify/*`:
`search_shop_catalog`, `get_product_details`, `search_shop_policies_and_faqs`, `get_cart`,
`update_cart`, `show_product_preview`, `navigate_to_page`, `get_collection_products`,
`interact_with_page`. Backend routes are unversioned. `get_collection_products` carries a
5s Retell timeout against a ~2s backend bound.

### Storefront prior art

`assets/` holds **three generations** of the widget — `mcp-agent-*`, `agent-app-*`,
`voice-bot-agent-*` — each as `loader` / `retell` / `session` / `ui`. Its `CONTEXT.md`
already describes the continuity model the map assumes: handoff written to `sessionStorage`
under `8west:agent-handoff` on navigate/unload, voice resuming as a **fresh call seeded with
prior transcript**, plus a `/api/create-call` + `/api/events` (SSE) pair.

### Store

> **Superseded by [ticket 010](./010-prior-art-reuse-boundary.md).** A new dev store is
> created instead; this one stays frozen as the fallback assistant. The theme facts below
> still hold, since the new store uses the same generated-data baseline.

- `https://voice-bot-store.myshopify.com/` — Shopify **development store**; no live store
  exists, so it is simultaneously the prototyping surface. No separate dev store or theme
  preview needed.
- Theme: `theme_info.theme_name` is `Generated Data Theme`, author Shopify, from Shopify's
  generated-data dev-store tooling. Not labelled Dawn, but the file layout is Dawn's
  (`snippets/card-product.liquid`, `cart-drawer.liquid`, `buy-buttons.liquid`; 55 sections),
  so **treat it as Dawn-structured** for selector and section reasoning.

### Credentials

- RetellAI: GitHub Actions secrets on the agent repo — `RETELL_API_KEY`,
  `RETELL_AGENT_ID`, `RETELL_LLM_ID`. Local runs read the same names from `.env`.
- Shopify: the dev store's single storefront password, held by the operator only. Not
  needed by this agent and deliberately not recorded anywhere. If a session ever needs it,
  the operator types it directly into the terminal.

### Consequences for the map

- "Fresh agent is acceptable" still holds, but the prompt layering, tool vocabulary, and
  sync pipeline are reusable prior art rather than reference-only curiosities.
- The backend's canonical contracts are readable, so tickets on catalogue query and action
  vocabulary can cite them instead of inventing a surface.
- Three generations of widget assets means the storefront repo encodes abandoned
  approaches; later tickets should check `docs/known-failures.md` in the agent repo before
  re-proposing one.

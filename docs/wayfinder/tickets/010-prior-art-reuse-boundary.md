---
id: 010
title: Prior-art reuse boundary across the three existing repos
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: [006, 007, 008]
---

# Prior-art reuse boundary across the three existing repos

Part of [the map](../map.md)

## Question

[Ticket 003](./003-gather-existing-retellai-assets-and-store-access.md) found a working
three-repo system: `shopify-mcp-ui-agent` (layered prompts, 9-tool artifact, one-way sync
to Retell), `retell-voice-backend` (tool runtime, canonical contracts), and
`shopify-voice-bot-store` (theme plus three generations of widget assets).

The map's charting assumption was "existing Retell agent assets are reference only, a fresh
agent is acceptable." That assumption predates knowing the prior art is this complete.

**Since narrowed.** The operator has settled the entity-level question: new agent, new tool
set from scratch, new backend service, with the existing stack frozen untouched as a
fallback. Nothing in the prior art is load-bearing. So this ticket is no longer "what do we
keep running" but **which prior-art patterns are worth porting into a from-scratch design**:

- The layered-prompt-file + `functions.json` + CI-sync pipeline as a *shape*: is that the
  right authoring model for the new RetellAI config package, or is there something better?
- The 9 existing tools as a *starting vocabulary*: which of those cuts survived contact with
  real use, and which were the wrong seam? The operator explicitly does not assume they are
  optimal.
- The three widget generations: what did the earlier two fail at, and does
  `docs/known-failures.md` in the agent repo already answer that?
- The handoff and SSE design in the storefront `CONTEXT.md`: port, or redesign?

Blocked on the catalogue, action-vocabulary, and monorepo-layout decisions, because what is
worth porting is only judgeable once the target shape is known.

## Resolution

**One file ports. Everything else is reference.**

All three repos were re-cloned and read. The target shape set by tickets 004–009 turned out
to have already decided most of this ticket by implication: once the backend owns the
transcript, `contracts` owns the tool schemas, and the agent is forbidden from touching the
DOM, the prior art has almost no surface left to attach to. The remaining judgement calls
are recorded below.

### The clean sweep

The prior stack stays **frozen and running** as the fallback assistant. Nothing in it is
load-bearing for the new build. New dev store, new Retell agent and LLM, new backend
service on a new URL.

### Evidence found

`docs/known-failures.md` in the agent repo holds **exactly one entry**: general product
language ("what candles do you sell?") routed to `get_collection_products` and left the
voice turn silent for ~10 s. Ticket 006 already deleted that tool and that routing. So the
old stack left essentially no written scar tissue, and the port/redesign split had to be
judged from the code rather than from recorded failures.

### Port / redesign, per pattern

| Prior art | Verdict | Why |
| --- | --- | --- |
| `assets/agent-app.css` (24.3 kb) | **Port** | The only real asset. Genuine visual design work that no ticket has replicated and the map still lists as unspecified. |
| Layered prompts + CI `llm.update` sync | **Port the shape, rewrite the code** | Pipeline shape is right; implementation is a trivial concatenate-and-push against SDK v3. Layering rebuilt (below). |
| `tools/functions.json` as a hand-authored artifact | **Redesign** | Ticket 008 makes `contracts` generate it. |
| 9-tool vocabulary | **Redesign** | Eight are already re-cut by tickets 006/007; the ninth is cut outright (below). |
| `sessionStorage` handoff (`8west:agent-handoff`) | **Redesign** | Ticket 004: backend owns the transcript, browser carries only a session id. The surviving *idea* — fresh call seeded with prior transcript — is already ADR-0001. |
| SSE `/api/events` | **Redesign** | Ticket 007 chose a per-leg WebSocket; Action Results need a return path SSE cannot give. |
| `*-session.js` (~1 kb, all three gens) | **Delete** | Ticket 004 deletes the job it does. |
| `*-retell.js` (23.6 → 10.4 kb across gens) | **Reference** | The shrinkage is the SDK stabilising, not the design improving. Ticket 001 says build on v3 fresh. Keep for gotchas. |
| `*-ui.js` (16.9 kb at v3) | **Reference** | No WebSocket Action executor, no Standby or VAD, no Preview Panel. The new widget's job is mostly what this file never did. |
| `*-loader.js` (1.6 kb) | **Reference** | Trivial script-tag bootstrapping either way. |
| `docs/contracts/` (backend) | **Reference** | Citable prior surface; ticket 008 re-authors contracts as Zod. |

### Prompt authoring model — rebuilt, not ported

Ported straight, the old pipeline would have **two sources feeding one `llm.update` call**:
`general_tools` generated from `contracts`, `general_prompt` hand-written in the `retell`
package. They can drift, and a CI name-check would not catch the drift that actually bit —
prompt guidance describing a seam inaccurately, which is the one recorded failure.

So **tool-facing prompt text is generated from `contracts` too**, authored as prose fields
on the Zod schemas (name, when to use, when not to use, plus the Action vocabulary table).
Tool and guidance are edited in one place; disagreement becomes structurally impossible.

Hand-authored files shrink from eight to **four**, covering only what generation cannot know:

- `identity` — persona, tone, proactivity
- `voice` — barge-in, brevity, how to speak a product
- `guardrails` — refusals, and confirmation-before-mutation, which ticket 007 placed in the
  prompt *only* and is therefore load-bearing
- `continuity` — do not re-greet on a new Call Leg, how to treat replayed turns

Dead outright: `07_dom_guidance` (ticket 007 — the agent never touches the DOM, so there is
nothing to guide), and `01_catalog_guidance` / `02_cart_guidance` / `03_policy_guidance`,
which collapse into generated tool guidance.

### `search_shop_policies_and_faqs` — cut

The orphan tool: ticket 006 is catalogue-only, 007 is actions-only, so nothing covered it.
Judged edge-case and **cut from scope**. Logged risk: "how much is shipping" is a *shopping*
question rather than a policy one and now hits nothing. Tolerable while the Catalogue Digest
carries no prices; reopen if the agent starts stonewalling.

### New dev store

A **new** Shopify development store, not `voice-bot-store.myshopify.com`. Ticket 008
disconnects the Shopify↔GitHub integration and makes the theme a repo package, which would
overwrite the very theme carrying the frozen fallback widget. "Old stack frozen" and "theme
is a repo package" cannot both hold on one store.

Setup stays in the Admin dashboard — the CLI cannot create stores. The single forbidden
Admin action is connecting the GitHub integration. After cutover, Admin remains the source
of truth for *content* (products, collections, pages, menus) while theme *code* moves to the
repo; the Admin code editor stops being authoritative because CI overwrites it.

The operator will hand-build the catalogue from real client product lists rather than take
Shopify's generated filler, which makes ticket 006's Catalogue Digest and semantic index
testable against coherent category structure. **Carry-forward:** ticket 006 assumes ~100
products and says reopen at thousands — record the final count once the store is seeded.


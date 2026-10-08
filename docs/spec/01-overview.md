---
title: Overview and scope
---

# 01 — Overview and scope

Part of [the spec](./README.md).

## What this is

A voice-based AI shopping assistant for **one** Shopify store. A click-to-start widget is
present on every storefront page except checkout. The shopper talks; the assistant answers
questions about the catalogue and about what is on screen, drives the storefront UI, and
reads and writes the shopper's existing cart.

## Fixed constraints

Only two things are given. Everything else was chosen on merit:

- **Shopify** is the storefront.
- **RetellAI** is the voice layer.

Backend language, hosting, data stores, widget architecture, tool vocabulary, and the
continuity mechanism were all decided from scratch. A prior three-repo implementation
exists and is **reference only** — see [ticket 010](../wayfinder/tickets/010-prior-art-reuse-boundary.md).
Exactly one file is carried forward: the v3 widget stylesheet.

## Shape of the system

Four parts, and the boundaries between them are load-bearing:

1. **The theme** emits typed Page Context and an Action Target registry in Liquid at render
   time, and hosts the widget.
2. **The widget** runs in the page: owns the microphone, opens and closes Call Legs,
   executes Actions against the DOM, and talks to the backend.
3. **The backend** owns the Session, the transcript, the Catalogue Index, and every Tool.
   One warm process.
4. **The Retell agent** is the brain: prompt plus a generated tool surface, resolving tool
   calls server-side against the backend.

The single most important rule in the system:

> **A Tool answers. An Action acts. The agent never touches the DOM.**

Every Action executes in the browser against a named Action Target. The agent names target
ids; it never sees a selector and never inspects markup.
See [ticket 007](../wayfinder/tickets/007-storefront-action-vocabulary-and-dom-boundary.md).

## Deliberate non-obvious choices

These look surprising in isolation and are each defended in a ticket:

- **The call does not survive navigation.** Continuity is reconnect-with-replay, not a
  persistent call — Retell exposes no resume primitive.
  [ADR-0001](../adr/0001-reconnect-with-replay-voice-continuity.md)
- **Standby is the resting state.** Most navigations open no Call Leg at all.
  [Ticket 009](../wayfinder/tickets/009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)
- **The page supplies identity; the catalogue supplies facts.** Page Context carries ids and
  handles, never descriptions. This removes name-similarity resolution from the path, which
  is what caused the prior version's hallucinations.
  [Ticket 005](../wayfinder/tickets/005-page-context-extraction-strategy.md)
- **Show, don't recite.** The agent names two or three things, puts them on screen, and
  stops. [Ticket 006](../wayfinder/tickets/006-catalogue-query-strategy.md)
- **The theme is a package in this repo**, not a Shopify↔GitHub-synced repo. The integration
  is deliberately disconnected.
  [ADR-0002](../adr/0002-single-repo-with-generated-contracts.md)

## Out of scope

- Checkout, post-purchase, and customer-account surfaces.
- Policy and FAQ answering. _Cut as edge-case in ticket 010; logged risk is that "how much is
  shipping" now resolves to nothing._
- Multi-tenant distribution, App Store listing, merchant onboarding, billing.
- Order history and personalisation beyond the current Session and cart.
- Always-listening / wake-word activation. Browser-local VAD exists, but only **after** the
  shopper has started a Session with the click-to-start CTA, and audio never leaves the page
  while in Standby.

## Target environment

- **Store:** a new Shopify development store, Dawn-structured theme. The prior store is
  frozen and still runs the old assistant as a fallback.
- **Shoppers:** Europe. Retell is US-only AWS; see
  [section 08](./08-deployment-and-operations.md) for what that costs and
  [section 09](./09-open-questions.md) for the residency question it opens.
- **Catalogue:** hand-built from real client product lists. Scale assumption in
  [section 05](./05-catalogue.md).

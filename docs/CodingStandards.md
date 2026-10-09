# Coding Standards

What a reviewer checks. Formatting is not in here — a formatter settles that. What follows is
the set of things a formatter cannot catch and that this project gets wrong when unwatched.

## The rule

> **Make wrong states unrepresentable, then you do not have to check for them.**

Most of this document is that one idea applied in different places. A rule enforced by prose
is a rule that will be broken; a rule enforced by the type checker or a failing parse is not.

## Types

**Branded ids.** `ProductId` is not assignable to `VariantId`. The prior system's defining bug
was resolving products by name similarity; branding makes the adjacent class of mistake a
compile error rather than a confidently wrong sentence spoken aloud.

**Money is integer minor units.** A float price read aloud is a wrong price.

**Discriminated unions over optional fields.** An Action is one of ten shapes, not one shape
with thirty optional properties. If a field is only meaningful for some variants, it belongs to
those variants.

**No `any`. No non-null `!`.** If a value might be absent, the absence is part of the design —
say so and handle it.

## Schemas

**`.strict()` by default.** Section 04 says Page Context never carries marketing prose. That is
only true if an emitter which adds a `description` **fails to parse** — and it does. Passthrough
objects turn a design rule back into a comment.

**Validate at the boundary, once.** Parse the tool webhook body, the socket message, and the
Liquid-emitted JSON. Do not re-validate the result downstream; inside the boundary the type is
the guarantee.

**`contracts` depends on nothing.** It is the one package every other package imports. An import
in the wrong direction there is a review blocker, not a nit.

## Modules

Follow the [deep-module vocabulary](../.agents/skills/codebase-design/SKILL.md). The short form:

- **Narrow interface, substantial implementation.** A module whose interface is as large as its
  body has not hidden anything.
- **One tool, not several.** The prior system shipped two overlapping catalogue tools and the
  agent mis-routed between them, leaving voice turns silent for ~10 s. Prefer one entry point
  that cannot be chosen wrongly — this applies to our own functions as much as to the agent's.
- **No speculative abstraction.** No helper for a single call site, no interface with one
  implementation, no configuration option nobody has asked for.

## Errors

**Define them out of existence where you can.** An unknown session id starts a fresh Session —
that is a defined state, not an error path ([spec section 08](./spec/08-deployment-and-operations.md)).

**Where you cannot, make them speakable.** Every Action Result failure carries a `reason` the
agent can turn into a sentence. `target_not_found` carries the page epoch so the agent can say
"that one's been filtered out" rather than apologise blindly. **An error the agent cannot
narrate is an error the shopper experiences as silence.**

**No empty catches, no swallowed rejections.** The failure must reach either the shopper or the
log.

## Comments

Write a comment only to state what the code cannot show on its own, and keep it to one line.

Good: *"Render routes to the container's external interface, so 127.0.0.1 would fail its port
scan."* That is a fact about the world.

Bad: restating the next line, explaining a change to the reviewer, or a doc comment on an
obvious function.

Where a constant encodes a decision, the comment points at the decision — `SEED_TOKEN_BUDGET`
says *why* 4,000, not *that* it is 4,000.

## Tests

[Spec section 12](./spec/12-testing.md) is the strategy. For review:

- **Test at the four seams**: tool webhook, Action Envelope, Liquid emission, Session state
  machine. The last touches no I/O and should be tested as a pure function.
- **A scenario per decision.** The seven harness walkthroughs exist because each guards a
  decision that would otherwise regress silently.
- **Do not write tests that pretend to cover conversation quality or latency.** Both are
  explicitly out of scope. A suite claiming them is worse than one that does not.

## Secrets and logs

- Secrets come from the environment. Never committed, never defaulted in code.
- The **Session Token** is never logged and never enters the Seed. The Session Id is public by
  design; do not conflate them.
- **Logs carry no conversation content.** Structured JSON lines to stdout, ids and outcomes only
  ([ticket 014](./wayfinder/tickets/014-data-retention-and-residency.md)).

## Prototypes

Prototype code lives in `docs/wayfinder/prototypes/`, is marked `PROTOTYPE`, and never imports
from `packages/`. It is throwaway by construction. Nothing in `packages/` may import from it.

## Changing a decision

The spec and the [ADRs](./adr/) record *why*, not just *what*. Code that contradicts a recorded
decision is a bug in one of the two — resolve which, and update the loser. Silently diverging
from the spec is the failure mode this repo is organised to prevent.

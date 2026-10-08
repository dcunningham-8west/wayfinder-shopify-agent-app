---
title: Voice shopping assistant — architecture spec
status: draft
---

# Voice shopping assistant — architecture spec

The handoff artefact for build agents. Every section states **what to build**; the
rationale for *why* lives in the ticket each section links to.

## How to read this

- **Terms are defined once**, in [`docs/Glossary.md`](../Glossary.md). This spec uses them
  precisely and does not redefine them. If a word is capitalised — Session, Call Leg,
  Action, Page Context — it is a glossary term with exactly one meaning.
- **Rationale is not repeated here.** Each decision links to the ticket that argued it.
  Before changing a decision, read its ticket: the alternatives were usually considered and
  rejected for recorded reasons.
- **Two ADRs are binding:** [ADR-0001](../adr/0001-reconnect-with-replay-voice-continuity.md)
  (continuity) and [ADR-0002](../adr/0002-single-repo-with-generated-contracts.md) (repo and
  contract generation).
- **Open questions are not hidden.** [Section 09](./09-open-questions.md) lists everything
  still undecided, split into what blocks the build and what the build decides for itself.

## Sections

| # | Section | Covers |
| --- | --- | --- |
| 01 | [Overview and scope](./01-overview.md) | What this is, what it is not, fixed constraints |
| 02 | [Architecture](./02-architecture.md) | The five packages, generation, data flow |
| 03 | [Session lifecycle](./03-session-lifecycle.md) | Session, Call Leg, Standby, Handoff, Seed |
| 04 | [Page context](./04-page-context.md) | Liquid emitters, identity vs facts |
| 05 | [Catalogue](./05-catalogue.md) | Digest, Index, live facts |
| 06 | [Tools and actions](./06-tools-and-actions.md) | The vocabulary and the DOM boundary |
| 07 | [Retell agent](./07-retell-agent.md) | Prompt authoring, sync pipeline, timeouts |
| 08 | [Deployment and operations](./08-deployment-and-operations.md) | Hosting, cost, latency floor |
| 09 | [Open questions](./09-open-questions.md) | What is still undecided, and who decides it |

## Status

Draft. Written from the eleven closed tickets on
[the map](../wayfinder/map.md). Catalogue figures in section 05 are provisional until the
new dev store is seeded.

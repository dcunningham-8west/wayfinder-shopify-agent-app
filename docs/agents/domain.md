# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/Glossary.md`**: the current single-context glossary (currently empty).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If these files don't exist or contain no relevant documentation, proceed silently. Don't flag their absence or suggest creating them upfront; domain docs are created lazily when terms or decisions are resolved.

## File structure

This is a single-context repo:

- Glossary: `docs/Glossary.md`
- ADRs: `docs/adr/`

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term as defined in the glossary. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because..._
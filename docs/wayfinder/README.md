# Wayfinder (local markdown tracker)

GitHub CLI is unavailable on this machine, so the map lives here as markdown.

## Layout

- `map.md` — the map (`wayfinder:map`)
- `tickets/NNN-slug.md` — child tickets of the map

## Ticket front matter

```yaml
---
id: NNN
title: <name>
type: research | prototype | grilling | task
mode: AFK | HITL
state: open | closed
assignee: <name or empty>
blocked_by: [NNN, NNN]
---
```

## Operations

- **Claim**: set `assignee` before any work.
- **Frontier**: tickets with `state: open`, empty `assignee`, and every `blocked_by` entry closed.
- **Resolve**: append a `## Resolution` section to the ticket, set `state: closed`, then add a one-line gist + link to Decisions so far in `map.md`.

---
id: A4
title: Theme avatar setting
state: closed
assignee:
blocked_by: []
---

Spec: [13-avatar.md](../../spec/13-avatar.md), section "Changes per package".

## Build

- `theme/sections/wayfinder-widget.liquid`: an "Enable avatar" checkbox in the schema,
  default off.
- When it is on, set `window.__WAYFINDER__.avatar = true`.
- `widget/config.ts`: read the flag into `WidgetConfig`.

## Done when

- Toggling the setting in the theme editor flips the flag.
- With the flag off, the widget behaves exactly as it does today.

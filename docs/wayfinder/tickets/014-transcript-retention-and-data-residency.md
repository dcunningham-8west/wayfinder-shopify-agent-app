---
id: 014
title: Transcript retention and data residency
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Transcript retention and data residency

Part of [the map](../map.md). Raised as
[spec section 09, item A3](../../spec/09-open-questions.md).

## Question

[Ticket 004](004-session-continuity-model-across-page-loads.md) makes the backend the
**owner of the transcript** — continuity depends on it — and
[ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md) replays
Session State plus the last ~4 turns into every new leg. Nothing yet says where that lives,
for how long, or what else is kept.

Undecided: the store (in-process memory, Redis, Postgres) and what that implies for
restarts and for [ticket 011](011-backend-hosting-and-cold-start-floor.md)'s single Render
service; the retention window for a live Session versus anything kept afterwards; whether
analytics are a separate, longer-lived record from the continuity transcript; and whether
audio is retained at all or only text.

Carries a live edge: the demo audience is European, Retell is **US-only AWS**, and the
backend is US-East, so EU residents' voice and transcripts leave the EEA through two hops
**by design**. That needs a deliberate answer — a disclosure, a retention ceiling, or an
accepted risk written down — not a discovered one.

Architectural because it determines backend storage.

## Resolution

**The backend stores nothing at rest. Retell stores the conversation, on our terms, for 30
days, with PII scrubbed.**

### The research moved the question

Retell's retention surface is far more configurable than assumed, and the controls are
**per-call parameters on `create-web-call`** rather than dashboard settings:

| Fact | Source |
| --- | --- |
| `data_storage_setting`: `everything` / `everything_except_pii` / `basic_attributes_only` | `create-web-call` API |
| `data_storage_retention_days`: 1–730, or `null` | same |
| **Default is `everything`, retained forever** | same |
| `pii_config` auto-redacts 14 PII categories, post-call, originals deleted | Data Storage Settings |
| `DELETE /v2/delete-call/{call_id}` erases a call and its recording | Delete Call API |
| *"We do not currently operate services within the European Union"* | Security and Compliance |
| Recordings in S3 **`us-west-2`** | recording URLs |

The last two are the ones that mattered: the EEA question has a flat, documented answer, and
the storage region contradicts the premise ticket 011 argued US-East from.

### In-process memory, no database

Sessions live in a `Map` in the one warm process ticket 011 already committed to for the
Catalogue Index. No Postgres, no Redis, no disk.

This is the load-bearing simplification, and it dissolves most of the ticket: with nothing
persisted there is **no backend retention policy to write, no backup to leak, and no erasure
request to service**. The backend holds personal data for minutes, in RAM, and never writes it
down. A Session is tab-scoped and dies on tab close regardless, so durability was buying
almost nothing.

Bounds, because memory is finite and a deploy is destructive:

| Bound | Value |
| --- | --- |
| Idle TTL | 30 min |
| Hard cap | 1,000 Sessions, LRU evict |
| Unknown session id | Silently start a fresh Session |

The TTL matters more than the cap at this scale — it is what stops an abandoned tab holding a
transcript for a day. The unknown-id path is a **defined state, not an error**: the widget
clears `sessionStorage` and begins again, so a deploy costs the shopper their history rather
than their call. If memory is the only store, losing it has to be designed for.

Redis later is a contained change; Redis now is infrastructure for a problem that does not
exist at this traffic.

### Retell: `everything_except_pii`, 30 days, all PII categories

Set **explicitly on every Call Leg**. The platform default is keep-everything-forever, and a
parameter that silently falls back to that is the wrong failure direction.

`basic_attributes_only` was rejected despite being the privacy-maximal choice: a voice agent
**cannot be debugged without transcripts**, and "why did it say that?" is the most common
question this system will face pre-demo. The compromise costs nothing, because redaction is
**post-call only** — the live agent still hears "it's a gift for Sarah" normally; only the
stored copy becomes `[person_name 1]`.

All 14 categories enabled. No shopping conversation needs a retained card number, passport or
SSN, and enabling the lot costs one array.

30 days: long enough to investigate any demo that went wrong, short enough that nothing
accumulates.

### Erasure documented, not automated

`DELETE /v2/delete-call/{call_id}` is written into
[section 08](../../spec/08-deployment-and-operations.md) as an operator procedure. Deliberately
not wired to session end — that would destroy the debugging value the 30-day window just
bought. Invited audience, 30-day ceiling: manual is sufficient.

### Analytics are operational, not behavioural

Structured JSON lines to stdout; Render retains 7 days on its own. Zero new infrastructure,
and it answers the questions that will actually arise — is Standby working, are Actions
failing, is the Seed near budget.

**No transcript text and no product-level shopper history.** That is the line between
operations and profiling, and personalization is already out of scope for this effort.

### The EEA transfer: disclosed in one line

Retell is US-only and says so plainly, so EU residents' voice and transcripts leave the EEA
**by design**, through two hops. The answer is proportionate rather than a privacy programme:
the storefront is password-protected and the audience is invited.

- **One line beneath the click-to-start CTA**, always visible, linking to a theme privacy page.
  Not a modal, not a checkbox.
- **Sign Retell's DPA**, which is self-serve and carries SCCs — the standard transfer
  mechanism, and an afternoon's work.

The CTA click **is** the consent act — explicit and unambiguous, which is precisely why
click-to-start beat always-listening. A dialog in front of it would damage the demo to gain
nothing legally. But "we never mentioned it" is not a defensible position for voice data, and
it is cheap not to be in it.

### Region uncertainty recorded, not reopened

Recordings in `us-west-2` weaken ticket 011's "region follows Retell" reasoning without
overturning it: what US-East optimises is the **tool-webhook round trip to Retell's API edge**,
and recording storage is asynchronous and off the voice path. Retell's inference region is
undocumented.

Logged in [section 08](../../spec/08-deployment-and-operations.md) as an open measurement:
**if measured latency disappoints, test US-West before redesigning anything.** Cheap to verify
later, expensive to speculate about now. Feeds
[ticket 015](015-latency-budget-per-turn.md).

### Recorded in

[Section 08](../../spec/08-deployment-and-operations.md) and
[section 03](../../spec/03-session-lifecycle.md). No ADR: no alternative was close enough to
count as a real trade-off, and the reasoning is not surprising in hindsight.

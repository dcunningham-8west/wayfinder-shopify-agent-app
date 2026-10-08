---
id: 012
title: Security of the mutation surface
type: grilling
mode: HITL
state: closed
assignee: agent
blocked_by: []
---

# Security of the mutation surface

Part of [the map](../map.md). Raised as
[spec section 09, item A1](../../spec/09-open-questions.md).

## Question

[Ticket 007](007-storefront-action-vocabulary-and-dom-boundary.md) moved cart writes into
the browser and introduced the Action Envelope: a **WebSocket, held for the life of a Call
Leg, over which the backend tells the browser to mutate things.**

The socket is opened by an **unauthenticated, anonymous storefront visitor.** Nothing in the
spec yet says what binds a socket to a Session, what stops one socket acting on another's
Session, or what bounds the volume a single Session can drive.

### Scope, settled before grilling

- **Design for a public store.** The demo store is password-protected, but that is an
  operational control on a toggle, not an architectural one — and it comes off by definition
  if this reaches a client's live store. Socket binding has to live in the handshake and the
  Session Seed, both of which are in `contracts`; retrofitting it reopens the contract, the
  widget and the backend together.
- **Shoppers are always anonymous.** Customer accounts are off. There is no identity to
  steal and no account to take over.
- **The agent touches the cart, never money.** No checkout, no discounts, no customer data.
  A hijacked socket yields an unwanted line item — annoying and reversible, not a loss.
- **A spend ceiling is acceptable** in principle; the number is open.

These three together shrink the problem. The worst *data* outcome is a stranger's cart. The
worst *cost* outcome is someone else's Retell bill. **Cost is the real risk here, not theft** —
the grilling should weight it accordingly, rather than reflexively treating this as an
authentication problem.

### Decide

**Binding**
- What authenticates a socket to a Session, given there is no shopper identity to bind to?
- Is the session id alone sufficient as a bearer secret? If so, what generates it, how is it
  transported across the `pagehide` handoff, and is it guessable?
- What stops a socket from acting on a Session it did not open?
- Does the Session Seed need to carry anything new? **This is the part that is expensive
  later** — it is the contract change.

**Bounds**
- What caps the number of Actions one Session can drive, and over what window?
- What caps Call Leg creations per visitor, beyond the ~5 s floor ticket 009 already set for
  cost reasons? Does that guard double as an abuse guard, or is it the wrong shape?
- Is there a ceiling on concurrent Sessions, and what happens at it — queue, refuse, degrade?

**Cost**
- What is the spend ceiling, and is it enforced per visitor, per day, or globally?
- What happens when it is hit? A hard stop is a self-inflicted outage; a soft one is not a
  ceiling.
- Can the ceiling be hit accidentally by legitimate traffic? If yes it is set wrong.

**Origin and transport**
- Does origin-checking the WebSocket upgrade buy anything real, or is it theatre against a
  scripted client?
- Does anything here constrain the widget's embedding — one store, one origin?

**Not in scope**
- Shopify Admin token handling — settled in
  [spec section 08](../../spec/08-deployment-and-operations.md). The backend is read-only to
  Shopify and cart writes never pass through it.
- Transcript retention and residency — that is
  [A3](../../spec/09-open-questions.md), a storage question, separately grilled.

## Resolution

### The split that decides everything here

The operator's constraint: **controlled demo settings only, no real shoppers in this phase.**

That does not make the ticket go away, it **splits** it:

| | Build now | Defer |
| --- | --- | --- |
| **Structural** — lives in `contracts`, the handshake, or the Seed | ✅ All of it | — |
| **Operational** — numbers, thresholds, policy | The enforcement *point* | The *values* |

The test is "what is expensive to retrofit", not "what is dangerous today". A credential scheme
touches the contract, the widget and the backend at once. A rate-limit threshold is a constant.

**So: build every mechanism, set every limit generously, tune none of them.** Deferring the
numbers is free. Deferring the mechanisms is not.

### 1. Binding — two values, not one

The backend mints both at Session creation:

| Value | Visibility | Carried in |
| --- | --- | --- |
| **Session Id** | Public. Logged freely, appears in analytics | The Session Seed |
| **Session Token** | Secret. High-entropy, opaque, **never logged, never in the Seed** | `sessionStorage` only |

The widget presents the Session Token on every socket connect. A socket may only act on the
Session it was bound to at connect time.

**Why not let the session id double as the credential.** The session id's job is to be an
identifier — it goes into the Seed, into logs, into analytics. The moment an identifier is
also a credential, every place it is logged is a place it leaks. That is not a hypothetical
failure; it is the ordinary one.

**Why `sessionStorage` specifically.** It persists across same-tab navigation and dies with
the tab — which is already exactly a Session's lifetime
([section 03](../../spec/03-session-lifecycle.md)). The token survives the `pagehide` handoff
with no extra machinery. No rotation, no expiry: the Session's lifetime *is* the token's.

**This is the contract change.** Everything else in this ticket is backend-local.

### 2. The chokepoint is Call Leg creation, not the socket

The spec originally framed the WebSocket as the exposed surface. That was mis-aimed. **A
socket is nearly free to hold. Call Legs cost money.**

So the socket carries binding only, and all metering, rate limiting and ceiling logic lives at
the endpoint that creates a Call Leg — one place, and it is the place where spend originates.

**This resolves the tension with [ticket 009](009-cost-and-concurrency-ceiling-of-per-navigation-reconnect.md)
rather than fighting it.** Ticket 009's ~5 s floor between leg creations and its 45 s idle
timeout are already guards at precisely this endpoint, built for cost. The abuse guards are
the same guards with different thresholds. They co-locate; they do not compete.

### 3. Retell webhook signature verification — **new, previously unmentioned**

The Retell tool webhook is a public unauthenticated endpoint that drives backend work, and the
spec never mentioned protecting it. Verify Retell's signature on every call, reject
unsigned.

This is strictly worse than the socket problem and was invisible because attention was on the
surface that *looked* new. Noted as the ticket's most useful find.

### 4. Origin checking — a noise filter, recorded as such

Check `Origin` on the WebSocket upgrade. It stops a browser on another site; it stops a
scripted client not at all, since a script sets any header it likes.

Keep it — it is free and catches casual embedding — but **it is written down as a noise
filter, not a control**, so nobody later mistakes it for a wall and under-builds what sits
behind it.

### 5. Action idempotency — a correctness fix in security clothing

Every Action Envelope carries an **idempotency key**. The widget records keys it has executed
for the Session and no-ops on repeats.

[Ticket 007](007-storefront-action-vocabulary-and-dom-boundary.md) has the backend blocking on
an Action Result before answering Retell. The obvious recovery from a dropped socket is to
retry the unacked Action — and the obvious recovery double-adds to the cart.

This only manifests on flaky connections, which means **it will not appear in testing and will
appear in a demo.** It rides along in the same contract change.

### 6. Metering — mechanism now, thresholds later

Counters at the Call Leg endpoint, keyed on **IP**, with generous limits.

- **No fingerprinting.** Fragile, and a privacy liability on a system already shipping
  European transcripts to US-East ([A3](../../spec/09-open-questions.md)).
- **Shared-IP collateral accepted explicitly.** One office or one mobile carrier is many
  shoppers behind one address. At demo scale this is near-zero, and the cost of being wrong is
  a shopper told "try again in a moment", not a lost sale.
- These counters are **cost control, not access control.** They do not need to be unforgeable.
  They need to make casual abuse unprofitable.

**No hard spend ceiling is implemented.** A ceiling that trips is a self-inflicted outage; one
that does not trip is decoration. Without real traffic there is no basis to set the number, so
guessing it would produce a false sense of safety. The counters and the enforcement point
exist; the policy is a constant to be set when there is traffic to set it against.

### What stays open, with triggers

Not carried into the fog unlabelled — each has a condition that reopens it:

| Item | Reopen when |
| --- | --- |
| Spend ceiling value and behaviour at the limit | Any traffic that is not a supervised demo |
| Rate-limit thresholds | Same |
| Whether IP is a sufficient counter | The store goes public |
| Abuse response — queue, refuse, or degrade | A ceiling is actually implemented |

**The storefront password remains the real control during this phase.** It is an operational
control on a toggle, and the above is what must be true before it is toggled off.

### Carried forward

- **`contracts` gains the Session Token and the Action idempotency key.** Both are handshake
  and envelope shape, so they must land before the widget and backend are built.
- [Section 06](../../spec/06-tools-and-actions.md)'s "Security — unresolved" note is replaced.
- [Section 08](../../spec/08-deployment-and-operations.md) gains the Retell webhook secret.

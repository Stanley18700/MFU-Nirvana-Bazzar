# The organizer role — what it is, and what it could be

Part 1 is what the code permits **today**, read off the callables, the security rules and the
router. Part 2 is a **brainstorm of proposals — none of it is built**; each idea says what it
would touch and roughly what it costs.

Companion to [systemflow.md](systemflow.md) (how the whole system fits together) and §5 of
`spec/spec.md` (the booth screen as specified).

---

# Part 1 — The organizer today

## 1.1 What the role *is*

A Firebase Auth custom claim, and nothing more:

```json
{ "role": "organizer", "boothId": "booth-04" }
```

Set in exactly two places — [`acceptInvite`](../functions/src/admin.ts) when the invited person
opens their emailed link, and [`setUserRole`](../functions/src/admin.ts) when an admin promotes an
existing account. Both also write `booths/{boothId}.organizerUid` and mirror `role` and `boothId`
onto `users/{uid}` for display. **The claim is the authority; the mirrored fields are decoration.**

The organizer's `users/{uid}` document is created with `visitorType: 'staff'`, `institution: 'MFU'`,
`countryCode: 'TH'` and zero points — and `onUserWrite` only counts documents whose role is
`visitor`, so **an organizer never appears in the visitor statistics.**

## 1.2 The three screens

| Route | What it does | Notes |
|---|---|---|
| `/booth` | The all-day booth screen: rotating QR + spoken 6-character code, countdown, live counters, wake lock | The claim supplies the booth; an admin must pass `?boothId=` |
| `/booth/stats` | That booth's own numbers — stamps, rank, per-hour bar chart per day, visitor mix, per-day totals, CSV of the hourly figures | §5.3 — "the organizer sees their own booth only" |
| `/redeem` | Prize desk: live stock strip, scan or type the visitor's rotating code, see every tier, hand one over | Only for a booth flagged `isPrizeDesk` |

Plus two things that are not organizer screens but reach them: `/r/:token` bounces an
organizer to `/redeem?code=…` when they scan a visitor's QR with the phone's camera app, and
`/account` (an ungated route) lets them change their own password or email address.

The router sends an organizer to `/booth` from `/` and from `/s/:token`, and away from `/join`.
There is **no navigation between the three screens except two hand-written links** — `/booth`
footer → `/booth/stats`, and `/booth/stats` → `/booth`. Nothing in the UI links to `/redeem`; a
prize-desk organizer has to be told the URL.

## 1.3 Exactly what they may call

| Callable | Organizer? | Scope |
|---|---|---|
| `boothSession` | **yes** | Own booth only — the boothId comes from the claim, never from the request |
| `lookupRedemption` | **yes** | Requires their booth to be `isPrizeDesk` |
| `confirmRedemption` | **yes** | Same gate; one transaction decrements stock and stamps the unlock |
| `redemptionCode` | yes, but pointless | Only needs `requireAuth`; an organizer has no unlocks to redeem |
| `syncAccount`, `requestErasure` | yes | Their own account |
| `scan` | **no** | Requires `visitor` or `admin`; an organizer gets `not_registered` |
| `join` | **no** | The router sends them away from `/join`; they already hold a role |
| `voidRedemption` | **no** | **Admin only** |
| Every other admin / event callable | **no** | `requireRole(req, 'admin')` |

`boothSession` is the only path to a booth secret anywhere in the system — `boothSecrets` is denied
to every client in the rules.

## 1.4 Exactly what they may read

From [firestore.rules](../firestore.rules), an organizer's client may read:

- `events/*` and `refData/*` — public anyway
- `booths/*` — **every** booth, not just their own (`allow read: if signedIn()`)
- `prizeTiers/*` — every tier, which is what feeds the prize desk's live stock strip
- `stats/event` + `stats/event/shards/*` — the event totals in the booth footer
- `stats/booths/items/*` — **every** booth's counters, not just their own
- `tierUnlocks/*` — **every** unlock document in the event (`isOrganizer()`)
- `users/{their own uid}`

Denied: other people's `users`, `scans`, `invites`, `auditLog`, `draws`, `archives`,
`stockAdjustments`, `erasureRequests`, `stats/buckets` (so no 5-minute timeline),
and `boothSecrets` / `rateLimits` / `counters`, which nobody can read.

Storage: booth artwork is readable by anyone signed in, **writable by admins only.**

## 1.5 Five things worth knowing before designing anything new

These are observations about the current code, not bugs to fix in a hurry.

1. **An organizer cannot collect stamps.** `scan` requires `visitor` or `admin`, and
   `/s/:token` redirects them to `/booth`. Deliberate — staff shouldn't farm their own prizes — but
   it also means a booth host cannot test the visitor flow on their own phone, and cannot join the
   game they're running.
2. **`booths/{id}.organizerUid` is a single field, but the claim is per person.** Two staff can
   both hold `boothId: 'booth-04'` and both run the screen; the booth document just remembers
   whichever was linked last. So multi-staff booths already work by accident, while
   [Readiness.tsx](../src/pages/admin/Readiness.tsx) counts a booth as "unlinked" purely on that
   one field.
3. **The prize desk cannot undo its own mistake.** Hand over Voyager when the visitor wanted to
   save for Globetrotter and only an admin can void it. At a busy desk that is a queue-stopper.
4. **Two rules grants are wider than the screens need.** `tierUnlocks` and
   `stats/booths/items/*` are readable by *any* organizer for *every* document, but the prize desk
   gets its unlock data from the `lookupRedemption` callable (server-side, with the Admin SDK), and
   `/booth/stats` only ever reads its own booth. Tightening both to least privilege would not
   change a single screen.
5. **The booth screen survives a network outage; the prize desk does not.** Tokens are computed
   locally from the secret, so `/booth` keeps working offline — the corner dot even says so. But
   `lookupRedemption` and `confirmRedemption` are round trips, so an outage stops redemption dead.

---

# Part 2 — Brainstorm: what else the organizer could do

**Nothing below is implemented.** Each idea carries what it touches and a rough size:
**S** = client only or one small callable · **M** = a callable plus UI, or a rules change ·
**L** = a new concept in the data model.

Legend for "touches": `client` · `callable` (new or widened function) · `rules` (Firestore or
Storage) · `model` (a new field or collection) · `claim` (the shape of the custom claim).

## A. Running the booth on the day

### A1 · "Back in 10 minutes" — self-service pause **(M: callable + client)**
A booth closes for lunch, a demo breaks, the host is pulled into a meeting. Today only an admin
can set `active: false`, and doing so is heavy: an inactive booth is rejected by `scan` outright,
so late arrivals get `invalid` with no explanation. A `setBoothPause({ minutes, reason })` callable
scoped to the caller's own booth, writing `pausedUntil` on the booth, would let `scan` return a
new `paused` status the visitor screen can explain — *"This booth is on a break until 13:20"* —
and the booth screen could show the notice instead of a QR.
**Why it matters:** the alternative today is the organizer walking away from a live QR that keeps
stamping people who never did the activity.

### A2 · Self-service secret rotation **(S: widen one callable)**
`rotateBoothSecret` is the emergency lever for a photographed code, and it is admin-only. The
person who *notices* the leak is the organizer standing at the booth. Widening it to "organizer,
own booth only" costs one line in `requireRole` plus a confirm dialog, and every call is already
audited.

### A3 · A clock-skew self-check **(S: client)**
The single most likely day-of failure is a booth tablet with a wrong clock: codes look fine and
every scan returns `invalid`. `boothSession` already returns `serverTime`, and the screen already
stores the skew — it just never shows it. Surfacing *"This device's clock is 47 s fast — codes may
be rejected"* when `|skew| > 5 s` turns a mystifying outage into a fixable one.

### A4 · Shift handover **(M: model + client)**
Who was on the desk at 14:00? `confirmRedemption` records `redeemedBy`, so prize handovers are
attributable, but ordinary booth operation is not. A lightweight `boothShifts` record — open on
`boothSession`, closed on sign-out — would give the admin a staffing picture and let the booth
screen greet the person by name.

### A5 · Offline redemption queue **(L: model + callable + client)**
Mirror what the booth screen already does well. Let `/redeem` verify a visitor's code
*locally* — it can't, today, because the redemption secret lives only on the server — then queue
the confirmations and replay them when the network returns. **This one is genuinely hard and
genuinely risky:** the stock decrement is the thing that must not double-count, and an offline
desk cannot know that stock is still available. Probably the right answer is a smaller version:
queue the *record* offline, print/write a paper slip, and reconcile with an admin afterwards.

### A6 · A second screen for the same booth **(S: nothing new)**
Already works — two devices signed in as the same organizer produce identical codes, since both
derive from the same secret and counter. Worth **documenting** in the UAT checklist rather than
building: big booths will want a screen at each end of the table.

## B. Owning their own booth's content

### B1 · Edit their own description and photo **(M: callable + client)**
Right now a booth host who spots a typo in their own English blurb has to message an admin. A
`updateOwnBooth` callable with a strict field allowlist — `descriptionEn`, `descriptionTh`,
`shortName`, maybe `location` — and **nothing** that affects the game (`points`, `zone`, `active`,
`isPrizeDesk`, `sortOrder`) would remove a whole class of admin errands. The allowlist is the
entire security design here: points must stay admin-only or a booth can inflate its own worth.

### B2 · Upload their own badge artwork **(M: rules + client)**
[storage.rules](../storage.rules) allows `booths/{boothId}/*` writes to admins only. Scoping it to
`request.auth.token.boothId == boothId` for organizers — keeping the existing 2 MB and
`image/*` limits — lets twelve booths supply their own stamp art in parallel instead of mailing
twelve PNGs to one admin the week before. The badge URL itself would still be written by a
callable, so a bad upload can't break the passport.

### B3 · Preview their own stamp **(S: client)**
[Stamp.tsx](../src/components/Stamp.tsx) already renders the fallback stamp from the booth's
accent colour and event mark. Showing the organizer *"this is what a visitor sees in their
passport after visiting you"* costs one component reuse and makes B2 self-correcting.

## C. Knowing how the booth is doing

### C1 · Pace, not just totals **(S: client)**
`/booth/stats` shows cumulative stamps and a rank. What an organizer actually asks at 11:00 is
*"are we on track?"* Everything needed is already readable: their own `byHour`, the event totals,
and the booth count. **Stamps this hour vs. your average hour**, and **your share of the hall's
stamps vs. 1/N**, are both pure client-side arithmetic.

### C2 · Visitor mix versus the hall **(S: client)**
They see their own `byVisitorType`; the event shards carry the hall's. *"You're seeing more
external guests than the hall average"* is a genuinely useful prompt for a booth deciding
which pitch to run — and it needs no new permission.

### C3 · Full CSV of their own booth **(S: client)**
`CsvButton` currently exports the hourly figures for **one** selected day. Exporting all days,
plus the visitor-type breakdown, is a few lines — and booth hosts write end-of-event reports for
their own schools.

### C4 · Rank movement, gently **(S: client)**
`rankBooths` recomputes every minute and the screen already shows `#3 of 12`. Showing the
*direction* since the morning turns the footer into a reason to keep the screen visible.
**Caution:** this is a leaderboard between colleagues; §2.2 of the spec is careful that the booth
accent, not competition, dominates the screen. Small and optional, or not at all.

### C5 · An end-of-day summary they can keep **(S: client)**
One printable page per booth: total stamped, peak hour, visitor mix, rank. `/admin/print` already
does this shape for the whole event — the same treatment scoped to one booth gives every school a
takeaway without an admin exporting twelve CSVs.

## D. The prize desk specifically

### D1 · Void your own handover, within a few minutes **(M: widen a callable)**
The single biggest friction in Part 1.5. `voidRedemption` widened to "the organizer who performed
*this* redemption, within N minutes" — it already records `redeemedBy` and `redeemedAt`, so the
check is two comparisons — with the audit entry and `stockAdjustments` row unchanged. Anything
older, or anyone else's, stays admin-only.

### D2 · Low-stock alert at the desk **(S: client)**
The stock strip already colours amber under 20% and vermilion at ≤5. It doesn't *tell* anyone.
A dismissable banner — *"Explorer stock will run out in about 40 minutes at the current rate"* —
uses the same live tier documents plus the desk's own redemption rate.

### D3 · Show the visitor what they're giving up **(S: client)**
A visitor 20 points from Globetrotter who redeems Voyager now may not realise the trade. The
lookup response already carries every tier and the visitor's points, so the desk could say
*"Globetrotter is 20 points away — 2 more booths"* before confirming. **This is the highest-value
tiny change in this document**, because it prevents the mistake D1 exists to undo.

### D4 · A queue/throughput counter **(S: client)**
Redemptions in the last 15 minutes, from the desk's own session. Tells a supervisor whether to
open a second desk. `sweepActive` does the equivalent for scans event-wide.

## E. Helping a visitor at the booth

### E1 · Organizer-assisted registration **(M: widen a callable)**
`createUser` — the walk-up desk account — is admin-only. But the person a visitor with a dead
phone or no email address actually meets is the organizer. Widening it to organizers with
`role: 'visitor'` forced, and a rate limit, puts help where the queue is.
**Watch out:** it creates an Auth account and consumes a passport number, so it needs the same
one-address-one-passport check and an audit entry naming the organizer.

### E2 · Manual stamp with a reason **(L: callable + model — and think hard)**
The accessibility case is real: a visitor whose phone is dead, or who has no smartphone at all,
did the activity and cannot be stamped. There is no path for this today at any privilege level —
`scan` needs a token the *visitor's* session must present.
A `grantStamp({ visitorId, reason })` callable would close it, and it is **the biggest fraud
vector in this document**: it mints points with no proof of presence. If it is built it needs, at
minimum, a mandatory free-text reason, the organizer's uid on the scan document, a per-organizer
daily cap, its own `auditLog` action, and a dashboard panel listing every manual stamp so an admin
sees the pattern. Consider whether a paper fallback reconciled by an admin is the better answer.

### E3 · Look up a passport by number **(M: callable)**
*"How many points do I have?"* is answerable today only on the visitor's own phone. A read-only
`lookupPassport({ passportNo })` returning name, points and stamp count — no contact details, no
sensitive fields, never the ethnic-group answer — would let any booth answer it. Note this is
deliberately narrower than what the rules allow the prize desk to infer, and must stay so.

### E4 · A "what is this?" explainer for the booth screen **(S: client)**
The booth screen is aimed at the visitor's camera, not at reading. A small `?` that expands into a
bilingual three-line explanation of the passport would save the organizer answering it a hundred
times a day.

## F. Role and plumbing ideas

### F1 · Multi-booth organizer **(L: claim + everywhere)**
The claim carries **one** `boothId`. A hall coordinator covering four booths, or one person
running two adjacent tables, cannot be expressed. Moving to `boothIds: string[]` touches
`requireRole`, `boothSession`, both organizer screens, the rules' `token.boothId` comparisons and
every existing claim. Real, but the most invasive idea here — only worth it if the event actually
staffs that way.

### F2 · A proper per-booth staff list **(M: model)**
Replace the single `booths/{id}.organizerUid` with a `staffUids` array, so the readiness check
counts people rather than one overwritten pointer, and A4's handover has something to attach to.
Fixes observation 1.5.2 properly.

### F3 · A "lead organizer" tier **(L: claim + rules)**
Between organizer and admin: can run the draw, can void, can pause any booth, cannot touch users
or the event lifecycle. Worth it only if handing out full admin turns out to be the actual
practice on the day — which is worth checking before building anything.

### F4 · Least-privilege pass on the rules **(S: rules)**
Scope `stats/booths/items/{boothId}` and `tierUnlocks` to the organizer's own booth and own
transactions. Changes no screen (observation 1.5.4), removes a standing over-grant, and is the
cheapest security improvement available.

### F5 · Let staff hold a passport too **(M: claim or model)**
Follows from 1.5.1. Either allow `scan` for organizers as a separate `canCollect` flag, or let one
person hold both a staff claim and a visitor passport. Mostly a policy question — should the people
running the hall be able to win the prize? — with a small code answer once decided.

---

## Where I'd start

Ordered by value per unit of work, not by section:

1. **D3** — warn the visitor before redeeming a lower tier. Client-only, prevents the mistake.
2. **A3** — the clock-skew warning. Client-only, turns the likeliest day-of outage into a message.
3. **D1** — let the desk void its own handover inside a few minutes. Small, removes the worst queue-stopper.
4. **A2** — organizer-initiated secret rotation. Nearly free, and the organizer is who notices.
5. **C1 + C2** — pace and mix, on data they can already read. No new permissions at all.
6. **F4** — the rules tightening, since it's cheap and nothing depends on the over-grant.
7. **B1 + B2** — hand booths their own copy and artwork, before the next event's setup crunch.

Deliberately last: **E2** (manual stamp) needs a policy decision before a line of code, and
**A5** / **F1** are large enough to deserve their own design note.

# Booth seed and prize model — decisions, 12 September 2026

Source of truth for booths: the organisers' booth sheet,
<https://docs.google.com/spreadsheets/d/1YSl-NRrnJCRqgCQE8EtN3X-JazTP4krxe18n5mFaVK0> (gid=0),
publicly readable, CSV export at `.../export?format=csv&gid=0`.

This replaces the 12 placeholder booths and the three-tier prize policy seeded on 7 September.
Decisions below were taken with Stanley on 12 September; the spec §13 items each one closes are
named so `spec/spec.md` can be updated in the same pass.

## Booths

**76 booths, all stampable, ids are the sheet's own codes** — `ED1`–`ED19`, `CL20`–`CL25`,
`FD26`–`FD63`, `OPEN1`–`OPEN13`. Keeping the sheet's codes means the signage, the sheet and
Firestore all say the same thing, which matters when an organiser phones in a problem about
"booth FD47". Cost: a re-seed, because the old `booth-NN` ids cannot be renamed in place.
*(Closes spec §13 "final booth count".)*

**Every booth is active all three days** (16–18 Sep). The sheet has no per-booth day column;
this is the assumption until the organisers say otherwise, and any individual booth can be
switched off from /admin/booths on the day. *(Partially closes §13 "activeDays".)*

**Flat points: 10 per booth, no zone weighting.** `ZONE_POINTS` now returns the same value for
all three zones and `zone` survives only so a future event can turn weighting back on. Distance
weighting was designed for 12 booths in two halls; across 76 it would have made the far corners
a chore rather than a draw. The quiet/busy adjustment is what now moves a booth's value —
which is the mechanic the organisers actually wanted, and it works better from a flat base
because every booth starts equal. *(Closes §13 "sanity-check badge point values".)*

**A new `category` field** (`educational` | `cultural` | `food` | `market` | `youth` |
`wellness`) groups the stamp grid. 76 tiles as one flat list is unreadable on a phone; the
categories are the sheet's own grouping, so nobody has to invent a taxonomy. Optional on
`BoothDoc`, so booths saved before it exist are unaffected.

**ED8 (GRD's "MFU Go Global") is the prize desk.** GRD is the main organiser and it is their own
booth. Previously this was `booth-01`.

### Where the generated data comes from

`scripts/build-booths.py` holds the sheet's rows and writes `functions/src/booths.data.ts`.
Do not hand-edit the generated file — change the script and re-run it, then `npm run seed`.

## Rows that still need the organisers

| Booth | Issue |
|---|---|
| `ED5` | Booth name is literally "Waiting" in the sheet. Seeded as "Waiting", short name "TBC". Needs a real name before print. |
| `FD63` | Sheet names it "French Food Fair (School of French)" but describes Rakhine soup and anchovy salad from coastal Myanmar. Seeded from the description as a Myanmar table — **confirm which is right**. |
| `FD43`–`FD62` | All arrived named "Global Table". Renamed from each row's cuisine ("Global Table — Korea", "— Mexico", …) so a visitor can tell one stamp from another. Check the names read right to GRD. |
| `FD35`/`FD36` | Both "Healthy Local Food (Ethnic Minority)" with identical descriptions; suffixed I and II. Real names wanted. |
| `OPEN7`–`OPEN12` | Sheet gave only "Youth Booth 5–10"; named from their descriptions (MUN, Human Rights Club, Maxim, ISC I–III). |
| `OPEN13` | "First Aid Service" is a service station, not an attraction. Seeded as stampable per the decision to include everything — worth a second thought before print. |
| all | No Thai names in the sheet, so `nameTh` is set to the English name. The UI is English-only (spec §2), so nothing displays wrong today, but a bilingual print run would. |
| all | No floor plan, so `location` is the sheet's category area, not a real position. |
| all | Short names were auto-derived to fit a stamp tile. Worth a read-through. |

## Prize

**One prize from the main organisers, at 100 points.** Booths hand out their own small gifts
directly; those are deliberately not modelled in the app. The three-tier Explorer/Voyager/
Globetrotter policy and the stage-draw entry are retired. *(Closes §13 "prize quantities per tier".)*

At 10 points a booth that is 10 booths — 8 if a visitor chases the boosted quiet ones, 13 if
they only visit busy ones.

**Stock is per session, not per event: 50 each morning and each afternoon, every day** —
09:00–12:00 and 12:00–16:00, both stored on the event document (`prizeSessions`) so an admin can
move them on the day without a redeploy. That editability is also the escape hatch: if the desk
must hand over outside a window, widen the window rather than working around the guard.

The rule that makes this humane: **sessions gate the gift, never the points.** A visitor who
reaches 100 at 11:58 with the morning's 50 gone keeps every point and collects after 12:00. The
passport says so in as many words rather than showing a bare "0 left", which reads as "you
missed it".

Three states, deliberately distinct — conflating any two of them is the bug this design exists
to prevent:

| State | Passport shows |
|---|---|
| session open, stock left | "37 left this morning" |
| session open, stock gone | the out-of-stock note, plus "Your points stay — collect from 12:00" |
| desk closed | "Collect from 09:00" — never "0 left" |

`sessionStockRemaining()` returns `null` for the closed case precisely so the two cannot be
confused by accident at a call site.

### How it is stored

`prizeTiers/{id}.sessionRemaining` is a map keyed `YYYY-MM-DD#sessionId` (`2026-09-16#am`), with
`stockPerSession` as the allowance. A key absent means that session is untouched and therefore
full — which is why the redemption transaction writes an absolute value rather than
`FieldValue.increment(-1)`: an increment against a missing key would set it to −1, not 49.

`stockTotal`/`stockRemaining` are kept as the event-wide audit figures and feed the archive.
`TierUnlockDoc.redeemedSessionKey` records which session a gift came out of, so voiding a
redemption returns it to that session rather than to whichever one happens to be open when the
mistake is noticed — capped at the session allowance so a void can never create a 51st gift.

## Applying it

```bash
npm run test:sessions                          # 11 tests over the session helpers
npm --prefix functions run build

node scripts/migrate-booths.mjs --emulator     # dry run: prints what it would delete
node scripts/migrate-booths.mjs --emulator --commit
npm run seed:emulator
npm run e2e                                    # existing suite, now against 76 booths

node scripts/migrate-booths.mjs --commit       # then, when the emulator run is clean
npm run seed
```

The migration deletes `booths/booth-NN`, their `boothSecrets` and `stats/booths/items`, and the
three old `prizeTiers`. It deliberately leaves `scans`, `users` and `tierUnlocks` alone: those
are the record of what happened in testing, and keeping them makes the migration recoverable.
Scans pointing at a deleted booth simply stop resolving. Use the admin Danger Zone if a genuinely
clean slate is wanted.

**Re-seeding rotates nothing that is already printed** — existing booth secrets are kept — but
the 12 old booths' QR codes die with them. Nothing has been printed against `booth-NN`, so this
costs nothing today; it will not be true again once signage goes to print.

## Still open

- Floor plan → real `location` values, and a decision on whether zone weighting comes back.
- The sheet rows in the table above.
- Whether `OPEN13` (First Aid) should really be a stamp.
- 76 booths × 2 counters is now the manual-code search space (was 12 × 2). Still far inside a
  32^6 keyspace, but the server scans every active booth per manual entry — fine at this size,
  worth re-checking if the count grows again.
- Sheet totals for logistics (172 tables, 454 chairs, 2 podiums) are not modelled; they are the
  organisers' own planning figures.

# Continue here — 12 Sep 2026

Booth data replaced and the prize model rewritten. Backend done, three UI surfaces unfinished.
Full rationale: `docs/booth-seed-notes.md`. Nothing has been built, run or deployed yet.

## What changed

**Booths** — 76 real booths from the organisers' sheet replace the 12 placeholders.
Ids are the sheet's codes: `ED1`–`ED19`, `CL20`–`CL25`, `FD26`–`FD63`, `OPEN1`–`OPEN13`.
Flat **10 points** every booth (zone weighting off: `ZONE_POINTS` returns the same value for all
three zones; `zone` kept so a future event can re-enable it). All booths active all 3 days.
New optional `BoothDoc.category` groups the stamp grid. Prize desk is now `ED8`, was `booth-01`.
`scripts/build-booths.py` generates `functions/src/booths.data.ts` — **never hand-edit the
generated file**, edit the script and re-run.

**Prize** — one gift at **100 points**. Explorer/Voyager/Globetrotter and the stage draw are
retired. Booths give their own mini gifts outside the app; don't model them.

**Session stock** — 50 gifts per session, sessions 09:00–12:00 and 12:00–16:00, stored on the
event doc as `prizeSessions`. Stock lives in `prizeTiers/{id}.sessionRemaining`, keyed
`YYYY-MM-DD#am`. Two invariants:

- **Sessions gate the gift, never the points.** Qualify at 11:58 with none left → keep every
  point, collect after 12:00.
- **`null` ≠ `0`.** `sessionStockRemaining()` returns `null` for "desk closed" and `0` for "open,
  all gone". Never collapse them — closed must read "Collect from 12:00", not "0 left".

Absent map key = untouched = full, so `confirmRedemption` writes an **absolute** value, not
`FieldValue.increment(-1)` (increment on a missing key gives −1, not 49).
`TierUnlockDoc.redeemedSessionKey` lets a void return the gift to its own session, capped.

## Files touched

| File | State |
|---|---|
| `shared/model.ts` | done — session types + helpers, `BoothCategory`, flat `ZONE_POINTS` |
| `functions/src/booths.data.ts` | new, generated |
| `functions/src/seed.ts` | done — 76 booths, one prize |
| `functions/src/organizer.ts` | done — per-session spend/void/lookup |
| `src/lib/data.ts` | done — `prizeSessions` on the event |
| `src/pages/visitor/Prize.tsx` | done — three-state live count |
| `scripts/migrate-booths.mjs` | new — retires the old 12 booths + 3 tiers |
| `scripts/test-sessions.cjs` | new — 11 tests, passing |

## TODO, in priority order

1. **`src/lib/api.ts:216`** — `LookupResult.tiers[]` lacks `sessionRemaining`, `stockPerSession`;
   result lacks `session`, `nextOpensAt`. `ConfirmResult` lacks `status: 'desk_closed'` and
   `nextOpensAt` on `out_of_stock`. Server already sends all of these; TS can't see them.
2. **`src/pages/organizer/Redeem.tsx:163–210`** — desk still shows the event pool. Staff would
   read "300 / 300" while the server counts down from 50, and Hand over enables on the wrong
   number. Highest real-world cost of the three.
3. **`src/pages/organizer/Redeem.tsx:~85`** — no branch for `desk_closed`; `out_of_stock` was
   **already** unhandled before this change, so both refusals currently do nothing visible.
4. **Admin** — `functions/src/admin.ts:441–452` `adjustStock` only moves the event pool;
   `/admin/event` has no editor for `prizeSessions`; `/admin/prizes` has no `stockPerSession`
   field. Until then, session times are editable only via the Firebase console.

**Open decision for 4:** an admin adding 10 gifts mid-morning — top up *this session only*, or
raise `stockPerSession` for all later sessions? Ask Stanley.

## Sheet rows needing the organisers

`ED5` is named "Waiting". **`FD63` is contradictory** — sheet calls it "French Food Fair (School
of French)" but describes Rakhine soup from coastal Myanmar; seeded from the description.
`FD43`–`FD62` all arrived as "Global Table", renamed from their cuisine. `FD35`/`FD36` identical.
No Thai names anywhere (`nameTh` = English). No floor plan, so `location` is the category area.

## Apply

```bash
npm run test:sessions && npm --prefix functions run build && npm run typecheck
node scripts/migrate-booths.mjs --emulator          # dry run, prints what it deletes
node scripts/migrate-booths.mjs --emulator --commit
npm run seed:emulator && npm run e2e
# only when that is clean:
node scripts/migrate-booths.mjs --commit && npm run seed
```

Migration leaves `scans`/`users`/`tierUnlocks` alone (recoverable; use the admin Danger Zone for
a clean slate). Re-seeding keeps existing booth secrets but the old `booth-NN` QRs die — costs
nothing today since nothing is printed.

Also stale: `spec/spec.md` still describes 12 booths and three tiers; §13 open questions on booth
count, activeDays, prize quantities and point values are now answered.

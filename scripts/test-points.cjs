const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  effectivePoints, scheduledPoints, activeBoost, nextPointChange, eligibleForAdjustment, pointWindow, nextCheck, suggestBoosts, boostFor,
  POINT_WINDOW_MS, POINT_LIVENESS_MS, BOOST_MS, MAX_BOOSTS_PER_GROUP,
} = require('../functions/lib/shared/points')
const { dayOf } = require('../functions/lib/shared/model')

// A Wednesday morning in Bangkok (11:32 ICT).
const now = Date.parse('2026-09-16T04:32:12Z')
const today = dayOf(new Date(now))
const booth = (id, extra = {}) => ({ id, nameEn: id, eventId: 'event', points: 20, active: true, isPrizeDesk: false, activeDays: [today], ...extra })
const ids = (rows) => rows.filter((r) => r.boostPoints > 0).map((r) => r.boothId)

// ---- what a booth is worth ----

test('scheduled value, boost and base are three separate layers', () => {
  const b = booth('a', { points: 15, temporaryPoints: 27, pointsExpireAt: now + 1000, boostPoints: 7, boostUntil: now + 500 })
  assert.equal(scheduledPoints(b, now), 27)
  assert.equal(activeBoost(b, now), 7)
  assert.equal(effectivePoints(b, now), 34)
  assert.equal(effectivePoints(b, now + 500), 27, 'boost ended, scheduled value stands')
  assert.equal(effectivePoints(b, now + 1000), 15, 'scheduled value ended, base stands')
})
test('a boost on a base-value booth adds to base; the total never passes 100', () => {
  assert.equal(effectivePoints(booth('a', { boostPoints: 5, boostUntil: now + 1 }), now), 25)
  assert.equal(effectivePoints(booth('a', { points: 98, boostPoints: 5, boostUntil: now + 1 }), now), 100)
})
test('neither layer applies to a closed, excluded or not-today booth, nor with junk values', () => {
  const b = booth('a', { temporaryPoints: 27, pointsExpireAt: now + 1000, boostPoints: 7, boostUntil: now + 1000 })
  for (const extra of [{ active: false }, { activeDays: [] }, { adjustmentExcluded: true }]) {
    assert.equal(effectivePoints({ ...b, ...extra }, now), 20)
  }
  assert.equal(effectivePoints({ ...b, temporaryPoints: NaN, boostPoints: 101 }, now), 20)
  assert.equal(effectivePoints({ ...b, temporaryPoints: 0, boostPoints: 0 }, now), 20)
  assert.equal(effectivePoints(booth('legacy'), now), 20, 'a booth saved before either field existed')
})
test('a prize desk honours a scheduled value, though the balancer still cannot touch it', () => {
  const desk = booth('a', { isPrizeDesk: true, temporaryPoints: 27, pointsExpireAt: now + 1000 })
  assert.equal(effectivePoints(desk, now), 27)
  assert.equal(eligibleForAdjustment(desk, 'event', today), false)
})
test('the next change is whichever layer ends first, with the value after it', () => {
  const b = booth('a', { points: 15, temporaryPoints: 27, pointsExpireAt: now + 1000, boostPoints: 7, boostUntil: now + 500 })
  assert.deepEqual(nextPointChange(b, now), { at: now + 500, points: 27 })
  assert.deepEqual(nextPointChange(b, now + 500), { at: now + 1000, points: 15 })
  assert.equal(nextPointChange(b, now + 1000), null)
  assert.deepEqual(nextPointChange(booth('a', { boostPoints: 5, boostUntil: now + 9 }), now), { at: now + 9, points: 20 })
})
test('eligibility excludes other events, days, closed booths and prize desks', () => {
  assert.equal(eligibleForAdjustment(booth('a'), 'event', today), true)
  for (const extra of [{ eventId: 'old' }, { active: false }, { activeDays: [] }, { isPrizeDesk: true }, { adjustmentExcluded: true }]) {
    assert.equal(eligibleForAdjustment(booth('a', extra), 'event', today), false)
  }
})

// ---- windows ----

test('window is exactly 30 completed minutes on a five-minute boundary, liveness one hour', () => {
  const w = pointWindow(now)
  assert.equal(w.windowEnd, Date.parse('2026-09-16T04:30:00Z'))
  assert.equal(w.windowEnd - w.windowStart, POINT_WINDOW_MS)
  assert.equal(w.windowEnd - w.livenessStart, POINT_LIVENESS_MS)
})
test('the next check is the next quarter hour, strictly after now', () => {
  assert.equal(nextCheck(now), Date.parse('2026-09-16T04:45:00Z'))
  assert.equal(nextCheck(Date.parse('2026-09-16T04:45:00Z')), Date.parse('2026-09-16T05:00:00Z'))
})

// ---- the boost scale ----

test('boost is 25% at the quiet line rising to 35% at zero scans, whole points, capped at 100', () => {
  assert.equal(boostFor(27, 6, 10), 7, '6 of a median 10 is exactly the 60% line: +25% of 27')
  assert.equal(boostFor(27, 0, 10), 9, 'no scans: +35% of 27 = 9.45 → 9')
  assert.equal(boostFor(27, 3, 10), 8, 'halfway down the scale: +30%')
  assert.equal(boostFor(12, 0, 10), 4)
  assert.equal(boostFor(15, 5, 10), 4, '+25% of 15 = 3.75 → 4')
  assert.equal(boostFor(98, 0, 10), 2, 'room to 100 only')
})

// ---- who is compared with whom ----

test('booths are grouped by current value within ±1 and judged against their own median', () => {
  const morning = (id, scans) => booth(id, { points: 15, temporaryPoints: 27, pointsExpireAt: now + 3600_000 })
  const booths = [
    ...['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => morning(id)),
    booth('m6', { points: 15, temporaryPoints: 28, pointsExpireAt: now + 3600_000 }), // OPEN12-style 28 joins the 27s
    ...['f1', 'f2', 'f3', 'f4'].map((id) => booth(id, { points: 12 })),
  ]
  const counts = { m1: 10, m2: 10, m3: 10, m4: 10, m5: 2, m6: 10, f1: 1, f2: 1, f3: 1, f4: 1 }
  const r = suggestBoosts(booths, counts, counts, now)
  assert.deepEqual(r.groups.map((g) => [g.label, g.size, g.median, g.sufficient]), [['27–28 points', 6, 10, true], ['12 points', 4, 1, false]])
  assert.deepEqual(ids(r.rows), ['m5'], 'only the quiet 27 is offered; the food group is too quiet to judge anyone')
  const m5 = r.rows.find((x) => x.boothId === 'm5')
  assert.equal(m5.currentPoints, 27)
  assert.equal(m5.boostPoints, boostFor(27, 2, 10))
  assert.equal(m5.suggestedPoints, 27 + m5.boostPoints)
  assert.equal(r.rows.find((x) => x.boothId === 'f1').reason, 'small-group')
  assert.equal(r.sufficient, true)
  assert.equal(r.offered, 1)
})
test('a hall-wide average would have called every workshop quiet; grouping does not', () => {
  // Six food stalls stamping 40 each, six workshops stamping 8 each. Old design: every workshop
  // is below 75% of the mean (24) and gets boosted all day. New design: each group is level.
  const booths = [
    ...['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((id) => booth(id, { points: 15 })),
    ...['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => booth(id, { points: 12 })),
  ]
  const counts = Object.fromEntries(booths.map((b) => [b.id, b.id[0] === 'w' ? 8 : 40]))
  const r = suggestBoosts(booths, counts, counts, now)
  assert.deepEqual(ids(r.rows), [])
  assert.ok(r.rows.every((x) => x.reason === 'typical'))
})
test('nothing is ever cut: a very busy booth stays at its value', () => {
  const booths = ['a', 'b', 'c', 'd', 'e'].map((id) => booth(id))
  const counts = { a: 100, b: 10, c: 10, d: 10, e: 10 }
  const r = suggestBoosts(booths, counts, counts, now)
  assert.ok(r.rows.every((x) => x.suggestedPoints >= x.currentPoints))
  assert.deepEqual(ids(r.rows), [])
})
test('the quiet line is strictly below 60% of the median', () => {
  const booths = ['a', 'b', 'c', 'd', 'e'].map((id) => booth(id))
  assert.deepEqual(ids(suggestBoosts(booths, { a: 6, b: 10, c: 10, d: 10, e: 10 }, { a: 6, b: 10, c: 10, d: 10, e: 10 }, now).rows), [], 'exactly 60% is not quiet')
  assert.deepEqual(ids(suggestBoosts(booths, { a: 5, b: 10, c: 10, d: 10, e: 10 }, { a: 5, b: 10, c: 10, d: 10, e: 10 }, now).rows), ['a'])
})
test('the median, not the mean: one queue does not make its neighbours quiet', () => {
  const booths = ['a', 'b', 'c', 'd', 'e'].map((id) => booth(id))
  const counts = { a: 200, b: 10, c: 10, d: 9, e: 9 } // mean 47.6 → b–e all "quiet" under a mean rule
  const r = suggestBoosts(booths, counts, counts, now)
  assert.equal(r.groups[0].median, 10)
  assert.deepEqual(ids(r.rows), [])
})

// ---- guards ----

test('a booth with no scan in the last hour is "not open", never boosted, and not in the median', () => {
  const booths = ['a', 'b', 'c', 'd', 'e', 'closed'].map((id) => booth(id))
  const counts = { a: 10, b: 10, c: 10, d: 10, e: 2 }
  const recent = { ...counts } // `closed` appears nowhere
  const r = suggestBoosts(booths, counts, recent, now)
  assert.equal(r.groups[0].comparable, 5)
  assert.equal(r.rows.find((x) => x.boothId === 'closed').reason, 'no-scans')
  assert.deepEqual(ids(r.rows), ['e'])
})
test('a booth alive an hour ago but silent this half hour IS compared — that is what quiet means', () => {
  const booths = ['a', 'b', 'c', 'd', 'e'].map((id) => booth(id))
  const counts = { a: 10, b: 10, c: 10, d: 10 }
  const recent = { ...counts, e: 3 }
  const r = suggestBoosts(booths, counts, recent, now)
  const e = r.rows.find((x) => x.boothId === 'e')
  assert.equal(e.reason, 'quiet')
  assert.equal(e.scans, 0)
  assert.equal(e.boostPoints, boostFor(20, 0, 10))
})
test('fewer than four comparable booths, or a median under three, and nobody is judged', () => {
  const three = ['a', 'b', 'c'].map((id) => booth(id))
  assert.equal(suggestBoosts(three, { a: 10, b: 10, c: 0 }, { a: 10, b: 10, c: 1 }, now).sufficient, false)
  const four = ['a', 'b', 'c', 'd'].map((id) => booth(id))
  assert.equal(suggestBoosts(four, { a: 2, b: 2, c: 2, d: 0 }, { a: 2, b: 2, c: 2, d: 1 }, now).sufficient, false, 'median 2 < 3')
  assert.equal(suggestBoosts(four, { a: 3, b: 3, c: 3, d: 0 }, { a: 3, b: 3, c: 3, d: 1 }, now).sufficient, true)
})
test('at most three boosts per group, quietest first; the rest are marked capped', () => {
  const booths = ['q1', 'q2', 'q3', 'q4', 'b1', 'b2', 'b3', 'b4', 'b5'].map((id) => booth(id))
  const counts = { q1: 0, q2: 1, q3: 2, q4: 3, b1: 10, b2: 10, b3: 10, b4: 10, b5: 10 }
  const recent = { ...counts, q1: 1 }
  const r = suggestBoosts(booths, counts, recent, now)
  assert.deepEqual(ids(r.rows), ['q1', 'q2', 'q3'])
  assert.equal(r.rows.find((x) => x.boothId === 'q4').reason, 'capped')
  assert.equal(r.groups[0].offered, MAX_BOOSTS_PER_GROUP)
})
test('a running boost counts against the cap and is never stacked', () => {
  const live = { boostPoints: 5, boostUntil: now + BOOST_MS / 2 }
  const booths = [booth('r1', live), booth('r2', live), booth('q1'), booth('q2'), ...['b1', 'b2', 'b3', 'b4'].map((id) => booth(id))]
  const counts = { r1: 0, r2: 0, q1: 0, q2: 1, b1: 10, b2: 10, b3: 10, b4: 10 }
  const recent = { ...counts, r1: 1, r2: 1, q1: 1 }
  const r = suggestBoosts(booths, counts, recent, now)
  assert.equal(r.rows.find((x) => x.boothId === 'r1').reason, 'boosted')
  assert.equal(r.rows.find((x) => x.boothId === 'r1').suggestedPoints, 25, 'shown at its boosted value, unchanged')
  assert.deepEqual(ids(r.rows), ['q1'], 'two running + one new = the cap of three')
  assert.equal(r.groups[0].live, 2)
})
test('too early: everything is listed, nothing is offered', () => {
  const booths = ['a', 'b', 'c', 'd', 'e'].map((id) => booth(id))
  const counts = { a: 10, b: 10, c: 10, d: 10, e: 0 }
  const r = suggestBoosts(booths, counts, { ...counts, e: 1 }, now, { tooEarly: true })
  assert.equal(r.rows.length, 5)
  assert.deepEqual(ids(r.rows), [])
  assert.equal(r.sufficient, false)
})

// ---- Friday 18 September, as configured by scripts/apply-scoring.mjs ----

test('Friday: morning groups, the noon switch, food opening at 13:00, a boost across noon', () => {
  const day = '2026-09-18'
  const noon = Date.parse('2026-09-18T12:00:00+07:00')
  const activity = (id, morning = 27, afternoon = 15) => booth(id, { points: afternoon, temporaryPoints: morning, pointsExpireAt: noon, activeDays: [day] })
  const food = (id) => booth(id, { points: 12, activeDays: [day] })
  const booths = [
    activity('ED1'), activity('ED2'), activity('ED3'), activity('ED4'), activity('ED5', 27, 16), activity('OPEN12', 28, 15),
    food('FD26'), food('FD27'), food('FD28'), food('FD29'), food('FD30'),
  ]

  // 10:00 — morning. Food is closed (no scans at all). ED3 is quiet.
  const t10 = Date.parse('2026-09-18T10:00:00+07:00')
  let counts = { ED1: 12, ED2: 12, ED3: 3, ED4: 12, ED5: 12, OPEN12: 12 }
  let r = suggestBoosts(booths, counts, counts, t10)
  assert.deepEqual(r.groups.map((g) => g.label), ['27–28 points', '12 points'])
  assert.equal(r.groups[1].comparable, 0, 'no food stall is open')
  assert.ok(r.rows.filter((x) => x.groupKey === r.groups[1].key).every((x) => x.reason === 'no-scans'))
  assert.deepEqual(ids(r.rows), ['ED3'])
  const ed3 = r.rows.find((x) => x.boothId === 'ED3')
  assert.equal(ed3.currentPoints, 27)
  assert.equal(ed3.boostPoints, boostFor(27, 3, 12))
  const boosted = { ...booths[2], boostPoints: ed3.boostPoints, boostUntil: t10 + BOOST_MS }

  // The boost sits on the morning value and a scan freezes it.
  assert.equal(effectivePoints(boosted, t10 + 60_000), 27 + ed3.boostPoints)
  assert.deepEqual(nextPointChange(boosted, t10 + 60_000), { at: t10 + BOOST_MS, points: 27 })

  // 11:45 — a boost approved now runs past noon: it rides the switch and lands on 15 + boost.
  const t1145 = Date.parse('2026-09-18T11:45:00+07:00')
  const acrossNoon = { ...booths[2], boostPoints: 7, boostUntil: t1145 + BOOST_MS }
  assert.equal(effectivePoints(acrossNoon, noon - 1), 34)
  assert.equal(effectivePoints(acrossNoon, noon), 22, 'scheduled value gone, boost still on: 15 + 7')
  assert.deepEqual(nextPointChange(acrossNoon, noon - 1), { at: noon, points: 22 })
  assert.deepEqual(nextPointChange(acrossNoon, noon), { at: t1145 + BOOST_MS, points: 15 })

  // 13:35 — afternoon. Groups are now 15–16 and 12. Food has just opened: three stalls have a few
  // scans, two have none yet, so the food group has too few comparable booths to judge.
  const t1335 = Date.parse('2026-09-18T13:35:00+07:00')
  counts = { ED1: 10, ED2: 10, ED3: 10, ED4: 10, ED5: 10, OPEN12: 1, FD26: 4, FD27: 4, FD28: 4 }
  r = suggestBoosts(booths, counts, counts, t1335)
  assert.deepEqual(r.groups.map((g) => [g.label, g.comparable, g.sufficient]), [['15–16 points', 6, true], ['12 points', 3, false]])
  assert.deepEqual(ids(r.rows), ['OPEN12'])
  assert.equal(r.rows.find((x) => x.boothId === 'OPEN12').currentPoints, 15, 'its 28 is over; it is a 15 now')
  assert.equal(r.rows.find((x) => x.boothId === 'ED5').currentPoints, 16)

  // 15:00 — every stall open; one is quiet.
  const t15 = Date.parse('2026-09-18T15:00:00+07:00')
  counts = { ED1: 10, ED2: 10, ED3: 10, ED4: 10, ED5: 10, OPEN12: 10, FD26: 20, FD27: 20, FD28: 20, FD29: 20, FD30: 5 }
  r = suggestBoosts(booths, counts, counts, t15)
  assert.deepEqual(ids(r.rows), ['FD30'])
  assert.equal(r.rows.find((x) => x.boothId === 'FD30').suggestedPoints, 12 + boostFor(12, 5, 20))
})

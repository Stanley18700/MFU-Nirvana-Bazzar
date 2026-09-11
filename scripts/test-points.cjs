const { test } = require('node:test')
const assert = require('node:assert/strict')
const { effectivePoints, eligibleForAdjustment, pointWindow, suggestPoints, POINT_WINDOW_MS } = require('../functions/lib/shared/points')
const { dayOf } = require('../functions/lib/shared/model')
const now = Date.parse('2026-09-16T04:32:12Z')
const booth = (id, extra = {}) => ({ id, nameEn: id, eventId: 'event', points: 20, active: true, isPrizeDesk: false, activeDays: [dayOf(new Date(now))], ...extra })

test('quiet, typical and busy rewards use base points without compounding', () => {
  const booths = [booth('quiet', { temporaryPoints: 25, pointsExpireAt: now + 1000 }), booth('typical'), booth('busy')]
  const result = suggestPoints(booths, { quiet: 2, typical: 10, busy: 18 }, now)
  assert.equal(result.average, 10)
  assert.equal(result.sufficient, true)
  assert.deepEqual(result.rows.map((r) => r.suggestedPoints), [25, 20, 15])
  assert.deepEqual(result.rows.map((r) => r.reason), ['quiet', 'typical', 'busy'])
})
test('threshold equality stays at base; equal traffic stays at base', () => {
  const booths = ['a', 'b', 'c', 'd'].map((id) => booth(id))
  assert.deepEqual(suggestPoints(booths, { a: 15, b: 25, c: 20, d: 20 }, now).rows.map((r) => r.suggestedPoints), [20, 20, 20, 20])
  assert.deepEqual(suggestPoints(booths, { a: 5, b: 5, c: 5, d: 5 }, now).rows.map((r) => r.suggestedPoints), [20, 20, 20, 20])
})
test('minimum sample and booth count prevent changes; zero-visit booths remain in the average', () => {
  const booths = ['a', 'b', 'c'].map((id) => booth(id))
  assert.equal(suggestPoints(booths, {}, now).sufficient, false)
  assert.equal(suggestPoints(booths, { a: 14 }, now).sufficient, false)
  assert.equal(suggestPoints(booths.slice(0, 2), { a: 100 }, now).sufficient, false)
  const result = suggestPoints(booths, { a: 15 }, now)
  assert.equal(result.sufficient, true)
  assert.equal(result.average, 5)
  assert.deepEqual(result.rows.map((r) => r.suggestedPoints), [15, 25, 25])
})
test('round whole points and enforce the existing 1–100 range', () => {
  const result = suggestPoints([booth('a', { points: 100 }), booth('b', { points: 15 }), booth('c', { points: 1 })], { c: 18 }, now)
  assert.deepEqual(result.rows.map((r) => r.suggestedPoints), [100, 19, 1])
})
test('eligibility excludes other events, days, closed booths and prize desks', () => {
  assert.equal(eligibleForAdjustment(booth('a'), 'event', dayOf(new Date(now))), true)
  for (const extra of [{ eventId: 'old' }, { active: false }, { activeDays: [] }, { isPrizeDesk: true }, { adjustmentExcluded: true }]) {
    assert.equal(eligibleForAdjustment(booth('a', extra), 'event', dayOf(new Date(now))), false)
  }
})
test('expiry boundary and ineligible booths return base points without cleanup', () => {
  const b = booth('a', { temporaryPoints: 25, pointsExpireAt: now + 1000 })
  assert.equal(effectivePoints(b, now), 25)
  assert.equal(effectivePoints(b, now + 999), 25)
  assert.equal(effectivePoints(b, now + 1000), 20)
  assert.equal(effectivePoints(booth('legacy'), now), 20)
  for (const extra of [{ active: false }, { activeDays: [] }, { isPrizeDesk: true }, { adjustmentExcluded: true }, { temporaryPoints: NaN }, { temporaryPoints: 101 }]) {
    assert.equal(effectivePoints({ ...b, ...extra }, now), 20)
  }
})
test('window is exactly 30 completed minutes on a five-minute boundary', () => {
  const w = pointWindow(now)
  assert.equal(w.windowEnd, Date.parse('2026-09-16T04:30:00Z'))
  assert.equal(w.windowEnd - w.windowStart, POINT_WINDOW_MS)
})

/**
 * Prize-session helpers (shared/model.ts) — the rules that decide whether the prize desk is open
 * and how many gifts that session has left.
 *
 *   npm run test:sessions
 *
 * The desk is stocked per session, so two answers must never be confused: `null` ("closed, come
 * back at 12:00") and `0` ("open, all gone"). Most of what follows guards that boundary, and the
 * boundaries of the windows themselves, where an off-by-one minute means a visitor at 11:59 is
 * told the wrong thing. Every fixture is written in +07:00 and the suite is run under TZ=UTC, so
 * a helper that quietly used the process clock instead of Asia/Bangkok would fail here.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_PRIZE_SESSIONS, currentPrizeSession, nextPrizeSession, sessionStockRemaining,
  minuteOfDay, sessionStockKey, minuteToHHMM,
} = require('../functions/lib/shared/model')

const DAYS = ['2026-09-16', '2026-09-17', '2026-09-18']
const S = DEFAULT_PRIZE_SESSIONS
const at = (iso) => new Date(iso)
const cur = (t) => currentPrizeSession(DAYS, S, at(t))
const nxt = (t) => nextPrizeSession(DAYS, S, at(t))

test('minute of day is Bangkok time, not the process timezone', () => {
  assert.equal(minuteOfDay(at('2026-09-16T09:00:00+07:00')), 540)
  assert.equal(minuteOfDay(new Date('2026-09-16T02:00:00Z')), 540)
  assert.equal(minuteOfDay(at('2026-09-16T23:30:00+07:00')), 23 * 60 + 30)
})

test('a session is open from its start minute up to but not including its end', () => {
  assert.equal(cur('2026-09-16T08:59:00+07:00'), null)
  assert.equal(cur('2026-09-16T09:00:00+07:00').session.id, 'am')
  assert.equal(cur('2026-09-16T11:59:00+07:00').session.id, 'am')
  assert.equal(cur('2026-09-16T12:00:00+07:00').session.id, 'pm')   // no gap at the handover
  assert.equal(cur('2026-09-16T15:59:00+07:00').session.id, 'pm')
  assert.equal(cur('2026-09-16T16:00:00+07:00'), null)
})

test('the desk is closed on a day the event does not run', () => {
  assert.equal(cur('2026-09-19T10:00:00+07:00'), null)
  assert.equal(cur('2026-09-15T10:00:00+07:00'), null)
})

test('the stock key names the day and the session', () => {
  assert.equal(cur('2026-09-17T10:00:00+07:00').key, '2026-09-17#am')
  assert.equal(cur('2026-09-17T10:00:00+07:00').key, sessionStockKey('2026-09-17', 'am'))
})

test('the next session is what the desk tells someone it turns away', () => {
  assert.equal(nxt('2026-09-16T07:00:00+07:00').key, '2026-09-16#am')   // before opening
  assert.equal(nxt('2026-09-16T10:00:00+07:00').key, '2026-09-16#pm')   // mid-morning
  assert.equal(nxt('2026-09-16T16:30:00+07:00').key, '2026-09-17#am')   // after close, rolls over
  assert.equal(nxt('2026-09-18T13:00:00+07:00'), null)                  // last session of the event
  assert.equal(nxt('2026-09-18T16:30:00+07:00'), null)
})

test('closed reads as null and never as zero', () => {
  const tier = { stockPerSession: 50, sessionRemaining: { '2026-09-16#am': 3 }, stockRemaining: 299 }
  assert.equal(sessionStockRemaining(tier, null), null)
  assert.equal(sessionStockRemaining({ stockPerSession: 50, sessionRemaining: { '2026-09-16#am': 0 }, stockRemaining: 1 },
    cur('2026-09-16T10:00:00+07:00')), 0)
})

test('an untouched session is full, not empty', () => {
  const tier = { stockPerSession: 50, sessionRemaining: { '2026-09-16#am': 3 }, stockRemaining: 299 }
  assert.equal(sessionStockRemaining(tier, cur('2026-09-16T10:00:00+07:00')), 3)    // written
  assert.equal(sessionStockRemaining(tier, cur('2026-09-16T13:00:00+07:00')), 50)   // same day, other session
  assert.equal(sessionStockRemaining(tier, cur('2026-09-17T10:00:00+07:00')), 50)   // fresh day
})

test('a tier with no per-session stock keeps the single-pool behaviour', () => {
  assert.equal(sessionStockRemaining({ stockRemaining: 7 }, cur('2026-09-16T10:00:00+07:00')), 7)
})

test('session times edited by an admin take effect without a redeploy', () => {
  const late = [
    { id: 'am', label: 'Morning', startMinute: 10 * 60, endMinute: 13 * 60 },
    { id: 'pm', label: 'Afternoon', startMinute: 13 * 60, endMinute: 18 * 60 },
  ]
  assert.equal(currentPrizeSession(DAYS, late, at('2026-09-16T09:30:00+07:00')), null)
  assert.equal(currentPrizeSession(DAYS, late, at('2026-09-16T17:00:00+07:00')).session.id, 'pm')
})

test('an epoch number works wherever a Date does', () => {
  assert.equal(currentPrizeSession(DAYS, S, at('2026-09-16T10:00:00+07:00').getTime()).session.id, 'am')
  assert.equal(nextPrizeSession(DAYS, S, at('2026-09-16T10:00:00+07:00').getTime()).key, '2026-09-16#pm')
})

test('clock formatting pads to HH:MM', () => {
  assert.equal(minuteToHHMM(540), '09:00')
  assert.equal(minuteToHHMM(16 * 60 + 5), '16:05')
})

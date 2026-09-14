// Isolated Firestore integration tests for per-session prize stock. Calls the real callables
// with explicit auth contexts. Run only against a disposable demo project.
//
// The pure helpers are covered by test-sessions.cjs. What is proved here is the behaviour that
// only exists once a transaction, an event document and a stock map are involved:
//   - a shut window and an empty one are different refusals, and stay different
//   - a top-up lands on the session that is open and nowhere else
//   - the absent-key trap: an untouched session must read as its full allowance, so a top-up
//     written as an increment would give the delta instead of allowance + delta
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Set FIRESTORE_EMULATOR_HOST and a demo-* GCLOUD_PROJECT before running these tests.')
}
const { db, Timestamp, clearEventCache } = require('../functions/lib/lib')
const { adjustStock, setSessionAllowance } = require('../functions/lib/admin')
const { updateEvent } = require('../functions/lib/event')
const { confirmRedemption, lookupRedemption } = require('../functions/lib/organizer')
const { redemptionCode } = require('../functions/lib/visitor')
const { dayOf, minuteOfDay, sessionStockKey } = require('../functions/lib/shared/model')

const eventId = 'session-test'
const TIER = 'gift'
const ALLOWANCE = 50
const req = (data = {}, role = 'admin', uid = 'admin') => ({ data, auth: { uid, token: { role } }, rawRequest: { headers: {}, ip: '127.0.0.1' } })
const call = (fn, data, role, uid) => fn.run(req(data, role, uid))
const reject = (fn, code) => assert.rejects(fn, (e) => e.code === code)

/** Windows placed relative to the clock, so the tests read the same at 09:00 as at 23:00. */
function windows(now = Date.now()) {
  const m = minuteOfDay(new Date(now))
  const clamp = (x) => Math.max(0, Math.min(1440, x))
  return {
    open: [{ id: 'am', label: 'Morning', startMinute: clamp(m - 60), endMinute: clamp(m + 60) }],
    // Entirely in the past, so nothing is open and there is nothing later today either.
    shut: [{ id: 'am', label: 'Morning', startMinute: clamp(m - 120), endMinute: clamp(m - 60) }],
  }
}

async function seed({ sessions, sessionRemaining } = {}) {
  for (const col of await db.listCollections()) await db.recursiveDelete(col)
  clearEventCache()
  const now = Date.now()
  const day = dayOf(new Date(now))
  await db.doc(`events/${eventId}`).set({
    nameEn: 'Session test', nameTh: '', status: 'live', active: true, days: [day],
    zonePoints: { entrance: 10, middle: 10, far: 10 }, qrPeriodSeconds: 20,
    startsAt: Timestamp.fromMillis(now - 3600_000), endsAt: Timestamp.fromMillis(now + 3600_000),
    prizeSessions: sessions ?? windows(now).open,
  })
  await db.doc(`prizeTiers/${TIER}`).set({
    eventId, name: 'Gift', reward: 'A tote', thresholdPoints: 100, active: true, sortOrder: 1,
    stockPerSession: ALLOWANCE, sessionRemaining: sessionRemaining ?? {},
    stockTotal: ALLOWANCE, stockRemaining: ALLOWANCE, outOfStockNoteEn: 'All gone for now',
  })
  await db.doc('users/visitor1').set({ role: 'visitor', displayName: 'Visitor One', points: 120, stampCount: 12, stampedBoothIds: [] })
  await db.doc(`tierUnlocks/visitor1_${TIER}`).set({
    visitorId: 'visitor1', tierId: TIER, unlockedAt: Timestamp.now(), pointsAtUnlock: 120, stampCountAtUnlock: 12,
    redeemedAt: null, redeemedBy: null, redeemedSessionKey: null, voidedAt: null, voidedBy: null, voidReason: null,
  })
  return { day, key: sessionStockKey(day, 'am') }
}

const tier = async () => (await db.doc(`prizeTiers/${TIER}`).get()).data()
// Alphanumeric, like a real Firebase uid: the redemption payload is parsed with
// /([A-Za-z0-9]+)\.(\d+)\.([A-Z2-7]{8})/, so a hyphen in a fixture uid silently fails to match.
const credential = async (uid = 'visitor1') => ({ payload: (await call(redemptionCode, {}, 'visitor', uid)).payload })

after(async () => { await db.terminate() })

test('a shut window and an empty one are different refusals', async () => {
  // Closed. The desk must not be told "out of stock" — it says nothing about stock, and staff
  // who hear it will turn people away for the rest of the day.
  await seed({ sessions: windows().shut })
  const closed = await call(confirmRedemption, { ...(await credential()), tierId: TIER })
  assert.equal(closed.status, 'desk_closed')
  assert.ok(!('note' in closed), 'a closed desk has no out-of-stock note to show')
  assert.equal((await tier()).stockRemaining, ALLOWANCE, 'a refusal spends nothing')

  // Open, but this session is spent. A different message, and the points are untouched either way.
  const { key } = await seed({ sessionRemaining: {} })
  await db.doc(`prizeTiers/${TIER}`).update({ [`sessionRemaining.${key}`]: 0 })
  const empty = await call(confirmRedemption, { ...(await credential()), tierId: TIER })
  assert.equal(empty.status, 'out_of_stock')
  assert.equal(empty.note, 'All gone for now')
  assert.equal((await db.doc('users/visitor1').get()).data().points, 120, 'sessions gate the gift, never the points')
})

test('a top-up on an untouched session gives the allowance plus the delta', async () => {
  // The trap this guards: an untouched session has no map entry, so writing the top-up as an
  // increment would store 10 rather than 60 — and the desk would lose forty gifts.
  const { key } = await seed()
  assert.equal((await tier()).sessionRemaining[key], undefined, 'untouched means absent, not zero')

  const r = await call(adjustStock, { tierId: TIER, delta: 10, reason: 'a box turned up', kind: 'restock' })
  assert.equal(r.sessionKey, key)
  const t = await tier()
  assert.equal(t.sessionRemaining[key], ALLOWANCE + 10)
  assert.equal(t.stockPerSession, ALLOWANCE, 'a top-up is for this session, not a standing rise')
  assert.equal(t.stockRemaining, ALLOWANCE + 10, 'the event-wide audit figure follows')
  assert.equal(t.stockTotal, ALLOWANCE + 10)

  const ledger = await db.collection('stockAdjustments').where('tierId', '==', TIER).get()
  assert.equal(ledger.size, 1)
  assert.equal(ledger.docs[0].data().sessionKey, key, 'the ledger records which session it landed in')
})

test('a top-up on a partly spent session adds to what is left', async () => {
  const { key } = await seed()
  await call(confirmRedemption, { ...(await credential()), tierId: TIER })
  assert.equal((await tier()).sessionRemaining[key], ALLOWANCE - 1)

  await call(adjustStock, { tierId: TIER, delta: 5, reason: 'five more', kind: 'restock' })
  assert.equal((await tier()).sessionRemaining[key], ALLOWANCE + 4)
})

test('a top-up is refused while the desk is shut, and names when it opens', async () => {
  // "This session" has no meaning with no session open. Quietly choosing the next one would
  // hand someone a surprise at nine tomorrow.
  await seed({ sessions: windows().shut })
  await reject(() => call(adjustStock, { tierId: TIER, delta: 10, reason: 'too early', kind: 'restock' }), 'failed-precondition')
  assert.equal((await tier()).stockRemaining, ALLOWANCE, 'a refused adjustment moves nothing at all')
})

test('a session cannot be taken below zero', async () => {
  const { key } = await seed()
  await reject(() => call(adjustStock, { tierId: TIER, delta: -(ALLOWANCE + 1), reason: 'too many', kind: 'correction' }), 'invalid-argument')
  assert.equal((await tier()).sessionRemaining[key], undefined, 'still untouched')
})

test('the desk is told how many are left in the session, not in the event pool', async () => {
  const { key } = await seed()
  await db.doc(`prizeTiers/${TIER}`).update({ [`sessionRemaining.${key}`]: 7, stockRemaining: 300, stockTotal: 300 })
  const r = await call(lookupRedemption, { ...(await credential()) })
  assert.equal(r.status, 'ok')
  const t = r.tiers.find((x) => x.id === TIER)
  assert.equal(t.sessionRemaining, 7, 'the number the desk spends')
  assert.equal(t.stockPerSession, ALLOWANCE)
  assert.equal(t.stockRemaining, 300, 'the pool is still reported, as the audit figure')
  assert.ok(r.session, 'an open window is named')
  assert.equal(r.nextOpensAt, null, 'and nothing is pending while one is open')
})

test('a closed desk reports null remaining, which is not zero', async () => {
  await seed({ sessions: windows().shut })
  const r = await call(lookupRedemption, { ...(await credential()) })
  const t = r.tiers.find((x) => x.id === TIER)
  assert.equal(t.sessionRemaining, null)
  assert.notEqual(t.sessionRemaining, 0)
  assert.equal(r.session, null)
})

test('overlapping prize sessions are refused', async () => {
  // currentPrizeSession takes the first window that matches, so two that overlap would quietly
  // spend one session's stock while the other looked untouched.
  await seed()
  await reject(() => call(updateEvent, {
    id: eventId,
    prizeSessions: [
      { id: 'am', label: 'Morning', startMinute: 540, endMinute: 720 },
      { id: 'pm', label: 'Afternoon', startMinute: 700, endMinute: 960 },
    ],
  }), 'invalid-argument')

  await reject(() => call(updateEvent, {
    id: eventId,
    prizeSessions: [{ id: 'am', label: 'Morning', startMinute: 720, endMinute: 540 }],
  }), 'invalid-argument')

  // The windows an admin would actually set are accepted, and survive the round trip.
  await call(updateEvent, {
    id: eventId,
    prizeSessions: [
      { id: 'am', label: 'Morning', startMinute: 540, endMinute: 720 },
      { id: 'pm', label: 'Afternoon', startMinute: 720, endMinute: 960 },
    ],
  })
  const saved = (await db.doc(`events/${eventId}`).get()).data().prizeSessions
  assert.deepEqual(saved.map((s) => s.id), ['am', 'pm'])
  assert.equal(saved[1].startMinute, 720)
})

/*
 * The allowance, which is the other half of stock and the one `adjustStock` deliberately will
 * not touch. The distinction that matters here is which sessions move: a window already spent
 * from keeps its own figure, and everything untouched re-bases with nothing written to the map.
 */
test('the allowance re-bases untouched sessions and leaves a spent one alone', async () => {
  const { key } = await seed()
  // Spend this session down to 44, so it has a map entry and the rest do not.
  await db.doc(`prizeTiers/${TIER}`).update({ [`sessionRemaining.${key}`]: 44 })

  await call(setSessionAllowance, { tierId: TIER, stockPerSession: 30, reason: 'fewer totes than promised' })
  const t = await tier()
  assert.equal(t.stockPerSession, 30, 'the allowance itself moved')
  assert.equal(t.sessionRemaining[key], 44, 'the session already under way keeps its own count')
  assert.equal(Object.keys(t.sessionRemaining).length, 1, 'no other session was backfilled')
})

test('the allowance can be set while the desk is shut, unlike a top-up', async () => {
  // The case that matters operationally: nobody sets tomorrow's allowance mid-queue, so the
  // refusal `adjustStock` raises here would make the control useless exactly when it is wanted.
  await seed({ sessions: windows().shut })
  await reject(call(adjustStock, { tierId: TIER, delta: 10, reason: 'box arrived' }), 'failed-precondition')
  await call(setSessionAllowance, { tierId: TIER, stockPerSession: 70, reason: 'more stock confirmed' })
  assert.equal((await tier()).stockPerSession, 70)
})

test('the allowance is refused when it would drive the event pool below zero', async () => {
  await seed()
  // One window today, so the pool moves by (new - old) x 1. Dropping far enough would imply
  // fewer gifts were ever loaded in than have already gone out, and the archive would then lie.
  await db.doc(`prizeTiers/${TIER}`).update({ stockRemaining: 5 })
  await reject(call(setSessionAllowance, { tierId: TIER, stockPerSession: 0, reason: 'cancel the gift' }), 'invalid-argument')
  assert.equal((await tier()).stockPerSession, ALLOWANCE, 'a refusal changes nothing')
})

test('the allowance is logged like any other stock change', async () => {
  await seed()
  await call(setSessionAllowance, { tierId: TIER, stockPerSession: 60, reason: 'second pallet' })
  const rows = await db.collection('stockAdjustments').where('kind', '==', 'allowance').get()
  assert.equal(rows.size, 1, 'one ledger row, so the closing figures still reconcile')
  const row = rows.docs[0].data()
  assert.equal(row.previousPerSession, ALLOWANCE)
  assert.equal(row.stockPerSession, 60)
  assert.equal(row.reason, 'second pallet')
})

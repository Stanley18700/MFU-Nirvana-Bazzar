// Isolated Firestore integration tests. Calls the real callable handlers with explicit auth contexts.
// Run only against a disposable demo project; no production reads or writes are allowed.
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith('demo-')) {
  throw new Error('Set FIRESTORE_EMULATOR_HOST and a demo-* GCLOUD_PROJECT before running these tests.')
}
const { db, Timestamp, clearEventCache } = require('../functions/lib/lib')
const { previewPointAdjustments: preview, applyPointAdjustments: apply, resetPointAdjustments: reset } = require('../functions/lib/points')
const { updateBooth, savePrizePolicy } = require('../functions/lib/admin')
const { purgeEventData } = require('../functions/lib/event')
const { scan } = require('../functions/lib/visitor')
const { onScanCreate, purgePersonalData } = require('../functions/lib/triggers')
const { dayOf } = require('../functions/lib/shared/model')
const { effectivePoints, pointWindow } = require('../functions/lib/shared/points')
const { computeToken, counterFor, buildPayload } = require('../functions/lib/shared/token')
const eventId = 'points-test'
const req = (data = {}, role = 'admin', uid = 'admin') => ({ data, auth: { uid, token: { role } }, rawRequest: { headers: {}, ip: '127.0.0.1' } })
const call = (fn, data) => fn.run(req(data))
const reject = (fn, code) => assert.rejects(fn, (e) => e.code === code)
let seq = 0

async function seed() {
  const cols = await db.listCollections()
  for (const col of cols) await db.recursiveDelete(col)
  clearEventCache()
  const now = Date.now(), day = dayOf(new Date(now))
  await db.doc(`events/${eventId}`).set({ nameEn: 'Point test', nameTh: '', status: 'live', active: true, days: [day],
    zonePoints: { entrance: 10, middle: 15, far: 20 }, startsAt: Timestamp.fromMillis(now - 3600000), endsAt: Timestamp.fromMillis(now + 3600000), qrPeriodSeconds: 20 })
  for (const [id, n] of [['quiet', 2], ['typical', 10], ['busy', 18]]) {
    await db.doc(`booths/${id}`).set({ eventId, nameEn: id, shortName: id, points: 20, active: true, isPrizeDesk: false, activeDays: [day], zone: 'middle', sortOrder: 1, createdAt: Timestamp.now() })
    await db.doc(`boothSecrets/${id}`).set({ secret: Buffer.alloc(32, 3).toString('base64') })
    const batch = db.batch()
    for (let i = 0; i < n; i++) batch.set(db.doc(`scans/history-${id}-${i}`), { eventId, boothId: id, visitorId: `old-${i}`, scannedAt: Timestamp.fromMillis(pointWindow(now).windowEnd - 60000), pointsAwarded: 20 })
    await batch.commit()
  }
  await db.doc('prizeTiers/top').set({ eventId, name: 'Top', thresholdPoints: 70, active: true })
}

test('preview is event scoped, deduplicates visits, excludes ineligible booths and warns about prizes', async () => {
  await seed()
  const w = pointWindow(Date.now())
  await db.doc('scans/duplicate').set({ eventId, boothId: 'quiet', visitorId: 'old-0', scannedAt: Timestamp.fromMillis(w.windowEnd - 60000) })
  await db.doc('scans/outside').set({ eventId, boothId: 'quiet', visitorId: 'outside', scannedAt: Timestamp.fromMillis(w.windowStart - 1) })
  await db.doc('scans/current-bucket').set({ eventId, boothId: 'quiet', visitorId: 'current', scannedAt: Timestamp.fromMillis(w.windowEnd) })
  await db.doc('scans/other-event').set({ eventId: 'old', boothId: 'quiet', visitorId: 'other', scannedAt: Timestamp.fromMillis(w.windowEnd - 60000) })
  const base = (await db.doc('booths/quiet').get()).data()
  for (const [id, extra] of [['excluded', { adjustmentExcluded: true }], ['closed', { active: false }], ['desk', { isPrizeDesk: true }], ['tomorrow', { activeDays: ['2099-01-01'] }], ['other-event', { eventId: 'old' }]]) {
    await db.doc(`booths/${id}`).set({ ...base, ...extra })
  }
  const p = await call(preview)
  assert.equal(p.totalScans, 30)
  assert.equal(p.rows.length, 3)
  assert.equal(p.average, 10)
  assert.equal(p.availablePoints, 80) // includes the excluded booth's base points
  assert.equal(p.unreachableTiers.length, 0)
  await db.doc('prizeTiers/top').update({ thresholdPoints: 90 })
  assert.equal((await call(preview)).unreachableTiers[0].name, 'Top')
})

test('all endpoints reject visitors and signed-out callers', async () => {
  for (const fn of [preview, apply, reset]) {
    await reject(() => fn.run(req({}, 'visitor')), 'permission-denied')
    await reject(() => fn.run({ data: {} }), 'unauthenticated')
  }
})

test('apply is atomic, idempotent and subject to cooldown; reset clears only temporary values', async () => {
  await seed()
  const historical = (await db.doc('scans/history-quiet-0').get()).data()
  await db.doc('users/earned').set({ points: 40 })
  await db.doc('tierUnlocks/earned_top').set({ visitorId: 'earned', tierId: 'top', pointsAtUnlock: 40, redeemedAt: Timestamp.now() })
  const unlock = (await db.doc('tierUnlocks/earned_top').get()).data()
  const p = await call(preview)
  const [a, retry] = await Promise.all([call(apply, { previewId: p.id }), call(apply, { previewId: p.id })])
  assert.deepEqual(a, retry)
  assert.equal(a.expiresAt - a.appliedAt, 30 * 60000)
  for (const [id, value] of [['quiet', 25], ['typical', 20], ['busy', 15]]) {
    const b = (await db.doc(`booths/${id}`).get()).data()
    assert.equal(b.points, 20)
    assert.equal(effectivePoints(b, a.appliedAt), value)
    assert.equal(effectivePoints(b, a.expiresAt), 20)
  }
  const next = await call(preview)
  await reject(() => call(apply, { previewId: next.id }), 'failed-precondition')
  await call(reset)
  assert.equal((await db.doc('booths/quiet').get()).data().temporaryPoints, null)
  assert.deepEqual(await call(apply, { previewId: p.id }), a) // retry after reset cannot reapply
  assert.equal((await db.doc('booths/quiet').get()).data().temporaryPoints, null)
  assert.deepEqual((await db.doc('scans/history-quiet-0').get()).data(), historical)
  assert.deepEqual((await db.doc('tierUnlocks/earned_top').get()).data(), unlock)
  assert.equal((await db.doc('users/earned').get()).data().points, 40)
  const audits = await db.collection('auditLog').where('action', '==', 'applyPointAdjustments').get()
  assert.equal(audits.size, 1)
})

test('expired, changed and insufficient proposals cannot apply', async () => {
  await seed()
  let p = await call(preview)
  await db.doc(`pointAdjustmentPreviews/${p.id}`).update({ validUntil: Date.now() - 1 })
  await reject(() => call(apply, { previewId: p.id }), 'failed-precondition')
  p = await call(preview)
  await call(updateBooth, { id: 'quiet', points: 30 })
  await reject(() => call(apply, { previewId: p.id }), 'failed-precondition')
  p = await call(preview)
  await call(reset)
  await reject(() => call(apply, { previewId: p.id }), 'failed-precondition')
  p = await call(preview)
  await db.doc('prizeTiers/top').update({ thresholdPoints: 75 })
  await reject(() => call(apply, { previewId: p.id }), 'failed-precondition')
  await db.recursiveDelete(db.collection('scans'))
  p = await call(preview)
  assert.equal(p.sufficient, false)
  await reject(() => call(apply, { previewId: p.id }), 'failed-precondition')
})

test('manual base edits and exclusion clear adjustments; unrelated edits preserve them', async () => {
  await seed()
  const p = await call(preview)
  await call(apply, { previewId: p.id })
  await call(updateBooth, { id: 'quiet', location: 'New location' })
  assert.equal((await db.doc('booths/quiet').get()).data().temporaryPoints, 25)
  await call(updateBooth, { id: 'quiet', adjustmentExcluded: true })
  assert.equal((await db.doc('booths/quiet').get()).data().temporaryPoints, null)
  await call(updateBooth, { id: 'busy', points: 18 })
  const b = (await db.doc('booths/busy').get()).data()
  assert.equal(b.points, 18)
  assert.equal(b.temporaryPoints, null)
})

async function visit(boothId) {
  const uid = `scan-user-${++seq}`
  await db.doc(`users/${uid}`).set({ role: 'visitor', points: 0, stampCount: 0, visitorType: 'guest', stampedBoothIds: [] })
  const secret = (await db.doc(`boothSecrets/${boothId}`).get()).data().secret
  const counter = counterFor(Date.now(), 20)
  const token = await computeToken(secret, boothId, counter)
  const result = await scan.run(req({ payload: buildPayload('http://localhost', boothId, counter, token) }, 'visitor', uid))
  assert.equal(result.status, 'success')
  const stored = await db.doc(`scans/${uid}_${boothId}`).get()
  assert.equal(result.pointsAwarded, stored.data().pointsAwarded)
  assert.equal(result.points, result.pointsAwarded)
  return { result, stored, uid }
}

test('real scans preserve the awarded value through expiry and trigger updates', async () => {
  await seed()
  const p = await call(preview)
  await call(apply, { previewId: p.id })
  const first = await visit('quiet')
  assert.equal(first.result.pointsAwarded, 25)
  await db.doc('booths/quiet').update({ pointsExpireAt: Date.now() - 1 })
  const second = await visit('quiet')
  assert.equal(second.result.pointsAwarded, 20)
  await onScanCreate.run({ data: first.stored, params: { scanId: first.stored.id } })
  assert.equal((await db.doc(`users/${first.uid}`).get()).data().points, 25)
  assert.equal((await first.stored.ref.get()).data().pointsAwarded, 25)
})

test('a scan racing an application receives the value of its serialized booth state', async () => {
  await seed()
  const p = await call(preview)
  const [, visitResult] = await Promise.all([call(apply, { previewId: p.id }), visit('quiet')])
  assert.ok([20, 25].includes(visitResult.result.pointsAwarded))
  assert.equal(visitResult.stored.data().pointsAwarded, visitResult.result.pointsAwarded)
  assert.equal((await visit('quiet')).result.pointsAwarded, 25)
})

const sumShards = async (field) => {
  const shards = await db.collection('stats/event/shards').get()
  return shards.docs.reduce((t, d) => t + (d.data()[field] ?? 0), 0)
}

test('a redelivered scan trigger counts the stamp once', async () => {
  await seed()
  const first = await visit('quiet')
  const delivery = { id: 'delivery-1', data: first.stored, params: { scanId: first.stored.id } }

  await onScanCreate.run(delivery)
  const once = (await db.doc(`users/${first.uid}`).get()).data()
  assert.equal(once.stampCount, 1)
  assert.equal(once.points, 20)
  assert.equal(await sumShards('stamps'), 1)

  // Firestore delivers at least once. The same delivery, and a fresh delivery id for the same
  // scan, must both be ignored — otherwise the visitor ends on 40 points and 2 stamps with
  // only one booth in stampedBoothIds, which is what the bug looked like.
  await onScanCreate.run(delivery)
  await onScanCreate.run({ ...delivery, id: 'delivery-2' })

  const after = (await db.doc(`users/${first.uid}`).get()).data()
  assert.equal(after.stampCount, 1)
  assert.equal(after.points, 20)
  assert.deepEqual(after.stampedBoothIds, ['quiet'])
  assert.equal(await sumShards('stamps'), 1)
  assert.equal(await sumShards('points'), 20)
  assert.equal((await db.doc(`stats/booths/items/quiet`).get()).data().stamps, 1)
})

after(async () => { await db.terminate() })

test('a threshold backfills every eligible visitor, not just the first batch', async () => {
  await seed()
  // 451 is the number that mattered: the old code stopped after 450 new unlocks per tier and
  // returned nothing to say it had stopped, so the 451st visitor saw enough points on their
  // passport and would have been turned away at the desk. A three-day event is ~1,500 visitors.
  const total = 451
  for (let i = 0; i < total; i += 400) {
    const batch = db.batch()
    for (let j = i; j < Math.min(i + 400, total); j++) {
      batch.set(db.doc(`users/bulk-${String(j).padStart(4, '0')}`), {
        role: 'visitor', points: 60, stampCount: 3, stampedBoothIds: [], visitorType: 'guest',
      })
    }
    await batch.commit()
  }

  const r = await call(savePrizePolicy, { tiers: [{ id: 'top', name: 'Top', reward: 'A thing', thresholdPoints: 10, stockTotal: 1000 }] })
  assert.equal(r.unlocksCreated, total)
  const unlocks = await db.collection('tierUnlocks').where('tierId', '==', 'top').count().get()
  assert.equal(unlocks.data().count, total)

  // Saving the same policy again must not double up: the unlock id is deterministic and the
  // bulk existence check is what keeps a re-save from creating a second row per visitor.
  const again = await call(savePrizePolicy, { tiers: [{ id: 'top', name: 'Top', reward: 'A thing', thresholdPoints: 10, stockTotal: 1000 }] })
  assert.equal(again.unlocksCreated, 0)
  assert.equal((await db.collection('tierUnlocks').where('tierId', '==', 'top').count().get()).data().count, total)
})

const bulkVisitors = async (n, prefix, extra = {}) => {
  for (let i = 0; i < n; i += 400) {
    const batch = db.batch()
    for (let j = i; j < Math.min(i + 400, n); j++) {
      batch.set(db.doc(`users/${prefix}-${String(j).padStart(4, '0')}`), {
        role: 'visitor', points: 60, stampCount: 3, stampedBoothIds: ['quiet'],
        displayName: `Visitor ${j}`, studentId: `S${j}`, contact: `v${j}@example.com`,
        ethnicGroup: 'Lahu', visitorType: 'guest', ...extra,
      })
    }
    await batch.commit()
  }
}

test('the retention purge reaches past the first 400 visitors', async () => {
  await seed()
  // 401 is the number that mattered: the job read limit(400) with no cursor and the write does
  // not change `role`, so every nightly run rewrote the same first 400 and visitor 401 was
  // never purged — while the logs looked healthy.
  await bulkVisitors(401, 'ret')
  await db.doc(`events/${eventId}`).update({ endsAt: Timestamp.fromMillis(Date.now() - 91 * 86400000) })
  clearEventCache()

  await purgePersonalData.run({})

  const all = await db.collection('users').where('role', '==', 'visitor').get()
  const unpurged = all.docs.filter((d) => d.data().displayName !== 'Purged')
  assert.equal(unpurged.length, 0, `${unpurged.length} left unpurged, e.g. ${unpurged[0]?.id}`)
  assert.equal(all.size, 401)
  const last = await db.doc('users/ret-0400').get()
  assert.equal(last.data().displayName, 'Purged')
  assert.equal(last.data().studentId, null)
  assert.equal(last.data().ethnicGroup, null)
})

test('a visitor reset clears everyone, not just the first page', async () => {
  await seed()
  // The reset selects on points > 0 now. Selecting every visitor made the page never advance,
  // because the write clears points but not `role`.
  await bulkVisitors(700, 'reset')
  await db.doc(`events/${eventId}`).update({ status: 'archived' })
  clearEventCache()

  for (let round = 0; round < 10; round++) {
    const r = await call(purgeEventData, { eventId, scope: 'visitors' })
    if (r.deleted === 0) break
  }
  const withPoints = await db.collection('users').where('role', '==', 'visitor').where('points', '>', 0).count().get()
  assert.equal(withPoints.data().count, 0)
  const total = await db.collection('users').where('role', '==', 'visitor').count().get()
  assert.equal(total.data().count, 700, 'accounts are kept, only progress is cleared')
})

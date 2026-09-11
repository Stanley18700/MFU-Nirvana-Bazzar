import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db, FieldValue, Timestamp, shardRef, boothStatsRef, bucketRef, getActiveEvent, toMillis } from './lib'
import { BoothStats, PrizeTierDoc, ScanDoc, UserDoc, hourOf } from './shared/model'

/** §7.2 — one scan updates every counter in a single transaction, and creates tier unlocks. */
export const onScanCreate = onDocumentCreated('scans/{scanId}', async (event) => {
  const scan = event.data?.data() as ScanDoc | undefined
  if (!scan) return
  const at = (scan.scannedAt as Timestamp).toDate()
  const vt = scan.visitorType ?? 'guest'
  const inst = scan.institution || 'Unknown'
  const school = scan.institution === 'MFU' ? scan.school || 'Unknown school' : null
  const hostKey = `${scan.boothId}`

  const { ref: bRef, startsAt } = bucketRef(scan.eventId, at)
  const userRef = db.doc(`users/${scan.visitorId}`)
  const shard = shardRef()

  /**
   * Firestore delivers a trigger *at least* once, so the same scan can arrive twice. The scan
   * document itself cannot be created twice — `scan` uses a deterministic id and `tx.create`
   * (visitor.ts) — but `FieldValue.increment` is not idempotent, so a redelivery would award
   * the points and the stamp a second time. `arrayUnion` would not move, which is the
   * signature: two stamps counted, one booth in `stampedBoothIds`.
   *
   * The marker is keyed by the scan document, not the delivery: the id is deterministic
   * (`{uid}_{boothId}`), so it is stable across redeliveries *and* states the invariant we
   * actually want — one scan awards its points exactly once. Writing it in the same
   * transaction as the counters is what makes that hold. Deliberately an early return rather
   * than letting the unlock pass below re-run: a missed unlock is recoverable (savePrizePolicy
   * rebuilds them, and the desk reads through a callable), whereas double points corrupt the
   * leaderboard and prize eligibility for the rest of the event.
   *
   * Breakdowns are real nested maps, never 'byDay.2026-09-16' keys. `set()` takes a dotted
   * key as one literal field name — only `update()` splits it into a path — so a dotted key
   * would store a field no reader can find. `merge: true` deep-merges these maps, so the
   * per-key increments still accumulate.
   */
  const counted = await db.runTransaction(async (tx) => {
    const doneRef = db.doc(`countedScans/${event.params.scanId}`)
    if ((await tx.get(doneRef)).exists) return false
    tx.create(doneRef, {
      visitorId: scan.visitorId, boothId: scan.boothId, eventId: scan.eventId,
      deliveryId: event.id ?? null, processedAt: FieldValue.serverTimestamp(),
    })
    tx.set(shard, {
      stamps: FieldValue.increment(1),
      points: FieldValue.increment(scan.pointsAwarded),
      byDay: { [scan.day]: { stamps: FieldValue.increment(1) } },
      // cross-school matrix (§6.1): visitor school/institution x booth
      crossSchool: { [key(school ?? inst)]: { [hostKey]: FieldValue.increment(1) } },
    }, { merge: true })
    tx.set(boothStatsRef(scan.boothId), {
      boothId: scan.boothId,
      stamps: FieldValue.increment(1),
      byVisitorType: { [vt]: FieldValue.increment(1) },
      byDay: { [scan.day]: FieldValue.increment(1) },
      byHour: { [`${scan.day}T${hourOf(at)}`]: FieldValue.increment(1) },
      lastStampAt: scan.scannedAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    tx.set(bRef, {
      startsAt, day: scan.day,
      total: FieldValue.increment(1),
      perBooth: { [scan.boothId]: FieldValue.increment(1) },
    }, { merge: true })
    tx.update(userRef, {
      stampCount: FieldValue.increment(1),
      points: FieldValue.increment(scan.pointsAwarded),
      stampedBoothIds: FieldValue.arrayUnion(scan.boothId),
      daysAttended: FieldValue.arrayUnion(scan.day),
      lastSeenAt: FieldValue.serverTimestamp(),
    })
    return true
  })
  if (!counted) return

  // Tier unlocks are recorded as facts at the moment they happen (§6.7).
  const [userSnap, tiers] = await Promise.all([
    userRef.get(),
    db.collection('prizeTiers').where('active', '==', true).get(),
  ])
  const u = userSnap.data() as UserDoc
  const unlockBatch = db.batch()
  let any = false
  const funnel: Record<string, unknown> = {}
  if (u.stampCount === 1) funnel.visitorsWithStamps = FieldValue.increment(1)
  const lowest = Math.min(...tiers.docs.map((t) => (t.data() as PrizeTierDoc).thresholdPoints))
  for (const t of tiers.docs) {
    const tier = t.data() as PrizeTierDoc
    if (u.points >= tier.thresholdPoints) {
      const ref = db.doc(`tierUnlocks/${scan.visitorId}_${t.id}`)
      if (!(await ref.get()).exists) {
        if (tier.thresholdPoints === lowest) funnel.tierReached = FieldValue.increment(1)
        unlockBatch.set(ref, {
          visitorId: scan.visitorId, tierId: t.id,
          unlockedAt: FieldValue.serverTimestamp(),
          pointsAtUnlock: u.points, stampCountAtUnlock: u.stampCount,
          redeemedAt: null, redeemedBy: null, redemptionNote: null,
          voidedAt: null, voidedBy: null, voidReason: null,
        })
        any = true
      }
    }
  }
  if (Object.keys(funnel).length) unlockBatch.set(shardRef(), funnel, { merge: true })
  if (any || Object.keys(funnel).length) await unlockBatch.commit()
})

/** §8.2 — keeps the visitor count and the breakdowns current. */
export const onUserWrite = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data() as UserDoc | undefined
  const after = event.data?.after.data() as UserDoc | undefined
  const wasVisitor = before?.role === 'visitor' && !before.deletedAt
  const isVisitor = after?.role === 'visitor' && !after.deletedAt
  if (wasVisitor === isVisitor) return
  const delta = isVisitor ? 1 : -1
  const u = (isVisitor ? after : before)!
  const day = u.daysAttended?.[0] ?? 'unknown'
  // Nested maps, not dotted keys — see the note in onScanCreate. `byDay` is also written by
  // onScanCreate with a `stamps` leaf; the deep merge keeps both on the same day.
  const update: Record<string, unknown> = {
    visitors: FieldValue.increment(delta),
    byVisitorType: { [u.visitorType ?? 'guest']: FieldValue.increment(delta) },
    byCountry: { [u.countryCode ?? 'XX']: FieldValue.increment(delta) },
    byInstitution: { [key(u.institution || 'Unknown')]: FieldValue.increment(delta) },
    byDay: { [day]: { visitors: FieldValue.increment(delta) } },
  }
  if (u.institution === 'MFU') update.bySchool = { [key(u.school || 'Unknown school')]: FieldValue.increment(delta) }
  if (u.ethnicGroup) {
    update.byEthnicGroup = { [key(u.ethnicGroup)]: FieldValue.increment(delta) }
    update.ethnicResponses = FieldValue.increment(delta)
  } else {
    update.ethnicDeclines = FieldValue.increment(delta)
  }
  await shardRef().set(update, { merge: true })
})

/** §7.2 — booth ranks, recomputed every minute (Cloud Scheduler's floor). */
export const rankBooths = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  await recomputeRanks()
})

export async function recomputeRanks() {
  const snap = await db.collection('stats/booths/items').get()
  const rows = snap.docs
    .map((d) => ({ id: d.id, stamps: (d.data() as BoothStats).stamps ?? 0 }))
    .sort((a, b) => b.stamps - a.stamps)
  const batch = db.batch()
  rows.forEach((r, i) => batch.set(db.doc(`stats/booths/items/${r.id}`), { rank: i + 1 }, { merge: true }))
  await batch.commit()
}

/** §8.2 — visitors active in the last 15 minutes. */
export const sweepActive = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  const since = Timestamp.fromMillis(Date.now() - 15 * 60 * 1000)
  const agg = await db.collection('scans').where('scannedAt', '>=', since).count().get()
  await db.doc('stats/event').set({ activeLast15m: agg.data().count, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
})

/** §10 — 90-day retention. Runs daily; a no-op until the cut-off. */
export const purgePersonalData = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Bangkok' }, async () => {
  // §10 — 90 days after the live event ends, whenever that is. Never a fixed date, or a
  // future event's visitors would be purged mid-run.
  const ev = await getActiveEvent(true)
  const endsAt = toMillis(ev.endsAt)
  if (!endsAt) return
  if (Date.now() < endsAt + 90 * 86400_000) return
  const users = await db.collection('users').where('role', '==', 'visitor').limit(400).get()
  const batch = db.batch()
  users.docs.forEach((d) => batch.update(d.ref, {
    displayName: 'Purged', studentId: null, contact: `purged-${d.id}`, ethnicGroup: null, ethnicConsentAt: null, purgedAt: FieldValue.serverTimestamp(),
  }))
  await batch.commit()
})

/** Firestore field paths cannot contain '.', '/', etc. */
export function key(s: string): string {
  return s.replace(/[.~*/[\]]/g, '_').slice(0, 60)
}

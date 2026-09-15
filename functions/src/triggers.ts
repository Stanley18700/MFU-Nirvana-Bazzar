import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db, FieldValue, Timestamp, shardRef, demographicsRef, boothStatsRef, bucketRef, getActiveEvent, toMillis } from './lib'
import { BoothStats, PrizeTierDoc, ScanDoc, UserDoc, hourOf } from './shared/model'

/**
 * §7.2 — one scan updates every counter in a single transaction, and creates tier unlocks.
 *
 * `retry: true`, because this is where the points are actually credited. The transaction below
 * writes documents the whole hall shares — the 5-minute bucket, the booth's counter — and at
 * peak it will occasionally lose the contention race past its retries. Without `retry` a failed
 * run is simply dropped: the scan document exists, the phone showed "+10", and the passport never
 * moves. With it, Cloud Functions redelivers the event until the handler returns cleanly. The
 * `countedScans` marker is what makes that safe — a redelivery of a scan that did get counted
 * returns early and awards nothing twice.
 *
 * The one thing a retried trigger must never do is throw on a condition that will not clear:
 * that becomes a redelivery every few minutes for seven days. Hence the `exists` check on the
 * visitor below — a scan whose visitor has since been deleted is logged and finished, not thrown.
 */
export const onScanCreate = onDocumentCreated({ document: 'scans/{scanId}', retry: true }, async (event) => {
  const scan = event.data?.data() as ScanDoc | undefined
  if (!scan) return

  /**
   * The other half of the rule above: with `retry: true` a throw is a redelivery every few
   * minutes for seven days, so a scan this handler can *never* process has to finish quietly
   * instead of raising. `visitor.ts` always writes both of these in the transaction that
   * creates the scan, so this is unreachable from the app — but a row added by hand in the
   * console, or by one of the emulator scripts pointed at the wrong project, would otherwise
   * spend the festival weekend redelivering. Logged at error, because it means a stamp exists
   * that will never be credited and someone has to go and look.
   */
  const scannedAt = scan.scannedAt instanceof Timestamp ? scan.scannedAt : null
  if (!scannedAt || typeof scan.pointsAwarded !== 'number') {
    console.error(`onScanCreate: scan ${event.params.scanId} has no usable scannedAt/pointsAwarded; not counted`)
    return
  }
  const at = scannedAt.toDate()
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
    const [done, visitor] = await Promise.all([tx.get(doneRef), tx.get(userRef)])
    if (done.exists) return false
    if (!visitor.exists) {
      // Deleted between the scan and this run (an admin hard-delete, the cleanup script). Nothing
      // to credit and nobody to credit it to; returning rather than throwing is what stops
      // `retry: true` from redelivering this forever.
      console.warn(`onScanCreate: visitor ${scan.visitorId} no longer exists; scan ${event.params.scanId} not counted`)
      return false
    }
    tx.create(doneRef, {
      visitorId: scan.visitorId, boothId: scan.boothId, eventId: scan.eventId,
      deliveryId: event.id ?? null, processedAt: FieldValue.serverTimestamp(),
    })
    tx.set(shard, {
      stamps: FieldValue.increment(1),
      points: FieldValue.increment(scan.pointsAwarded),
      byDay: { [scan.day]: { stamps: FieldValue.increment(1) } },
    }, { merge: true })
    // cross-school matrix (§6.1): visitor school/institution x booth. Demographic, so it
    // belongs with the rest of them in the admin-only document, not in the shard an
    // organizer reads. Same transaction, so it is covered by the marker above.
    tx.set(demographicsRef(), {
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
  }, { maxAttempts: 10 })
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
  const counters: Record<string, unknown> = {
    visitors: FieldValue.increment(delta),
    byVisitorType: { [u.visitorType ?? 'guest']: FieldValue.increment(delta) },
    byDay: { [day]: { visitors: FieldValue.increment(delta) } },
  }
  // Who the visitors are goes to its own admin-only document (§4.1). An organizer's booth
  // screen subscribes to the event counters above; it must not receive a country, a school
  // or an ethnic group along with them.
  const who: Record<string, unknown> = {
    byCountry: { [u.countryCode ?? 'XX']: FieldValue.increment(delta) },
    byInstitution: { [key(u.institution || 'Unknown')]: FieldValue.increment(delta) },
  }
  if (u.institution === 'MFU') who.bySchool = { [key(u.school || 'Unknown school')]: FieldValue.increment(delta) }
  if (u.ethnicGroup) {
    who.byEthnicGroup = { [key(u.ethnicGroup)]: FieldValue.increment(delta) }
    who.ethnicResponses = FieldValue.increment(delta)
  } else {
    who.ethnicDeclines = FieldValue.increment(delta)
  }
  await Promise.all([
    shardRef().set(counters, { merge: true }),
    demographicsRef().set(who, { merge: true }),
  ])
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
export const purgePersonalData = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Bangkok', timeoutSeconds: 540 }, async () => {
  // §10 — 90 days after the live event ends, whenever that is. Never a fixed date, or a
  // future event's visitors would be purged mid-run.
  const ev = await getActiveEvent(true)
  const endsAt = toMillis(ev.endsAt)
  if (!endsAt) return
  if (Date.now() < endsAt + 90 * 86400_000) return

  /**
   * Pages by document id until there are none left. It used to read `limit(400)` with no
   * cursor, and since the write does not change `role`, every run returned the same first 400
   * documents: visitor 401 was not purged late, but never — while the job rewrote the same
   * 400 every night and looked healthy in the logs. A retention promise that quietly covers
   * only the alphabetically-first 400 people is the kind of failure nobody notices until
   * someone asks.
   *
   * Filtering on `purgedAt` would not work here: Firestore's `== null` matches an explicit
   * null, not a missing field, and the visitors already in the database have no such field.
   * A cursor needs nothing to be true of the existing data.
   */
  let cursor: QueryDocumentSnapshot | undefined
  let purged = 0
  for (;;) {
    let q = db.collection('users').where('role', '==', 'visitor').orderBy(FieldPath.documentId()).limit(400)
    if (cursor) q = q.startAfter(cursor)
    const users = await q.get()
    if (users.empty) break
    cursor = users.docs[users.docs.length - 1]
    const batch = db.batch()
    users.docs.forEach((d) => batch.update(d.ref, {
      displayName: 'Purged', studentId: null, contact: `purged-${d.id}`, ethnicGroup: null, ethnicConsentAt: null, purgedAt: FieldValue.serverTimestamp(),
    }))
    await batch.commit()
    purged += users.size
    if (users.size < 400) break
  }
  console.log(`purgePersonalData: ${purged} visitor records purged`)
})

/** Firestore field paths cannot contain '.', '/', etc. */
export function key(s: string): string {
  return s.replace(/[.~*/[\]]/g, '_').slice(0, 60)
}

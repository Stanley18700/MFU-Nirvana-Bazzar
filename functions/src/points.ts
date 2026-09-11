import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { type QuerySnapshot } from 'firebase-admin/firestore'
import { db, FieldValue, Timestamp, getActiveEvent, requireRole, sha256, str } from './lib'
import { dayOf, type BoothDoc, type PrizeTierDoc } from './shared/model'
import { effectivePoints, eligibleForAdjustment, pointWindow, suggestPoints, POINT_WINDOW_MS, POINT_COOLDOWN_MS, POINT_PREVIEW_MS, type PointPreview, type ApplyPointsResult } from './shared/points'

// Document versions include additions/deletions and concurrent manual edits, not just point edits.
function versions(snapshot: QuerySnapshot) {
  return snapshot.docs.map((d) => `${d.id}:${d.updateTime.toMillis()}:${d.updateTime.nanoseconds}`).sort()
}
function fingerprint(booths: QuerySnapshot, tiers: QuerySnapshot, eventVersion: string, revision: number) {
  // Stock redemptions do not change the reviewed reward policy.
  const policies = tiers.docs.map((d) => ({ id: d.id, name: d.data().name, active: d.data().active, thresholdPoints: d.data().thresholdPoints }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return sha256(JSON.stringify([versions(booths), policies, eventVersion, revision]))
}
function assertLive(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data || data.status !== 'live') throw new HttpsError('failed-precondition', 'This event is no longer live.')
}

export const previewPointAdjustments = onCall(async (req): Promise<PointPreview> => {
  const { uid } = requireRole(req, 'admin')
  const event = await getActiveEvent(true)
  const proposalRef = db.collection('pointAdjustmentPreviews').doc()
  return db.runTransaction(async (tx) => {
    const now = Date.now()
    const window = pointWindow(now)
    const eventSnap = await tx.get(db.doc(`events/${event.id}`))
    assertLive(eventSnap.data())
    const booths = await tx.get(db.collection('booths').where('eventId', '==', event.id))
    const tiers = await tx.get(db.collection('prizeTiers').where('eventId', '==', event.id))
    const state = await tx.get(db.doc(`pointAdjustmentState/${event.id}`))
    const scans = await tx.get(db.collection('scans').where('eventId', '==', event.id)
      .where('scannedAt', '>=', Timestamp.fromMillis(window.windowStart))
      .where('scannedAt', '<', Timestamp.fromMillis(window.windowEnd)).orderBy('scannedAt', 'desc')
      .select('boothId', 'visitorId'))
    const all = booths.docs.map((d) => ({ ...d.data() as BoothDoc, id: d.id }))
    if (all.length > 400) throw new HttpsError('failed-precondition', 'Point adjustment supports up to 400 booths per event.')
    const day = dayOf(new Date(now))
    const eligible = all.filter((b) => eligibleForAdjustment(b, event.id, day))
    const counts: Record<string, number> = Object.create(null)
    const seen = new Set<string>()
    for (const doc of scans.docs) {
      const s = doc.data()
      const key = JSON.stringify([s.visitorId, s.boothId])
      if (seen.has(key)) continue
      seen.add(key)
      counts[s.boothId] = (counts[s.boothId] ?? 0) + 1
    }
    const suggestions = suggestPoints(eligible, counts, now)
    const proposed = new Map(suggestions.rows.map((r) => [r.boothId, r.suggestedPoints]))
    const availablePoints = all.filter((b) => b.active && !b.isPrizeDesk && b.activeDays.includes(day))
      .reduce((sum, b) => sum + (proposed.get(b.id) ?? effectivePoints(b, now)), 0)
    const result: PointPreview = {
      id: proposalRef.id, eventId: event.id, createdAt: now, validUntil: now + POINT_PREVIEW_MS,
      ...window, ...suggestions, availablePoints,
      nextApplyAt: (state.data()?.lastAppliedAt ?? 0) + POINT_COOLDOWN_MS,
      unreachableTiers: tiers.docs.map((d) => d.data() as PrizeTierDoc)
        .filter((t) => t.active && t.thresholdPoints > availablePoints)
        .map((t) => ({ name: t.name, thresholdPoints: t.thresholdPoints })),
    }
    tx.create(proposalRef, { ...result, actorUid: uid, day,
      fingerprint: fingerprint(booths, tiers, eventSnap.updateTime!.toDate().toISOString() + eventSnap.updateTime!.nanoseconds, state.data()?.revision ?? 0) })
    return result
  })
})

export const applyPointAdjustments = onCall(async (req): Promise<ApplyPointsResult> => {
  const { uid } = requireRole(req, 'admin')
  const id = str(req.data?.previewId, 'previewId', { max: 100 })
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid preview ID.')
  const proposalRef = db.doc(`pointAdjustmentPreviews/${id}`)
  return db.runTransaction(async (tx) => {
    const now = Date.now()
    const proposal = await tx.get(proposalRef)
    if (!proposal.exists) throw new HttpsError('not-found', 'Generate a new preview first.')
    const p = proposal.data() as PointPreview & { day: string; fingerprint: string; applied?: ApplyPointsResult }
    // A retry acknowledges the original operation; it never reapplies or extends its lifetime.
    if (p.applied) return p.applied
    if (now >= p.validUntil || dayOf(new Date(now)) !== p.day) throw new HttpsError('failed-precondition', 'This preview expired. Generate a new preview.')
    if (!p.sufficient) throw new HttpsError('failed-precondition', 'Not enough recent participation.')
    const eventSnap = await tx.get(db.doc(`events/${p.eventId}`))
    assertLive(eventSnap.data())
    const booths = await tx.get(db.collection('booths').where('eventId', '==', p.eventId))
    const tiers = await tx.get(db.collection('prizeTiers').where('eventId', '==', p.eventId))
    const stateRef = db.doc(`pointAdjustmentState/${p.eventId}`)
    const state = await tx.get(stateRef)
    if (now < (state.data()?.lastAppliedAt ?? 0) + POINT_COOLDOWN_MS) throw new HttpsError('failed-precondition', 'Wait 15 minutes between adjustments.')
    if (p.fingerprint !== fingerprint(booths, tiers, eventSnap.updateTime!.toDate().toISOString() + eventSnap.updateTime!.nanoseconds, state.data()?.revision ?? 0)) {
      throw new HttpsError('failed-precondition', 'Booth or event settings changed. Generate a new preview.')
    }
    const applied: ApplyPointsResult = { ok: true, appliedAt: now, expiresAt: now + POINT_WINDOW_MS, nextApplyAt: now + POINT_COOLDOWN_MS }
    for (const row of p.rows) tx.update(db.doc(`booths/${row.boothId}`), { temporaryPoints: row.suggestedPoints, pointsExpireAt: applied.expiresAt })
    tx.set(stateRef, { lastAppliedAt: now, revision: (state.data()?.revision ?? 0) + 1 })
    tx.update(proposalRef, { applied, appliedBy: uid })
    tx.create(db.collection('auditLog').doc(), { actorUid: uid, action: 'applyPointAdjustments', targetType: 'event', targetId: p.eventId,
      before: p.rows.map((r) => ({ boothId: r.boothId, points: r.currentPoints })),
      after: { previewId: id, rows: p.rows, ...applied }, createdAt: FieldValue.serverTimestamp() })
    return applied
  })
})

export const resetPointAdjustments = onCall(async (req) => {
  const { uid } = requireRole(req, 'admin')
  const event = await getActiveEvent(true)
  await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(db.doc(`events/${event.id}`))
    assertLive(eventSnap.data())
    const booths = await tx.get(db.collection('booths').where('eventId', '==', event.id))
    const stateRef = db.doc(`pointAdjustmentState/${event.id}`)
    const state = await tx.get(stateRef)
    const changed = booths.docs.filter((d) => d.data().temporaryPoints != null || d.data().pointsExpireAt != null)
    if (changed.length > 400) throw new HttpsError('failed-precondition', 'Point adjustment supports up to 400 booths per event.')
    for (const b of changed) tx.update(b.ref, { temporaryPoints: null, pointsExpireAt: null })
    // Reset invalidates existing proposals but does not bypass the application cooldown.
    tx.set(stateRef, { revision: (state.data()?.revision ?? 0) + 1 }, { merge: true })
    tx.create(db.collection('auditLog').doc(), { actorUid: uid, action: 'resetPointAdjustments', targetType: 'event', targetId: event.id,
      before: changed.map((d) => ({ boothId: d.id, temporaryPoints: d.data().temporaryPoints ?? null, pointsExpireAt: d.data().pointsExpireAt ?? null })),
      after: { reset: true }, createdAt: FieldValue.serverTimestamp() })
  })
  return { ok: true as const }
})

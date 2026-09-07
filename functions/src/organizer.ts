import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db, FieldValue, requireRole, str, audit } from './lib'
import { verifyRedemptionPayload } from './visitor'
import { BoothDoc, EVENT_ID, EventDoc, PrizeTierDoc, TierUnlockDoc, UserDoc } from './shared/model'
import { DEFAULT_PERIOD_SECONDS } from './shared/token'

/** §5.1 — the only path to a booth secret. Organizer gets their own booth; admin may name any. */
export const boothSession = onCall(async (req) => {
  const { role, boothId: claimBooth } = requireRole(req, 'organizer', 'admin')
  const boothId = role === 'admin' ? str(req.data?.boothId, 'boothId') : claimBooth
  if (!boothId) throw new HttpsError('failed-precondition', 'No booth assigned to this account')

  const [boothSnap, secretSnap, eventSnap] = await Promise.all([
    db.doc(`booths/${boothId}`).get(),
    db.doc(`boothSecrets/${boothId}`).get(),
    db.doc(`events/${EVENT_ID}`).get(),
  ])
  if (!boothSnap.exists || !secretSnap.exists) throw new HttpsError('not-found', 'Booth not found')
  const booth = boothSnap.data() as BoothDoc
  return {
    boothId,
    booth: { ...booth, createdAt: null },
    secret: secretSnap.data()!.secret as string,
    period: (eventSnap.data() as EventDoc | undefined)?.qrPeriodSeconds ?? DEFAULT_PERIOD_SECONDS,
    serverTime: Date.now(),
  }
})

/** Prize desk: look up who is standing in front of you before confirming. */
export const lookupRedemption = onCall(async (req) => {
  const { role, boothId } = requireRole(req, 'organizer', 'admin')
  await assertPrizeDesk(role, boothId)
  const v = await verifyRedemptionPayload(str(req.data?.payload, 'payload', { max: 300 }))
  if (!v) return { status: 'invalid' as const }
  const [userSnap, unlocks, tiers] = await Promise.all([
    db.doc(`users/${v.uid}`).get(),
    db.collection('tierUnlocks').where('visitorId', '==', v.uid).get(),
    db.collection('prizeTiers').orderBy('sortOrder').get(),
  ])
  if (!userSnap.exists) return { status: 'invalid' as const }
  const u = userSnap.data() as UserDoc
  return {
    status: 'ok' as const,
    visitor: { uid: v.uid, displayName: u.displayName, passportNo: u.passportNo, points: u.points, stampCount: u.stampCount },
    tiers: tiers.docs.map((t) => {
      const tier = t.data() as PrizeTierDoc
      const un = unlocks.docs.find((x) => x.id === `${v.uid}_${t.id}`)?.data() as TierUnlockDoc | undefined
      return {
        id: t.id, name: tier.name, reward: tier.reward, thresholdPoints: tier.thresholdPoints,
        stockRemaining: tier.stockRemaining, stockTotal: tier.stockTotal,
        outOfStockNote: tier.outOfStockNoteEn ?? '',
        unlocked: !!un && !un.voidedAt ? true : false,
        redeemedAt: un?.redeemedAt ? (un.redeemedAt as { toMillis(): number }).toMillis() : null,
        redeemedBy: un?.redeemedBy ?? null,
      }
    }),
  }
})

/** §4.4 / §6.7 — mark a tier redeemed and decrement stock in one transaction. */
export const confirmRedemption = onCall(async (req) => {
  const { uid: actor, role, boothId } = requireRole(req, 'organizer', 'admin')
  await assertPrizeDesk(role, boothId)
  const v = await verifyRedemptionPayload(str(req.data?.payload, 'payload', { max: 300 }))
  if (!v) throw new HttpsError('invalid-argument', 'Code expired or invalid — ask the visitor to refresh')
  const tierId = str(req.data?.tierId, 'tierId')
  const unlockRef = db.doc(`tierUnlocks/${v.uid}_${tierId}`)
  const tierRef = db.doc(`prizeTiers/${tierId}`)

  const result = await db.runTransaction(async (tx) => {
    const [un, tier] = await Promise.all([tx.get(unlockRef), tx.get(tierRef)])
    if (!un.exists) throw new HttpsError('failed-precondition', 'Visitor has not unlocked this tier')
    const u = un.data() as TierUnlockDoc
    if (u.redeemedAt && !u.voidedAt) {
      return { status: 'already' as const, redeemedAt: (u.redeemedAt as { toMillis(): number }).toMillis(), redeemedBy: u.redeemedBy }
    }
    const t = tier.data() as PrizeTierDoc
    if (t.stockRemaining <= 0) return { status: 'out_of_stock' as const, note: t.outOfStockNoteEn ?? '' }
    tx.update(tierRef, { stockRemaining: FieldValue.increment(-1) })
    tx.update(unlockRef, { redeemedAt: FieldValue.serverTimestamp(), redeemedBy: actor, voidedAt: null, voidedBy: null, voidReason: null })
    tx.create(db.collection('stockAdjustments').doc(), {
      tierId, delta: -1, reason: `redeemed by ${v.uid}`, actorUid: actor, kind: 'redeem', createdAt: FieldValue.serverTimestamp(),
    })
    return { status: 'redeemed' as const }
  })
  if (result.status === 'redeemed') {
    await db.doc('stats/event/shards/0').set({ redeemed: FieldValue.increment(1) }, { merge: true })
  }
  return result
})

/** §6.7 — void a redemption: returns the item to stock, reopens the tier. Admin only. */
export const voidRedemption = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const visitorId = str(req.data?.visitorId, 'visitorId')
  const tierId = str(req.data?.tierId, 'tierId')
  const reason = str(req.data?.reason, 'reason', { max: 300 })
  const unlockRef = db.doc(`tierUnlocks/${visitorId}_${tierId}`)
  await db.runTransaction(async (tx) => {
    const un = await tx.get(unlockRef)
    if (!un.exists || !un.data()!.redeemedAt || un.data()!.voidedAt) throw new HttpsError('failed-precondition', 'Nothing to void')
    tx.update(unlockRef, { redeemedAt: null, redeemedBy: null, voidedAt: FieldValue.serverTimestamp(), voidedBy: actor, voidReason: reason })
    tx.update(db.doc(`prizeTiers/${tierId}`), { stockRemaining: FieldValue.increment(1) })
    tx.create(db.collection('stockAdjustments').doc(), {
      tierId, delta: 1, reason, actorUid: actor, kind: 'void', createdAt: FieldValue.serverTimestamp(),
    })
  })
  await db.doc('stats/event/shards/0').set({ redeemed: FieldValue.increment(-1) }, { merge: true })
  await audit(actor, 'voidRedemption', 'tierUnlock', `${visitorId}_${tierId}`, null, { reason })
  return { ok: true }
})

async function assertPrizeDesk(role: string, boothId?: string) {
  if (role === 'admin') return
  if (!boothId) throw new HttpsError('permission-denied', 'Not a prize desk')
  const b = await db.doc(`booths/${boothId}`).get()
  if (!(b.data() as BoothDoc | undefined)?.isPrizeDesk) throw new HttpsError('permission-denied', 'This booth is not a prize desk')
}

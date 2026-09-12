import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldPath } from 'firebase-admin/firestore'
import { db, FieldValue, requireRole, str, audit, getActiveEvent } from './lib'
import { resolveRedemption } from './visitor'
import {
  ActiveSession, BoothDoc, DEFAULT_PRIZE_SESSIONS, EventDoc, PrizeTierDoc, TierUnlockDoc, UserDoc,
  currentPrizeSession, minuteToHHMM, nextPrizeSession, sessionStockRemaining,
} from './shared/model'
import { DEFAULT_PERIOD_SECONDS } from './shared/token'

/**
 * The gift is stocked per session, not per event — 50 each morning and each afternoon. This
 * resolves which window the desk is in right now. Null means the desk is closed: a different
 * thing from "out of stock", and the two must never be shown to a visitor as the same message.
 */
function prizeWindow(event: EventDoc, now = Date.now()) {
  const sessions = event.prizeSessions?.length ? event.prizeSessions : DEFAULT_PRIZE_SESSIONS
  const days = event.days ?? []
  const active = currentPrizeSession(days, sessions, now)
  const next = active ? null : nextPrizeSession(days, sessions, now)
  return {
    active,
    session: active ? { id: active.session.id, label: active.session.label, day: active.day } : null,
    /** Where the desk should point someone it has to turn away. */
    nextOpensAt: next ? { day: next.day, at: minuteToHHMM(next.session.startMinute), label: next.session.label } : null,
  }
}

/** Gifts left in the open session — or null when the desk is closed. */
function remainingNow(tier: PrizeTierDoc, active: ActiveSession | null) {
  return sessionStockRemaining(tier, active)
}

/** §5.1 — the only path to a booth secret. Organizer gets their own booth; admin may name any. */
export const boothSession = onCall(async (req) => {
  const { role, boothId: claimBooth } = requireRole(req, 'organizer', 'admin')
  const boothId = role === 'admin' ? str(req.data?.boothId, 'boothId') : claimBooth
  if (!boothId) throw new HttpsError('failed-precondition', 'No booth assigned to this account')

  const [boothSnap, secretSnap, event] = await Promise.all([
    db.doc(`booths/${boothId}`).get(),
    db.doc(`boothSecrets/${boothId}`).get(),
    getActiveEvent(),
  ])
  if (!boothSnap.exists || !secretSnap.exists) throw new HttpsError('not-found', 'Booth not found')
  const booth = boothSnap.data() as BoothDoc
  return {
    boothId,
    booth: { ...booth, createdAt: null },
    secret: secretSnap.data()!.secret as string,
    period: event.qrPeriodSeconds ?? DEFAULT_PERIOD_SECONDS,
    serverTime: Date.now(),
  }
})

/** Prize desk: look up who is standing in front of you before confirming. */
export const lookupRedemption = onCall(async (req) => {
  const { role, boothId } = requireRole(req, 'organizer', 'admin')
  await assertPrizeDesk(role, boothId)
  const v = await resolveRedemption(req.data)
  if (!v) return { status: 'invalid' as const }
  const [userSnap, unlocks, tiers, event] = await Promise.all([
    db.doc(`users/${v.uid}`).get(),
    db.collection('tierUnlocks').where('visitorId', '==', v.uid).get(),
    db.collection('prizeTiers').orderBy('sortOrder').get(),
    getActiveEvent(),
  ])
  if (!userSnap.exists) return { status: 'invalid' as const }
  const u = userSnap.data() as UserDoc
  const window = prizeWindow(event as EventDoc)
  // "Already handed over by whom" (UAT P-04): the desk cannot read users, so resolve names here.
  const names = await staffNames(unlocks.docs.map((x) => (x.data() as TierUnlockDoc).redeemedBy).filter((x): x is string => !!x))
  return {
    status: 'ok' as const,
    visitor: { uid: v.uid, displayName: u.displayName, passportNo: u.passportNo, points: u.points, stampCount: u.stampCount },
    session: window.session,
    nextOpensAt: window.nextOpensAt,
    tiers: tiers.docs.map((t) => {
      const tier = t.data() as PrizeTierDoc
      const un = unlocks.docs.find((x) => x.id === `${v.uid}_${t.id}`)?.data() as TierUnlockDoc | undefined
      const sessionRemaining = remainingNow(tier, window.active)
      return {
        id: t.id, name: tier.name, reward: tier.reward, thresholdPoints: tier.thresholdPoints,
        // What this desk can actually hand over right now. `stockRemaining`/`stockTotal` stay
        // for the event-wide picture; `sessionRemaining` is null when the desk is closed.
        sessionRemaining, stockPerSession: tier.stockPerSession ?? null,
        stockRemaining: tier.stockRemaining, stockTotal: tier.stockTotal,
        outOfStockNote: tier.outOfStockNoteEn ?? '',
        // A voided redemption reopens the tier (§6.7): the visitor still qualifies and can collect again.
        unlocked: !!un,
        redeemedAt: un?.redeemedAt ? (un.redeemedAt as { toMillis(): number }).toMillis() : null,
        redeemedBy: un?.redeemedBy ?? null,
        redeemedByName: un?.redeemedBy ? names.get(un.redeemedBy) ?? null : null,
      }
    }),
  }
})

/** §4.4 / §6.7 — mark a tier redeemed and decrement stock in one transaction. */
export const confirmRedemption = onCall(async (req) => {
  const { uid: actor, role, boothId } = requireRole(req, 'organizer', 'admin')
  await assertPrizeDesk(role, boothId)
  const v = await resolveRedemption(req.data)
  if (!v) throw new HttpsError('invalid-argument', 'Code expired or invalid — ask the visitor to refresh')
  const tierId = str(req.data?.tierId, 'tierId')
  const unlockRef = db.doc(`tierUnlocks/${v.uid}_${tierId}`)
  const tierRef = db.doc(`prizeTiers/${tierId}`)
  const event = (await getActiveEvent()) as EventDoc
  const window = prizeWindow(event)

  const result = await db.runTransaction(async (tx) => {
    const [un, tier] = await Promise.all([tx.get(unlockRef), tx.get(tierRef)])
    if (!un.exists) throw new HttpsError('failed-precondition', 'Visitor has not unlocked this tier')
    const u = un.data() as TierUnlockDoc
    if (u.redeemedAt && !u.voidedAt) {
      return { status: 'already' as const, redeemedAt: (u.redeemedAt as { toMillis(): number }).toMillis(), redeemedBy: u.redeemedBy ?? null }
    }
    const t = tier.data() as PrizeTierDoc

    // Per-session stock. Sessions gate the GIFT, never the points: a visitor turned away here
    // keeps every point and collects in the next window, which is what `nextOpensAt` tells the
    // desk to say. An admin who needs to hand over outside the window widens the session times
    // in /admin/event rather than being blocked — that is why those times are data.
    if (typeof t.stockPerSession === 'number') {
      if (!window.active) {
        return { status: 'desk_closed' as const, nextOpensAt: window.nextOpensAt }
      }
      const key = window.active.key
      const remaining = t.sessionRemaining?.[key] ?? t.stockPerSession
      if (remaining <= 0) {
        return { status: 'out_of_stock' as const, note: t.outOfStockNoteEn ?? '', nextOpensAt: window.nextOpensAt }
      }
      // Written as an absolute value, not an increment: the first redemption of a session has no
      // map entry yet, and increment(-1) on a missing key would set it to -1 rather than 49.
      // The transaction is what makes the read-then-write safe.
      tx.update(tierRef, new FieldPath('sessionRemaining', key), remaining - 1)
      tx.update(tierRef, { stockRemaining: FieldValue.increment(-1) })
      tx.update(unlockRef, {
        redeemedAt: FieldValue.serverTimestamp(), redeemedBy: actor,
        // Remembered so a void returns the gift to the session it came out of, not to whichever
        // session happens to be open when someone notices the mistake.
        redeemedSessionKey: key,
        voidedAt: null, voidedBy: null, voidReason: null,
      })
      tx.create(db.collection('stockAdjustments').doc(), {
        tierId, delta: -1, reason: `redeemed by ${v.uid} (${key})`, actorUid: actor, kind: 'redeem',
        sessionKey: key, createdAt: FieldValue.serverTimestamp(),
      })
      return { status: 'redeemed' as const }
    }

    // Tiers with no per-session stock keep the original single-pool behaviour.
    if (t.stockRemaining <= 0) return { status: 'out_of_stock' as const, note: t.outOfStockNoteEn ?? '', nextOpensAt: null }
    tx.update(tierRef, { stockRemaining: FieldValue.increment(-1) })
    tx.update(unlockRef, { redeemedAt: FieldValue.serverTimestamp(), redeemedBy: actor, redeemedSessionKey: null, voidedAt: null, voidedBy: null, voidReason: null })
    tx.create(db.collection('stockAdjustments').doc(), {
      tierId, delta: -1, reason: `redeemed by ${v.uid}`, actorUid: actor, kind: 'redeem', createdAt: FieldValue.serverTimestamp(),
    })
    return { status: 'redeemed' as const }
  })
  if (result.status === 'redeemed') {
    await db.doc('stats/event/shards/0').set({ redeemed: FieldValue.increment(1) }, { merge: true })
    return result
  }
  if (result.status === 'already') {
    const names = result.redeemedBy ? await staffNames([result.redeemedBy]) : new Map<string, string>()
    return { ...result, redeemedByName: result.redeemedBy ? names.get(result.redeemedBy) ?? null : null }
  }
  return result
})

/** Display names for the staff who handed prizes over — a handful of uids, read one by one. */
async function staffNames(uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(uids)].slice(0, 20)
  if (!unique.length) return out
  const snaps = await db.getAll(...unique.map((u) => db.doc(`users/${u}`)))
  for (const s of snaps) { const n = (s.data() as UserDoc | undefined)?.displayName; if (s.exists && n) out.set(s.id, n) }
  return out
}

/** §6.7 — void a redemption: returns the item to stock, reopens the tier. Admin only. */
export const voidRedemption = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const visitorId = str(req.data?.visitorId, 'visitorId')
  const tierId = str(req.data?.tierId, 'tierId')
  const reason = str(req.data?.reason, 'reason', { max: 300 })
  const unlockRef = db.doc(`tierUnlocks/${visitorId}_${tierId}`)
  const tierRef = db.doc(`prizeTiers/${tierId}`)
  await db.runTransaction(async (tx) => {
    const [un, tier] = await Promise.all([tx.get(unlockRef), tx.get(tierRef)])
    if (!un.exists || !un.data()!.redeemedAt || un.data()!.voidedAt) throw new HttpsError('failed-precondition', 'Nothing to void')
    const u = un.data() as TierUnlockDoc
    const t = tier.data() as PrizeTierDoc | undefined
    tx.update(unlockRef, { redeemedAt: null, redeemedBy: null, voidedAt: FieldValue.serverTimestamp(), voidedBy: actor, voidReason: reason })
    tx.update(tierRef, { stockRemaining: FieldValue.increment(1) })
    // Back to the session it was taken from, capped at that session's allowance so a void can
    // never conjure a 51st gift into a session of 50.
    const key = u.redeemedSessionKey
    if (key && t && typeof t.stockPerSession === 'number') {
      const back = Math.min(t.stockPerSession, (t.sessionRemaining?.[key] ?? t.stockPerSession) + 1)
      tx.update(tierRef, new FieldPath('sessionRemaining', key), back)
    }
    tx.create(db.collection('stockAdjustments').doc(), {
      tierId, delta: 1, reason, actorUid: actor, kind: 'void',
      ...(key ? { sessionKey: key } : {}), createdAt: FieldValue.serverTimestamp(),
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

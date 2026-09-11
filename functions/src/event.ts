/**
 * Event lifecycle (spec 7.1 `events/{eventId}`).
 *
 * The app runs one event at a time. Rather than scoping every collection by eventId — which
 * would mean changing the deterministic ids `scans/{uid}_{boothId}` and
 * `tierUnlocks/{uid}_{tierId}`, the stats paths, the rules and every query — an event is
 * *archived* (its totals frozen at `archives/{id}`) and its working data purged, leaving the
 * collections clean for the next one. Purging `scans` and `tierUnlocks` is exactly what makes
 * booth ids safe to reuse: without it a returning visitor could never re-stamp `booth-01`.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db, auth, FieldValue, Timestamp, requireRole, str, num, audit,
  getActiveEvent, clearEventCache, randomSecretB64, toMillis,
} from './lib'
import {
  ACCENTS, ArchiveDoc, BoothDoc, BoothStats, DEFAULT_PASSPORT_PREFIX, EventDoc, EventStatsShard,
  PrizeTierDoc, STATS_SHARDS, Zone, ZONE_POINTS, dayOf,
} from './shared/model'

const ZONES: Zone[] = ['entrance', 'middle', 'far']

/** Every day from start to end inclusive, in Asia/Bangkok, as 'YYYY-MM-DD'. */
function daysBetween(startMs: number, endMs: number): string[] {
  const out: string[] = []
  for (let t = startMs; t <= endMs && out.length < 60; t += 86400_000) {
    const d = dayOf(new Date(t))
    if (!out.includes(d)) out.push(d)
  }
  const last = dayOf(new Date(endMs))
  if (!out.includes(last)) out.push(last)
  return out
}

function slugify(s: string): string {
  const base = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return base || `event-${Date.now()}`
}

function eventFromData(d: Record<string, unknown>, existing?: EventDoc): Omit<EventDoc, 'createdAt'> {
  const nameEn = str(d.nameEn, 'nameEn', { required: !existing, max: 120 }) || existing!.nameEn
  const startMs = typeof d.startsAt === 'number' ? num(d.startsAt, 'startsAt', { min: 0, max: 4e12 }) : toMillis(existing?.startsAt)
  const endMs = typeof d.endsAt === 'number' ? num(d.endsAt, 'endsAt', { min: 0, max: 4e12 }) : toMillis(existing?.endsAt)
  if (!startMs || !endMs) throw new HttpsError('invalid-argument', 'startsAt and endsAt are required')
  if (endMs < startMs) throw new HttpsError('invalid-argument', 'The event cannot end before it starts')

  const days = Array.isArray(d.days) && d.days.length
    ? (d.days as string[]).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 60)
    : daysBetween(startMs, endMs)
  if (!days.length) throw new HttpsError('invalid-argument', 'The event needs at least one day')

  const zp = (d.zonePoints ?? existing?.zonePoints ?? ZONE_POINTS) as Record<string, unknown>
  const zonePoints = {} as Record<Zone, number>
  for (const z of ZONES) zonePoints[z] = typeof zp[z] === 'number' ? num(zp[z], `zonePoints.${z}`, { min: 1, max: 100 }) : ZONE_POINTS[z]

  return {
    nameEn,
    nameTh: str(d.nameTh, 'nameTh', { required: false, max: 120 }) || existing?.nameTh || '',
    startsAt: Timestamp.fromMillis(startMs),
    endsAt: Timestamp.fromMillis(endMs),
    days,
    qrPeriodSeconds: typeof d.qrPeriodSeconds === 'number' ? num(d.qrPeriodSeconds, 'qrPeriodSeconds', { min: 10, max: 120 }) : existing?.qrPeriodSeconds ?? 20,
    passportPrefix: (str(d.passportPrefix, 'passportPrefix', { required: false, max: 12 }) || existing?.passportPrefix || DEFAULT_PASSPORT_PREFIX)
      .toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    zonePoints,
    active: existing?.active ?? true,
    boothCount: existing?.boothCount ?? 0,
    status: existing?.status ?? 'draft',
  }
}

/** Create the next event. It starts as a draft; `goLive` switches over. */
export const createEvent = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const d = req.data ?? {}
  const doc = eventFromData(d)
  const id = str(d.id, 'id', { required: false, max: 60 }) || slugify(doc.nameEn)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', 'Bad event id')
  const ref = db.doc(`events/${id}`)
  if ((await ref.get()).exists) throw new HttpsError('already-exists', `An event with id "${id}" already exists`)
  await ref.set({ ...doc, status: 'draft', createdAt: FieldValue.serverTimestamp() })
  await audit(actor, 'createEvent', 'event', id, null, doc)
  return { id }
})

export const updateEvent = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const ref = db.doc(`events/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found')
  const before = snap.data() as EventDoc
  const after = eventFromData(req.data ?? {}, before)
  await ref.set(after, { merge: true })
  clearEventCache()
  await audit(actor, 'updateEvent', 'event', id, before, after)
  return { ok: true }
})

/** Remove a draft created by mistake. Live and archived events keep their history; archive those instead. */
export const deleteEvent = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const ref = db.doc(`events/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found')
  const before = snap.data() as EventDoc
  if (before.status !== 'draft') throw new HttpsError('failed-precondition', 'Only drafts can be deleted — archive a live event instead')
  await ref.delete()
  clearEventCache()
  await audit(actor, 'deleteEvent', 'event', id, before, null)
  return { ok: true }
})

/** Make one event the live one. Any other live event is archived in the same write. */
export const goLive = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const ref = db.doc(`events/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found')

  const [booths, tiers] = await Promise.all([
    db.collection('booths').where('active', '==', true).count().get(),
    db.collection('prizeTiers').where('active', '==', true).count().get(),
  ])
  if (!booths.data().count) throw new HttpsError('failed-precondition', 'Add at least one active booth before going live')
  if (!tiers.data().count) throw new HttpsError('failed-precondition', 'Set a prize policy before going live')

  /**
   * A transaction, not a batch. A batch is atomic but carries no read precondition, so two
   * admins pressing Go live at the same moment both read the live set before either commits,
   * each demotes only what it saw, and both write `status: 'live'` — leaving two live events,
   * after which `getActiveEvent` silently picks one by document id (lib.ts). The whole point
   * of this function is that exactly one event is live, so the read has to be part of the
   * write.
   */
  const demoted = await db.runTransaction(async (tx) => {
    const live = await tx.get(db.collection('events').where('status', '==', 'live'))
    const others = live.docs.filter((o) => o.id !== id)
    for (const o of others) {
      tx.set(o.ref, { status: 'archived', active: false, archivedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    tx.set(ref, { status: 'live', active: true, boothCount: booths.data().count }, { merge: true })
    return others.map((o) => o.id)
  })
  clearEventCache()
  await audit(actor, 'goLive', 'event', id, { demoted }, null)
  return { ok: true }
})

/**
 * Freeze the event's totals at `archives/{id}` and mark it archived. Always run this before
 * `purgeEventData` — once the scans and stats are gone the numbers cannot be reconstructed.
 */
export const archiveEvent = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const confirmName = str(req.data?.confirmName, 'confirmName', { max: 120 })
  const ref = db.doc(`events/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found')
  const ev = snap.data() as EventDoc
  if (confirmName.trim().toLowerCase() !== ev.nameEn.trim().toLowerCase()) {
    throw new HttpsError('failed-precondition', 'Type the event name exactly to confirm')
  }
  // Archiving twice is not harmless: the totals below are read from the live counters, so
  // running this again after a purge would overwrite a good archive with zeros — and the
  // archive is the only copy once the scans are gone.
  if (ev.status === 'archived') {
    throw new HttpsError('failed-precondition', 'This event is already archived. Its totals are frozen at archives/' + id)
  }

  const [shards, boothStats, booths, tiers, draws, unlocks] = await Promise.all([
    db.collection('stats/event/shards').get(),
    db.collection('stats/booths/items').get(),
    db.collection('booths').get(),
    db.collection('prizeTiers').get(),
    db.collection('draws').get(),
    db.collection('tierUnlocks').get(),
  ])

  const totals = { visitors: 0, stamps: 0, points: 0, redeemed: 0 }
  for (const sh of shards.docs) {
    const v = sh.data() as Partial<EventStatsShard>
    totals.visitors += v.visitors ?? 0
    totals.stamps += v.stamps ?? 0
    totals.points += v.points ?? 0
    totals.redeemed += v.redeemed ?? 0
  }
  const stampsOf = new Map(boothStats.docs.map((d) => [d.id, (d.data() as BoothStats).stamps ?? 0]))
  const redeemedOf = new Map<string, number>()
  for (const u of unlocks.docs) {
    const d = u.data()
    if (d.redeemedAt && !d.voidedAt) redeemedOf.set(d.tierId as string, (redeemedOf.get(d.tierId as string) ?? 0) + 1)
  }

  const archive: ArchiveDoc = {
    eventId: id,
    nameEn: ev.nameEn,
    nameTh: ev.nameTh ?? '',
    days: ev.days ?? [],
    startsAt: ev.startsAt ?? null,
    endsAt: ev.endsAt ?? null,
    archivedAt: FieldValue.serverTimestamp(),
    archivedBy: actor,
    totals,
    booths: booths.docs.map((b) => {
      const d = b.data() as BoothDoc
      return { id: b.id, nameEn: d.nameEn, points: d.points, stamps: stampsOf.get(b.id) ?? 0 }
    }),
    tiers: tiers.docs.map((t) => {
      const d = t.data() as PrizeTierDoc
      return {
        id: t.id, name: d.name, thresholdPoints: d.thresholdPoints,
        stockTotal: d.stockTotal ?? 0, stockRemaining: d.stockRemaining ?? 0,
        redeemed: redeemedOf.get(t.id) ?? 0,
      }
    }),
    draws: draws.docs.map((d) => ({ winners: (d.data().winners as string[]) ?? [], names: d.data().names ?? null, createdAt: d.data().createdAt ?? null })),
  }
  await db.doc(`archives/${id}`).set(archive)
  await ref.set({ status: 'archived', active: false, archivedAt: FieldValue.serverTimestamp() }, { merge: true })
  clearEventCache()
  await audit(actor, 'archiveEvent', 'event', id, { totals }, null)
  return { ok: true, totals, boothCount: archive.booths.length, tierCount: archive.tiers.length }
})

/**
 * Scopes for `purgeEventData`. `booths` and `prizeTiers` start the next event blank;
 * `resetTierStock` and `rotateSecrets` are what you run instead when carrying them over.
 */
export type PurgeScope =
  | 'scans' | 'tierUnlocks' | 'stockAdjustments' | 'draws' | 'buckets' | 'invites' | 'rateLimits'
  | 'visitors' | 'boothStats' | 'eventStats' | 'counters'
  | 'booths' | 'prizeTiers' | 'resetTierStock' | 'rotateSecrets'

const SCOPES: PurgeScope[] = [
  'scans', 'tierUnlocks', 'stockAdjustments', 'draws', 'buckets', 'invites', 'rateLimits',
  'visitors', 'boothStats', 'eventStats', 'counters', 'booths', 'prizeTiers', 'resetTierStock', 'rotateSecrets',
]

/**
 * One page of the purge. A three-day event is roughly 1,500 visitors x 12 booths of `scans`,
 * far more than a 30-second callable can delete, so the admin page calls this in a loop and
 * shows progress. Returns `done` when the scope is finished.
 */
export const purgeEventData = onCall({ timeoutSeconds: 120 }, async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const eventId = str(req.data?.eventId, 'eventId')
  const scope = str(req.data?.scope, 'scope') as PurgeScope
  if (!SCOPES.includes(scope)) throw new HttpsError('invalid-argument', `Unknown scope: ${scope}`)
  const limit = typeof req.data?.limit === 'number' ? num(req.data.limit, 'limit', { min: 1, max: 300 }) : 300
  const hard = req.data?.hard === true

  // The guard: never purge anything but an event that has already been archived.
  const ev = (await db.doc(`events/${eventId}`).get()).data() as EventDoc | undefined
  if (!ev) throw new HttpsError('not-found', 'Event not found')
  if (ev.status !== 'archived') throw new HttpsError('failed-precondition', 'Archive the event before purging its data')

  let deleted = 0
  let remaining = 0

  const deletePage = async (path: string) => {
    const snap = await db.collection(path).limit(limit).get()
    if (!snap.empty) {
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted = snap.size
    }
    remaining = (await db.collection(path).count().get()).data().count
  }

  switch (scope) {
    // The award markers live or die with the scans they guard. A marker left behind would
    // make the same visitor's re-scan after a purge create its stamp and then silently count
    // nothing, because onScanCreate would take it for a redelivery. Same scope, so an admin
    // cannot clear one without the other; scans first, then the markers.
    case 'scans': {
      await deletePage('scans')
      if (deleted === 0) await deletePage('countedScans')
      else remaining += (await db.collection('countedScans').count().get()).data().count
      break
    }
    case 'tierUnlocks': await deletePage('tierUnlocks'); break
    case 'stockAdjustments': await deletePage('stockAdjustments'); break
    case 'draws': await deletePage('draws'); break
    case 'buckets': await deletePage('stats/buckets/items'); break
    case 'invites': await deletePage('invites'); break
    case 'rateLimits': await deletePage('rateLimits'); break
    case 'prizeTiers': await deletePage('prizeTiers'); break

    case 'visitors': {
      /**
       * Default is to reset progress and keep the account; `hard` deletes it outright (PDPA).
       *
       * The soft reset selects on `points > 0`, the same condition `remaining` counts below.
       * Selecting every visitor instead made the page never advance: the write clears points
       * but not `role`, so the next call re-read the same first 300 and everyone past them
       * kept their points however many times an admin pressed it. The client loop gives up
       * after 500 rounds and reports items still to clear, which is what it looked like.
       *
       * A stamp always awards at least one point — booth points are `min: 1` — so `points > 0`
       * is exactly "has progress to clear", and a reset visitor drops out of the query.
       */
      const snap = hard
        ? await db.collection('users').where('role', '==', 'visitor').limit(limit).get()
        : await db.collection('users').where('role', '==', 'visitor').where('points', '>', 0).limit(limit).get()
      if (!snap.empty) {
        if (hard) {
          await auth.deleteUsers(snap.docs.map((d) => d.id)).catch((e) => console.error('deleteUsers', e))
          const batch = db.batch()
          snap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        } else {
          const batch = db.batch()
          snap.docs.forEach((d) => batch.set(d.ref, {
            points: 0, stampCount: 0, stampedBoothIds: [], daysAttended: [], resetAt: FieldValue.serverTimestamp(),
          }, { merge: true }))
          await batch.commit()
        }
        deleted = snap.size
      }
      if (hard) {
        remaining = (await db.collection('users').where('role', '==', 'visitor').count().get()).data().count
      } else {
        // A reset is idempotent but not self-terminating, so page by "not yet reset".
        const left = await db.collection('users').where('role', '==', 'visitor').where('points', '>', 0).count().get()
        remaining = left.data().count
      }
      break
    }

    case 'booths': {
      const snap = await db.collection('booths').limit(limit).get()
      if (!snap.empty) {
        const batch = db.batch()
        for (const b of snap.docs) {
          batch.delete(b.ref)
          batch.delete(db.doc(`boothSecrets/${b.id}`))
          batch.delete(db.doc(`stats/booths/items/${b.id}`))
        }
        await batch.commit()
        // Artwork in Cloud Storage, best effort — a leftover file is harmless, a failed purge is not.
        for (const b of snap.docs) {
          try {
            const { getStorage } = await import('firebase-admin/storage')
            await getStorage().bucket().deleteFiles({ prefix: `booths/${b.id}/` })
          } catch (e) { console.error('storage purge', b.id, e) }
        }
        deleted = snap.size
      }
      remaining = (await db.collection('booths').count().get()).data().count
      break
    }

    case 'boothStats': {
      const snap = await db.collection('stats/booths/items').limit(limit).get()
      if (!snap.empty) {
        const batch = db.batch()
        snap.docs.forEach((d) => batch.set(d.ref, { stamps: 0, rank: null, byVisitorType: {}, byDay: {}, byHour: {}, lastStampAt: null }, { merge: true }))
        await batch.commit()
        deleted = snap.size
      }
      remaining = 0
      break
    }

    case 'eventStats': {
      const batch = db.batch()
      for (let i = 0; i < STATS_SHARDS; i++) {
        batch.delete(db.doc(`stats/event/shards/${i}`))
        // The demographic shards are event counters too, just held apart for access (§4.1).
        // Clearing one set and not the other would carry a finished event's visitors into
        // the next one's dashboard.
        batch.delete(db.doc(`stats/demographics/shards/${i}`))
      }
      batch.delete(db.doc('stats/event'))
      await batch.commit()
      deleted = STATS_SHARDS * 2 + 1
      remaining = 0
      break
    }

    case 'counters': {
      await db.doc('counters/passport').delete()
      deleted = 1
      remaining = 0
      break
    }

    case 'resetTierStock': {
      const snap = await db.collection('prizeTiers').get()
      const batch = db.batch()
      snap.docs.forEach((d) => {
        const t = d.data() as PrizeTierDoc
        batch.set(d.ref, { stockRemaining: t.stockTotal ?? 0 }, { merge: true })
      })
      await batch.commit()
      deleted = snap.size
      remaining = 0
      break
    }

    case 'rotateSecrets': {
      // Carrying booths over must not carry their secrets: last year's photographed QR would live on.
      const snap = await db.collection('booths').get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.set(db.doc(`boothSecrets/${d.id}`), {
        secret: randomSecretB64(), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: actor,
      }))
      await batch.commit()
      deleted = snap.size
      remaining = 0
      break
    }
  }

  if (deleted) await audit(actor, 'purgeEventData', 'event', eventId, null, { scope, deleted, remaining, hard })
  return { scope, deleted, remaining, done: remaining === 0 }
})

/** Everything the admin Event page needs in one call. */
export const listEvents = onCall(async (req) => {
  requireRole(req, 'admin')
  const [events, live] = await Promise.all([
    db.collection('events').get(),
    getActiveEvent(true),
  ])
  return {
    liveId: live.id,
    events: events.docs.map((d) => {
      const e = d.data() as EventDoc
      return {
        id: d.id, nameEn: e.nameEn, nameTh: e.nameTh ?? '',
        startsAt: toMillis(e.startsAt), endsAt: toMillis(e.endsAt),
        days: e.days ?? [], qrPeriodSeconds: e.qrPeriodSeconds ?? 20,
        passportPrefix: e.passportPrefix ?? DEFAULT_PASSPORT_PREFIX,
        zonePoints: e.zonePoints ?? ZONE_POINTS,
        status: e.status ?? (d.id === live.id ? 'live' : 'archived'),
        boothCount: e.boothCount ?? 0,
      }
    }).sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0)),
    accents: ACCENTS,
  }
})

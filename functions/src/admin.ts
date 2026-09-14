import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
  db, auth, FieldValue, Timestamp, requireRole, requireAuth, str, num, sha256, randomToken, randomSecretB64, audit,
  getActiveEvent, toMillis, type ActiveEvent,
} from './lib'
import {
  ACCENTS, BoothDoc, DEFAULT_PRIZE_SESSIONS, EVENT_SURVEY_ID, InviteDoc, PrizeTierDoc, Role, UserDoc, VisitorType, Zone,
  currentPrizeSession, dayOf, minuteToHHMM, nextPrizeSession, passportNo,
} from './shared/model'
import { APP_ORIGIN, EMAILJS_PRIVATE_KEY, mailConfigured, sendInvite } from './mailer'
import { recomputeRanks } from './triggers'

const ZONES: Zone[] = ['entrance', 'middle', 'far']
const ROLES: Role[] = ['visitor', 'organizer', 'admin']
const VISITOR_TYPES: VisitorType[] = ['student', 'staff', 'alumni', 'guest']

// ---------- users ----------

/** §3 — claim and mirrored field are written together. */
export const setUserRole = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const uid = str(req.data?.uid, 'uid')
  const role = str(req.data?.role, 'role') as Role
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Bad role')
  const boothId = str(req.data?.boothId, 'boothId', { required: false })
  if (role === 'organizer' && !boothId) throw new HttpsError('invalid-argument', 'Organizer needs a booth')
  const ref = db.doc(`users/${uid}`)
  const before = (await ref.get()).data()
  await auth.setCustomUserClaims(uid, role === 'organizer' ? { role, boothId } : { role })
  await ref.set({ role, boothId: role === 'organizer' ? boothId : null }, { merge: true })
  if (role === 'organizer') await db.doc(`booths/${boothId}`).set({ organizerUid: uid }, { merge: true })
  await audit(actor, 'setUserRole', 'user', uid, { role: before?.role, boothId: before?.boothId }, { role, boothId })
  return { ok: true }
})

/**
 * §6.2 — an admin creates an account at the desk: a walk-up visitor who cannot sign up on their
 * own phone, or a staff account with a set password. The admin vouches for the address, so the
 * account is marked verified — otherwise the client's Guard would park it at /verify-email
 * waiting for a mail nobody sends. A visitor gets a passport number from the same counter as
 * `join`, so the two paths can never collide.
 */
export const createUser = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const d = req.data ?? {}
  const displayName = str(d.displayName, 'displayName', { max: 80 })
  const contact = str(d.contact, 'contact', { max: 120 }).toLowerCase()
  const role = str(d.role, 'role') as Role
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Bad role')
  const boothId = str(d.boothId, 'boothId', { required: false })
  if (role === 'organizer' && !boothId) throw new HttpsError('invalid-argument', 'Organizer needs a booth')
  const isEmail = contact.includes('@')
  /**
   * Without a password the account exists but can never sign in — Firebase has no credential to
   * check — so a staff account created here was unusable. Optional, because an organizer
   * normally arrives through an invitation (§6.4) and never sees a password field.
   */
  const password = str(d.password, 'password', { required: false, max: 128 })
  if (password && password.length < 10) throw new HttpsError('invalid-argument', 'Password must be at least 10 characters')
  if (password && !isEmail) throw new HttpsError('invalid-argument', 'A password needs an email address as the contact')

  // Walk-up details (§4.1 fields, all optional here; defaults describe a Thai guest at the desk).
  const visitorType = (str(d.visitorType, 'visitorType', { required: false }) || (role === 'visitor' ? 'guest' : 'staff')) as VisitorType
  if (!VISITOR_TYPES.includes(visitorType)) throw new HttpsError('invalid-argument', 'Bad visitorType')
  const countryCode = (str(d.countryCode, 'countryCode', { required: false, max: 2 }) || 'TH').toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new HttpsError('invalid-argument', 'Bad countryCode')
  const institution = str(d.institution, 'institution', { required: false, max: 120 }) || 'MFU'
  const school = str(d.school, 'school', { required: false, max: 120 })
  const studentId = str(d.studentId, 'studentId', { required: false, max: 40 })

  // One address = one account (§4.1), the same rule `join` applies.
  const dup = await db.collection('users').where('contact', '==', contact).limit(1).get()
  if (!dup.empty) throw new HttpsError('already-exists', 'That contact already has an account')

  let user
  try {
    user = await auth.createUser({
      email: isEmail ? contact : undefined,
      emailVerified: isEmail,
      displayName,
      ...(password ? { password } : {}),
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with that email already exists — find it in the list below')
    }
    throw e
  }
  await auth.setCustomUserClaims(user.uid, role === 'organizer' ? { role, boothId } : { role })

  let passport: string | null = null
  if (role === 'visitor') {
    const seq = await db.runTransaction(async (tx) => {
      const cRef = db.doc('counters/passport')
      const c = await tx.get(cRef)
      const next = ((c.data()?.value as number | undefined) ?? 0) + 1
      tx.set(cRef, { value: next }, { merge: true })
      return next
    })
    const ev = await getActiveEvent(true)
    passport = passportNo(seq, ev.passportPrefix)
  }

  const doc: UserDoc = {
    role, displayName, contact, contactVerified: isEmail, boothId: role === 'organizer' ? boothId : null,
    visitorType, institution, school: school || null, studentId: studentId || null,
    countryCode, isInternational: countryCode !== 'TH',
    stampCount: 0, points: 0, stampedBoothIds: [],
    ...(passport
      ? { passportNo: passport, daysAttended: [dayOf(new Date())], consentAt: FieldValue.serverTimestamp() }
      : { daysAttended: [] }),
    createdAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  }
  await db.doc(`users/${user.uid}`).set(doc)
  await audit(actor, 'createUser', 'user', user.uid, null, { role, displayName, boothId: boothId || null, passportNo: passport })
  return { uid: user.uid, passportNo: passport }
})

/** §6.2 — edit any profile field. Only the keys sent are touched; an empty string clears an optional one. */
export const updateUser = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const uid = str(req.data?.uid, 'uid')
  const patch: Record<string, unknown> = {}
  for (const f of ['displayName', 'studentId', 'institution', 'school', 'contact', 'visitorType', 'countryCode'] as const) {
    if (req.data?.[f] === undefined) continue
    const v = str(req.data[f], f, { required: false, max: 120 })
    if (!v && (f === 'displayName' || f === 'contact' || f === 'institution')) throw new HttpsError('invalid-argument', `${f} cannot be empty`)
    patch[f] = v || null
  }
  if (patch.visitorType !== undefined && !VISITOR_TYPES.includes(patch.visitorType as VisitorType)) throw new HttpsError('invalid-argument', 'Bad visitorType')
  if (patch.countryCode !== undefined) {
    patch.countryCode = String(patch.countryCode).toUpperCase()
    if (!/^[A-Z]{2}$/.test(patch.countryCode as string)) throw new HttpsError('invalid-argument', 'Bad countryCode')
    patch.isInternational = patch.countryCode !== 'TH'
  }
  if (typeof patch.contact === 'string') patch.contact = patch.contact.toLowerCase()
  if (!Object.keys(patch).length) throw new HttpsError('invalid-argument', 'Nothing to update')

  const ref = db.doc(`users/${uid}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'User not found')
  const before = snap.data() as UserDoc

  // The sign-in address lives on the Auth account (see syncAccount); a contact change that is an
  // email moves it there too, otherwise the organisers would see an address that cannot sign in.
  if (typeof patch.contact === 'string' && patch.contact !== before.contact) {
    const dup = await db.collection('users').where('contact', '==', patch.contact).limit(1).get()
    if (!dup.empty && dup.docs[0].id !== uid) throw new HttpsError('already-exists', 'Another account already uses that contact')
    if (patch.contact.includes('@')) {
      try {
        await auth.updateUser(uid, { email: patch.contact, emailVerified: true })
        patch.contactVerified = true
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Another sign-in account already uses that email')
        if (code !== 'auth/user-not-found') throw e
      }
    }
  }
  await ref.set(patch, { merge: true })
  const was = Object.fromEntries(Object.keys(patch).map((k) => [k, (before as unknown as Record<string, unknown>)[k] ?? null]))
  await audit(actor, 'updateUser', 'user', uid, was, patch)
  return { ok: true }
})

/** §6.2 — soft delete anonymises; hard delete (PDPA erasure) removes scans too. */
export const deleteUser = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const uid = str(req.data?.uid, 'uid')
  const hard = req.data?.hard === true
  const ref = db.doc(`users/${uid}`)
  if (hard) {
    // Everything keyed to the person goes: the document, their stamps and their prize unlocks.
    // Counters are left alone (§10) — they hold nothing about anyone. At most ~15 docs per
    // visitor, well inside one batch.
    const [scans, unlocks] = await Promise.all([
      db.collection('scans').where('visitorId', '==', uid).get(),
      db.collection('tierUnlocks').where('visitorId', '==', uid).get(),
    ])
    const batch = db.batch()
    scans.docs.forEach((s) => batch.delete(s.ref))
    unlocks.docs.forEach((u) => batch.delete(u.ref))
    batch.delete(ref)
    await batch.commit()
    await auth.deleteUser(uid).catch(() => undefined)
  } else {
    await ref.set({ deletedAt: FieldValue.serverTimestamp(), contact: `deleted-${uid}`, displayName: 'Deleted visitor', studentId: null, ethnicGroup: null }, { merge: true })
    await auth.updateUser(uid, { disabled: true }).catch(() => undefined)
  }
  // A self-service erasure request (§10) is answered by whichever delete the admin chose.
  const reqRef = db.doc(`erasureRequests/${uid}`)
  if ((await reqRef.get()).exists) {
    await reqRef.set({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actor, resolution: hard ? 'hard' : 'soft' }, { merge: true })
  }
  await audit(actor, hard ? 'hardDeleteUser' : 'softDeleteUser', 'user', uid, null, null)
  return { ok: true }
})

/** §10 — close an erasure request without deleting anyone: a duplicate, a test account, a withdrawn request. */
export const dismissErasureRequest = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const uid = str(req.data?.uid, 'uid')
  const reason = str(req.data?.reason, 'reason', { max: 300 })
  const ref = db.doc(`erasureRequests/${uid}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No erasure request for that user')
  if (snap.data()!.status !== 'open') throw new HttpsError('failed-precondition', 'That request is already closed')
  await ref.set({ status: 'dismissed', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actor, reason }, { merge: true })
  await audit(actor, 'dismissErasureRequest', 'user', uid, { status: 'open' }, { status: 'dismissed', reason })
  return { ok: true }
})

// ---------- booths ----------

function boothFromData(ev: ActiveEvent, d: Record<string, unknown>, existing?: BoothDoc): Omit<BoothDoc, 'createdAt'> {
  const zone = (str(d.zone, 'zone', { required: false }) || existing?.zone || 'entrance') as Zone
  if (!ZONES.includes(zone)) throw new HttpsError('invalid-argument', 'Bad zone')
  const activeDays = Array.isArray(d.activeDays)
    ? (d.activeDays as string[]).filter((x) => ev.days.includes(x))
    : existing?.activeDays ?? [...ev.days]
  const nameEn = str(d.nameEn, 'nameEn', { required: !existing, max: 120 }) || existing!.nameEn
  // An explicit null clears an image ("Remove badge"); an absent key keeps whatever is there.
  const image = (k: 'badgeUrl' | 'badgeThumbUrl' | 'photoUrl' | 'photoThumbUrl'): string | null =>
    k in d ? (typeof d[k] === 'string' ? (d[k] as string) : null) : existing?.[k] ?? null
  return {
    eventId: ev.id,
    nameEn,
    nameTh: str(d.nameTh, 'nameTh', { required: false, max: 120 }) || existing?.nameTh || '',
    shortName: str(d.shortName, 'shortName', { required: false, max: 24 }) || existing?.shortName
      || nameEn.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase(),
    hostUnit: str(d.hostUnit, 'hostUnit', { required: false, max: 120 }) || existing?.hostUnit || '',
    location: str(d.location, 'location', { required: false, max: 80 }) || existing?.location || '',
    descriptionEn: str(d.descriptionEn, 'descriptionEn', { required: false, max: 600 }) || existing?.descriptionEn || '',
    descriptionTh: str(d.descriptionTh, 'descriptionTh', { required: false, max: 600 }) || existing?.descriptionTh || '',
    accentColor: str(d.accentColor, 'accentColor', { required: false, max: 7 }) || existing?.accentColor || ACCENTS[0],
    points: typeof d.points === 'number' ? num(d.points, 'points', { min: 1, max: 100 }) : existing?.points ?? ev.zonePoints[zone],
    adjustmentExcluded: typeof d.adjustmentExcluded === 'boolean' ? d.adjustmentExcluded : existing?.adjustmentExcluded ?? false,
    zone,
    badgeUrl: image('badgeUrl'),
    badgeThumbUrl: image('badgeThumbUrl'),
    photoUrl: image('photoUrl'),
    photoThumbUrl: image('photoThumbUrl'),
    activeDays,
    isPrizeDesk: typeof d.isPrizeDesk === 'boolean' ? d.isPrizeDesk : existing?.isPrizeDesk ?? false,
    active: typeof d.active === 'boolean' ? d.active : existing?.active ?? true,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : existing?.sortOrder ?? 0,
    organizerUid: existing?.organizerUid ?? null,
  }
}

export const createBooth = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const d = req.data ?? {}
  const ev = await getActiveEvent(true)
  const count = (await db.collection('booths').count().get()).data().count
  const booth = boothFromData(ev, d)
  if (!d.accentColor) booth.accentColor = ACCENTS[count % ACCENTS.length]
  if (typeof d.sortOrder !== 'number') booth.sortOrder = count + 1
  const id = str(d.id, 'id', { required: false, max: 40 }) || `booth-${String(count + 1).padStart(2, '0')}`
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', 'Bad booth id')
  /*
   * The festival survey is stored as a booth survey under this id, and is admin-only precisely
   * because no organizer's `boothId` claim can equal it. A booth created with it would hand
   * that booth's organizer every festival response.
   */
  if (id === EVENT_SURVEY_ID) throw new HttpsError('invalid-argument', 'That booth id is reserved')
  const ref = db.doc(`booths/${id}`)
  if ((await ref.get()).exists) throw new HttpsError('already-exists', 'Booth id in use')
  const batch = db.batch()
  batch.set(ref, { ...booth, createdAt: FieldValue.serverTimestamp() })
  batch.set(db.doc(`boothSecrets/${id}`), { secret: randomSecretB64(), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: actor })
  batch.set(db.doc(`stats/booths/items/${id}`), { boothId: id, stamps: 0, byVisitorType: {}, byDay: {}, byHour: {} }, { merge: true })
  batch.set(db.doc(`events/${ev.id}`), { boothCount: FieldValue.increment(1) }, { merge: true })
  await batch.commit()
  await audit(actor, 'createBooth', 'booth', id, null, booth)
  return { id }
})

export const updateBooth = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const ref = db.doc(`booths/${id}`)
  const ev = await getActiveEvent(true)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Booth not found')
    const before = snap.data() as BoothDoc
    const after = boothFromData(ev, req.data ?? {}, before)
    if (after.points !== before.points || after.adjustmentExcluded || !after.active || after.isPrizeDesk
      || after.eventId !== before.eventId || JSON.stringify(after.activeDays) !== JSON.stringify(before.activeDays)) {
      after.temporaryPoints = null
      after.pointsExpireAt = null
    }
    tx.set(ref, after, { merge: true })
    tx.create(db.collection('auditLog').doc(), { actorUid: actor, action: 'updateBooth', targetType: 'booth', targetId: id,
      before, after, createdAt: FieldValue.serverTimestamp() })
  })
  return { ok: true }
})

export const deleteBooth = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  const scans = await db.collection('scans').where('boothId', '==', id).limit(1).get()
  if (!scans.empty) {
    await db.doc(`booths/${id}`).set({ active: false }, { merge: true })
    await audit(actor, 'deactivateBooth', 'booth', id, null, null)
    return { ok: true, deactivated: true }
  }
  const ev = await getActiveEvent()
  const batch = db.batch()
  batch.delete(db.doc(`booths/${id}`))
  batch.delete(db.doc(`boothSecrets/${id}`))
  batch.delete(db.doc(`stats/booths/items/${id}`))
  batch.set(db.doc(`events/${ev.id}`), { boothCount: FieldValue.increment(-1) }, { merge: true })
  await batch.commit()
  await audit(actor, 'deleteBooth', 'booth', id, null, null)
  return { ok: true, deactivated: false }
})

/** §6.3 — the emergency lever: every photographed code dies immediately. */
export const rotateBoothSecret = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.id, 'id')
  await db.doc(`boothSecrets/${id}`).set({ secret: randomSecretB64(), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: actor })
  await audit(actor, 'rotateBoothSecret', 'booth', id, null, null)
  return { ok: true }
})

// ---------- prizes ----------

/** §6.5 / §6.7 — thresholds validated against points available; preview of new unlocks. */
// Paging every eligible visitor across every tier can outlast the 30s default (index.ts).
export const savePrizePolicy = onCall({ timeoutSeconds: 120 }, async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const ev = await getActiveEvent(true)
  const tiers = req.data?.tiers
  if (!Array.isArray(tiers) || tiers.length === 0 || tiers.length > 10) throw new HttpsError('invalid-argument', 'tiers[] required')
  const booths = await db.collection('booths').where('active', '==', true).get()
  const available = booths.docs.reduce((s, b) => s + ((b.data() as BoothDoc).points ?? 0), 0)
  const dryRun = req.data?.dryRun === true

  const parsed = tiers.map((t: Record<string, unknown>, i: number) => {
    const threshold = num(t.thresholdPoints, 'thresholdPoints', { min: 1, max: 10_000 })
    if (threshold > available) {
      throw new HttpsError('invalid-argument', `"${t.name}" needs ${threshold} points but only ${available} are available in the hall`)
    }
    return {
      id: str(t.id, 'id', { required: false, max: 40 }) || `tier-${i + 1}`,
      name: str(t.name, 'name', { max: 60 }),
      thresholdPoints: threshold,
      reward: str(t.reward, 'reward', { max: 200 }),
      grantsDrawEntry: t.grantsDrawEntry === true,
      active: t.active !== false,
      sortOrder: i + 1,
      outOfStockNoteEn: str(t.outOfStockNoteEn, 'outOfStockNoteEn', { required: false, max: 200 }),
      outOfStockNoteTh: str(t.outOfStockNoteTh, 'outOfStockNoteTh', { required: false, max: 200 }),
      stockTotal: typeof t.stockTotal === 'number' ? num(t.stockTotal, 'stockTotal', { min: 0 }) : undefined,
    }
  })

  // Preview: how many visitors would newly qualify per tier.
  const preview: Record<string, number> = {}
  for (const t of parsed) {
    const q = await db.collection('users').where('role', '==', 'visitor').where('points', '>=', t.thresholdPoints).count().get()
    const have = await db.collection('tierUnlocks').where('tierId', '==', t.id).count().get()
    preview[t.id] = Math.max(0, q.data().count - have.data().count)
  }
  if (dryRun) return { preview, available }

  const existing = await db.collection('prizeTiers').get()
  const batch = db.batch()
  for (const t of parsed) {
    const ref = db.doc(`prizeTiers/${t.id}`)
    const prev = existing.docs.find((d) => d.id === t.id)?.data() as PrizeTierDoc | undefined
    const { stockTotal, ...rest } = t
    const doc: Partial<PrizeTierDoc> = { eventId: ev.id, ...rest }
    if (!prev) {
      doc.stockTotal = stockTotal ?? 0
      doc.stockRemaining = stockTotal ?? 0
      if (doc.stockTotal) {
        batch.set(db.collection('stockAdjustments').doc(), {
          tierId: t.id, delta: doc.stockTotal, reason: 'load-in', actorUid: actor, kind: 'load-in', createdAt: FieldValue.serverTimestamp(),
        })
      }
    }
    batch.set(ref, doc, { merge: true })
  }
  // Tiers removed from the list are deactivated, never deleted (unlock history stays).
  for (const d of existing.docs) if (!parsed.some((t) => t.id === d.id)) batch.set(d.ref, { active: false }, { merge: true })
  await batch.commit()

  /**
   * Lowering a threshold unlocks immediately (§6.7). Raising never revokes.
   *
   * This used to read every matching visitor in one unbounded query and then stop after 450
   * new unlocks per tier, with nothing in the result to say it had stopped. At 451 eligible
   * visitors the 451st was silently skipped and never retried — they would see enough points
   * on their passport and be turned away at the desk. A three-day event is around 1,500
   * visitors, so this was going to happen.
   *
   * Now it pages the visitors, checks the unlock documents in bulk rather than one round trip
   * each, and keeps committing until the tier is finished. `PAGE` stays under Firestore's
   * 500-writes-per-batch ceiling so one page is always one batch.
   */
  const PAGE = 400
  let created = 0
  for (const t of parsed) {
    let cursor: QueryDocumentSnapshot | undefined
    for (;;) {
      let q = db.collection('users')
        .where('role', '==', 'visitor').where('points', '>=', t.thresholdPoints)
        .orderBy('points').orderBy(FieldPath.documentId()).limit(PAGE)
      if (cursor) q = q.startAfter(cursor)
      const page = await q.get()
      if (page.empty) break
      cursor = page.docs[page.docs.length - 1]

      const refs = page.docs.map((u) => db.doc(`tierUnlocks/${u.id}_${t.id}`))
      const already = new Set((await db.getAll(...refs)).filter((s) => s.exists).map((s) => s.id))
      const batch = db.batch()
      let n = 0
      for (const u of page.docs) {
        if (already.has(`${u.id}_${t.id}`)) continue
        const ud = u.data() as UserDoc
        batch.set(db.doc(`tierUnlocks/${u.id}_${t.id}`), {
          visitorId: u.id, tierId: t.id, unlockedAt: FieldValue.serverTimestamp(),
          pointsAtUnlock: ud.points, stampCountAtUnlock: ud.stampCount,
          redeemedAt: null, redeemedBy: null, redemptionNote: null, voidedAt: null, voidedBy: null, voidReason: null,
        })
        n++
      }
      if (n) { await batch.commit(); created += n }
      if (page.size < PAGE) break
    }
  }
  // `stockTotal` is undefined for an existing tier (stock is never typed over), and Firestore
  // refuses undefined inside a document — which made every policy save from the admin page fail.
  await audit(actor, 'savePrizePolicy', 'prizePolicy', ev.id, existing.docs.map((d) => d.data()), parsed.map((t) => ({ ...t, stockTotal: t.stockTotal ?? null })))
  return { ok: true, preview, available, unlocksCreated: created }
})

/**
 * §6.7 — stock is only ever adjusted with a reason, never typed over.
 *
 * For a tier stocked per session, the adjustment lands on the session that is open now and
 * nowhere else: a box of ten that turns up at half past ten is ten more gifts this morning, not
 * a standing rise in every session's allowance. `stockPerSession` is deliberately untouched, so
 * the afternoon still starts from its own fifty.
 *
 * This used to move `stockTotal`/`stockRemaining` only. Those are the event-wide audit figures,
 * and the desk does not spend them — so an admin could add twenty gifts, be told it worked, and
 * change nothing about what the desk could hand out.
 */
export const adjustStock = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const tierId = str(req.data?.tierId, 'tierId')
  const delta = num(req.data?.delta, 'delta', { min: -100_000, max: 100_000 })
  const reason = str(req.data?.reason, 'reason', { max: 300 })
  const kind = (str(req.data?.kind, 'kind', { required: false }) || 'restock') as 'load-in' | 'restock' | 'correction'
  const ev = await getActiveEvent(true)
  const sessions = ev.prizeSessions?.length ? ev.prizeSessions : DEFAULT_PRIZE_SESSIONS
  let sessionKey: string | null = null

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`prizeTiers/${tierId}`)
    const t = (await tx.get(ref)).data() as PrizeTierDoc | undefined
    if (!t) throw new HttpsError('not-found', 'Tier not found')
    if (t.stockRemaining + delta < 0) throw new HttpsError('invalid-argument', 'Would take remaining stock below zero')

    if (typeof t.stockPerSession === 'number') {
      const now = Date.now()
      const active = currentPrizeSession(ev.days ?? [], sessions, now)
      if (!active) {
        // Refused rather than guessed at. "This session" has no meaning with no session open,
        // and silently choosing the next one would hand someone a surprise at nine tomorrow.
        const next = nextPrizeSession(ev.days ?? [], sessions, now)
        throw new HttpsError('failed-precondition', next
          ? `This prize is stocked per session and the desk is closed, so there is no session to adjust. It opens at ${minuteToHHMM(next.session.startMinute)} on ${next.day}.`
          : 'This prize is stocked per session and the desk is closed for the rest of the event, so there is no session to adjust.')
      }
      sessionKey = active.key
      const before = t.sessionRemaining?.[active.key] ?? t.stockPerSession
      const after = before + delta
      if (after < 0) {
        throw new HttpsError('invalid-argument', `Would take this session below zero — ${before} left this ${active.session.label.toLowerCase()}`)
      }
      // Absolute, not an increment: an untouched session has no map entry yet, and an increment
      // against a missing key writes the delta rather than the allowance plus it. The
      // transaction is what makes the read-then-write safe. Same reasoning as confirmRedemption.
      tx.update(ref, new FieldPath('sessionRemaining', active.key), after)
    }

    // The event-wide figures follow either way: they are the audit trail and what the archive
    // reports, even when they are not what the desk spends.
    tx.update(ref, { stockTotal: FieldValue.increment(delta), stockRemaining: FieldValue.increment(delta) })
    tx.create(db.collection('stockAdjustments').doc(), {
      tierId, delta, reason, actorUid: actor, kind, createdAt: FieldValue.serverTimestamp(),
      ...(sessionKey ? { sessionKey } : {}),
    })
  })
  await audit(actor, 'adjustStock', 'prizeTier', tierId, null, { delta, reason, kind, sessionKey })
  return { ok: true, sessionKey }
})

/** §6.7 — stage draw. */
export const runDraw = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const ev = await getActiveEvent()
  const count = num(req.data?.count ?? 1, 'count', { min: 1, max: 50 })
  const tiers = await db.collection('prizeTiers').where('grantsDrawEntry', '==', true).get()
  const pool = new Set<string>()
  for (const t of tiers.docs) {
    const un = await db.collection('tierUnlocks').where('tierId', '==', t.id).get()
    un.docs.forEach((d) => { if (!d.data().voidedAt) pool.add(d.data().visitorId) })
  }
  const prev = await db.collection('draws').get()
  prev.docs.forEach((d) => (d.data().winners as string[]).forEach((w) => pool.delete(w)))
  const ids = [...pool]
  const winners: string[] = []
  while (winners.length < count && ids.length) winners.push(ids.splice(Math.floor(Math.random() * ids.length), 1)[0])
  const names = await Promise.all(winners.map(async (w) => {
    const u = (await db.doc(`users/${w}`).get()).data() as UserDoc | undefined
    return { uid: w, displayName: u?.displayName ?? '?', passportNo: u?.passportNo ?? '' }
  }))
  await db.collection('draws').add({ winners, names, actorUid: actor, createdAt: FieldValue.serverTimestamp(), poolSize: pool.size })
  await audit(actor, 'runDraw', 'draw', ev.id, null, { winners })
  return { winners: names, poolSize: pool.size }
})

// ---------- reference data (§4.1) ----------

/**
 * §4.1 / §13 — the institution, MFU school and ethnic-group suggestion lists. These were
 * writable only by re-running the seed, which needs a developer with application-default
 * credentials. The Office of International Affairs has to be able to revise the ethnic-group
 * lists (§10 — sensitive data under PDPA s.26) without that, and the institution list changes
 * whenever a new university is invited.
 *
 * `refData/*` is world-readable by design (the registration form reads it before sign-in), so
 * these are suggestion lists only — never a security boundary. The form accepts free text.
 */
export const saveRefData = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const name = str(req.data?.name, 'name')
  if (!['institutions', 'mfuSchools', 'ethnicGroups'].includes(name)) {
    throw new HttpsError('invalid-argument', 'Unknown reference list')
  }
  const ref = db.doc(`refData/${name}`)
  const before = (await ref.get()).data() ?? null

  const clean = (v: unknown, field: string) => {
    if (!Array.isArray(v)) throw new HttpsError('invalid-argument', `${field} must be a list`)
    // Trim and drop blanks before validating: `str()` treats an empty string as missing and
    // throws, and a pasted list routinely has trailing blank lines.
    const trimmed = (v as unknown[])
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => x.length > 0)
      .map((x) => str(x, field, { max: 120 }))
    const out = [...new Set(trimmed)]
    if (out.length > 400) throw new HttpsError('invalid-argument', `${field} is too long`)
    return out.sort((a, b) => a.localeCompare(b))
  }

  if (name === 'ethnicGroups') {
    // Shape is { [ISO 3166-1 alpha-2]: string[] } — one list per country of origin.
    const src = (req.data?.byCountry ?? {}) as Record<string, unknown>
    const byCountry: Record<string, string[]> = {}
    for (const [code, list] of Object.entries(src)) {
      const cc = code.toUpperCase()
      if (!/^[A-Z]{2}$/.test(cc)) throw new HttpsError('invalid-argument', `Bad country code: ${code}`)
      const cleaned = clean(list, `ethnicGroups.${cc}`)
      if (cleaned.length) byCountry[cc] = cleaned
    }
    if (Object.keys(byCountry).length > 60) throw new HttpsError('invalid-argument', 'Too many countries')
    await ref.set(byCountry)
    await audit(actor, 'saveRefData', 'refData', name, before, byCountry)
    return { ok: true, countries: Object.keys(byCountry).length }
  }

  const list = clean(req.data?.list, name)
  await ref.set({ list })
  await audit(actor, 'saveRefData', 'refData', name, before, { list })
  return { ok: true, count: list.length }
})

// ---------- invitations (§6.4) ----------

/**
 * 14 days, or the end of the live event, whichever comes first (spec 6.4). Read from the
 * event document: a fixed date issues every invitation already expired once it has passed.
 */
function inviteExpiry(ev: ActiveEvent) {
  const fortnight = Date.now() + 14 * 86400_000
  const end = toMillis(ev.endsAt)
  return Timestamp.fromMillis(end && end > Date.now() ? Math.min(fortnight, end) : fortnight)
}

function eventDates(ev: ActiveEvent): string {
  const fmt = (ms: number | null) => (ms
    ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })
    : '')
  const a = fmt(toMillis(ev.startsAt)), b = fmt(toMillis(ev.endsAt))
  return a && b ? (a === b ? a : a + ' - ' + b) : ev.days.join(' / ')
}

export const inviteOrganizer = onCall({ secrets: [EMAILJS_PRIVATE_KEY] }, async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const ev = await getActiveEvent(true)
  const list: Array<{ name: string; email: string; boothId: string; role?: Role }> = Array.isArray(req.data?.invites)
    ? req.data.invites
    : [{ name: req.data?.name, email: req.data?.email, boothId: req.data?.boothId, role: req.data?.role }]
  const results = []
  for (const inv of list.slice(0, 50)) {
    const email = str(inv.email, 'email', { max: 120 }).toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', `Bad email: ${email}`)
    const displayName = str(inv.name, 'name', { max: 80 })
    const role = (inv.role === 'admin' ? 'admin' : 'organizer') as 'organizer' | 'admin'
    const boothId = role === 'organizer' ? str(inv.boothId, 'boothId') : null
    let boothName = ''
    if (boothId) {
      const b = await db.doc(`booths/${boothId}`).get()
      if (!b.exists) throw new HttpsError('not-found', `Booth ${boothId} not found`)
      boothName = (b.data() as BoothDoc).nameEn
    }
    const token = randomToken(24)
    const expiresAt = inviteExpiry(ev)
    const ref = db.collection('invites').doc()
    const doc: InviteDoc = {
      email, displayName, boothId, role, tokenHash: sha256(token), status: 'sent',
      sentAt: FieldValue.serverTimestamp(), sentBy: actor, expiresAt, acceptedUid: null,
    }
    await ref.set(doc)
    const link = `${APP_ORIGIN.value()}/invite/${token}`
    let mailed = false
    try {
      mailed = await sendInvite({
        to: email, name: displayName, boothName, link, role,
        expires: expiresAt.toDate().toLocaleDateString('en-GB'),
        eventName: ev.nameEn, eventDates: eventDates(ev),
      })
    } catch (e) {
      console.error('invite mail failed', e)
    }
    await audit(actor, 'inviteOrganizer', 'invite', ref.id, null, { email, boothId, role, mailed })
    // The link always comes back, whether or not the mail went out. When it did, the admin screen
    // keeps it folded away — but an invitation that lands in spam is common, and the only other
    // way to hand the organizer their link is `resendInvite`, which rotates the token and kills
    // the copy already sitting in their inbox. This is not an extra exposure: the token is
    // single-use and refuses any address but the invited one (see `acceptInvite`).
    results.push({ inviteId: ref.id, email, mailed, link })
  }
  return { results, mailConfigured: mailConfigured() }
})

export const resendInvite = onCall({ secrets: [EMAILJS_PRIVATE_KEY] }, async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.inviteId, 'inviteId')
  const ref = db.doc(`invites/${id}`)
  const inv = (await ref.get()).data() as InviteDoc | undefined
  if (!inv || inv.status === 'accepted') throw new HttpsError('failed-precondition', 'Cannot resend')
  const ev = await getActiveEvent(true)
  const token = randomToken(24)
  const expiresAt = inviteExpiry(ev)
  await ref.set({ tokenHash: sha256(token), status: 'sent', sentAt: FieldValue.serverTimestamp(), expiresAt }, { merge: true })
  const boothName = inv.boothId ? ((await db.doc(`booths/${inv.boothId}`).get()).data() as BoothDoc | undefined)?.nameEn ?? '' : ''
  const link = `${APP_ORIGIN.value()}/invite/${token}`
  let mailed = false
  try {
    mailed = await sendInvite({
      to: inv.email, name: inv.displayName, boothName, link,
      role: inv.role === 'admin' ? 'admin' : 'organizer',
      expires: expiresAt.toDate().toLocaleDateString('en-GB'),
      eventName: ev.nameEn, eventDates: eventDates(ev),
    })
  } catch (e) { console.error(e) }
  await audit(actor, 'resendInvite', 'invite', id, null, { mailed })
  return { mailed, link }
})

export const revokeInvite = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const id = str(req.data?.inviteId, 'inviteId')
  // The hash stays so the link can still be recognised and told "revoked" rather than "invalid";
  // status is what acceptInvite checks, so the token is dead either way.
  await db.doc(`invites/${id}`).set({ status: 'revoked' }, { merge: true })
  await audit(actor, 'revokeInvite', 'invite', id, null, null)
  return { ok: true }
})

/** Public-with-token: what does this invitation say? Marks it `opened`. */
export const inviteInfo = onCall(async (req) => {
  const token = str(req.data?.token, 'token', { max: 200 })
  const q = await db.collection('invites').where('tokenHash', '==', sha256(token)).limit(1).get()
  if (q.empty) return { status: 'invalid' as const }
  const inv = q.docs[0].data() as InviteDoc
  if (inv.status === 'revoked') return { status: 'revoked' as const }
  if (inv.status === 'accepted') return { status: 'accepted' as const }
  if ((inv.expiresAt as Timestamp).toMillis() < Date.now()) return { status: 'expired' as const }
  if (inv.status === 'sent') await q.docs[0].ref.set({ status: 'opened', openedAt: FieldValue.serverTimestamp() }, { merge: true })
  const boothName = inv.boothId ? ((await db.doc(`booths/${inv.boothId}`).get()).data() as BoothDoc | undefined)?.nameEn ?? '' : ''
  return { status: 'ok' as const, displayName: inv.displayName, email: inv.email, role: inv.role, boothId: inv.boothId, boothName }
})

/**
 * The caller has already signed in with Google or an email and password (§4.1 — there is no
 * anonymous session to upgrade any more); this promotes that account. Single-use.
 */
export const acceptInvite = onCall(async (req) => {
  const uid = requireAuth(req)
  const token = str(req.data?.token, 'token', { max: 200 })
  const q = await db.collection('invites').where('tokenHash', '==', sha256(token)).limit(1).get()
  if (q.empty) throw new HttpsError('not-found', 'Invalid invitation')
  const snap = q.docs[0]
  const inv = snap.data() as InviteDoc
  if (inv.status === 'accepted' || inv.status === 'revoked') throw new HttpsError('failed-precondition', 'This invitation has already been used')
  if ((inv.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This invitation has expired')

  // Bound to the invited address, and to an address the caller has actually proved is theirs.
  const callerEmail = (req.auth!.token.email as string | undefined)?.toLowerCase()
  if (!callerEmail) throw new HttpsError('failed-precondition', 'Sign in with the invited email address first')
  if (callerEmail !== inv.email) throw new HttpsError('permission-denied', 'This invitation was sent to a different address')
  if (req.auth!.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Confirm your email address first')

  const claims = inv.role === 'organizer' ? { role: 'organizer', boothId: inv.boothId } : { role: 'admin' }
  await auth.setCustomUserClaims(uid, claims)

  /*
   * Promote the account; do not re-create it.
   *
   * The blank counters, the 'staff' visitor type and the MFU/TH defaults are what a brand new
   * staff account needs, and writing them over an existing document is how a student who
   * registered as a visitor in the morning and was asked to run a booth in the afternoon lost
   * their stamps: `points`, `stampCount`, `stampedBoothIds` and `daysAttended` all went back to
   * zero, their own answers about who they are were replaced with MFU/TH/staff, and `createdAt`
   * moved to today — while their `scans` stayed on the booth counters, so the passport and the
   * booth totals then disagreed.
   *
   * So the defaults are only written when there is nothing there, and an existing document gets
   * exactly the four fields the invitation is actually about. `displayName` is deliberately left
   * alone too: theirs is the name they chose, and the invitation's is whatever the admin typed
   * into the CSV.
   */
  const userRef = db.doc(`users/${uid}`)
  const existingUser = await userRef.get()
  await userRef.set(existingUser.exists
    ? {
      role: inv.role,
      boothId: inv.boothId,
      contact: inv.email,
      contactVerified: true,
      displayName: (existingUser.data() as UserDoc).displayName || inv.displayName,
      lastSeenAt: FieldValue.serverTimestamp(),
    }
    : {
      role: inv.role, displayName: inv.displayName, contact: inv.email, contactVerified: true,
      boothId: inv.boothId, visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
      stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [],
      createdAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  if (inv.boothId) await db.doc(`booths/${inv.boothId}`).set({ organizerUid: uid }, { merge: true })
  // Keep the hash (see revokeInvite): a second visit to the link should say "already used", not "invalid".
  await snap.ref.set({ status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), acceptedUid: uid }, { merge: true })
  return { ok: true, role: inv.role, boothId: inv.boothId }
})

// ---------- misc ----------

/** What the dashboard's readiness checklist cannot see from the client: whether invitation mail can be sent. */
export const setupStatus = onCall({ secrets: [EMAILJS_PRIVATE_KEY] }, async (req) => {
  requireRole(req, 'admin')
  return { mailConfigured: mailConfigured() }
})

export const refreshRanks = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  await recomputeRanks()
  await audit(actor, 'refreshRanks', 'stats', 'booths', null, null)
  return { ok: true }
})

/**
 * One-off bootstrap (§3 "first admin is seeded by a one-off admin script"): the FIRST
 * signed-in caller who presents the bootstrap key becomes admin. Refuses once an admin exists.
 *   firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY
 */
export const ADMIN_BOOTSTRAP_KEY = defineSecret('ADMIN_BOOTSTRAP_KEY')
export const bootstrapAdmin = onCall({ secrets: [ADMIN_BOOTSTRAP_KEY] }, async (req) => {
  const uid = requireAuth(req)
  const key = str(req.data?.key, 'key', { max: 200 })
  const expected = ADMIN_BOOTSTRAP_KEY.value()
  if (!expected || key !== expected) throw new HttpsError('permission-denied', 'Bad bootstrap key')
  const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get()
  if (!admins.empty) throw new HttpsError('failed-precondition', 'An admin already exists — use the admin panel to add more')
  await auth.setCustomUserClaims(uid, { role: 'admin' })
  await db.doc(`users/${uid}`).set({
    role: 'admin', displayName: str(req.data?.displayName, 'displayName', { required: false }) || 'Admin',
    contact: (req.auth!.token.email as string | undefined)?.toLowerCase() ?? `admin-${uid}`,
    contactVerified: req.auth!.token.email_verified === true,
    visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
    stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [], createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  await audit(uid, 'bootstrapAdmin', 'user', uid, null, null)
  return { ok: true }
})

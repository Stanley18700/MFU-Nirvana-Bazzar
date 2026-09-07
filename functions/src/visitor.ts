import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db, auth, FieldValue, Timestamp, requireAuth, str, rateLimit, clientFingerprint, redemptionSecret, getActiveEvent,
} from './lib'
import { computeToken, constantTimeEqual, counterFor, normaliseManualCode, parsePayload, DEFAULT_PERIOD_SECONDS, ParsedToken } from './shared/token'
import {
  BoothDoc, PrizeTierDoc, ScanResult, UserDoc, VisitorType, dayOf, passportNo,
} from './shared/model'

const VISITOR_TYPES: VisitorType[] = ['student', 'staff', 'alumni', 'guest']

/**
 * §4.1 — registration. Anonymous sign-in is gone: the caller already holds a Google or
 * email/password account, so the contact is the address on that account rather than
 * something typed into the form, and it is provably theirs before a passport is issued.
 */
export const join = onCall(async (req) => {
  const uid = requireAuth(req)
  const d = req.data ?? {}

  const email = (req.auth!.token.email as string | undefined)?.toLowerCase()
  if (!email) throw new HttpsError('failed-precondition', 'Sign in with an email address first')
  if (req.auth!.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Confirm your email address first — check your inbox for the link')
  }

  const displayName = str(d.displayName, 'displayName', { max: 80 })
  const visitorType = str(d.visitorType, 'visitorType') as VisitorType
  if (!VISITOR_TYPES.includes(visitorType)) throw new HttpsError('invalid-argument', 'Bad visitorType')
  const studentId = str(d.studentId, 'studentId', { required: false, max: 40 })
  const institution = str(d.institution, 'institution', { max: 120 })
  const institutionOther = str(d.institutionOther, 'institutionOther', { required: false, max: 120 })
  const school = str(d.school, 'school', { required: false, max: 120 })
  const countryCode = str(d.countryCode, 'countryCode', { max: 2 }).toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new HttpsError('invalid-argument', 'Bad countryCode')
  const contact = email
  if (d.consent !== true) throw new HttpsError('invalid-argument', 'Consent is required')

  // Sensitive field (PDPA s.26): stored only with its own separate consent.
  const ethnicConsent = d.ethnicConsent === true
  const ethnicGroupRaw = str(d.ethnicGroup, 'ethnicGroup', { required: false, max: 80 })
  const ethnicGroup = ethnicConsent && ethnicGroupRaw && ethnicGroupRaw !== 'Prefer not to say' ? ethnicGroupRaw : null

  const { ipPrefix } = clientFingerprint(req)
  if (!(await rateLimit(`join_${ipPrefix}`, 5, 3600))) {
    throw new HttpsError('resource-exhausted', 'Too many registrations from this network, try again later')
  }

  const userRef = db.doc(`users/${uid}`)
  const existing = await userRef.get()
  if (existing.exists && (existing.data() as UserDoc).role) {
    return { ok: true, passportNo: (existing.data() as UserDoc).passportNo, existing: true }
  }

  // One address = one passport (§4.1). Signing in on a new device reaches the same uid, so this
  // only fires when a stale document from a previous account still holds the address.
  const dup = await db.collection('users').where('contact', '==', contact).limit(1).get()
  if (!dup.empty && dup.docs[0].id !== uid) {
    throw new HttpsError('already-exists', 'This email already has a passport. Sign in with it instead.')
  }

  const seq = await db.runTransaction(async (tx) => {
    const cRef = db.doc('counters/passport')
    const c = await tx.get(cRef)
    const next = ((c.data()?.value as number | undefined) ?? 0) + 1
    tx.set(cRef, { value: next }, { merge: true })
    return next
  })

  // Forced: the passport number carries the event's prefix and is never reissued.
  const ev = await getActiveEvent(true)
  const today = dayOf(new Date())
  const user: UserDoc = {
    role: 'visitor',
    displayName,
    studentId: studentId || null,
    visitorType,
    institution,
    institutionOther: institutionOther || null,
    school: school || null,
    countryCode,
    isInternational: countryCode !== 'TH',
    ethnicGroup,
    ethnicConsentAt: ethnicGroup ? FieldValue.serverTimestamp() : null,
    contact,
    contactVerified: true,
    boothId: null,
    passportNo: passportNo(seq, ev.passportPrefix),
    stampCount: 0,
    points: 0,
    stampedBoothIds: [],
    daysAttended: [today],
    consentAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  }
  await userRef.set(user)
  await auth.setCustomUserClaims(uid, { role: 'visitor' })
  return { ok: true, passportNo: user.passportNo, existing: false }
})

/** §4.3 / §5.2 — verify a booth token and stamp the passport, exactly once per booth. */
export const scan = onCall(async (req): Promise<ScanResult> => {
  const uid = requireAuth(req)
  if (req.auth!.token.role !== 'visitor' && req.auth!.token.role !== 'admin') return { status: 'not_registered' }

  const raw = str(req.data?.payload, 'payload', { max: 400 })
  if (!(await rateLimit(`scan_${uid}`, 10, 60))) return { status: 'rate_limited' }

  const [event, userSnap] = await Promise.all([getActiveEvent(), db.doc(`users/${uid}`).get()])
  if (!userSnap.exists) return { status: 'not_registered' }
  const user = userSnap.data() as UserDoc
  let period = event.qrPeriodSeconds ?? DEFAULT_PERIOD_SECONDS
  let nowCounter = counterFor(Date.now(), period)

  /**
   * The counter is derived from the event's QR period, so a warm instance holding a stale
   * cached event computes the wrong window and rejects perfectly good codes. That window is
   * short but it lands exactly when a new event goes live. One forced re-read on the failure
   * path costs a single document read and closes it.
   */
  const refreshPeriod = async (): Promise<boolean> => {
    const fresh = await getActiveEvent(true)
    const p = fresh.qrPeriodSeconds ?? DEFAULT_PERIOD_SECONDS
    if (p === period) return false
    period = p
    nowCounter = counterFor(Date.now(), period)
    return true
  }

  let parsed = parsePayload(raw)
  if (!parsed) {
    // Manual entry (§4.3): a bare 6-character code. Match it against every active booth for the
    // current and previous period — 12 booths x 2 counters = 24 HMACs, trivially cheap.
    const code = normaliseManualCode(raw)
    if (code.length !== 6) return { status: 'invalid' }
    parsed = await matchManualCode(code, nowCounter)
    if (!parsed && (await refreshPeriod())) parsed = await matchManualCode(code, nowCounter)
    if (!parsed) return { status: 'invalid' }
  }

  const [boothSnap, secretSnap] = await Promise.all([
    db.doc(`booths/${parsed.boothId}`).get(),
    db.doc(`boothSecrets/${parsed.boothId}`).get(),
  ])
  if (!boothSnap.exists || !secretSnap.exists) return { status: 'invalid' }
  const booth = boothSnap.data() as BoothDoc
  if (!booth.active) return { status: 'invalid' }
  // Grace window of one period (§5.2): current or previous counter only.
  if (parsed.counter !== nowCounter && parsed.counter !== nowCounter - 1) await refreshPeriod()
  if (parsed.counter !== nowCounter && parsed.counter !== nowCounter - 1) {
    // A well-formed but stale token: tell the visitor to rescan rather than "invalid".
    const expected = await computeToken(secretSnap.data()!.secret, parsed.boothId, parsed.counter)
    return constantTimeEqual(expected, parsed.token) ? { status: 'expired' } : { status: 'invalid' }
  }
  const expected = await computeToken(secretSnap.data()!.secret, parsed.boothId, parsed.counter)
  if (!constantTimeEqual(expected, parsed.token)) return { status: 'invalid' }

  const scanId = `${uid}_${parsed.boothId}`
  const scanRef = db.doc(`scans/${scanId}`)
  const now = new Date()
  const { uaHash, ipPrefix } = clientFingerprint(req)

  try {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(scanRef)
      if (s.exists) throw new HttpsError('already-exists', 'already')
      tx.create(scanRef, {
        visitorId: uid,
        boothId: parsed.boothId,
        eventId: event.id,
        scannedAt: Timestamp.fromDate(now),
        day: dayOf(now),
        pointsAwarded: booth.points, // frozen at scan time (§6.6)
        counter: parsed.counter,
        uaHash, ipPrefix,
        visitorType: user.visitorType ?? 'guest',
        institution: user.institution ?? '',
        school: user.school ?? null,
        countryCode: user.countryCode ?? 'XX',
        isInternational: user.isInternational ?? false,
        // ethnicGroup deliberately NOT copied (§7.1)
      })
    })
  } catch (e) {
    if (e instanceof HttpsError && e.code === 'already-exists') return { status: 'already', boothId: parsed.boothId }
    throw e
  }

  // Counters are updated by the onScanCreate trigger; return an optimistic total so the
  // visitor sees "+N points" instantly. Tier unlocks are also created by the trigger.
  const points = (user.points ?? 0) + booth.points
  const tiers = await db.collection('prizeTiers').where('active', '==', true).get()
  const unlockedTierIds = tiers.docs
    .filter((t) => {
      const tier = t.data() as PrizeTierDoc
      return tier.thresholdPoints > (user.points ?? 0) && tier.thresholdPoints <= points
    })
    .map((t) => t.id)

  return {
    status: 'success',
    boothId: parsed.boothId,
    pointsAwarded: booth.points,
    points,
    stampCount: (user.stampCount ?? 0) + 1,
    unlockedTierIds,
  }
})

async function matchManualCode(code: string, nowCounter: number): Promise<ParsedToken | null> {
  const [booths, secrets] = await Promise.all([
    db.collection('booths').where('active', '==', true).get(),
    db.collection('boothSecrets').get(),
  ])
  const secretOf = new Map(secrets.docs.map((d) => [d.id, d.data().secret as string]))
  for (const b of booths.docs) {
    const secret = secretOf.get(b.id)
    if (!secret) continue
    for (const counter of [nowCounter, nowCounter - 1]) {
      if (constantTimeEqual(await computeToken(secret, b.id, counter), code)) return { boothId: b.id, counter, token: code }
    }
  }
  return null
}

/** §4.4 — rotating 8-character redemption code for the caller (30 s period). */
export const REDEMPTION_PERIOD = 30
export const redemptionCode = onCall(async (req) => {
  const uid = requireAuth(req)
  const secret = await redemptionSecret()
  const counter = counterFor(Date.now(), REDEMPTION_PERIOD)
  const code = (await computeToken(secret, `r:${uid}`, counter)) + (await computeToken(secret, `r2:${uid}`, counter)).slice(0, 2)
  return { code, counter, period: REDEMPTION_PERIOD, payload: `${uid}.${counter}.${code}`, serverTime: Date.now() }
})

export async function verifyRedemptionPayload(payload: string): Promise<{ uid: string } | null> {
  const m = payload.trim().match(/(?:^|\/r\/)([A-Za-z0-9]+)\.(\d+)\.([A-Z2-7]{8})(?:[/?#]|$)/i)
  if (!m) return null
  const [, uid, counterStr, code] = m
  const counter = Number(counterStr)
  const now = counterFor(Date.now(), REDEMPTION_PERIOD)
  if (counter !== now && counter !== now - 1) return null
  const secret = await redemptionSecret()
  const expected = (await computeToken(secret, `r:${uid}`, counter)) + (await computeToken(secret, `r2:${uid}`, counter)).slice(0, 2)
  return constantTimeEqual(expected, code.toUpperCase()) ? { uid } : null
}

/**
 * Copies the address on the Auth account down onto users/{uid}.
 *
 * Firebase Auth owns the email: `verifyBeforeUpdateEmail` (the "Email address change" mail)
 * swaps it without telling Firestore, so `contact` would otherwise drift and the organisers
 * would be looking at an address that no longer signs in. The client calls this after any
 * change, and again whenever it notices the two disagree.
 */
export const syncAccount = onCall(async (req) => {
  const uid = requireAuth(req)
  const rec = await auth.getUser(uid)
  const email = rec.email?.toLowerCase() ?? null
  const ref = db.doc(`users/${uid}`)
  if (!(await ref.get()).exists) return { ok: true as const, synced: false, contact: email }

  if (email) {
    const dup = await db.collection('users').where('contact', '==', email).limit(1).get()
    if (!dup.empty && dup.docs[0].id !== uid) {
      throw new HttpsError('already-exists', 'Another passport already uses that email address')
    }
  }
  await ref.set({
    ...(email ? { contact: email } : {}),
    contactVerified: !!rec.emailVerified,
    ...(rec.displayName ? { displayName: rec.displayName } : {}),
    lastSeenAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  return { ok: true as const, synced: true, contact: email, contactVerified: !!rec.emailVerified }
})

/** §10 — self-service PDPA erasure request. */
export const requestErasure = onCall(async (req) => {
  const uid = requireAuth(req)
  await db.collection('erasureRequests').doc(uid).set({ uid, requestedAt: FieldValue.serverTimestamp(), status: 'open' })
  return { ok: true }
})

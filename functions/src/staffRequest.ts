/**
 * Becoming booth staff when nobody has your email address.
 *
 * `inviteOrganizer` regex-validates an address, and `acceptInvite` refuses any caller whose
 * verified token email differs from the invited one — deliberately, because the emailed link is
 * the credential. None of that helps a booth host who turns up on the day and is simply not on
 * anyone's list, which is the gap this closes.
 *
 * It closes it without adding a fourth self-granting route. `scripts/e2e-auth.mjs` opens by
 * stating the rule the festival rests on — "a guest signs themselves up, and staff are invited" —
 * and organizer is not a small role: `boothSession` hands over the raw HMAC booth secret, which
 * mints valid stamp QR codes off-device until an admin rotates it. So filing a request grants
 * nothing at all. An admin decides every case; the only dependency removed is on knowing an email
 * address in advance, not on an admin being in the loop.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import {
  db, auth, FieldValue, requireAuth, requireRole, str, audit,
  getActiveEvent, rateLimit, clientFingerprint,
} from './lib'
import { BoothDoc, StaffRequestDoc, UserDoc } from './shared/model'
import { createBoothDoc } from './admin'

/**
 * Ask to run a booth. Writes a pending row and nothing else — no claim, no booth, no user change.
 */
export const requestBoothAccess = onCall(async (req) => {
  const uid = requireAuth(req)

  /*
   * A verified address is what makes the request answerable: an admin approving one is deciding
   * about a person they may be standing next to, and needs something to match them against.
   * Google sign-in satisfies this without anybody typing an address, which is the point.
   */
  if (req.auth!.token.email_verified !== true && !req.auth!.token.phone_number) {
    throw new HttpsError('failed-precondition', 'Confirm your email address first — check your inbox for the link')
  }

  /*
   * The same guard `join` uses (visitor.ts) and for the same reason: an account that already holds
   * a working role must not launder itself into a different one through a side door. An organizer
   * who wants a *different* booth is an admin's job, not a new request.
   *
   * An organizer with no booth at all is the exception, and the reason the booth screen's dead end
   * links here: the claim says staff but names nothing, so the screen cannot start and there is
   * otherwise no way forward for them. Refusing them too would have sent that link in a circle.
   */
  const role = req.auth!.token.role as string | undefined
  const claimBooth = req.auth!.token.boothId as string | undefined
  if (role === 'admin' || (role === 'organizer' && claimBooth)) {
    throw new HttpsError('failed-precondition', 'This account is already staff. Ask an admin to change which booth it runs.')
  }

  const boothId = str(req.data?.boothId, 'boothId', { required: false, max: 40 })
  const newBoothName = str(req.data?.newBoothName, 'newBoothName', { required: false, max: 120 })
  const note = str(req.data?.note, 'note', { required: false, max: 300 })
  // One or the other. Both would leave the admin guessing which the person meant.
  if (!boothId && !newBoothName) throw new HttpsError('invalid-argument', 'Choose a booth or type its name')
  if (boothId && newBoothName) throw new HttpsError('invalid-argument', 'Choose a booth or type its name, not both')
  if (boothId && !(await db.doc(`booths/${boothId}`).get()).exists) {
    throw new HttpsError('not-found', 'That booth no longer exists — pick another, or type its name')
  }

  // As generous as `join`, and for a reason that is specific to the day: the venue's Wi-Fi puts
  // every host behind one address, so a per-network limit tight enough to matter would lock out
  // the tenth legitimate person on the morning of the 16th. Filing grants nothing, so the only
  // thing this protects is the admin's list from a script — and 200 an hour still does that.
  const { ipPrefix } = clientFingerprint(req)
  if (!(await rateLimit(`staffreq_${ipPrefix}`, 200, 3600))) {
    throw new HttpsError('resource-exhausted', 'Too many requests from this network in the last hour. Please ask a member of staff.')
  }

  const userSnap = await db.doc(`users/${uid}`).get()
  const user = userSnap.data() as UserDoc | undefined
  const contact = (req.auth!.token.email as string | undefined)?.toLowerCase()
    || (req.auth!.token.phone_number as string | undefined)
    || user?.contact || ''

  /*
   * Keyed by uid, so a second submission corrects the first rather than queueing beside it. An
   * already-approved row is left alone: re-requesting after approval would otherwise reopen a
   * decision that has already been acted on.
   */
  const ref = db.doc(`staffRequests/${uid}`)
  const existing = (await ref.get()).data() as StaffRequestDoc | undefined
  if (existing?.status === 'approved') {
    throw new HttpsError('failed-precondition', 'This request was already approved. Sign out and back in if your booth has not appeared.')
  }

  const doc: StaffRequestDoc = {
    uid,
    displayName: user?.displayName || (req.auth!.token.name as string | undefined) || contact || 'Unnamed',
    contact,
    boothId: boothId || null,
    newBoothName: newBoothName || null,
    note: note || null,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    grantedBoothId: null,
  }
  await ref.set(doc)
  return { ok: true as const, status: 'pending' as const }
})

/**
 * An admin's decision. This is the only place a request turns into a claim.
 */
export const decideStaffRequest = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const uid = str(req.data?.uid, 'uid')
  const approve = req.data?.approve === true
  const overrideBoothId = str(req.data?.boothId, 'boothId', { required: false, max: 40 })
  const note = str(req.data?.decisionNote, 'decisionNote', { required: false, max: 300 })

  const ref = db.doc(`staffRequests/${uid}`)
  const reqDoc = (await ref.get()).data() as StaffRequestDoc | undefined
  if (!reqDoc) throw new HttpsError('not-found', 'No such request')
  if (reqDoc.status !== 'pending') throw new HttpsError('failed-precondition', `This request was already ${reqDoc.status}`)

  if (!approve) {
    await ref.set({ status: 'rejected', decidedAt: FieldValue.serverTimestamp(), decidedBy: actor, decisionNote: note || null }, { merge: true })
    await audit(actor, 'decideStaffRequest', 'staffRequest', uid, reqDoc, { approve: false, decisionNote: note || null })
    return { ok: true as const, approved: false as const }
  }

  /*
   * Which booth, in order of authority: what the admin picked while approving, then what was
   * asked for, then a new one from the typed name. The override exists because the person asking
   * may well name their booth differently from the sheet — "the Korea table" against "ED12" —
   * and the admin looking at both should be able to land them on the right one.
   */
  const ev = await getActiveEvent(true)
  let boothId = overrideBoothId || reqDoc.boothId || ''
  let createdBooth: string | null = null
  if (!boothId) {
    if (!reqDoc.newBoothName) throw new HttpsError('failed-precondition', 'This request names no booth — pick one to approve it')
    // Active with the zone's standard points, exactly as an admin-created booth: the whole reason
    // this path exists is that the host can start working the moment they are approved.
    const made = await createBoothDoc(ev, { nameEn: reqDoc.newBoothName }, actor)
    boothId = made.id
    createdBooth = made.id
    await audit(actor, 'createBooth', 'booth', made.id, null, made.booth)
  } else if (!(await db.doc(`booths/${boothId}`).get()).exists) {
    throw new HttpsError('not-found', 'That booth no longer exists')
  }

  // The whole object, as everywhere else — setCustomUserClaims replaces rather than merges, so a
  // partial write here would strip the role it is meant to be granting.
  await auth.setCustomUserClaims(uid, { role: 'organizer', boothId })

  /*
   * Promote the account; do not re-create it. Same reasoning as `acceptInvite` (admin.ts), which
   * documents the bug at length: writing the staff defaults over an existing document is how a
   * student who registered as a visitor in the morning loses their stamps in the afternoon.
   */
  const userRef = db.doc(`users/${uid}`)
  const existingUser = await userRef.get()
  await userRef.set(existingUser.exists
    ? {
      role: 'organizer', boothId,
      displayName: (existingUser.data() as UserDoc).displayName || reqDoc.displayName,
      lastSeenAt: FieldValue.serverTimestamp(),
    }
    : {
      role: 'organizer', displayName: reqDoc.displayName, contact: reqDoc.contact, contactVerified: true,
      boothId, visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
      stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [],
      createdAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true })

  await db.doc(`booths/${boothId}`).set({ organizerUid: uid }, { merge: true })
  await ref.set({
    status: 'approved', decidedAt: FieldValue.serverTimestamp(), decidedBy: actor,
    decisionNote: note || null, grantedBoothId: boothId,
  }, { merge: true })

  const booth = (await db.doc(`booths/${boothId}`).get()).data() as BoothDoc | undefined
  await audit(actor, 'decideStaffRequest', 'staffRequest', uid, reqDoc, { approve: true, boothId, createdBooth, decisionNote: note || null })
  return { ok: true as const, approved: true as const, boothId, boothName: booth?.nameEn ?? boothId, createdBooth }
})

import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, signInAs, idToken, claims, rawCall, ownerDoc, readSecret, fails,
  bkkDay, windowAroundNow,
} from './lib.mjs'

/** Admin bootstrap, event and reference data, booth CRUD, desk-made accounts, the first invitation. */
export default async function adminSetup(ctx) {
  section('Admin bootstrap')
  ctx.adminUid = await signUpVerified('admin@example.com')
  await call('bootstrapAdmin')({ key: 'dev', displayName: 'Test Admin' })
  await auth.currentUser.getIdToken(true)
  ok('bootstrapAdmin sets the admin claim', (await claims()).role === 'admin')
  ctx.tokens.admin = await idToken()

  section('Live event is data, not a constant')
  const evs = await getDocs(query(collection(db, 'events'), where('status', '==', 'live')))
  ok('exactly one live event', evs.size === 1, `${evs.size} found`)
  const liveEvent = ctx.liveEvent = { id: evs.docs[0].id, ...evs.docs[0].data() }
  ok('event carries days[]', Array.isArray(liveEvent.days) && liveEvent.days.length === 3, JSON.stringify(liveEvent.days))
  ok('event carries passportPrefix', liveEvent.passportPrefix === 'MFU-GG')
  // Flat points since the booth count went from 12 to 76: distance weighting was designed for
  // two halls, and across 76 booths it made the far corners a chore rather than a draw.
  ok('event carries flat zonePoints', liveEvent.zonePoints?.far === 10 && liveEvent.zonePoints?.entrance === liveEvent.zonePoints?.far,
    JSON.stringify(liveEvent.zonePoints))
  ok('event carries prize sessions', Array.isArray(liveEvent.prizeSessions) && liveEvent.prizeSessions.length === 2,
    JSON.stringify(liveEvent.prizeSessions?.map((s) => s.id)))
  const listed = await call('listEvents')({})
  ok('listEvents returns the live one', listed.liveId === liveEvent.id, listed.liveId)

  /*
   * Booth ids are the organisers' own sheet codes now (ED8, FD26, OPEN3 …) and will change
   * again for the next event, so the suite picks booths by the job it needs them for rather
   * than naming them. The prize desk is whichever booth is flagged as one.
   */
  const allBooths = (await getDocs(query(collection(db, 'booths'), orderBy('sortOrder')))).docs.map((d) => ({ id: d.id, ...d.data() }))
  const desks = allBooths.filter((b) => b.isPrizeDesk)
  ok('the seed marks exactly one prize desk', desks.length === 1, desks.map((b) => b.id).join(',') || 'none')
  const others = allBooths.filter((b) => !b.isPrizeDesk)
  ctx.booths = {
    all: allBooths.map((b) => b.id),
    desk: desks[0].id,
    organizer: others[0].id,
    staff: others[1].id,
    // Ten is what a visitor needs for the 100-point gift at a flat ten a booth.
    stampable: others.slice(2, 12).map((b) => b.id),
    spare: others[12].id,
  }
  ok('76 booths seeded from the sheet', allBooths.length === 76, `${allBooths.length} booths`)

  section('Event and reference data are editable')
  // Only the Thai name: the scan counters below depend on qrPeriodSeconds staying put.
  await call('updateEvent')({ id: liveEvent.id, nameTh: 'e2e ทดสอบ' })
  const ev1 = (await getDoc(doc(db, 'events', liveEvent.id))).data()
  ok('updateEvent writes the field', ev1.nameTh === 'e2e ทดสอบ')
  ok('updateEvent keeps days[] and the QR period', ev1.days.length === 3 && ev1.qrPeriodSeconds === liveEvent.qrPeriodSeconds)

  /*
   * The prize desk only opens on a day the event runs, inside one of its windows — so a suite
   * that must pass on any day has to move the event to itself. This also exercises the session
   * editor's server half, which is the only way these times can be changed.
   */
  const today = bkkDay()
  await call('updateEvent')({ id: liveEvent.id, days: [today], prizeSessions: windowAroundNow() })
  const ev2 = (await getDoc(doc(db, 'events', liveEvent.id))).data()
  ok('the event can be moved onto today', ev2.days.length === 1 && ev2.days[0] === today, ev2.days.join(','))
  ok('and its prize window with it', ev2.prizeSessions?.length === 1 && ev2.prizeSessions[0].endMinute > ev2.prizeSessions[0].startMinute,
    JSON.stringify(ev2.prizeSessions))
  ok('overlapping windows are refused', await fails(call('updateEvent')({
    id: liveEvent.id,
    prizeSessions: [{ id: 'am', label: 'A', startMinute: 540, endMinute: 720 }, { id: 'pm', label: 'B', startMinute: 700, endMinute: 960 }],
  }), /overlaps/i))
  ctx.liveEvent = { ...liveEvent, days: ev2.days, prizeSessions: ev2.prizeSessions }

  const rd = await call('saveRefData')({ name: 'institutions', list: ['  Zeta U', 'Alpha U', '', 'Alpha U', 'MFU', 'Other'] })
  const inst = (await getDoc(doc(db, 'refData', 'institutions'))).data().list
  ok('saveRefData trims, dedupes and drops blanks', rd.count === 4 && inst.length === 4, inst.join('|'))
  ok('saveRefData sorts alphabetically', inst.join('|') === 'Alpha U|MFU|Other|Zeta U')
  const eg = await call('saveRefData')({ name: 'ethnicGroups', byCountry: { mm: ['Shan', 'Bamar'], TH: ['Akha'] } })
  const egDoc = (await getDoc(doc(db, 'refData', 'ethnicGroups'))).data()
  ok('ethnicGroups saved per upper-cased country', eg.countries === 2 && egDoc.MM?.[0] === 'Bamar' && !egDoc.mm)
  ok('unknown reference list refused', await fails(call('saveRefData')({ name: 'nope', list: ['x'] }), /Unknown reference list/))
  ok('bad country code refused', await fails(call('saveRefData')({ name: 'ethnicGroups', byCountry: { THA: ['x'] } }), /Bad country code/))

  const far = Date.now() + 60 * 86400_000
  const draft = await call('createEvent')({ nameEn: 'Draft To Delete', startsAt: far, endsAt: far + 86400_000 })
  ok('deleteEvent refuses the live event', await fails(call('deleteEvent')({ id: liveEvent.id }), /Only drafts/))
  await call('deleteEvent')({ id: draft.id })
  ok('deleteEvent removes a draft', !(await getDoc(doc(db, 'events', draft.id))).exists())

  section('Booth CRUD (before any scans, so the booth count comes back to where it started)')
  const countBefore = (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount
  const cb = await call('createBooth')({ nameEn: 'E2E Booth', zone: 'far' })
  // A booth added by hand is still numbered booth-NN from the count, which cannot collide with
  // the sheet's ED/CL/FD/OPEN codes. The id is taken from the result rather than predicted.
  const adhoc = cb.id
  ok('createBooth allocates a booth-NN id that cannot clash with the sheet', /^booth-\d+$/.test(adhoc), adhoc)
  const nb = (await getDoc(doc(db, 'booths', adhoc))).data()
  ok('new booth takes the zone default points and is active', nb.points === liveEvent.zonePoints.far && nb.active === true)
  ok('new booth has a secret', typeof (await readSecret(adhoc)) === 'string')
  ok('new booth has a stats doc', (await getDoc(doc(db, `stats/booths/items/${adhoc}`))).exists())
  ok('event boothCount incremented', (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount === countBefore + 1)
  await call('updateBooth')({ id: adhoc, points: 25, location: 'Test corner' })
  const nb2 = (await getDoc(doc(db, 'booths', adhoc))).data()
  ok('updateBooth patches the sent fields and keeps the rest', nb2.points === 25 && nb2.location === 'Test corner' && nb2.nameEn === 'E2E Booth')
  const sAd = await readSecret(adhoc)
  await call('rotateBoothSecret')({ id: adhoc })
  ok('rotateBoothSecret replaces the secret', (await readSecret(adhoc)) !== sAd)
  const del = await call('deleteBooth')({ id: adhoc })
  ok('an unscanned booth is deleted outright', del.deactivated === false)
  ok('booth doc gone', !(await getDoc(doc(db, 'booths', adhoc))).exists())
  ok('booth secret gone', (await ownerDoc(`boothSecrets/${adhoc}`)) === null)
  ok('event boothCount back', (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount === countBefore)

  section('Accounts made at the desk (§6.2)')
  const walk = await call('createUser')({ displayName: 'Walk-up Guest', contact: 'walkup@example.com', role: 'visitor', password: 'passw0rd!!', countryCode: 'TH', visitorType: 'guest' })
  ok('createUser issues a visitor a passport number', /^MFU-GG-\d{4}$/.test(walk.passportNo ?? ''), walk.passportNo)
  const staff = await call('createUser')({ displayName: 'Desk Staff', contact: 'staff@example.com', role: 'organizer', boothId: ctx.booths.staff, password: 'passw0rd!!' })
  ok('createUser refuses a duplicate contact', await fails(call('createUser')({ displayName: 'Dup', contact: 'walkup@example.com', role: 'visitor' }), /already has an account/))
  ok('an organizer without a booth is refused', await fails(call('createUser')({ displayName: 'X', contact: 'x@example.com', role: 'organizer' }), /needs a booth/))

  await signInAs('walkup@example.com', 'passw0rd!!')
  ok('admin-created visitor signs straight in, already verified', auth.currentUser.uid === walk.uid && auth.currentUser.emailVerified === true)
  ok('…and carries the visitor claim', (await claims()).role === 'visitor')
  const wdoc = (await getDoc(doc(db, 'users', walk.uid))).data()
  ok('walk-up passport document is complete', wdoc.passportNo === walk.passportNo && wdoc.contactVerified === true && wdoc.daysAttended?.length === 1, JSON.stringify({ p: wdoc.passportNo, v: wdoc.contactVerified, d: wdoc.daysAttended }))
  ctx.tally.visitors++ // onUserWrite counts a visitor document

  await signInAs('staff@example.com', 'passw0rd!!')
  ok('admin-created organizer opens their booth', (await call('boothSession')({})).boothId === ctx.booths.staff)
  await rawCall(ctx.tokens.admin, 'updateUser', { uid: staff.uid, displayName: 'Desk Staff 2', countryCode: 'mm' })
  const sdoc = (await getDoc(doc(db, 'users', staff.uid))).data()
  ok('updateUser patches fields and derives isInternational', sdoc.displayName === 'Desk Staff 2' && sdoc.countryCode === 'MM' && sdoc.isInternational === true)
  ok('updateUser validates the visitor type', await fails(rawCall(ctx.tokens.admin, 'updateUser', { uid: staff.uid, visitorType: 'robot' }), /Bad visitorType/))
  ok('updateUser with nothing to change is refused', await fails(rawCall(ctx.tokens.admin, 'updateUser', { uid: staff.uid }), /Nothing to update/))

  await rawCall(ctx.tokens.admin, 'deleteUser', { uid: walk.uid })
  const sd = await ownerDoc(`users/${walk.uid}`)
  ok('soft delete anonymises and keeps the document', !!sd?.deletedAt && sd.displayName === 'Deleted visitor' && sd.contact === `deleted-${walk.uid}`)
  ctx.tally.visitors-- // a deleted visitor leaves the count again
  await signOut(auth)
  ok('soft-deleted account cannot sign in', await signInWithEmailAndPassword(auth, 'walkup@example.com', 'passw0rd!!').then(() => false, (e) => e.code === 'auth/user-disabled'))
  await signInAs('admin@example.com')

  section('Invite expiry follows the event (was a hardcoded 2026-09-18)')
  const inv = await call('inviteOrganizer')({ invites: [{ name: 'Test Organizer', email: 'organizer@example.com', boothId: ctx.booths.organizer }] })
  ctx.inviteId = inv.results[0].inviteId
  const invDoc = await getDoc(doc(db, 'invites', ctx.inviteId))
  const expMs = invDoc.data().expiresAt.toMillis()
  ok('invitation is not already expired', expMs > Date.now(), new Date(expMs).toISOString())
  ok('emulator has no mail: a copyable link is returned', inv.results[0].mailed === false && /\/invite\//.test(inv.results[0].link ?? ''))
  ctx.tokenA = inv.results[0].link.split('/invite/')[1]

  section('draws is readable by an admin (was denied by the rules)')
  let drawsReadable = true
  try { await getDocs(collection(db, 'draws')) } catch (e) { drawsReadable = false; console.log('   ', e.code) }
  ok('admin can read draws', drawsReadable)

  section('A passport needs a real, confirmed account')
  await signOut(auth)
  await createUserWithEmailAndPassword(auth, 'unconfirmed@example.com', 'passw0rd!')
  let refused = ''
  try {
    await call('join')({ displayName: 'Unconfirmed', visitorType: 'guest', institution: 'MFU', countryCode: 'TH', consent: true })
  } catch (e) { refused = e.message ?? '' }
  ok('join refuses an unconfirmed email address', /confirm your email/i.test(refused), refused)
}

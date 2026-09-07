import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, signInAs, idToken, claims, rawCall, ownerDoc, readSecret, fails,
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
  ok('event carries zonePoints', liveEvent.zonePoints?.far === 20)
  const listed = await call('listEvents')({})
  ok('listEvents returns the live one', listed.liveId === liveEvent.id, listed.liveId)

  section('Event and reference data are editable')
  // Only the Thai name: the scan counters below depend on qrPeriodSeconds staying put.
  await call('updateEvent')({ id: liveEvent.id, nameTh: 'e2e ทดสอบ' })
  const ev1 = (await getDoc(doc(db, 'events', liveEvent.id))).data()
  ok('updateEvent writes the field', ev1.nameTh === 'e2e ทดสอบ')
  ok('updateEvent keeps days[] and the QR period', ev1.days.length === 3 && ev1.qrPeriodSeconds === liveEvent.qrPeriodSeconds)

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

  section('Booth CRUD (before any scans, so the booth count stays at 12)')
  const countBefore = (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount
  const cb = await call('createBooth')({ nameEn: 'E2E Booth', zone: 'far' })
  ok('createBooth allocates the next id', cb.id === 'booth-13', cb.id)
  const b13 = (await getDoc(doc(db, 'booths', 'booth-13'))).data()
  ok('new booth takes the zone default points and is active', b13.points === liveEvent.zonePoints.far && b13.active === true)
  ok('new booth has a secret', typeof (await readSecret('booth-13')) === 'string')
  ok('new booth has a stats doc', (await getDoc(doc(db, 'stats/booths/items/booth-13'))).exists())
  ok('event boothCount incremented', (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount === countBefore + 1)
  await call('updateBooth')({ id: 'booth-13', points: 25, location: 'Test corner' })
  const b13b = (await getDoc(doc(db, 'booths', 'booth-13'))).data()
  ok('updateBooth patches the sent fields and keeps the rest', b13b.points === 25 && b13b.location === 'Test corner' && b13b.nameEn === 'E2E Booth')
  const s13 = await readSecret('booth-13')
  await call('rotateBoothSecret')({ id: 'booth-13' })
  ok('rotateBoothSecret replaces the secret', (await readSecret('booth-13')) !== s13)
  const del = await call('deleteBooth')({ id: 'booth-13' })
  ok('an unscanned booth is deleted outright', del.deactivated === false)
  ok('booth doc gone', !(await getDoc(doc(db, 'booths', 'booth-13'))).exists())
  ok('booth secret gone', (await ownerDoc('boothSecrets/booth-13')) === null)
  ok('event boothCount back', (await getDoc(doc(db, 'events', liveEvent.id))).data().boothCount === countBefore)

  section('Accounts made at the desk (§6.2)')
  const walk = await call('createUser')({ displayName: 'Walk-up Guest', contact: 'walkup@example.com', role: 'visitor', password: 'passw0rd!!', countryCode: 'TH', visitorType: 'guest' })
  ok('createUser issues a visitor a passport number', /^MFU-GG-\d{4}$/.test(walk.passportNo ?? ''), walk.passportNo)
  const staff = await call('createUser')({ displayName: 'Desk Staff', contact: 'staff@example.com', role: 'organizer', boothId: 'booth-03', password: 'passw0rd!!' })
  ok('createUser refuses a duplicate contact', await fails(call('createUser')({ displayName: 'Dup', contact: 'walkup@example.com', role: 'visitor' }), /already has an account/))
  ok('an organizer without a booth is refused', await fails(call('createUser')({ displayName: 'X', contact: 'x@example.com', role: 'organizer' }), /needs a booth/))

  await signInAs('walkup@example.com', 'passw0rd!!')
  ok('admin-created visitor signs straight in, already verified', auth.currentUser.uid === walk.uid && auth.currentUser.emailVerified === true)
  ok('…and carries the visitor claim', (await claims()).role === 'visitor')
  const wdoc = (await getDoc(doc(db, 'users', walk.uid))).data()
  ok('walk-up passport document is complete', wdoc.passportNo === walk.passportNo && wdoc.contactVerified === true && wdoc.daysAttended?.length === 1, JSON.stringify({ p: wdoc.passportNo, v: wdoc.contactVerified, d: wdoc.daysAttended }))
  ctx.tally.visitors++ // onUserWrite counts a visitor document

  await signInAs('staff@example.com', 'passw0rd!!')
  ok('admin-created organizer opens their booth', (await call('boothSession')({})).boothId === 'booth-03')
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
  const inv = await call('inviteOrganizer')({ invites: [{ name: 'Test Organizer', email: 'organizer@example.com', boothId: 'booth-02' }] })
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

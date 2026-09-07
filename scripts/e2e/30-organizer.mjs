import { signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, idToken, claims, rawCall, ownerDoc, ownerAuthUpdate, readSecret, denied, fails,
} from './lib.mjs'

/** Invitations, the organizer's booth, both prize desks, the two-desk race, a void, the audit log. */
export default async function organizer(ctx) {
  const { liveEvent, tokens, tally, visitorUid, visitor3Uid } = ctx

  section('Invitations (§6.4, §12.17)')
  const infoA = await call('inviteInfo')({ token: ctx.tokenA })
  ok('inviteInfo describes the invitation', infoA.status === 'ok' && infoA.email === 'organizer@example.com' && infoA.boothId === 'booth-02' && infoA.boothName === 'Liberal Arts', JSON.stringify(infoA))
  ok('opening the link marks the invite opened', (await ownerDoc(`invites/${ctx.inviteId}`))?.status === 'opened')
  await signOut(auth)
  const orgUid = ctx.orgUid = await signUpVerified('organizer@example.com')
  const acc = await call('acceptInvite')({ token: ctx.tokenA })
  const stale = await claims()
  await auth.currentUser.getIdToken(true)
  const fresh = await claims()
  ok('acceptInvite promotes the account', acc.ok && acc.role === 'organizer' && acc.boothId === 'booth-02')
  ok('claims arrive only after a token refresh', stale.role === undefined && fresh.role === 'organizer' && fresh.boothId === 'booth-02')
  ok('booth records its organizer', (await getDoc(doc(db, 'booths', 'booth-02'))).data().organizerUid === orgUid)
  ok('second use of the link fails (§12.17)', await fails(call('acceptInvite')({ token: ctx.tokenA }), /already been used/))
  ok('inviteInfo now says accepted', (await call('inviteInfo')({ token: ctx.tokenA })).status === 'accepted')

  const invB = await rawCall(tokens.admin, 'inviteOrganizer', { invites: [{ name: 'Desk Person', email: 'desk@example.com', boothId: 'booth-01' }] })
  const tokenB1 = invB.results[0].link.split('/invite/')[1]
  ok('an invitation for a different address is refused', await fails(call('acceptInvite')({ token: tokenB1 }), /different address/))
  const rs = await rawCall(tokens.admin, 'resendInvite', { inviteId: invB.results[0].inviteId })
  const tokenB2 = rs.link.split('/invite/')[1]
  ok('resend invalidates the old link', (await call('inviteInfo')({ token: tokenB1 })).status === 'invalid')
  ok('resend issues a working new link', (await call('inviteInfo')({ token: tokenB2 })).status === 'ok')
  await rawCall(tokens.admin, 'revokeInvite', { inviteId: invB.results[0].inviteId })
  ok('a revoked link reads as revoked', (await call('inviteInfo')({ token: tokenB2 })).status === 'revoked')
  ok('a revoked link cannot be accepted', await fails(call('acceptInvite')({ token: tokenB2 }), /already been used/))
  tokens.organizer = await idToken()

  section('Organizer at booth-02')
  const bs = await call('boothSession')({})
  ok('boothSession returns own booth, secret and period', bs.boothId === 'booth-02' && bs.secret === await readSecret('booth-02') && bs.period === (liveEvent.qrPeriodSeconds ?? 20))
  ok('organizer cannot pick another booth', (await call('boothSession')({ boothId: 'booth-01' })).boothId === 'booth-02')
  const p1 = await rawCall(tokens.visitor1, 'redemptionCode', {})
  ok('a non-prize-desk organizer is refused at the desk', await fails(call('lookupRedemption')({ payload: p1.payload }), /not a prize desk/i))
  ok('organizer reads own booth counters', (await getDoc(doc(db, 'stats/booths/items/booth-02'))).exists())
  ok('organizer reads the event shards', (await getDocs(collection(db, 'stats/event/shards'))).size > 0)
  ok('organizer reads booths and prize tiers', (await getDocs(collection(db, 'booths'))).size === 12 && (await getDocs(collection(db, 'prizeTiers'))).size === 3)
  ok('organizer cannot read visitors', await denied(getDoc(doc(db, 'users', visitorUid))))
  ok('organizer cannot read invites / audit / stock ledger', (await denied(getDocs(collection(db, 'invites')))) && (await denied(getDocs(collection(db, 'auditLog')))) && (await denied(getDocs(collection(db, 'stockAdjustments')))))

  section('setUserRole moves the organizer to the prize desk (§12.8)')
  await rawCall(tokens.admin, 'setUserRole', { uid: orgUid, role: 'organizer', boothId: 'booth-01' })
  ok('setUserRole updates the document and the booth link', (await getDoc(doc(db, 'users', orgUid))).data().boothId === 'booth-01' && (await getDoc(doc(db, 'booths', 'booth-01'))).data().organizerUid === orgUid)
  ok('the old token still says booth-02 (a refresh is needed)', (await claims()).boothId === 'booth-02')
  await auth.currentUser.getIdToken(true)
  ok('the refreshed token says booth-01', (await claims()).boothId === 'booth-01')
  tokens.organizer = await idToken()

  section('Prize desk (second admin account)')
  // bootstrapAdmin refuses once an admin exists, so elevate a fresh account via the Auth emulator.
  await signOut(auth)
  const uid2 = await signUpVerified('prizedesk@example.com')
  await ownerAuthUpdate({ localId: uid2, customAttributes: JSON.stringify({ role: 'admin' }) })
  await auth.currentUser.getIdToken(true)
  if ((await claims()).role !== 'admin') throw new Error('could not elevate the second admin account through the Auth emulator')
  tokens.admin2 = await idToken()
  // Redemption codes are only good for a 30 s window, so fetch one right before use.
  const code = await rawCall(tokens.visitor1, 'redemptionCode', {})
  const before = (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining
  const lookup = await call('lookupRedemption')({ payload: code.payload })
  ok('prize desk finds the visitor', lookup.status === 'ok', lookup.status === 'ok' ? lookup.visitor.displayName : '')
  const conf = await call('confirmRedemption')({ payload: code.payload, tierId: 'explorer' })
  ok('redemption confirmed', conf.status === 'redeemed', conf.status)
  tally.redeemed++
  ok('stockRemaining decremented', (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining === before - 1)

  section('Organizer prize desk (booth-01)')
  const p3 = await rawCall(tokens.visitor3, 'redemptionCode', {})
  const lk = await rawCall(tokens.organizer, 'lookupRedemption', { payload: p3.payload })
  const tier = (id) => lk.tiers.find((t) => t.id === id)
  ok('organizer desk sees the visitor and the tier state', lk.status === 'ok' && lk.visitor.displayName === 'Third Visitor' && tier('explorer').unlocked && tier('voyager').unlocked && !tier('globetrotter').unlocked)
  const stockBefore = (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining
  const c1 = await rawCall(tokens.organizer, 'confirmRedemption', { payload: p3.payload, tierId: 'explorer' })
  ok('organizer confirms a redemption', c1.status === 'redeemed', c1.status)
  tally.redeemed++
  ok('stock decremented by the organizer desk', (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining === stockBefore - 1)
  const p3b = await rawCall(tokens.visitor3, 'redemptionCode', {})
  ok('a second confirm says already', (await rawCall(tokens.organizer, 'confirmRedemption', { payload: p3b.payload, tierId: 'explorer' })).status === 'already')

  section('Two desks, last item (§12.15)')
  const voy = (await getDoc(doc(db, 'prizeTiers', 'voyager'))).data()
  await rawCall(tokens.admin, 'adjustStock', { tierId: 'voyager', delta: -(voy.stockRemaining - 1), reason: 'e2e: leave one item', kind: 'correction' })
  ok('adjustStock leaves exactly one Voyager', (await getDoc(doc(db, 'prizeTiers', 'voyager'))).data().stockRemaining === 1)
  ok('adjustStock refuses to go below zero', await fails(rawCall(tokens.admin, 'adjustStock', { tierId: 'voyager', delta: -5, reason: 'x' }), /below zero/))
  ok('the adjustment is in the ledger', (await getDocs(query(collection(db, 'stockAdjustments'), where('kind', '==', 'correction')))).size >= 1)
  const [q1, q3] = await Promise.all([rawCall(tokens.visitor1, 'redemptionCode', {}), rawCall(tokens.visitor3, 'redemptionCode', {})])
  const [r1, r3] = await Promise.all([
    rawCall(tokens.organizer, 'confirmRedemption', { payload: q1.payload, tierId: 'voyager' }), // desk A: the organizer at booth-01
    rawCall(tokens.admin, 'confirmRedemption', { payload: q3.payload, tierId: 'voyager' }),     // desk B: an admin
  ])
  tally.redeemed++
  ok('exactly one redemption and one out-of-stock', [r1.status, r3.status].sort().join() === 'out_of_stock,redeemed', `${r1.status} / ${r3.status}`)
  ok('stock never goes negative', (await getDoc(doc(db, 'prizeTiers', 'voyager'))).data().stockRemaining === 0)

  section('Void returns the item and reopens the tier (§6.7)')
  const winner = r1.status === 'redeemed' ? visitorUid : visitor3Uid
  const winnerToken = winner === visitorUid ? tokens.visitor1 : tokens.visitor3
  await rawCall(tokens.admin, 'voidRedemption', { visitorId: winner, tierId: 'voyager', reason: 'e2e: handed to the wrong person' })
  tally.redeemed--
  const vu = (await getDoc(doc(db, 'tierUnlocks', `${winner}_voyager`))).data()
  ok('void returns the item to stock', (await getDoc(doc(db, 'prizeTiers', 'voyager'))).data().stockRemaining === 1)
  ok('void clears the redemption and records the reason', vu.redeemedAt === null && !!vu.voidedAt && vu.voidReason === 'e2e: handed to the wrong person')
  ok('voiding twice is refused', await fails(rawCall(tokens.admin, 'voidRedemption', { visitorId: winner, tierId: 'voyager', reason: 'again' }), /Nothing to void/))
  const lkv = await rawCall(tokens.organizer, 'lookupRedemption', { payload: (await rawCall(winnerToken, 'redemptionCode', {})).payload })
  const vt = lkv.tiers.find((t) => t.id === 'voyager')
  ok('the desk offers the voided tier again', vt.unlocked === true && vt.redeemedAt === null, JSON.stringify(vt))

  section('Audit log (§12.10)')
  await rawCall(tokens.visitor1, 'requestErasure', {})
  await rawCall(tokens.admin, 'dismissErasureRequest', { uid: visitorUid, reason: 'e2e: test account' })
  const dismissed = await ownerDoc(`erasureRequests/${visitorUid}`)
  ok('dismissErasureRequest closes a request with a reason', dismissed?.status === 'dismissed' && dismissed.reason === 'e2e: test account' && dismissed.resolvedBy === ctx.adminUid)
  ok('a closed request cannot be dismissed again', await fails(rawCall(tokens.admin, 'dismissErasureRequest', { uid: visitorUid, reason: 'x' }), /already closed/))
  const audit = (await getDocs(collection(db, 'auditLog'))).docs.map((d) => d.data())
  const actions = new Set(audit.map((a) => a.action))
  const expected = [
    'bootstrapAdmin', 'updateEvent', 'saveRefData', 'createEvent', 'deleteEvent',
    'createBooth', 'updateBooth', 'rotateBoothSecret', 'deleteBooth', 'deactivateBooth',
    'createUser', 'updateUser', 'softDeleteUser', 'inviteOrganizer', 'resendInvite', 'revokeInvite', 'setUserRole',
    'savePrizePolicy', 'adjustStock', 'runDraw', 'voidRedemption', 'refreshRanks', 'requestErasure', 'dismissErasureRequest',
  ]
  const missing = expected.filter((a) => !actions.has(a))
  ok('every admin mutation is audited', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${actions.size} distinct actions`)
  ok('audit rows carry actor and timestamp', audit.every((a) => typeof a.actorUid === 'string' && a.createdAt))
}

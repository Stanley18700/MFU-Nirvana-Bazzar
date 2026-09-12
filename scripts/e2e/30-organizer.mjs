import { signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, idToken, claims, rawCall, ownerDoc, ownerAuthUpdate, readSecret, denied, fails,
} from './lib.mjs'

/** Invitations, the organizer's booth, both prize desks, the two-desk race, a void, the audit log. */
export default async function organizer(ctx) {
  const { liveEvent, tokens, tally, visitorUid, visitor3Uid, booths } = ctx
  const ORG = booths.organizer
  const DESK = booths.desk
  const orgName = (await getDoc(doc(db, 'booths', ORG))).data().nameEn
  // One gift now, so the tier id comes from the data rather than a name that no longer exists.
  const GIFT = (await getDocs(collection(db, 'prizeTiers'))).docs[0].id
  const giftDoc = async () => (await getDoc(doc(db, 'prizeTiers', GIFT))).data()

  section('Invitations (§6.4, §12.17)')
  const infoA = await call('inviteInfo')({ token: ctx.tokenA })
  ok('inviteInfo describes the invitation', infoA.status === 'ok' && infoA.email === 'organizer@example.com' && infoA.boothId === ORG && infoA.boothName === orgName, JSON.stringify(infoA))
  ok('opening the link marks the invite opened', (await ownerDoc(`invites/${ctx.inviteId}`))?.status === 'opened')
  await signOut(auth)
  const orgUid = ctx.orgUid = await signUpVerified('organizer@example.com')
  const acc = await call('acceptInvite')({ token: ctx.tokenA })
  const stale = await claims()
  await auth.currentUser.getIdToken(true)
  const fresh = await claims()
  ok('acceptInvite promotes the account', acc.ok && acc.role === 'organizer' && acc.boothId === ORG)
  ok('claims arrive only after a token refresh', stale.role === undefined && fresh.role === 'organizer' && fresh.boothId === ORG)
  ok('booth records its organizer', (await getDoc(doc(db, 'booths', ORG))).data().organizerUid === orgUid)
  ok('second use of the link fails (§12.17)', await fails(call('acceptInvite')({ token: ctx.tokenA }), /already been used/))
  ok('inviteInfo now says accepted', (await call('inviteInfo')({ token: ctx.tokenA })).status === 'accepted')

  const invB = await rawCall(tokens.admin, 'inviteOrganizer', { invites: [{ name: 'Desk Person', email: 'desk@example.com', boothId: DESK }] })
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

  section('Organizer at their own booth')
  const bs = await call('boothSession')({})
  ok('boothSession returns own booth, secret and period', bs.boothId === ORG && bs.secret === await readSecret(ORG) && bs.period === (liveEvent.qrPeriodSeconds ?? 20))
  ok('organizer cannot pick another booth', (await call('boothSession')({ boothId: DESK })).boothId === ORG)
  const p1 = await rawCall(tokens.visitor1, 'redemptionCode', {})
  ok('a non-prize-desk organizer is refused at the desk', await fails(call('lookupRedemption')({ payload: p1.payload }), /not a prize desk/i))
  ok('organizer reads own booth counters', (await getDoc(doc(db, `stats/booths/items/${ORG}`))).exists())
  ok('organizer reads the event shards', (await getDocs(collection(db, 'stats/event/shards'))).size > 0)
  // §4.1 — the booth screen needs the event total, so the shards above stay readable. Who the
  // visitors are must not come with it: a group of one or two identifies a person, and the
  // dashboard's under-5 folding is a render filter an organizer never runs.
  ok('organizer cannot read visitor demographics', await denied(getDocs(collection(db, 'stats/demographics/shards'))))
  const openShards = await getDocs(collection(db, 'stats/event/shards'))
  ok('the readable shards carry no demographic field',
    openShards.docs.every((d) => !['byCountry', 'byInstitution', 'bySchool', 'byEthnicGroup', 'crossSchool', 'ethnicResponses', 'ethnicDeclines'].some((f) => f in d.data())),
    openShards.docs.flatMap((d) => Object.keys(d.data())).join(','))
  ok('organizer reads booths and prize tiers', (await getDocs(collection(db, 'booths'))).size === 76 && (await getDocs(collection(db, 'prizeTiers'))).size === 1)
  ok('organizer cannot read visitors', await denied(getDoc(doc(db, 'users', visitorUid))))
  ok('organizer cannot read invites / audit / stock ledger', (await denied(getDocs(collection(db, 'invites')))) && (await denied(getDocs(collection(db, 'auditLog')))) && (await denied(getDocs(collection(db, 'stockAdjustments')))))

  section('setUserRole moves the organizer to the prize desk (§12.8)')
  await rawCall(tokens.admin, 'setUserRole', { uid: orgUid, role: 'organizer', boothId: DESK })
  ok('setUserRole updates the document and the booth link', (await getDoc(doc(db, 'users', orgUid))).data().boothId === DESK && (await getDoc(doc(db, 'booths', DESK))).data().organizerUid === orgUid)
  ok('the old token still says the previous booth (a refresh is needed)', (await claims()).boothId === ORG)
  await auth.currentUser.getIdToken(true)
  ok('the refreshed token says the prize desk', (await claims()).boothId === DESK)
  tokens.organizer = await idToken()

  section('Prize desk (second admin account)')
  // bootstrapAdmin refuses once an admin exists, so elevate a fresh account via the Auth emulator.
  await signOut(auth)
  const uid2 = await signUpVerified('prizedesk@example.com')
  await ownerAuthUpdate({ localId: uid2, customAttributes: JSON.stringify({ role: 'admin' }) })
  await auth.currentUser.getIdToken(true)
  if ((await claims()).role !== 'admin') throw new Error('could not elevate the second admin account through the Auth emulator')
  tokens.admin2 = await idToken()

  /**
   * §4.1 — the demographics moved to their own admin-only document. The rules side is asserted
   * above: the organizer is refused. This is the other half — that the move did not quietly
   * drop the data the admin dashboard draws.
   *
   * Read as the emulator owner rather than through the client. Elevating this account set a
   * custom claim out of band, and the Firestore channel keeps the token it opened with until
   * it reconnects, so a client read here would be testing token propagation rather than the
   * data. The suite uses stored tokens for admin work for the same reason.
   */
  const demoShards = []
  for (let i = 0; i < 10; i++) demoShards.push(await ownerDoc(`stats/demographics/shards/${i}`))
  const live = demoShards.filter(Boolean)
  const countryTotal = live.reduce((t, s) => t + Object.values(s.byCountry ?? {}).reduce((a, n) => a + n, 0), 0)
  ok('the demographic shards are being written', live.length > 0, `${live.length} of 10 shards`)
  ok('every registered visitor is counted by country', countryTotal === tally.visitors, `${countryTotal} counted vs ${tally.visitors} registered`)
  // Redemption codes are only good for a 30 s window, so fetch one right before use.
  const code = await rawCall(tokens.visitor1, 'redemptionCode', {})
  const before = await giftDoc()
  const lookup = await call('lookupRedemption')({ payload: code.payload })
  ok('prize desk finds the visitor', lookup.status === 'ok', lookup.status === 'ok' ? lookup.visitor.displayName : '')
  // The desk is told what THIS session holds, which is what it spends. The event-wide pool is
  // reported alongside it as the audit figure, and the two are deliberately different numbers.
  const lt = lookup.tiers.find((t) => t.id === GIFT)
  ok('the desk is given the session count, not the pool', lt.sessionRemaining === before.stockPerSession && lt.stockRemaining > lt.sessionRemaining,
    `session ${lt.sessionRemaining}, pool ${lt.stockRemaining}`)
  ok('and the window it is standing in', !!lookup.session && lookup.nextOpensAt === null, JSON.stringify(lookup.session))

  const conf = await call('confirmRedemption')({ payload: code.payload, tierId: GIFT })
  ok('redemption confirmed', conf.status === 'redeemed', conf.status)
  tally.redeemed++
  const afterOne = await giftDoc()
  const sessionKey = Object.keys(afterOne.sessionRemaining ?? {})[0]
  ok('the session is what got spent', afterOne.sessionRemaining[sessionKey] === before.stockPerSession - 1, JSON.stringify(afterOne.sessionRemaining))
  ok('and the event-wide figure follows it', afterOne.stockRemaining === before.stockRemaining - 1)
  ok('the unlock remembers which session the gift came out of',
    (await ownerDoc(`tierUnlocks/${visitorUid}_${GIFT}`))?.redeemedSessionKey === sessionKey, sessionKey)

  section('Organizer prize desk')
  const p3 = await rawCall(tokens.visitor3, 'redemptionCode', {})
  const lk = await rawCall(tokens.organizer, 'lookupRedemption', { payload: p3.payload })
  ok('organizer desk sees the visitor and the gift unlocked',
    lk.status === 'ok' && lk.visitor.displayName === 'Third Visitor' && lk.tiers.find((t) => t.id === GIFT).unlocked)
  const c1 = await rawCall(tokens.organizer, 'confirmRedemption', { payload: p3.payload, tierId: GIFT })
  ok('organizer confirms a redemption', c1.status === 'redeemed', c1.status)
  tally.redeemed++
  const p3b = await rawCall(tokens.visitor3, 'redemptionCode', {})
  ok('a second confirm says already', (await rawCall(tokens.organizer, 'confirmRedemption', { payload: p3b.payload, tierId: GIFT })).status === 'already')

  section('Typed at the desk: passport number + 8-character code (§4.4)')
  // The visitor's Prize page shows only the code; the desk cannot read users, so the server joins.
  const v3no = (await ownerDoc(`users/${visitor3Uid}`)).passportNo
  const p3c = await rawCall(tokens.visitor3, 'redemptionCode', {})
  const byNo = await rawCall(tokens.organizer, 'lookupRedemption', { passportNo: v3no, code: p3c.code })
  ok('desk resolves passport number + code to the visitor', byNo.status === 'ok' && byNo.visitor.uid === visitor3Uid, `${v3no} ${p3c.code}`)
  ok('digits alone stand for the passport number', (await rawCall(tokens.organizer, 'lookupRedemption', { passportNo: v3no.split('-').pop(), code: p3c.code.toLowerCase() })).status === 'ok')
  ok('a wrong code with a real passport number is invalid', (await rawCall(tokens.organizer, 'lookupRedemption', { passportNo: v3no, code: 'AAAAAAAA' })).status === 'invalid')
  const againNo = await rawCall(tokens.organizer, 'confirmRedemption', { passportNo: v3no, code: p3c.code, tierId: GIFT })
  ok('confirm by passport number says already and names the desk', againNo.status === 'already' && typeof againNo.redeemedByName === 'string' && againNo.redeemedByName.length > 0, JSON.stringify(againNo))
  ok('neither form given is refused', await fails(rawCall(tokens.organizer, 'lookupRedemption', {}), /payload, or passportNo and code/))

  section('Two desks, last gift of the session (§12.15)')
  // Brought down to one by an admin, which is also the only way to move session stock:
  // adjustStock lands on the window that is open and leaves the allowance alone.
  const nowLeft = (await giftDoc()).sessionRemaining[sessionKey]
  await rawCall(tokens.admin, 'adjustStock', { tierId: GIFT, delta: -(nowLeft - 1), reason: 'e2e: leave one gift in this session', kind: 'correction' })
  const oneLeft = await giftDoc()
  ok('adjustStock leaves exactly one in the open session', oneLeft.sessionRemaining[sessionKey] === 1, JSON.stringify(oneLeft.sessionRemaining))
  ok('and does not touch the per-session allowance', oneLeft.stockPerSession === before.stockPerSession, String(oneLeft.stockPerSession))
  ok('adjustStock refuses to go below zero', await fails(rawCall(tokens.admin, 'adjustStock', { tierId: GIFT, delta: -5, reason: 'x' }), /below zero/))
  ok('the adjustment is in the ledger with its session', (await getDocs(query(collection(db, 'stockAdjustments'), where('kind', '==', 'correction')))).docs.some((d) => d.data().sessionKey === sessionKey))

  // Both have already collected, so give them back their claim before racing them for the last one.
  for (const uid of [visitorUid, visitor3Uid]) {
    await rawCall(tokens.admin, 'voidRedemption', { visitorId: uid, tierId: GIFT, reason: 'e2e: race setup' })
    tally.redeemed--
  }
  await rawCall(tokens.admin, 'adjustStock', { tierId: GIFT, delta: -((await giftDoc()).sessionRemaining[sessionKey] - 1), reason: 'e2e: back to one', kind: 'correction' })
  ok('one gift left again after the voids', (await giftDoc()).sessionRemaining[sessionKey] === 1)

  const [q1, q3] = await Promise.all([rawCall(tokens.visitor1, 'redemptionCode', {}), rawCall(tokens.visitor3, 'redemptionCode', {})])
  const [r1, r3] = await Promise.all([
    rawCall(tokens.organizer, 'confirmRedemption', { payload: q1.payload, tierId: GIFT }), // desk A: the organizer at the desk
    rawCall(tokens.admin, 'confirmRedemption', { payload: q3.payload, tierId: GIFT }),     // desk B: an admin
  ])
  tally.redeemed++
  ok('exactly one redemption and one refusal', [r1.status, r3.status].sort().join() === 'out_of_stock,redeemed', `${r1.status} / ${r3.status}`)
  ok('the refusal is out of stock, not a closed desk', [r1, r3].some((r) => r.status === 'out_of_stock'))
  ok('the session never goes negative', (await giftDoc()).sessionRemaining[sessionKey] === 0)

  section('Void returns the gift to its own session (§6.7)')
  const winner = r1.status === 'redeemed' ? visitorUid : visitor3Uid
  const winnerToken = winner === visitorUid ? tokens.visitor1 : tokens.visitor3
  await rawCall(tokens.admin, 'voidRedemption', { visitorId: winner, tierId: GIFT, reason: 'e2e: handed to the wrong person' })
  tally.redeemed--
  const vu = (await getDoc(doc(db, 'tierUnlocks', `${winner}_${GIFT}`))).data()
  ok('void returns the gift to the session it came out of', (await giftDoc()).sessionRemaining[sessionKey] === 1)
  ok('void clears the redemption and records the reason', vu.redeemedAt === null && !!vu.voidedAt && vu.voidReason === 'e2e: handed to the wrong person')
  ok('voiding twice is refused', await fails(rawCall(tokens.admin, 'voidRedemption', { visitorId: winner, tierId: GIFT, reason: 'again' }), /Nothing to void/))
  const lkv = await rawCall(tokens.organizer, 'lookupRedemption', { payload: (await rawCall(winnerToken, 'redemptionCode', {})).payload })
  const vt = lkv.tiers.find((t) => t.id === GIFT)
  ok('the desk offers the voided gift again', vt.unlocked === true && vt.redeemedAt === null, JSON.stringify(vt))

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

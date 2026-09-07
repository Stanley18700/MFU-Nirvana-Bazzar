import { signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, idToken, rawCall, ownerDoc, ownerDelete, ownerAuthUpdate, readSecret, boothToken, nowCounter, denied, fails, sleep,
} from './lib.mjs'

/** Two visitors: registration, scans, the prize policy rules (§6.7), the draw, rules (§12.13), an erasure request. */
export default async function visitor(ctx) {
  const { liveEvent, secrets, tokens, tally } = ctx
  const period = liveEvent.qrPeriodSeconds ?? 20
  const stamp = async (boothId) => {
    secrets[boothId] ??= await readSecret(boothId)
    return call('scan')({ payload: boothToken(secrets[boothId], boothId, nowCounter(period)) })
  }

  section('Visitor registers, scans, unlocks')
  await signOut(auth)
  const visitorUid = ctx.visitorUid = await signUpVerified('visitor1@example.com')
  // `contact` is no longer sent: join reads the confirmed address off the ID token.
  const joined = ctx.joined = await call('join')({
    displayName: 'Test Visitor', visitorType: 'student', institution: 'MFU', school: 'School of Law',
    countryCode: 'MM', consent: true,
  })
  ok('join issues a passport number with the event prefix', joined.passportNo?.startsWith('MFU-GG-'), joined.passportNo)
  const visitorDoc = await getDoc(doc(db, 'users', visitorUid))
  ok('join takes the contact from the signed-in account', visitorDoc.data().contact === 'visitor1@example.com', visitorDoc.data().contact)
  ok('join marks the contact confirmed', visitorDoc.data().contactVerified === true)
  await auth.currentUser.getIdToken(true)
  tokens.visitor1 = await idToken()
  tally.visitors++

  // Visitors must be able to read live prize stock (the planners' request).
  const tiersSnap = await getDocs(collection(db, 'prizeTiers'))
  ok('visitor can read prizeTiers stock live', tiersSnap.size === 3 && typeof tiersSnap.docs[0].data().stockRemaining === 'number',
    tiersSnap.docs.map((d) => `${d.id}:${d.data().stockRemaining}`).join(' '))

  let stamped = 0
  for (const b of ['booth-01', 'booth-02', 'booth-03', 'booth-04', 'booth-05', 'booth-08', 'booth-09', 'booth-10', 'booth-12']) {
    const res = await stamp(b)
    if (res.status === 'success') stamped++
    else console.log(`    scan ${b} -> ${res.status}`)
  }
  ok('all 9 scans stamped', stamped === 9, `${stamped}/9`)
  tally.stamps += stamped
  ok('rescanning the same booth says "already"', (await stamp('booth-01')).status === 'already')

  await sleep(3000) // let onScanCreate settle
  const me = await getDoc(doc(db, 'users', visitorUid))
  ok('user document accumulated points', (me.data().points ?? 0) >= 130, `${me.data().points} points, ${me.data().stampCount} stamps`)
  const unlocks = await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))
  ok('tier unlocks created by the trigger', unlocks.size === 2, `${unlocks.size} unlocks at 140 points (50/100 reached, 150 not)`)

  section('Ranks and deactivation')
  await rawCall(tokens.admin, 'refreshRanks', {})
  const ranks = []
  for (let i = 1; i <= 12; i++) ranks.push(await ownerDoc(`stats/booths/items/booth-${String(i).padStart(2, '0')}`))
  ok('refreshRanks assigns 1..12', new Set(ranks.map((r) => r?.rank)).size === 12, ranks.map((r) => r?.rank).join(','))
  ok('scanned booths outrank unscanned ones', ranks.filter((r) => r.stamps === 1).every((r) => r.rank <= 9) && ranks.filter((r) => r.stamps === 0).every((r) => r.rank >= 10))
  const d12 = await rawCall(tokens.admin, 'deleteBooth', { id: 'booth-12' })
  ok('a booth with stamps is deactivated, not deleted', d12.deactivated === true && (await getDoc(doc(db, 'booths', 'booth-12'))).data().active === false)
  await rawCall(tokens.admin, 'updateBooth', { id: 'booth-12', active: true })
  ok('booth reactivated', (await getDoc(doc(db, 'booths', 'booth-12'))).data().active === true)
  // Ten scan attempts a minute (§5.2) — the nine stamps plus the rescan used them up. Open a new
  // window rather than waiting a minute; the limit itself is asserted below.
  await ownerDelete(`rateLimits/scan_${visitorUid}`)
  // A booth this visitor has not stamped yet, so the answer is about the booth, not the visitor.
  await rawCall(tokens.admin, 'updateBooth', { id: 'booth-06', active: false })
  const inactive = await stamp('booth-06')
  ok('scanning an inactive booth is invalid', inactive.status === 'invalid', inactive.status)
  await rawCall(tokens.admin, 'updateBooth', { id: 'booth-06', active: true })

  section('Prize policy: lowering unlocks now, raising never revokes (§6.7)')
  const tiersNow = (await getDocs(collection(db, 'prizeTiers'))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.sortOrder - b.sortOrder)
  const tierInput = (over = {}) => tiersNow.map((t) => ({
    id: t.id, name: t.name, thresholdPoints: over[t.id] ?? t.thresholdPoints, reward: t.reward,
    grantsDrawEntry: t.grantsDrawEntry, active: true, outOfStockNoteEn: t.outOfStockNoteEn ?? '',
  }))
  const available = (await getDocs(collection(db, 'booths'))).docs.filter((d) => d.data().active).reduce((s, d) => s + d.data().points, 0)
  ok('a threshold above the points on the floor is refused', await fails(rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ globetrotter: available + 1 }), dryRun: true }), /only \d+ are available/), `${available} available`)
  const dry = await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ globetrotter: 140 }), dryRun: true })
  ok('dry run previews one new Globetrotter unlock', dry.preview.globetrotter === 1 && dry.preview.explorer === 0 && dry.available === available, JSON.stringify(dry.preview))
  ok('dry run writes nothing', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))).size === 2)
  const explorerStock = (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining
  await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ globetrotter: 140 }) })
  const gUnlock = await getDoc(doc(db, 'tierUnlocks', `${visitorUid}_globetrotter`))
  ok('lowering a threshold unlocks immediately', gUnlock.exists() && gUnlock.data().pointsAtUnlock === 140)
  ok('re-saving the policy leaves stock untouched', (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining === explorerStock)
  await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ globetrotter: 150 }) })
  ok('raising a threshold never revokes (§12.9)', (await getDoc(doc(db, 'tierUnlocks', `${visitorUid}_globetrotter`))).exists())
  ok('threshold is back at 150', (await getDoc(doc(db, 'prizeTiers', 'globetrotter'))).data().thresholdPoints === 150)
  const s6 = await stamp('booth-06')
  ok('tenth scan reaches 155 points', s6.status === 'success' && s6.points === 155, `${s6.status} ${s6.points}`)
  tally.stamps++
  await sleep(3000)
  ok('trigger does not duplicate the existing unlock', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))).size === 3 && (await getDoc(doc(db, 'users', visitorUid))).data().points === 155)
  const d1 = await rawCall(tokens.admin, 'runDraw', { count: 1 })
  ok('runDraw picks the only Globetrotter', d1.poolSize === 1 && d1.winners[0]?.uid === visitorUid && d1.winners[0].passportNo === joined.passportNo, JSON.stringify(d1))
  const d2 = await rawCall(tokens.admin, 'runDraw', { count: 1 })
  ok('runDraw excludes previous winners', d2.poolSize === 0 && d2.winners.length === 0, JSON.stringify(d2))

  section('syncAccount follows an email change')
  // Stands in for the "Email address change" link: Auth moves, Firestore has not heard yet.
  await ownerAuthUpdate({ localId: visitorUid, email: 'moved@example.com', emailVerified: true })
  await auth.currentUser.getIdToken(true)
  const synced = await call('syncAccount')({})
  ok('syncAccount reports the new address', synced.contact === 'moved@example.com', synced.contact)
  const movedDoc = await getDoc(doc(db, 'users', visitorUid))
  ok('users/{uid}.contact caught up with the account', movedDoc.data().contact === 'moved@example.com', movedDoc.data().contact)
  tokens.visitor1 = await idToken()

  section('Third visitor: the rules matrix (§12.13) and an erasure request (§10)')
  await signOut(auth)
  const visitor3Uid = ctx.visitor3Uid = await signUpVerified('visitor3@example.com')
  await call('join')({ displayName: 'Third Visitor', visitorType: 'guest', institution: 'Chiang Mai University', countryCode: 'TH', consent: true })
  await auth.currentUser.getIdToken(true)
  tokens.visitor3 = await idToken()
  tally.visitors++
  let stamped3 = 0
  for (const b of ['booth-08', 'booth-09', 'booth-10', 'booth-11', 'booth-12']) if ((await stamp(b)).status === 'success') stamped3++
  tally.stamps += stamped3
  await sleep(3000)
  const v3 = (await getDoc(doc(db, 'users', visitor3Uid))).data()
  ok('visitor 3 at 100 points with 2 unlocks', stamped3 === 5 && v3.points === 100 && (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitor3Uid)))).size === 2, `${stamped3} stamps, ${v3.points} pts`)
  ok('visitor cannot read another visitor (incl. ethnicGroup)', await denied(getDoc(doc(db, 'users', visitorUid))))
  ok('visitor cannot read boothSecrets', await denied(getDoc(doc(db, 'boothSecrets', 'booth-01'))))
  ok('visitor cannot write scans directly', await denied(setDoc(doc(db, 'scans', `${visitor3Uid}_booth-01`), { visitorId: visitor3Uid, boothId: 'booth-01' })))
  ok("visitor cannot read another's tierUnlock", await denied(getDoc(doc(db, 'tierUnlocks', `${visitorUid}_explorer`))))
  ok('visitor can read own tierUnlocks and scans', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitor3Uid)))).size === 2 && (await getDocs(query(collection(db, 'scans'), where('visitorId', '==', visitor3Uid)))).size === 5)
  ok('visitor cannot read auditLog / invites / booth stats', (await denied(getDocs(collection(db, 'auditLog')))) && (await denied(getDocs(collection(db, 'invites')))) && (await denied(getDoc(doc(db, 'stats/booths/items/booth-01')))))
  ok('visitor cannot open a booth session', await fails(call('boothSession')({}), /Requires role/))
  const er1 = await call('requestErasure')({})
  const er2 = await call('requestErasure')({})
  ok('requestErasure files one open request and is idempotent', er1.existing === false && er2.existing === true && typeof er2.requestedAt === 'number', JSON.stringify(er2))
  const erDoc = await ownerDoc(`erasureRequests/${visitor3Uid}`)
  ok('the request carries who asked', erDoc?.status === 'open' && erDoc.displayName === 'Third Visitor' && erDoc.contact === 'visitor3@example.com')
  ok('visitor can read their own request', (await getDoc(doc(db, 'erasureRequests', visitor3Uid))).exists())
  ok("visitor cannot read another's request", await denied(getDoc(doc(db, 'erasureRequests', visitorUid))))
}

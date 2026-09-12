import { signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, idToken, rawCall, ownerDoc, ownerDelete, ownerAuthUpdate, readSecret, boothToken, nowCounter, denied, fails, sleep,
} from './lib.mjs'

/** Two visitors: registration, scans, the prize policy rules (§6.7), the draw, rules (§12.13), an erasure request. */
export default async function visitor(ctx) {
  const { liveEvent, secrets, tokens, tally, booths } = ctx
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
  ok('visitor can read prize stock live', tiersSnap.size === 1 && typeof tiersSnap.docs[0].data().stockRemaining === 'number',
    tiersSnap.docs.map((d) => `${d.id}:${d.data().stockRemaining}`).join(' '))
  const GIFT = tiersSnap.docs[0].id
  // Stock is held per session now; the event-wide figures are the audit trail behind it.
  ok('the gift is stocked per session', tiersSnap.docs[0].data().stockPerSession === 50, String(tiersSnap.docs[0].data().stockPerSession))

  // Nine of the ten a visitor needs, so the policy tests below have someone just short.
  const nine = booths.stampable.slice(0, 9)
  let stamped = 0
  for (const b of nine) {
    const res = await stamp(b)
    if (res.status === 'success') stamped++
    else console.log(`    scan ${b} -> ${res.status}`)
  }
  ok('all 9 scans stamped', stamped === 9, `${stamped}/9`)
  tally.stamps += stamped
  ok('rescanning the same booth says "already"', (await stamp(nine[0])).status === 'already')

  await sleep(3000) // let onScanCreate settle
  const me = await getDoc(doc(db, 'users', visitorUid))
  // Flat ten a booth, so nine booths is ninety — ten points short of the gift on purpose.
  ok('user document accumulated points', (me.data().points ?? 0) === 90, `${me.data().points} points, ${me.data().stampCount} stamps`)
  const unlocks = await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))
  ok('no unlock yet at ninety points', unlocks.size === 0, `${unlocks.size} unlocks`)

  // The breakdowns must be real nested maps. `set()` treats a dotted key as one literal field
  // name, so writing 'byDay.2026-09-16.stamps' stores a field nothing can read: the totals
  // still look right while every per-day, per-hour and per-type figure reads zero. A dot in a
  // top-level key is the signature of that bug, so assert against it directly.
  const b1 = await ownerDoc(`stats/booths/items/${nine[0]}`)
  ok('booth counters use no dotted field names', Object.keys(b1).every((k) => !k.includes('.')), Object.keys(b1).filter((k) => k.includes('.')).join(',') || 'none')
  ok('booth byDay is a nested map holding the stamp', typeof b1.byDay === 'object' && b1.byDay !== null && Object.values(b1.byDay).reduce((s, n) => s + n, 0) === 1, JSON.stringify(b1.byDay))
  ok('booth byVisitorType and byHour nest too', Object.values(b1.byVisitorType ?? {}).reduce((s, n) => s + n, 0) === 1 && Object.keys(b1.byHour ?? {}).length === 1,
    `${JSON.stringify(b1.byVisitorType)} ${JSON.stringify(b1.byHour)}`)

  const shards = []
  for (let i = 0; i < 10; i++) shards.push(await ownerDoc(`stats/event/shards/${i}`))
  const live = shards.filter(Boolean)
  ok('event shards use no dotted field names', live.every((s) => Object.keys(s).every((k) => !k.includes('.'))),
    live.flatMap((s) => Object.keys(s).filter((k) => k.includes('.'))).join(',') || 'none')
  const byDayStamps = live.reduce((sum, s) => sum + Object.values(s.byDay ?? {}).reduce((t, v) => t + (v.stamps ?? 0), 0), 0)
  ok('event byDay stamps sum to every stamp taken', byDayStamps === tally.stamps, `${byDayStamps} vs ${tally.stamps}`)

  section('Ranks and deactivation')
  await rawCall(tokens.admin, 'refreshRanks', {})
  // Every seeded booth has a counters document, so the ranking covers all of them, not just
  // the nine that were scanned.
  const ranks = []
  for (const id of booths.all) ranks.push(await ownerDoc(`stats/booths/items/${id}`))
  const found = ranks.filter(Boolean)
  ok('refreshRanks numbers every booth once', new Set(found.map((r) => r.rank)).size === found.length && found.length === booths.all.length,
    `${found.length} of ${booths.all.length} booths ranked`)
  ok('scanned booths outrank unscanned ones',
    found.filter((r) => (r.stamps ?? 0) === 1).every((r) => r.rank <= 9) && found.filter((r) => (r.stamps ?? 0) === 0).every((r) => r.rank >= 10))
  const stampedBooth = nine[8]
  const dStamped = await rawCall(tokens.admin, 'deleteBooth', { id: stampedBooth })
  ok('a booth with stamps is deactivated, not deleted', dStamped.deactivated === true && (await getDoc(doc(db, 'booths', stampedBooth))).data().active === false)
  await rawCall(tokens.admin, 'updateBooth', { id: stampedBooth, active: true })
  ok('booth reactivated', (await getDoc(doc(db, 'booths', stampedBooth))).data().active === true)
  // Ten scan attempts a minute (§5.2) — the nine stamps plus the rescan used them up. Open a new
  // window rather than waiting a minute; the limit itself is asserted below.
  await ownerDelete(`rateLimits/scan_${visitorUid}`)
  // A booth this visitor has not stamped yet, so the answer is about the booth, not the visitor.
  const tenth = booths.stampable[9]
  await rawCall(tokens.admin, 'updateBooth', { id: tenth, active: false })
  const inactive = await stamp(tenth)
  ok('scanning an inactive booth is invalid', inactive.status === 'invalid', inactive.status)
  await rawCall(tokens.admin, 'updateBooth', { id: tenth, active: true })

  section('Prize policy: lowering unlocks now, raising never revokes (§6.7)')
  const tiersNow = (await getDocs(collection(db, 'prizeTiers'))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.sortOrder - b.sortOrder)
  const tierInput = (over = {}) => tiersNow.map((t) => ({
    id: t.id, name: t.name, thresholdPoints: over[t.id] ?? t.thresholdPoints, reward: t.reward,
    grantsDrawEntry: t.grantsDrawEntry, active: true, outOfStockNoteEn: t.outOfStockNoteEn ?? '',
  }))
  const available = (await getDocs(collection(db, 'booths'))).docs.filter((d) => d.data().active).reduce((s, d) => s + d.data().points, 0)
  ok('a threshold above the points on the floor is refused',
    await fails(rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ [GIFT]: available + 1 }), dryRun: true }), /only \d+ are available/), `${available} available`)

  // The visitor is on ninety. Dropping the bar to ninety should reach exactly them.
  const dry = await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ [GIFT]: 90 }), dryRun: true })
  ok('dry run previews the one visitor it would reach', dry.preview[GIFT] === 1 && dry.available === available, JSON.stringify(dry.preview))
  ok('dry run writes nothing', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))).size === 0)

  const stockBefore = (await getDoc(doc(db, 'prizeTiers', GIFT))).data().stockRemaining
  const applied = await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ [GIFT]: 90 }) })
  ok('applying it reports what it created', applied.unlocksCreated === 1, JSON.stringify(applied.unlocksCreated))
  const gUnlock = await getDoc(doc(db, 'tierUnlocks', `${visitorUid}_${GIFT}`))
  ok('lowering a threshold unlocks immediately', gUnlock.exists() && gUnlock.data().pointsAtUnlock === 90)
  ok('re-saving the policy leaves stock untouched', (await getDoc(doc(db, 'prizeTiers', GIFT))).data().stockRemaining === stockBefore)
  ok('and leaves the per-session allowance untouched', (await getDoc(doc(db, 'prizeTiers', GIFT))).data().stockPerSession === 50)

  await rawCall(tokens.admin, 'savePrizePolicy', { tiers: tierInput({ [GIFT]: 100 }) })
  ok('raising a threshold never revokes (§12.9)', (await getDoc(doc(db, 'tierUnlocks', `${visitorUid}_${GIFT}`))).exists())
  ok('threshold is back at 100', (await getDoc(doc(db, 'prizeTiers', GIFT))).data().thresholdPoints === 100)

  const s10 = await stamp(tenth)
  ok('the tenth stamp reaches the hundred the gift asks for', s10.status === 'success' && s10.points === 100, `${s10.status} ${s10.points}`)
  tally.stamps++
  await sleep(3000)
  ok('the trigger does not duplicate the unlock the policy already made',
    (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))).size === 1
    && (await getDoc(doc(db, 'users', visitorUid))).data().points === 100)

  // The stage draw was retired with the three-tier policy: booths hand out their own small
  // gifts directly, and the one remaining prize grants no entry. The callable is still there,
  // so assert that it now finds nobody rather than quietly leaving it untested.
  const draw = await rawCall(tokens.admin, 'runDraw', { count: 1 })
  ok('the draw finds an empty pool now that no tier grants an entry', draw.poolSize === 0 && draw.winners.length === 0, JSON.stringify(draw))

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
  // The full ten, so the desk tests downstream have two people who have earned the gift and can
  // race each other for the last one.
  let stamped3 = 0
  for (const b of booths.stampable) if ((await stamp(b)).status === 'success') stamped3++
  tally.stamps += stamped3
  await sleep(3000)
  const v3 = (await getDoc(doc(db, 'users', visitor3Uid))).data()
  ok('visitor 3 reaches the gift as well', stamped3 === 10 && v3.points === 100
    && (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitor3Uid)))).size === 1, `${stamped3} stamps, ${v3.points} pts`)
  ok('visitor cannot read another visitor (incl. ethnicGroup)', await denied(getDoc(doc(db, 'users', visitorUid))))
  ok('visitor cannot read boothSecrets', await denied(getDoc(doc(db, 'boothSecrets', booths.desk))))
  ok('visitor cannot write scans directly', await denied(setDoc(doc(db, 'scans', `${visitor3Uid}_${booths.desk}`), { visitorId: visitor3Uid, boothId: booths.desk })))
  ok("visitor cannot read another's tierUnlock", await denied(getDoc(doc(db, 'tierUnlocks', `${visitorUid}_${GIFT}`))))
  ok('visitor can read own tierUnlocks and scans', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitor3Uid)))).size === 1 && (await getDocs(query(collection(db, 'scans'), where('visitorId', '==', visitor3Uid)))).size === 10)
  ok('visitor cannot read auditLog / invites / booth stats', (await denied(getDocs(collection(db, 'auditLog')))) && (await denied(getDocs(collection(db, 'invites')))) && (await denied(getDoc(doc(db, `stats/booths/items/${booths.desk}`)))))
  ok('visitor cannot open a booth session', await fails(call('boothSession')({}), /Requires role/))
  const er1 = await call('requestErasure')({})
  const er2 = await call('requestErasure')({})
  ok('requestErasure files one open request and is idempotent', er1.existing === false && er2.existing === true && typeof er2.requestedAt === 'number', JSON.stringify(er2))
  const erDoc = await ownerDoc(`erasureRequests/${visitor3Uid}`)
  ok('the request carries who asked', erDoc?.status === 'open' && erDoc.displayName === 'Third Visitor' && erDoc.contact === 'visitor3@example.com')
  ok('visitor can read their own request', (await getDoc(doc(db, 'erasureRequests', visitor3Uid))).exists())
  ok("visitor cannot read another's request", await denied(getDoc(doc(db, 'erasureRequests', visitorUid))))
}

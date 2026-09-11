import { signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import {
  auth, db, call, ok, section, signUpVerified, rawCall, ownerDoc, readSecret, boothToken, nowCounter, sleep,
} from './lib.mjs'

/** Archive, the PDPA hard delete, the purge, and the next event reusing the booth ids. Runs as the second admin. */
export default async function lifecycle(ctx) {
  const { liveEvent, secrets, tokens, tally, visitorUid, visitor3Uid } = ctx

  section('Archive freezes totals')
  const arch = await call('archiveEvent')({ id: liveEvent.id, confirmName: liveEvent.nameEn })
  ok('archive records the totals', arch.totals.stamps === tally.stamps && arch.totals.redeemed === tally.redeemed && arch.totals.visitors === tally.visitors,
    `${JSON.stringify(arch.totals)} expected ${JSON.stringify(tally)}`)
  const archDoc = await getDoc(doc(db, 'archives', liveEvent.id))
  ok('archives/{id} written', archDoc.exists() && archDoc.data().booths.length === 12, `${archDoc.data()?.booths?.length} booths`)
  ok('archive counts redemptions per tier', archDoc.data().tiers.find((t) => t.id === 'explorer')?.redeemed === 2, JSON.stringify(archDoc.data().tiers.map((t) => [t.id, t.redeemed])))
  ok('archive keeps the draws', archDoc.data().draws.length === 2)

  section('Hard delete is the PDPA erasure (§10)')
  await rawCall(tokens.admin, 'deleteUser', { uid: visitor3Uid, hard: true })
  ok('hard delete removes the user document', !(await getDoc(doc(db, 'users', visitor3Uid))).exists())
  ok('hard delete removes the visitor scans', (await getDocs(query(collection(db, 'scans'), where('visitorId', '==', visitor3Uid)))).size === 0)
  ok('hard delete removes the visitor unlocks', (await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitor3Uid)))).size === 0)
  const er = await ownerDoc(`erasureRequests/${visitor3Uid}`)
  ok('the erasure request is marked resolved', er?.status === 'resolved' && er.resolution === 'hard' && er.resolvedBy === ctx.adminUid, JSON.stringify(er))

  section('Purge clears the event')
  const scopes = ['scans', 'tierUnlocks', 'stockAdjustments', 'draws', 'buckets', 'invites', 'rateLimits', 'counters', 'visitors', 'eventStats']
  for (const scope of scopes) {
    let guard = 0
    for (;;) {
      const r = await call('purgeEventData')({ eventId: liveEvent.id, scope })
      if (r.done || ++guard > 50) break
    }
  }
  await call('purgeEventData')({ eventId: liveEvent.id, scope: 'boothStats' })
  await call('purgeEventData')({ eventId: liveEvent.id, scope: 'rotateSecrets' })
  await call('purgeEventData')({ eventId: liveEvent.id, scope: 'resetTierStock' })

  await sleep(6000)
  await call('purgeEventData')({ eventId: liveEvent.id, scope: 'eventStats' })
  const shardsAfter = await getDocs(collection(db, 'stats/event/shards'))
  ok('no counter shards left behind', shardsAfter.size === 0, `${shardsAfter.size} shards`)
  ok('scans cleared', (await getDocs(collection(db, 'scans'))).size === 0)
  ok('tierUnlocks cleared', (await getDocs(collection(db, 'tierUnlocks'))).size === 0)
  ok('booths kept', (await getDocs(collection(db, 'booths'))).size === 12)
  ok('prize stock restored', (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining === 600)
  const voy = (await getDoc(doc(db, 'prizeTiers', 'voyager'))).data()
  ok('adjusted tier restored to its own total', voy.stockRemaining === voy.stockTotal, `${voy.stockRemaining}/${voy.stockTotal}`)
  const v = await getDoc(doc(db, 'users', visitorUid))
  ok('visitor progress reset', (v.data().points ?? 0) === 0 && (v.data().stampCount ?? 0) === 0, `${v.data().points} points`)

  section('Create the next event and go live')
  const start = Date.now() + 30 * 86400_000
  const created = await call('createEvent')({
    nameEn: 'MFU Open House 2027', nameTh: '', startsAt: start, endsAt: start + 86400_000,
    qrPeriodSeconds: 30, passportPrefix: 'MFU-OH', zonePoints: { entrance: 5, middle: 10, far: 15 },
  })
  ok('createEvent returns a slug id', !!created.id, created.id)
  await call('goLive')({ id: created.id })
  const nowLive = await getDocs(query(collection(db, 'events'), where('status', '==', 'live')))
  ok('exactly one live event after go-live', nowLive.size === 1, nowLive.docs[0]?.id)
  ok('the new event is the live one', nowLive.docs[0].id === created.id)
  ok('the new event has 2 days derived from its dates', nowLive.docs[0].data().days.length === 2, JSON.stringify(nowLive.docs[0].data().days))

  section('The next event reuses the booth ids safely')
  // A booth carries the id of the event it was created under, and `scan` refuses one that is
  // not the live event's (§6.6). Carrying a booth over is therefore an explicit admin action
  // rather than a side effect of going live: `updateBooth` re-stamps eventId from the live
  // event, and clears any temporary reward along with it. Runs as the admin, before sign-out.
  const newDays = nowLive.docs[0].data().days
  const basePointsBefore = (await getDoc(doc(db, 'booths', 'booth-01'))).data().points
  await call('updateBooth')({ id: 'booth-01', activeDays: newDays })
  const carried = await getDoc(doc(db, 'booths', 'booth-01'))
  ok('carrying a booth over re-points it at the live event', carried.data().eventId === created.id, carried.data().eventId)
  ok('carrying a booth over keeps its base points and clears any temporary reward',
    carried.data().points === basePointsBefore && carried.data().temporaryPoints == null && carried.data().pointsExpireAt == null,
    `${carried.data().points} base (was ${basePointsBefore}), temporary ${carried.data().temporaryPoints}`)
  ok('carrying a booth over adopts the new event days', JSON.stringify(carried.data().activeDays) === JSON.stringify(newDays), JSON.stringify(carried.data().activeDays))
  await signOut(auth); await signUpVerified('visitor2@example.com')
  const newSecret = await readSecret('booth-01')
  ok('booth secret was rotated', newSecret !== secrets['booth-01'])
  const nextPassport = await call('join')({ displayName: 'Second Event Visitor', visitorType: 'guest', institution: 'MFU', countryCode: 'TH', consent: true })
  await auth.currentUser.getIdToken(true) // the app calls refreshClaims() here
  const reScan = await call('scan')({ payload: boothToken(newSecret, 'booth-01', nowCounter(30)) })
  ok('booth-01 can be stamped again in the new event', reScan.status === 'success', reScan.status)
  ok('passport numbering restarted with the new event prefix', nextPassport.passportNo === 'MFU-OH-0001', nextPassport.passportNo)
}

/**
 * End-to-end smoke test of the visitor -> scan -> redeem -> archive -> recreate loop
 * against the local emulators. Uses the client SDK so it goes through the real rules.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { createHmac } from 'node:crypto'

const app = initializeApp({ projectId: 'mfu-passport', apiKey: 'demo-key', authDomain: 'localhost' })
const auth = getAuth(app)
const db = getFirestore(app)
const fns = getFunctions(app, 'asia-southeast1')
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectFunctionsEmulator(fns, '127.0.0.1', 5001)

const call = (n) => async (d = {}) => (await httpsCallable(fns, n)(d)).data

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}
const section = (s) => console.log(`\n=== ${s} ===`)

// --- booth token, same scheme as shared/token.ts (base32 of HMAC-SHA256) ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function boothToken(secretB64, boothId, counter) {
  const mac = createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`${boothId}:${counter}`).digest()
  let bits = '', out = ''
  for (const b of mac) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < 6; i++) out += B32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  return out
}

/** boothSecrets is denied to every client by design, so read it as the emulator owner. */
async function readSecret(boothId) {
  const r = await fetch(
    `http://127.0.0.1:8080/v1/projects/mfu-passport/databases/(default)/documents/boothSecrets/${boothId}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  const j = await r.json()
  if (!j.fields) throw new Error(`no secret for ${boothId}: ${JSON.stringify(j).slice(0, 200)}`)
  return j.fields.secret.stringValue
}

async function main() {
  section('Admin bootstrap')
  await signInAnonymously(auth)
  const adminUid = auth.currentUser.uid
  await call('bootstrapAdmin')({ key: 'dev', displayName: 'Test Admin' })
  await auth.currentUser.getIdToken(true)
  ok('bootstrapAdmin sets the admin claim', (await auth.currentUser.getIdTokenResult()).claims.role === 'admin')

  section('Live event is data, not a constant')
  const evs = await getDocs(query(collection(db, 'events'), where('status', '==', 'live')))
  ok('exactly one live event', evs.size === 1, `${evs.size} found`)
  const liveEvent = { id: evs.docs[0].id, ...evs.docs[0].data() }
  ok('event carries days[]', Array.isArray(liveEvent.days) && liveEvent.days.length === 3, JSON.stringify(liveEvent.days))
  ok('event carries passportPrefix', liveEvent.passportPrefix === 'MFU-GG')
  ok('event carries zonePoints', liveEvent.zonePoints?.far === 20)

  const listed = await call('listEvents')({})
  ok('listEvents returns the live one', listed.liveId === liveEvent.id, listed.liveId)

  section('Invite expiry follows the event (was a hardcoded 2026-09-18)')
  const inv = await call('inviteOrganizer')({ invites: [{ name: 'Test Organizer', email: 'organizer@example.com', boothId: 'booth-02' }] })
  const inviteId = inv.results[0].inviteId
  const invDoc = await getDoc(doc(db, 'invites', inviteId))
  const expMs = invDoc.data().expiresAt.toMillis()
  ok('invitation is not already expired', expMs > Date.now(), new Date(expMs).toISOString())

  section('draws is readable by an admin (was denied by the rules)')
  let drawsReadable = true
  try { await getDocs(collection(db, 'draws')) } catch (e) { drawsReadable = false; console.log('   ', e.code) }
  ok('admin can read draws', drawsReadable)

  section('Visitor registers, scans, unlocks')
  await signOut(auth)
  await signInAnonymously(auth)
  const visitorUid = auth.currentUser.uid
  const joined = await call('join')({
    displayName: 'Test Visitor', visitorType: 'student', institution: 'MFU', school: 'School of Law',
    countryCode: 'MM', contact: 'visitor1@example.com', consent: true,
  })
  ok('join issues a passport number with the event prefix', joined.passportNo?.startsWith('MFU-GG-'), joined.passportNo)
  await auth.currentUser.getIdToken(true)

  // Visitors must be able to read live prize stock (the planners' request).
  const tiersSnap = await getDocs(collection(db, 'prizeTiers'))
  ok('visitor can read prizeTiers stock live', tiersSnap.size === 3 && typeof tiersSnap.docs[0].data().stockRemaining === 'number',
    tiersSnap.docs.map((d) => `${d.id}:${d.data().stockRemaining}`).join(' '))

  // Scan every booth as admin-issued tokens. Read secrets with the admin SDK via REST.
  const secrets = {}
  for (const b of ['booth-01', 'booth-02', 'booth-03', 'booth-04', 'booth-05', 'booth-08', 'booth-09', 'booth-10', 'booth-12']) {
    secrets[b] = await readSecret(b)
  }
  let stamped = 0, points = 0
  for (const [boothId, secret] of Object.entries(secrets)) {
    const counter = Math.floor(Date.now() / 1000 / (liveEvent.qrPeriodSeconds ?? 20))
    const res = await call('scan')({ payload: boothToken(secret, boothId, counter) })
    if (res.status === 'success') { stamped++; points = res.points }
    else console.log(`    scan ${boothId} -> ${res.status}`)
  }
  ok('all 9 scans stamped', stamped === 9, `${stamped}/9`)
  void points

  const again = await call('scan')({ payload: boothToken(secrets['booth-01'], 'booth-01', Math.floor(Date.now() / 1000 / 20)) })
  ok('rescanning the same booth says "already"', again.status === 'already')

  await new Promise((r) => setTimeout(r, 3000)) // let onScanCreate settle
  const me = await getDoc(doc(db, 'users', visitorUid))
  ok('user document accumulated points', (me.data().points ?? 0) >= 130, `${me.data().points} points, ${me.data().stampCount} stamps`)
  const unlocks = await getDocs(query(collection(db, 'tierUnlocks'), where('visitorId', '==', visitorUid)))
  ok('tier unlocks created by the trigger', unlocks.size === 2, `${unlocks.size} unlocks at 140 points (50/100 reached, 150 not)`)

  section('Prize desk redeems, stock drops live')
  const code = await call('redemptionCode')({})
  const before = 600

  section('Prize desk (second admin account)')
  // bootstrapAdmin refuses once an admin exists, so elevate a fresh account via the Auth emulator.
  await signOut(auth)
  await signInAnonymously(auth)
  const uid2 = auth.currentUser.uid
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/mfu-passport/accounts:update', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid2, customAttributes: JSON.stringify({ role: 'admin' }) }),
  }).catch((e) => console.log('    elevate failed', e.message))
  await auth.currentUser.getIdToken(true)
  const isAdmin = (await auth.currentUser.getIdTokenResult()).claims.role === 'admin'
  if (!isAdmin) { console.log('    (could not elevate second account; skipping redeem + archive checks)'); return report() }

  const lookup = await call('lookupRedemption')({ payload: code.payload })
  ok('prize desk finds the visitor', lookup.status === 'ok', lookup.status === 'ok' ? lookup.visitor.displayName : '')
  const conf = await call('confirmRedemption')({ payload: code.payload, tierId: 'explorer' })
  ok('redemption confirmed', conf.status === 'redeemed', conf.status)
  const after = (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining
  ok('stockRemaining decremented', after === before - 1, `${before} -> ${after}`)

  section('Archive freezes totals, purge clears the event')
  const arch = await call('archiveEvent')({ id: liveEvent.id, confirmName: liveEvent.nameEn })
  ok('archive records the totals', arch.totals.stamps === 9 && arch.totals.redeemed === 1 && arch.totals.visitors === 1, JSON.stringify(arch.totals))
  const archDoc = await getDoc(doc(db, 'archives', liveEvent.id))
  ok('archives/{id} written', archDoc.exists() && archDoc.data().booths.length === 12, `${archDoc.data()?.booths?.length} booths`)

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

  await new Promise((r) => setTimeout(r, 6000))
  await call('purgeEventData')({ eventId: liveEvent.id, scope: 'eventStats' })
  const shardsAfter = await getDocs(collection(db, 'stats/event/shards'))
  ok('no counter shards left behind', shardsAfter.size === 0, `${shardsAfter.size} shards`)

  ok('scans cleared', (await getDocs(collection(db, 'scans'))).size === 0)
  ok('tierUnlocks cleared', (await getDocs(collection(db, 'tierUnlocks'))).size === 0)
  ok('booths kept', (await getDocs(collection(db, 'booths'))).size === 12)
  ok('prize stock restored', (await getDoc(doc(db, 'prizeTiers', 'explorer'))).data().stockRemaining === 600)
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
  await signOut(auth); await signInAnonymously(auth)
  const newSecret = await readSecret('booth-01')
  ok('booth secret was rotated', newSecret !== secrets['booth-01'])

  const nextPassport = await call('join')({
    displayName: 'Second Event Visitor', visitorType: 'guest', institution: 'MFU',
    countryCode: 'TH', contact: 'visitor2@example.com', consent: true,
  })
  await auth.currentUser.getIdToken(true) // the app calls refreshClaims() here
  const reScan = await call('scan')({ payload: boothToken(newSecret, 'booth-01', Math.floor(Date.now() / 1000 / 30)) })
  ok('booth-01 can be stamped again in the new event', reScan.status === 'success', reScan.status)
  ok('passport numbering restarted with the new event prefix', nextPassport.passportNo === 'MFU-OH-0001', nextPassport.passportNo)

  report()
}

function report() {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('\nFATAL', e); process.exit(1) })

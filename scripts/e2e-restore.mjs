/**
 * Proves the restore path end to end against the emulators (spec §4.1).
 *
 * The thing that must hold is that restoring lands on the visitor's ORIGINAL uid, so their
 * stamps come back with them. The previous implementation signed them into a fresh uid and then
 * dead-ended at `join`, which refuses a contact that already has a passport — so this test
 * checks the uid, not just that a sign-in succeeded.
 *
 *   npm run e2e:restore     (resets and reseeds the emulator first)
 */
import { initializeApp } from 'firebase/app'
import {
  getAuth, connectAuthEmulator, signInAnonymously, signOut,
  sendPasswordResetEmail, confirmPasswordReset, signInWithEmailAndPassword,
} from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { createHmac } from 'node:crypto'

const PROJECT = 'mfu-passport'
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost' })
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

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function boothToken(secretB64, boothId, counter) {
  const mac = createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`${boothId}:${counter}`).digest()
  let bits = '', out = ''
  for (const b of mac) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < 6; i++) out += B32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  return out
}

async function readSecret(boothId) {
  const r = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/boothSecrets/${boothId}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  return (await r.json()).fields.secret.stringValue
}

/** The Auth emulator does not send mail; it exposes the generated codes instead. */
async function latestResetCode(email) {
  const r = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`)
  const { oobCodes = [] } = await r.json()
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET')
  return mine.length ? mine[mine.length - 1].oobCode : null
}

const EMAIL = `restore-test-${Date.now()}@example.com`

async function main() {
  console.log('\n=== Register, then stamp a booth ===')
  await signInAnonymously(auth)
  const originalUid = auth.currentUser.uid
  await call('join')({
    displayName: 'Restore Test', visitorType: 'student', institution: 'MFU', school: 'School of Law',
    countryCode: 'TH', contact: EMAIL, consent: true,
  })
  await auth.currentUser.getIdToken(true)
  ok('registered', !!originalUid, originalUid.slice(0, 10) + '…')

  // join links an email credential onto this same anonymous account (lib/linkEmail.ts). The
  // browser does that, so replicate it here with the same call the app makes.
  const { EmailAuthProvider, linkWithCredential } = await import('firebase/auth')
  await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(EMAIL, 'throwaway-' + Date.now()))
  await auth.currentUser.reload()
  ok('account is no longer anonymous', auth.currentUser.isAnonymous === false)
  ok('account carries a password provider', auth.currentUser.providerData.some((p) => p.providerId === 'password'),
    auth.currentUser.providerData.map((p) => p.providerId).join(','))

  const secret = await readSecret('booth-09') // far corner, 20 points
  const r = await call('scan')({ payload: boothToken(secret, 'booth-09', Math.floor(Date.now() / 1000 / 20)) })
  ok('stamped a booth', r.status === 'success', r.status)
  await new Promise((res) => setTimeout(res, 3000)) // let onScanCreate land
  const before = (await getDoc(doc(db, 'users', originalUid))).data()
  ok('points recorded', (before.points ?? 0) === 20, `${before.points} points, ${before.stampCount} stamps`)

  console.log('\n=== Lose the device, then restore ===')
  await signOut(auth)
  ok('signed out', auth.currentUser === null)

  await sendPasswordResetEmail(auth, EMAIL)
  const code = await latestResetCode(EMAIL)
  ok('reset email issued', !!code, code ? code.slice(0, 12) + '…' : 'none')
  if (!code) return report()

  await confirmPasswordReset(auth, code, 'a-brand-new-password-123')
  const cred = await signInWithEmailAndPassword(auth, EMAIL, 'a-brand-new-password-123')

  ok('restored onto the ORIGINAL uid', cred.user.uid === originalUid,
    `${cred.user.uid.slice(0, 10)}… vs ${originalUid.slice(0, 10)}…`)

  const claims = (await cred.user.getIdTokenResult(true)).claims
  ok('still has the visitor role', claims.role === 'visitor', String(claims.role))

  const after = (await getDoc(doc(db, 'users', cred.user.uid))).data()
  ok('stamps and points came back', (after?.points ?? 0) === 20 && (after?.stampCount ?? 0) === 1,
    `${after?.points} points, ${after?.stampCount} stamps`)
  ok('same passport number', after?.passportNo === before.passportNo, after?.passportNo)

  console.log('\n=== Re-scanning the same booth is still refused ===')
  const again = await call('scan')({ payload: boothToken(secret, 'booth-09', Math.floor(Date.now() / 1000 / 20)) })
  ok('duplicate scan still detected after restore', again.status === 'already', again.status)

  report()
}

function report() {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('\nFATAL', e); process.exit(1) })

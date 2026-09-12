/**
 * Shared plumbing for the emulator end-to-end run (`npm run e2e`, see run.mjs).
 *
 * Everything goes through the client SDK where a client would, so the real security rules are
 * exercised; the emulator owner APIs are used only for what no client can do (flip
 * emailVerified, read a booth secret, elevate a second admin).
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { createHmac } from 'node:crypto'

export const PROJECT = 'mfu-passport'
export const REGION = 'asia-southeast1'
const AUTH_HOST = 'http://127.0.0.1:9099'
const FS_HOST = 'http://127.0.0.1:8080'
const FN_HOST = 'http://127.0.0.1:5001'

export const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost' })
export const auth = getAuth(app)
export const db = getFirestore(app)
export const fns = getFunctions(app, REGION)
connectAuthEmulator(auth, AUTH_HOST, { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectFunctionsEmulator(fns, '127.0.0.1', 5001)

/** A callable as the SDK's currently signed-in user. */
export const call = (n) => async (d = {}) => (await httpsCallable(fns, n)(d)).data

// ---------- reporting ----------
export const counts = { pass: 0, fail: 0 }
export const ok = (name, cond, extra = '') => {
  if (cond) { counts.pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`) }
  else { counts.fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}
export const section = (s) => console.log(`\n=== ${s} ===`)
export function report() {
  console.log(`\n${counts.pass} passed, ${counts.fail} failed`)
  process.exit(counts.fail ? 1 : 0)
}

// ---------- booth token, same scheme as shared/token.ts (base32 of HMAC-SHA256) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function boothToken(secretB64, boothId, counter) {
  const mac = createHmac('sha256', Buffer.from(secretB64, 'base64')).update(`${boothId}:${counter}`).digest()
  let bits = '', out = ''
  for (const b of mac) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < 6; i++) out += B32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  return out
}
export const nowCounter = (period = 20) => Math.floor(Date.now() / 1000 / period)

// ---------- actors ----------
/** Auth emulator owner API: the stand-in for clicking a verification link, or for a console admin edit. */
export async function ownerAuthUpdate(body) {
  const r = await fetch(`${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`accounts:update ${r.status}: ${await r.text()}`)
}

/**
 * Anonymous sign-in is off (§4.1), so every actor is a real email/password account. The emulator
 * creates them unverified and `join` insists on a confirmed address, so flip emailVerified here.
 */
export async function signUpVerified(email, password = 'passw0rd!') {
  await createUserWithEmailAndPassword(auth, email, password)
  const localId = auth.currentUser.uid
  await ownerAuthUpdate({ localId, emailVerified: true })
  await auth.currentUser.getIdToken(true)
  return localId
}

export async function signInAs(email, password = 'passw0rd!') {
  await signOut(auth)
  await signInWithEmailAndPassword(auth, email, password)
  await auth.currentUser.getIdToken(true)
  return auth.currentUser.uid
}

export const idToken = () => auth.currentUser.getIdToken()
export const claims = async () => (await auth.currentUser.getIdTokenResult()).claims

/**
 * The raw callable protocol with an explicit ID token, so a second actor can act while the SDK
 * stays signed in as someone else. This is what makes the two-desk race (§12.15) possible, and
 * lets the admin act while an organizer or visitor keeps their session. Emulator ID tokens are
 * unsigned and last an hour: capture one per actor after their claims are final.
 */
export async function rawCall(token, name, data = {}) {
  const r = await fetch(`${FN_HOST}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
  })
  const j = await r.json()
  if (j.error) { const e = new Error(j.error.message); e.code = j.error.status; throw e }
  return j.result
}

// ---------- owner reads ----------
/** Firestore REST typed values -> plain JS. */
function fromRest(v) {
  if (v === undefined || v === null) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromRest)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromRest(x)]))
  return v
}

/** Read any document as the emulator owner (for what the rules deny every client). Null when absent. */
export async function ownerDoc(path) {
  const r = await fetch(`${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } })
  const j = await r.json()
  if (!j.fields) return null
  return Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, fromRest(v)]))
}

/** Delete a document as the emulator owner (rate-limit windows, which no client may touch). */
export async function ownerDelete(path) {
  const r = await fetch(`${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
  if (!r.ok && r.status !== 404) throw new Error(`delete ${path}: ${r.status}`)
}

/** boothSecrets is denied to every client by design. */
export async function readSecret(boothId) {
  const d = await ownerDoc(`boothSecrets/${boothId}`)
  if (!d) throw new Error(`no secret for ${boothId}`)
  return d.secret
}

// ---------- assertion helpers ----------
/** Resolves true when the promise is refused by the rules. */
export const denied = (p) => p.then(() => false, (e) => e.code === 'permission-denied')
/** Resolves true when the promise rejects with a message matching `re`. */
export const fails = (p, re) => p.then(() => false, (e) => re.test(e.message ?? ''))
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- the event's clock ----------

/**
 * Today and the minute of the day in Asia/Bangkok, whatever the machine's clock is set to.
 *
 * The prize desk only opens on a day the event runs, inside one of its windows, so a suite that
 * has to pass on any day of the year has to move the event to itself. These are the two figures
 * that takes. They mirror `dayOf`/`minuteOfDay` in shared/model rather than importing them,
 * because that module is TypeScript and this suite runs straight off the source.
 */
export const bkkDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export const bkkMinute = (d = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).split(':').map(Number)
  return h * 60 + m
}

/** A prize window around now, clamped to the day, so the desk is open while the suite runs. */
export function windowAroundNow(label = 'Test window') {
  const m = bkkMinute()
  return [{ id: 'am', label, startMinute: Math.max(0, m - 60), endMinute: Math.min(1440, m + 60) }]
}

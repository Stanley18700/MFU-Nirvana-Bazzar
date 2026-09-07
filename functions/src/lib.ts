import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp, Transaction } from 'firebase-admin/firestore'
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { createHash, randomBytes } from 'node:crypto'
import { Role, STATS_SHARDS } from './shared/model'

if (!getApps().length) initializeApp()

export const db = getFirestore()
export const auth = getAuth()
export { FieldValue, Timestamp }

export const REGION = 'asia-southeast1'

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth.uid
}

export function requireRole(req: CallableRequest, ...roles: Role[]): { uid: string; role: Role; boothId?: string } {
  const uid = requireAuth(req)
  const role = req.auth!.token.role as Role | undefined
  if (!role || !roles.includes(role)) throw new HttpsError('permission-denied', `Requires role: ${roles.join(' or ')}`)
  return { uid, role, boothId: req.auth!.token.boothId as string | undefined }
}

export function str(v: unknown, field: string, { max = 200, required = true } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpsError('invalid-argument', `${field} is required`)
    return ''
  }
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} must be a string`)
  const s = v.trim()
  if (s.length > max) throw new HttpsError('invalid-argument', `${field} is too long`)
  return s
}

export function num(v: unknown, field: string, { min = 0, max = 1_000_000 } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpsError('invalid-argument', `${field} must be a number`)
  if (v < min || v > max) throw new HttpsError('invalid-argument', `${field} out of range`)
  return v
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomSecretB64(): string {
  return randomBytes(32).toString('base64')
}

export function shardRef(i = Math.floor(Math.random() * STATS_SHARDS)) {
  return db.doc(`stats/event/shards/${i}`)
}

export function boothStatsRef(boothId: string) {
  return db.doc(`stats/booths/items/${boothId}`)
}

export function bucketRef(eventId: string, date: Date) {
  const d = new Date(date)
  d.setUTCSeconds(0, 0)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5)
  const id = `${eventId}_${d.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
  return { ref: db.doc(`stats/buckets/items/${id}`), startsAt: Timestamp.fromDate(d) }
}

export async function audit(actorUid: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  await db.collection('auditLog').add({
    actorUid, action, targetType, targetId,
    before: before ?? null, after: after ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })
}

/** Simple fixed-window rate limit on a rateLimits/{key} document. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const ref = db.doc(`rateLimits/${key}`)
  const now = Date.now()
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref)
    const data = snap.data() as { count: number; windowStart: number } | undefined
    if (!data || now - data.windowStart > windowSeconds * 1000) {
      tx.set(ref, { count: 1, windowStart: now })
      return true
    }
    if (data.count >= limit) return false
    tx.update(ref, { count: FieldValue.increment(1) })
    return true
  })
}

export function clientFingerprint(req: CallableRequest): { uaHash: string; ipPrefix: string } {
  const ua = req.rawRequest.headers['user-agent'] ?? ''
  const ip = (req.rawRequest.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.rawRequest.ip ?? ''
  const ipPrefix = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::' : ip.split('.').slice(0, 3).join('.') + '.0'
  return { uaHash: sha256(ua).slice(0, 16), ipPrefix }
}

/** Server-side secret used for rotating redemption codes; created on first use. */
export async function redemptionSecret(): Promise<string> {
  const ref = db.doc('boothSecrets/_redemption')
  const snap = await ref.get()
  if (snap.exists) return snap.data()!.secret as string
  const secret = randomSecretB64()
  await ref.set({ secret, rotatedAt: FieldValue.serverTimestamp(), rotatedBy: 'system' })
  return secret
}

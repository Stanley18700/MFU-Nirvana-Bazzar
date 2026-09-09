import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp, Transaction } from 'firebase-admin/firestore'
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https'
import { createHash, randomBytes } from 'node:crypto'
import {
  DEFAULT_PASSPORT_PREFIX, EVENT_DAYS, EVENT_ID, EventDoc, Role, STATS_SHARDS, ZONE_POINTS,
} from './shared/model'

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

export type ActiveEvent = EventDoc & { id: string }

const FALLBACK_EVENT: ActiveEvent = {
  id: EVENT_ID,
  nameEn: 'MFU International Festival 2026',
  nameTh: '',
  startsAt: null,
  endsAt: null,
  qrPeriodSeconds: 20,
  active: true,
  boothCount: 0,
  days: [...EVENT_DAYS],
  passportPrefix: DEFAULT_PASSPORT_PREFIX,
  zonePoints: { ...ZONE_POINTS },
  status: 'live',
}

let eventCache: { at: number; value: ActiveEvent } | null = null

/**
 * The one live event. Read from `events` rather than a constant so an admin can archive
 * this event and create the next one without a redeploy.
 *
 * Memoised per instance, because the hot `scan` path needs it on every call. The cache is
 * only safe where a few seconds of staleness cannot be observed: `clearEventCache()` reaches
 * the instance that switched events, but other warm instances keep theirs until the TTL
 * expires. Anything that writes the event's identity into a durable record — the passport
 * prefix, a booth's eventId, an invitation's expiry — must pass `force`.
 */
export async function getActiveEvent(force = false): Promise<ActiveEvent> {
  if (!force && eventCache && Date.now() - eventCache.at < 30_000) return eventCache.value
  const q = await db.collection('events').where('status', '==', 'live').limit(1).get()
  let value: ActiveEvent
  if (q.empty) {
    // Pre-migration data has no `status`; fall back to the seeded document, then to defaults.
    const legacy = await db.doc(`events/${EVENT_ID}`).get()
    value = legacy.exists
      ? { ...FALLBACK_EVENT, ...(legacy.data() as Partial<EventDoc>), id: legacy.id, days: (legacy.data()!.days as string[]) ?? [...EVENT_DAYS] }
      : FALLBACK_EVENT
  } else {
    const d = q.docs[0]
    value = { ...FALLBACK_EVENT, ...(d.data() as Partial<EventDoc>), id: d.id }
  }
  if (!Array.isArray(value.days) || value.days.length === 0) value.days = [...EVENT_DAYS]
  if (!value.zonePoints) value.zonePoints = { ...ZONE_POINTS }
  if (!value.passportPrefix) value.passportPrefix = DEFAULT_PASSPORT_PREFIX
  eventCache = { at: Date.now(), value }
  return value
}

/** Call after any write to an event document so the next read is not stale. */
export function clearEventCache() { eventCache = null }

/** Milliseconds since the epoch for a Firestore Timestamp, a Date, or a number. */
export function toMillis(v: unknown): number | null {
  if (!v) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis(): number }).toMillis()
  return null
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

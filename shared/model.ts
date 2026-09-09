/** Firestore document shapes — spec §7.1. Shared by client and functions. */

export type Role = 'visitor' | 'organizer' | 'admin'
export type VisitorType = 'student' | 'staff' | 'alumni' | 'guest'
export type Zone = 'entrance' | 'middle' | 'far'

/**
 * Seed defaults and last-resort fallbacks only. The live event is a document —
 * `events/{id}` with `status: 'live'` — so the app can be run again for a new event
 * without a redeploy. Read it with `getActiveEvent()` (functions) or `useEvent()` (client).
 */
export const EVENT_ID = 'mfu-go-global-2026'
export const EVENT_DAYS = ['2026-09-16', '2026-09-17', '2026-09-18'] as const
export type EventDay = (typeof EVENT_DAYS)[number]

export const ZONE_POINTS: Record<Zone, number> = { entrance: 10, middle: 15, far: 20 }
export const DEFAULT_PASSPORT_PREFIX = 'MFU-GG'
export type EventStatus = 'draft' | 'live' | 'archived'

export const ACCENTS = [
  '#EF5F5F', '#0FAFD0', '#4C764F', '#F5C63C', '#FF919C', '#F0A445', '#45CFC0', '#E08761', '#2F5D3E',
] as const

export interface EventDoc {
  nameTh: string
  nameEn: string
  startsAt: unknown
  endsAt: unknown
  qrPeriodSeconds: number
  active: boolean
  boothCount: number
  /** The days this event runs, 'YYYY-MM-DD' in Asia/Bangkok. Was the EVENT_DAYS constant. */
  days: string[]
  /** Passport number prefix, e.g. 'MFU-GG' -> MFU-GG-0001. */
  passportPrefix: string
  /** Default points offered per zone when a booth is created. */
  zonePoints: Record<Zone, number>
  status: EventStatus
  /** Arc text on the generated fallback stamp (spec 2.5) — e.g. 'MFU INTERFEST'. */
  stampMarkTop?: string
  /** Lower arc, e.g. '2026 · CHIANG RAI'. */
  stampMarkBottom?: string
  archivedAt?: unknown
  createdAt?: unknown
}

/** The frozen totals kept at `archives/{eventId}` when an event is archived and purged. */
export interface ArchiveDoc {
  eventId: string
  nameEn: string
  nameTh: string
  days: string[]
  startsAt: unknown
  endsAt: unknown
  archivedAt: unknown
  archivedBy: string
  totals: { visitors: number; stamps: number; points: number; redeemed: number }
  booths: Array<{ id: string; nameEn: string; points: number; stamps: number }>
  tiers: Array<{ id: string; name: string; thresholdPoints: number; stockTotal: number; stockRemaining: number; redeemed: number }>
  draws: Array<{ winners: string[]; names: unknown; createdAt: unknown }>
}

export interface UserDoc {
  role: Role
  displayName: string
  studentId?: string | null
  visitorType?: VisitorType
  institution?: string
  institutionOther?: string | null
  school?: string | null
  countryCode?: string
  isInternational?: boolean
  ethnicGroup?: string | null
  ethnicConsentAt?: unknown
  contact?: string
  contactVerified?: boolean
  boothId?: string | null
  passportNo?: string
  stampCount: number
  points: number
  stampedBoothIds: string[]
  daysAttended: string[]
  consentAt?: unknown
  createdAt: unknown
  lastSeenAt?: unknown
  deletedAt?: unknown
}

export interface BoothDoc {
  eventId: string
  nameTh: string
  nameEn: string
  shortName: string
  hostUnit: string
  location: string
  descriptionTh?: string
  descriptionEn?: string
  accentColor: string
  points: number
  zone: Zone
  badgeUrl?: string | null
  badgeThumbUrl?: string | null
  photoUrl?: string | null
  photoThumbUrl?: string | null
  activeDays: string[]
  isPrizeDesk: boolean
  active: boolean
  sortOrder: number
  organizerUid?: string | null
  createdAt: unknown
}

export interface ScanDoc {
  visitorId: string
  boothId: string
  eventId: string
  scannedAt: unknown
  day: string
  pointsAwarded: number
  counter: number
  uaHash: string
  ipPrefix: string
  visitorType?: VisitorType
  institution?: string
  school?: string | null
  countryCode?: string
  isInternational?: boolean
}

export interface PrizeTierDoc {
  eventId: string
  name: string
  thresholdPoints: number
  reward: string
  stockTotal: number
  stockRemaining: number
  outOfStockNoteTh?: string
  outOfStockNoteEn?: string
  grantsDrawEntry: boolean
  active: boolean
  sortOrder: number
}

export interface TierUnlockDoc {
  visitorId: string
  tierId: string
  unlockedAt: unknown
  pointsAtUnlock: number
  stampCountAtUnlock: number
  redeemedAt?: unknown
  redeemedBy?: string | null
  redemptionNote?: string | null
  voidedAt?: unknown
  voidedBy?: string | null
  voidReason?: string | null
}

export interface InviteDoc {
  email: string
  displayName: string
  boothId: string | null
  role: 'organizer' | 'admin'
  tokenHash: string
  status: 'sent' | 'opened' | 'accepted' | 'revoked' | 'expired'
  sentAt: unknown
  sentBy: string
  openedAt?: unknown
  acceptedAt?: unknown
  expiresAt: unknown
  acceptedUid?: string | null
}

export interface EventStatsShard {
  visitors: number
  stamps: number
  points: number
  redeemed: number
  byVisitorType: Partial<Record<VisitorType, number>>
  byCountry: Record<string, number>
  byInstitution: Record<string, number>
  bySchool: Record<string, number>
  byDay: Record<string, { visitors?: number; stamps?: number }>
  pointsBuckets?: Record<string, number>
}

export interface BoothStats {
  boothId: string
  stamps: number
  rank?: number
  byVisitorType: Partial<Record<VisitorType, number>>
  byDay: Record<string, number>
  byHour: Record<string, number>
  lastStampAt?: unknown
  updatedAt?: unknown
}

export interface BucketDoc {
  startsAt: unknown
  day: string
  total: number
  perBooth: Record<string, number>
}

export const STATS_SHARDS = 10

/** Scan result codes returned by the `scan` callable — spec §4.3. */
export type ScanResult =
  | { status: 'success'; boothId: string; pointsAwarded: number; points: number; stampCount: number; unlockedTierIds: string[] }
  | { status: 'already'; boothId: string }
  | { status: 'expired' }
  | { status: 'invalid' }
  | { status: 'rate_limited' }
  | { status: 'not_registered' }

export function dayOf(date: Date, tz = 'Asia/Bangkok'): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function hourOf(date: Date, tz = 'Asia/Bangkok'): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date)
}

export function passportNo(seq: number, prefix: string = DEFAULT_PASSPORT_PREFIX): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

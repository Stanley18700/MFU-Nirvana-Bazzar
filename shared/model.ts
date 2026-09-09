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
  '#E0533D', '#1B52A8', '#1E8A6E', '#C8A24A', '#7B4EA8', '#D4762A', '#2A7FB8', '#B23A63', '#4E8B32',
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
  /** Arc text on the generated fallback stamp (spec 2.5) — e.g. 'MFU GO GLOBAL'. */
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

// ---------- booth surveys (§4.3 follow-on) ----------

/**
 * One survey per booth, built by that booth's organizer and offered to a visitor straight
 * after they collect the booth's stamp. Answering is optional and never affects the stamp or
 * the points — the passport mechanic must not depend on a form being finished.
 */
export type QuestionKind =
  | 'short' | 'paragraph' | 'choice' | 'checkboxes' | 'dropdown' | 'scale' | 'rating' | 'date'

export interface SurveyQuestion {
  id: string
  kind: QuestionKind
  title: string
  /** Help text under the title. */
  help?: string
  required: boolean
  imageUrl?: string | null
  /** choice | checkboxes | dropdown */
  options?: string[]
  /** scale */
  scaleMin?: number
  scaleMax?: number
  scaleMinLabel?: string
  scaleMaxLabel?: string
  /** rating — how many stars. */
  stars?: number
}

export interface SurveyDoc {
  boothId: string
  eventId: string
  title: string
  description?: string
  headerImageUrl?: string | null
  questions: SurveyQuestion[]
  /** Off by default: a half-built survey must never reach a visitor. */
  active: boolean
  responseCount: number
  updatedAt: unknown
  updatedBy: string
}

/** A single answer. `string[]` is checkboxes; `number` is scale and rating. */
export type SurveyAnswer = string | string[] | number

/**
 * Deliberately holds NO visitor identity — not in a field and not in the document id, because
 * booth organizers can read this collection. §10's rule for sensitive answers is that they are
 * never shown per person, and the cheapest way to honour that is not to store the link here at
 * all. `surveyTaken/{visitorId}_{boothId}` carries the "already answered" marker instead, and
 * only the visitor and an admin can read it.
 */
export interface SurveyResponseDoc {
  boothId: string
  eventId: string
  /** Keyed by question id. A skipped optional question is simply absent. */
  answers: Record<string, SurveyAnswer>
  submittedAt: unknown
}

export interface SurveyTakenDoc {
  boothId: string
  takenAt: unknown
}

export const QUESTION_KINDS: Array<{ kind: QuestionKind; label: string; hasOptions: boolean }> = [
  { kind: 'short', label: 'Short answer', hasOptions: false },
  { kind: 'paragraph', label: 'Paragraph', hasOptions: false },
  { kind: 'choice', label: 'Multiple choice', hasOptions: true },
  { kind: 'checkboxes', label: 'Checkboxes', hasOptions: true },
  { kind: 'dropdown', label: 'Dropdown', hasOptions: true },
  { kind: 'scale', label: 'Linear scale', hasOptions: false },
  { kind: 'rating', label: 'Star rating', hasOptions: false },
  { kind: 'date', label: 'Date', hasOptions: false },
]

export const QUESTION_LIMIT = 30
export const OPTION_LIMIT = 20

export function hasOptions(kind: QuestionKind): boolean {
  return kind === 'choice' || kind === 'checkboxes' || kind === 'dropdown'
}

/** A new question of the given kind, with the defaults that make it immediately usable. */
export function blankQuestion(kind: QuestionKind, id: string): SurveyQuestion {
  const q: SurveyQuestion = { id, kind, title: '', required: false }
  if (hasOptions(kind)) q.options = ['', '']
  if (kind === 'scale') { q.scaleMin = 1; q.scaleMax = 5 }
  if (kind === 'rating') q.stars = 5
  return q
}

/** True when a visitor has left this question blank — used for the `required` check on both sides. */
export function answerIsEmpty(a: SurveyAnswer | undefined): boolean {
  if (a === undefined || a === null) return true
  if (typeof a === 'string') return a.trim() === ''
  if (Array.isArray(a)) return a.length === 0
  return false
}

/**
 * Structural problems an organizer can see and fix, in the order the questions appear. Shared so
 * the builder can refuse to save exactly what the callable would refuse to accept.
 */
export function surveyProblems(title: string, questions: SurveyQuestion[]): string[] {
  const out: string[] = []
  if (!title.trim()) out.push('The survey needs a title.')
  if (questions.length === 0) out.push('Add at least one question.')
  if (questions.length > QUESTION_LIMIT) out.push(`At most ${QUESTION_LIMIT} questions.`)
  questions.forEach((q, i) => {
    const at = `Question ${i + 1}`
    if (!q.title.trim()) out.push(`${at} has no question text.`)
    if (hasOptions(q.kind)) {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) out.push(`${at} needs at least two options.`)
      if (opts.length > OPTION_LIMIT) out.push(`${at} has more than ${OPTION_LIMIT} options.`)
      if (new Set(opts).size !== opts.length) out.push(`${at} has two identical options.`)
    }
    if (q.kind === 'scale') {
      const lo = q.scaleMin ?? 1, hi = q.scaleMax ?? 5
      if (!(hi > lo)) out.push(`${at}: the scale's top must be above its bottom.`)
      if (hi - lo > 10) out.push(`${at}: a scale wider than 11 points is unreadable on a phone.`)
    }
  })
  return out
}

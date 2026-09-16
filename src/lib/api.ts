import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { ApplyPointsInput, ApplyPointsResult, PointPreview } from '../../shared/points'
import type { PrizeSession, Role, ScanResult, SurveyAnswer, SurveyQuestion, VisitorType, Zone } from '../../shared/model'

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name)
  return async (data: Req): Promise<Res> => (await fn(data)).data
}

export interface JoinInput {
  displayName: string
  visitorType: VisitorType
  studentId?: string
  institution: string
  institutionOther?: string
  school?: string
  countryCode: string
  ethnicGroup?: string
  ethnicConsent?: boolean
  consent: boolean
}

export const api = {
  // visitor
  join: call<JoinInput, { ok: true; passportNo: string; existing: boolean }>('join'),
  scan: call<{ payload: string }, ScanResult>('scan'),
  /** One to five stars for a booth already stamped. `already` means this visitor had rated it before. */
  rateBooth: call<{ boothId: string; stars: number; comment?: string }, { ok: true; already: boolean }>('rateBooth'),
  redemptionCode: call<Record<string, never>, { code: string; counter: number; period: number; payload: string; serverTime: number }>('redemptionCode'),
  /** Copies the address on the Auth account onto users/{uid} after an email change. */
  syncAccount: call<Record<string, never>, { ok: true; synced: boolean; contact: string | null; contactVerified?: boolean }>('syncAccount'),
  /** Idempotent: `existing` is true when a request was already on file; `requestedAt` is when it was filed. */
  requestErasure: call<Record<string, never>, { ok: true; existing: boolean; requestedAt: number | null }>('requestErasure'),
  // organizer
  boothSession: call<{ boothId?: string }, { boothId: string; booth: Record<string, unknown>; secret: string; period: number; serverTime: number }>('boothSession'),
  lookupRedemption: call<RedemptionCred, LookupResult>('lookupRedemption'),
  confirmRedemption: call<RedemptionCred & { tierId: string }, ConfirmResult>('confirmRedemption'),
  voidRedemption: call<{ visitorId: string; tierId: string; reason: string }, { ok: true }>('voidRedemption'),
  // admin
  previewPointAdjustments: call<Record<string, never>, PointPreview>('previewPointAdjustments'),
  applyPointAdjustments: call<ApplyPointsInput, ApplyPointsResult>('applyPointAdjustments'),
  resetPointAdjustments: call<Record<string, never>, { ok: true; cleared: number }>('resetPointAdjustments'),
  setUserRole: call<{ uid: string; role: Role; boothId?: string }, { ok: true }>('setUserRole'),
  /** `password` is optional; without one the account exists but cannot sign in. A visitor gets a passport number. */
  createUser: call<CreateUserInput, { uid: string; passportNo: string | null }>('createUser'),
  /** Only the keys sent are changed; an empty string clears an optional field. */
  updateUser: call<UpdateUserInput, { ok: true }>('updateUser'),
  /** `hard` is the PDPA erasure: account, passport, stamps and unlocks all go. */
  deleteUser: call<{ uid: string; hard?: boolean }, { ok: true }>('deleteUser'),
  dismissErasureRequest: call<{ uid: string; reason: string }, { ok: true }>('dismissErasureRequest'),
  createBooth: call<BoothInput, { id: string }>('createBooth'),
  updateBooth: call<Partial<BoothInput> & { id: string }, { ok: true }>('updateBooth'),
  deleteBooth: call<{ id: string }, { ok: true; deactivated: boolean }>('deleteBooth'),
  rotateBoothSecret: call<{ id: string }, { ok: true }>('rotateBoothSecret'),
  savePrizePolicy: call<{ tiers: TierInput[]; dryRun?: boolean }, { ok?: true; preview: Record<string, number>; available: number }>('savePrizePolicy'),
  adjustStock: call<{ tierId: string; delta: number; reason: string; kind?: 'load-in' | 'restock' | 'correction' }, { ok: true }>('adjustStock'),
  /** How many each session starts with, for sessions nobody has spent from yet. Not a top-up: see adjustStock. */
  setSessionAllowance: call<{ tierId: string; stockPerSession: number; reason: string }, { ok: true; stockPerSession: number; previousPerSession: number }>('setSessionAllowance'),
  saveRefData: call<
    { name: 'institutions' | 'mfuSchools' } & { list: string[] }
    | { name: 'ethnicGroups'; byCountry: Record<string, string[]> },
    { ok: true; count?: number; countries?: number }
  >('saveRefData'),
  /** Ask to run a booth when nobody has your email address. Grants nothing — an admin decides. */
  requestBoothAccess: call<{ boothId?: string; newBoothName?: string; note?: string }, { ok: true; status: 'pending' }>('requestBoothAccess'),
  decideStaffRequest: call<{ uid: string; approve: boolean; boothId?: string; decisionNote?: string }, { ok: true; approved: boolean; boothId?: string; boothName?: string; createdBooth?: string | null }>('decideStaffRequest'),
  runDraw: call<{ count: number }, { winners: Array<{ uid: string; displayName: string; passportNo: string }>; poolSize: number }>('runDraw'),
  inviteOrganizer: call<{ invites: Array<{ name: string; email: string; boothId?: string; role?: Role }> }, { results: Array<{ inviteId: string; email: string; mailed: boolean; link: string }>; mailConfigured: boolean }>('inviteOrganizer'),
  resendInvite: call<{ inviteId: string }, { mailed: boolean; link: string }>('resendInvite'),
  revokeInvite: call<{ inviteId: string }, { ok: true }>('revokeInvite'),
  inviteInfo: call<{ token: string }, { status: 'invalid' | 'revoked' | 'accepted' | 'expired' } | { status: 'ok'; displayName: string; email: string; role: Role; boothId: string | null; boothName: string }>('inviteInfo'),
  acceptInvite: call<{ token: string }, { ok: true; role: Role; boothId: string | null }>('acceptInvite'),
  refreshRanks: call<Record<string, never>, { ok: true }>('refreshRanks'),
  /** For the dashboard readiness checklist. */
  setupStatus: call<Record<string, never>, { mailConfigured: boolean }>('setupStatus'),
  // admin: event lifecycle
  listEvents: call<Record<string, never>, { liveId: string; events: EventRow[]; accents: readonly string[] }>('listEvents'),
  createEvent: call<EventInput, { id: string }>('createEvent'),
  updateEvent: call<Partial<EventInput> & { id: string }, { ok: true }>('updateEvent'),
  /** Drafts only; a live or archived event is refused. */
  deleteEvent: call<{ id: string }, { ok: true }>('deleteEvent'),
  goLive: call<{ id: string }, { ok: true }>('goLive'),
  archiveEvent: call<{ id: string; confirmName: string }, { ok: true; totals: EventTotals; boothCount: number; tierCount: number }>('archiveEvent'),
  purgeEventData: call<{ eventId: string; scope: PurgeScope; limit?: number; hard?: boolean }, { scope: PurgeScope; deleted: number; remaining: number; done: boolean }>('purgeEventData'),
  bootstrapAdmin: call<{ key: string; displayName?: string }, { ok: true }>('bootstrapAdmin'),
  // booth surveys — an organizer builds one for their own booth; an admin must name the booth
  saveSurvey: call<SurveyInput, { ok: true }>('saveSurvey'),
  setSurveyActive: call<{ active: boolean; boothId?: string; gateGift?: boolean }, { ok: true; active: boolean; gateGift?: boolean }>('setSurveyActive'),
  deleteSurvey: call<{ boothId?: string }, { ok: true }>('deleteSurvey'),
  /** What the visitor is offered after a stamp. 'none' when the booth has no live survey. */
  surveyForBooth: call<{ boothId: string }, SurveyOffer>('surveyForBooth'),
  submitSurveyResponse: call<{ boothId: string; answers: Record<string, SurveyAnswer> }, { ok: true }>('submitSurveyResponse'),
}

export interface CreateUserInput {
  displayName: string
  contact: string
  role: Role
  boothId?: string
  password?: string
  visitorType?: VisitorType
  countryCode?: string
  institution?: string
  school?: string
  studentId?: string
}

export type UpdateUserInput = { uid: string } & Partial<{
  displayName: string
  contact: string
  studentId: string
  institution: string
  school: string
  visitorType: VisitorType
  countryCode: string
}>

export interface SurveyInput {
  /** Admin only — an organizer's booth comes from their claim and this is ignored. */
  boothId?: string
  title: string
  description?: string
  headerImageUrl?: string | null
  questions: SurveyQuestion[]
  active: boolean
}

export type SurveyOffer =
  | { status: 'none' }
  | { status: 'done' }
  | { status: 'ok'; title: string; description: string; headerImageUrl: string | null; questions: SurveyQuestion[] }

export interface EventInput {
  id?: string
  nameEn: string
  nameTh?: string
  /** Milliseconds since the epoch. */
  startsAt: number
  endsAt: number
  days?: string[]
  qrPeriodSeconds?: number
  passportPrefix?: string
  zonePoints?: Record<Zone, number>
  /** Omit to leave the windows alone; send the whole set to replace them. */
  prizeSessions?: PrizeSession[]
}

export interface EventRow {
  id: string
  nameEn: string
  nameTh: string
  startsAt: number | null
  endsAt: number | null
  days: string[]
  qrPeriodSeconds: number
  passportPrefix: string
  zonePoints: Record<Zone, number>
  prizeSessions: PrizeSession[]
  status: 'draft' | 'live' | 'archived'
  boothCount: number
}

export interface EventTotals { visitors: number; stamps: number; points: number; redeemed: number }

/**
 * One step of the archive-and-restart purge (spec 7.1). `booths` / `prizeTiers` start the
 * next event blank; `resetTierStock` / `rotateSecrets` are what you run instead when
 * carrying them over.
 */
export type PurgeScope =
  | 'scans' | 'tierUnlocks' | 'stockAdjustments' | 'draws' | 'buckets' | 'invites' | 'rateLimits'
  | 'visitors' | 'boothStats' | 'eventStats' | 'counters'
  | 'booths' | 'prizeTiers' | 'resetTierStock' | 'rotateSecrets'

export interface BoothInput {
  id?: string
  nameEn: string
  nameTh?: string
  shortName?: string
  hostUnit?: string
  location?: string
  descriptionEn?: string
  accentColor?: string
  points?: number
  adjustmentExcluded?: boolean
  zone?: Zone
  activeDays?: string[]
  isPrizeDesk?: boolean
  active?: boolean
  sortOrder?: number
  badgeUrl?: string | null
  badgeThumbUrl?: string | null
  photoUrl?: string | null
  photoThumbUrl?: string | null
}

export interface TierInput {
  id?: string
  name: string
  thresholdPoints: number
  reward: string
  stockTotal?: number
  grantsDrawEntry?: boolean
  active?: boolean
  outOfStockNoteEn?: string
}

/**
 * What the prize desk hands the server: the scanned `/r/` payload, or — typed by hand — the
 * visitor's passport number and the 8-character code from their Prize page (§4.4).
 */
export type RedemptionCred = { payload: string } | { passportNo: string; code: string }

/** The prize session that is open now — `null` when the desk is shut. */
export type OpenSession = { id: string; label: string; day: string }
/** When the desk next opens. `at` is 'HH:MM' in Asia/Bangkok, `day` is 'YYYY-MM-DD'. */
export type NextOpening = { day: string; at: string; label: string }

/**
 * The desk's two refusals are deliberately separate, and neither may be shown as the other.
 * `desk_closed` means the window is shut and says nothing about stock; `out_of_stock` means the
 * window is open and this session's gifts are gone. Either way the visitor keeps every point.
 *
 * `nextOpensAt` is null on `out_of_stock` in practice: the server only computes a next opening
 * when no session is active, and that branch requires an active one. The desk works out when to
 * tell someone to come back with `nextPrizeSession` from shared/model.
 */
export type ConfirmResult =
  | { status: 'redeemed' }
  | { status: 'already'; redeemedAt: number; redeemedBy: string | null; redeemedByName: string | null }
  | { status: 'desk_closed'; nextOpensAt: NextOpening | null }
  | { status: 'out_of_stock'; note: string; nextOpensAt: NextOpening | null }

export type LookupResult =
  | { status: 'invalid' }
  | {
      status: 'ok'
      visitor: { uid: string; displayName: string; passportNo?: string; points: number; stampCount: number }
      /**
       * Mutually exclusive, though both keys are always sent: the server fills `nextOpensAt`
       * only when nothing is open, so a non-null `session` always comes with a null
       * `nextOpensAt`. Both null means the desk is shut and will not open again.
       */
      session: OpenSession | null
      nextOpensAt: NextOpening | null
      tiers: Array<{
        id: string; name: string; reward: string; thresholdPoints: number; stockRemaining: number; stockTotal: number
        /**
         * Gifts left in the session that is open now — the number the desk actually spends.
         * `null` means the desk is closed, which is NOT `0`: never render it as "0 left".
         * `stockPerSession` is null for a tier that uses the single event-wide pool instead.
         */
        sessionRemaining: number | null
        stockPerSession: number | null
        outOfStockNote: string; unlocked: boolean; redeemedAt: number | null; redeemedBy: string | null; redeemedByName: string | null
      }>
    }

export function errorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (!err) return 'Something went wrong'
  const msg = err.message ?? 'Something went wrong'
  return msg.replace(/^functions\//, '').replace(/^[A-Z_-]+:\s*/i, '')
}

/**
 * The same error as a sentence for booth staff, who cannot act on "Requires role: organizer"
 * or "deadline-exceeded". Admin pages keep `errorMessage`, whose server text names the field.
 */
export function friendlyError(e: unknown): string {
  const code = ((e as { code?: string })?.code ?? '').replace(/^functions\//, '')
  switch (code) {
    case 'permission-denied': return 'This account is not allowed to do that. Ask the admin to check your booth and role.'
    case 'unauthenticated': return 'You are signed out — sign in again.'
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal': return 'No connection to the server — check the Wi-Fi and try again.'
    case 'not-found': return 'That booth no longer exists. Ask the admin to assign you a booth.'
    default: return errorMessage(e)
  }
}

import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { Role, ScanResult, VisitorType, Zone } from '../../shared/model'

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
  redemptionCode: call<Record<string, never>, { code: string; counter: number; period: number; payload: string; serverTime: number }>('redemptionCode'),
  /** Copies the address on the Auth account onto users/{uid} after an email change. */
  syncAccount: call<Record<string, never>, { ok: true; synced: boolean; contact: string | null; contactVerified?: boolean }>('syncAccount'),
  /** Idempotent: `existing` is true when a request was already on file; `requestedAt` is when it was filed. */
  requestErasure: call<Record<string, never>, { ok: true; existing: boolean; requestedAt: number | null }>('requestErasure'),
  // organizer
  boothSession: call<{ boothId?: string }, { boothId: string; booth: Record<string, unknown>; secret: string; period: number; serverTime: number }>('boothSession'),
  lookupRedemption: call<{ payload: string }, LookupResult>('lookupRedemption'),
  confirmRedemption: call<{ payload: string; tierId: string }, { status: 'redeemed' } | { status: 'already'; redeemedAt: number; redeemedBy: string | null } | { status: 'out_of_stock'; note: string }>('confirmRedemption'),
  voidRedemption: call<{ visitorId: string; tierId: string; reason: string }, { ok: true }>('voidRedemption'),
  // admin
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
  saveRefData: call<
    { name: 'institutions' | 'mfuSchools' } & { list: string[] }
    | { name: 'ethnicGroups'; byCountry: Record<string, string[]> },
    { ok: true; count?: number; countries?: number }
  >('saveRefData'),
  runDraw: call<{ count: number }, { winners: Array<{ uid: string; displayName: string; passportNo: string }>; poolSize: number }>('runDraw'),
  inviteOrganizer: call<{ invites: Array<{ name: string; email: string; boothId?: string; role?: Role }> }, { results: Array<{ inviteId: string; email: string; mailed: boolean; link?: string }>; mailConfigured: boolean }>('inviteOrganizer'),
  resendInvite: call<{ inviteId: string }, { mailed: boolean; link?: string }>('resendInvite'),
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

export type LookupResult =
  | { status: 'invalid' }
  | {
      status: 'ok'
      visitor: { uid: string; displayName: string; passportNo?: string; points: number; stampCount: number }
      tiers: Array<{
        id: string; name: string; reward: string; thresholdPoints: number; stockRemaining: number; stockTotal: number
        outOfStockNote: string; unlocked: boolean; redeemedAt: number | null; redeemedBy: string | null
      }>
    }

export function errorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (!err) return 'Something went wrong'
  const msg = err.message ?? 'Something went wrong'
  return msg.replace(/^functions\//, '').replace(/^[A-Z_-]+:\s*/i, '')
}

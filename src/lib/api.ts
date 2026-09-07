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
  contact: string
  consent: boolean
}

export const api = {
  // visitor
  join: call<JoinInput, { ok: true; passportNo: string; existing: boolean }>('join'),
  scan: call<{ payload: string }, ScanResult>('scan'),
  redemptionCode: call<Record<string, never>, { code: string; counter: number; period: number; payload: string; serverTime: number }>('redemptionCode'),
  requestRestore: call<{ contact: string }, { ok: true }>('requestRestore'),
  requestErasure: call<Record<string, never>, { ok: true }>('requestErasure'),
  // organizer
  boothSession: call<{ boothId?: string }, { boothId: string; booth: Record<string, unknown>; secret: string; period: number; serverTime: number }>('boothSession'),
  lookupRedemption: call<{ payload: string }, LookupResult>('lookupRedemption'),
  confirmRedemption: call<{ payload: string; tierId: string }, { status: 'redeemed' } | { status: 'already'; redeemedAt: number; redeemedBy: string | null } | { status: 'out_of_stock'; note: string }>('confirmRedemption'),
  voidRedemption: call<{ visitorId: string; tierId: string; reason: string }, { ok: true }>('voidRedemption'),
  // admin
  setUserRole: call<{ uid: string; role: Role; boothId?: string }, { ok: true }>('setUserRole'),
  createUser: call<{ displayName: string; contact: string; role: Role; boothId?: string; institution?: string }, { uid: string }>('createUser'),
  updateUser: call<Record<string, unknown> & { uid: string }, { ok: true }>('updateUser'),
  deleteUser: call<{ uid: string; hard?: boolean }, { ok: true }>('deleteUser'),
  createBooth: call<BoothInput, { id: string }>('createBooth'),
  updateBooth: call<Partial<BoothInput> & { id: string }, { ok: true }>('updateBooth'),
  deleteBooth: call<{ id: string }, { ok: true; deactivated: boolean }>('deleteBooth'),
  rotateBoothSecret: call<{ id: string }, { ok: true }>('rotateBoothSecret'),
  savePrizePolicy: call<{ tiers: TierInput[]; dryRun?: boolean }, { ok?: true; preview: Record<string, number>; available: number }>('savePrizePolicy'),
  adjustStock: call<{ tierId: string; delta: number; reason: string; kind?: 'load-in' | 'restock' | 'correction' }, { ok: true }>('adjustStock'),
  runDraw: call<{ count: number }, { winners: Array<{ uid: string; displayName: string; passportNo: string }>; poolSize: number }>('runDraw'),
  inviteOrganizer: call<{ invites: Array<{ name: string; email: string; boothId?: string; role?: Role }> }, { results: Array<{ inviteId: string; email: string; mailed: boolean; link?: string }>; mailConfigured: boolean }>('inviteOrganizer'),
  resendInvite: call<{ inviteId: string }, { mailed: boolean; link?: string }>('resendInvite'),
  revokeInvite: call<{ inviteId: string }, { ok: true }>('revokeInvite'),
  inviteInfo: call<{ token: string }, { status: 'invalid' | 'revoked' | 'accepted' | 'expired' } | { status: 'ok'; displayName: string; email: string; role: Role; boothId: string | null; boothName: string }>('inviteInfo'),
  acceptInvite: call<{ token: string }, { ok: true; role: Role; boothId: string | null }>('acceptInvite'),
  refreshRanks: call<Record<string, never>, { ok: true }>('refreshRanks'),
  bootstrapAdmin: call<{ key: string; displayName?: string }, { ok: true }>('bootstrapAdmin'),
}

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

import { dayOf, type BoothDoc } from './model'

export const POINT_WINDOW_MS = 30 * 60_000
export const POINT_COOLDOWN_MS = 15 * 60_000
export const POINT_PREVIEW_MS = 5 * 60_000

// A prize desk is excluded from the automatic balancer by `eligibleForAdjustment`, so a scheduled
// value on one can only have been set deliberately (the planner's morning rate for ED7, say).
// Honour it here like any other booth rather than silently falling back to the base value.
export function effectivePoints(booth: Pick<BoothDoc, 'points' | 'temporaryPoints' | 'pointsExpireAt' | 'adjustmentExcluded' | 'active' | 'activeDays'>, now: number): number {
  return booth.active && !booth.adjustmentExcluded
    && booth.activeDays.includes(dayOf(new Date(now)))
    && typeof booth.temporaryPoints === 'number' && Number.isFinite(booth.temporaryPoints)
    && booth.temporaryPoints >= 1 && booth.temporaryPoints <= 100
    && (booth.pointsExpireAt ?? 0) > now
    ? booth.temporaryPoints : booth.points
}

export type AdjustmentReason = 'quiet' | 'typical' | 'busy'
export interface PointSuggestion {
  boothId: string
  name: string
  scans: number
  basePoints: number
  currentPoints: number
  suggestedPoints: number
  reason: AdjustmentReason
}
export interface PointPreview {
  id: string
  eventId: string
  createdAt: number
  validUntil: number
  windowStart: number
  windowEnd: number
  nextApplyAt: number
  average: number
  totalScans: number
  minimumScans: number
  sufficient: boolean
  rows: PointSuggestion[]
  availablePoints: number
  unreachableTiers: Array<{ name: string; thresholdPoints: number }>
}
export interface ApplyPointsInput { previewId: string }
export interface ApplyPointsResult { ok: true; appliedAt: number; expiresAt: number; nextApplyAt: number }

export function pointWindow(now: number) {
  const windowEnd = Math.floor(now / POINT_PREVIEW_MS) * POINT_PREVIEW_MS
  return { windowStart: windowEnd - POINT_WINDOW_MS, windowEnd }
}

export function eligibleForAdjustment(booth: BoothDoc, eventId: string, day: string) {
  return booth.eventId === eventId && booth.active && !booth.isPrizeDesk
    && !booth.adjustmentExcluded && booth.activeDays.includes(day)
}

export function suggestPoints(booths: Array<BoothDoc & { id: string }>, counts: Record<string, number>, now: number) {
  const totalScans = booths.reduce((sum, b) => sum + (counts[b.id] ?? 0), 0)
  const average = booths.length ? totalScans / booths.length : 0
  const minimumScans = booths.length * 5
  const sufficient = booths.length >= 3 && totalScans >= minimumScans
  const rows: PointSuggestion[] = booths.map((b) => {
    const scans = counts[b.id] ?? 0
    const reason: AdjustmentReason = scans < average * 0.75 ? 'quiet' : scans > average * 1.25 ? 'busy' : 'typical'
    const multiplier = reason === 'quiet' ? 1.25 : reason === 'busy' ? 0.75 : 1
    return { boothId: b.id, name: b.nameEn, scans, basePoints: b.points,
      currentPoints: effectivePoints(b, now),
      suggestedPoints: sufficient ? Math.max(1, Math.min(100, Math.round(b.points * multiplier))) : effectivePoints(b, now), reason }
  })
  return { rows, average, totalScans, minimumScans, sufficient }
}

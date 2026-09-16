import { dayOf, type BoothDoc } from './model'

/*
 * What a booth is worth, and when the hall is asked to send more people to it.
 *
 * Two independent layers, in two independent pairs of fields:
 *
 *   scheduled value  `temporaryPoints` until `pointsExpireAt`, else `points`
 *                    Set deliberately by an admin or a script — the planner's "27 in the
 *                    morning, 15 in the afternoon". Nothing in this file ever writes it.
 *
 *   boost            `boostPoints` EXTRA until `boostUntil`
 *                    Added on top of the scheduled value for a quiet booth, for 30 minutes,
 *                    after an admin has approved it. The balancer writes only these two fields
 *                    and "reset" clears only these two fields, so a boost can never destroy a
 *                    scheduled value — which is exactly what the previous design did.
 *
 * A booth is worth scheduled + boost, capped at 100. A scan freezes that number into the stamp.
 *
 * Boost-only, by decision (16 Sep 2026): a busy booth is never worth less than its scheduled
 * value. Exhibitors know their number and it only ever goes up; visitors are never surprised
 * downward on arrival.
 */

/** Scans compared: the last 30 completed minutes, on a 5-minute boundary. */
export const POINT_WINDOW_MS = 30 * 60_000
/** A booth with no scan at all in this long is treated as not open rather than quiet. */
export const POINT_LIVENESS_MS = 60 * 60_000
/** How long an approved boost lasts. */
export const BOOST_MS = 30 * 60_000
/** Minimum gap between two approvals. */
export const POINT_COOLDOWN_MS = 15 * 60_000
/** A preview is good for this long before it must be regenerated. */
export const POINT_PREVIEW_MS = 5 * 60_000
/** The admin page re-checks on this cadence (:00, :15, :30, :45). */
export const POINT_CHECK_MS = 15 * 60_000
/** No suggestions until the hall has been open this long — the first half hour is arrivals. */
export const EVENT_WARMUP_MS = 30 * 60_000

/** A group needs this many comparable booths before anyone in it can be called quiet. */
export const MIN_GROUP_SIZE = 4
/** …and its median booth must have at least this many scans in the window. */
export const MIN_GROUP_MEDIAN = 3
/** Quiet = below this share of the group median. */
export const QUIET_RATIO = 0.6
/** Boost as a share of the booth's current value: this much at the quiet line… */
export const BOOST_MIN = 0.25
/** …rising to this much for a booth with no scans at all. */
export const BOOST_MAX = 0.35
/** Never more than this many boosts live in one group at once. */
export const MAX_BOOSTS_PER_GROUP = 3
/** Booths whose scheduled values differ by at most this much are compared with each other. */
export const GROUP_TOLERANCE = 1

type PointFields = Pick<BoothDoc, 'points' | 'temporaryPoints' | 'pointsExpireAt' | 'boostPoints' | 'boostUntil' | 'adjustmentExcluded' | 'active' | 'activeDays'>

function validPoints(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 100
}
function liveToday(booth: PointFields, now: number) {
  return booth.active && !booth.adjustmentExcluded && booth.activeDays.includes(dayOf(new Date(now)))
}

/**
 * The booth's value before any boost: its scheduled value while that is current, else base.
 * A prize desk is excluded from the balancer by `eligibleForAdjustment`, so a scheduled value on
 * one can only have been set deliberately; honour it like any other booth.
 */
export function scheduledPoints(booth: PointFields, now: number): number {
  return liveToday(booth, now) && validPoints(booth.temporaryPoints) && (booth.pointsExpireAt ?? 0) > now
    ? booth.temporaryPoints : booth.points
}

/** The extra points a live boost is adding right now, or 0. */
export function activeBoost(booth: PointFields, now: number): number {
  return liveToday(booth, now) && validPoints(booth.boostPoints) && (booth.boostUntil ?? 0) > now
    ? booth.boostPoints : 0
}

/** What a scan is worth at `now`: scheduled value plus any live boost, never above 100. */
export function effectivePoints(booth: PointFields, now: number): number {
  return Math.min(100, scheduledPoints(booth, now) + activeBoost(booth, now))
}

/**
 * The next moment this booth's value changes, and what it changes to — or null if nothing
 * scheduled or boosted is live. Used for the "Until 10:45 · then 27 points" line.
 */
export function nextPointChange(booth: PointFields, now: number): { at: number; points: number } | null {
  const marks: number[] = []
  if (activeBoost(booth, now) > 0) marks.push(booth.boostUntil!)
  if (scheduledPoints(booth, now) !== booth.points) marks.push(booth.pointsExpireAt!)
  if (!marks.length) return null
  const at = Math.min(...marks)
  return { at, points: effectivePoints(booth, at) }
}

export type BoostReason =
  | 'quiet'        // below the quiet line and offered a boost
  | 'typical'      // comparable, not quiet
  | 'no-scans'     // nothing in the last hour: probably not open, never boosted
  | 'boosted'      // already carrying a live boost; left alone until it ends
  | 'capped'       // quiet, but the group already has its three
  | 'small-group'  // too few comparable booths or too quiet a median to judge anyone

export interface BoostSuggestion {
  boothId: string
  name: string
  groupKey: string
  /** Scans in the compared window (one per visitor per booth). */
  scans: number
  /** Scans in the liveness window — is anyone at all being stamped here? */
  recentScans: number
  basePoints: number
  /** The value before boosts, right now. */
  currentPoints: number
  /** A boost already live on the booth, if any. */
  activeBoost: number
  /** The EXTRA points proposed; 0 for every row that is not offered a boost. */
  boostPoints: number
  /** currentPoints + boostPoints, what a scan would be worth if applied. */
  suggestedPoints: number
  reason: BoostReason
}

export interface BoostGroup {
  key: string
  /** "27–28 points" — the scheduled values that share this group. */
  label: string
  size: number
  comparable: number
  median: number
  sufficient: boolean
  /** Booths offered a boost this round. */
  offered: number
  /** Booths already carrying a live boost. */
  live: number
}

export interface PointPreview {
  id: string
  eventId: string
  createdAt: number
  validUntil: number
  windowStart: number
  windowEnd: number
  /** Nothing is offered before this moment (opening + warm-up). */
  notBefore: number
  nextApplyAt: number
  /** The next :00/:15/:30/:45 the admin page will check on its own. */
  nextCheckAt: number
  totalScans: number
  groups: BoostGroup[]
  rows: BoostSuggestion[]
  /** True when at least one boost is on offer. */
  sufficient: boolean
  /** How many booths are offered a boost this round. */
  offered: number
  availablePoints: number
  unreachableTiers: Array<{ name: string; thresholdPoints: number }>
}
export interface ApplyPointsInput { previewId: string }
export interface ApplyPointsResult { ok: true; appliedAt: number; expiresAt: number; nextApplyAt: number; boosted: number }

/** The last 30 completed minutes, ending on a 5-minute boundary so two admins see the same window. */
export function pointWindow(now: number) {
  const windowEnd = Math.floor(now / POINT_PREVIEW_MS) * POINT_PREVIEW_MS
  return { windowStart: windowEnd - POINT_WINDOW_MS, windowEnd, livenessStart: windowEnd - POINT_LIVENESS_MS }
}

/** The next quarter-hour boundary strictly after `now`. */
export function nextCheck(now: number) {
  return (Math.floor(now / POINT_CHECK_MS) + 1) * POINT_CHECK_MS
}

export function eligibleForAdjustment(booth: BoothDoc, eventId: string, day: string) {
  return booth.eventId === eventId && booth.active && !booth.isPrizeDesk
    && !booth.adjustmentExcluded && booth.activeDays.includes(day)
}

function median(values: number[]) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Cluster booths by their current scheduled value: values within GROUP_TOLERANCE of a neighbour
 * share a group, so 27 and 28 compare with each other, as do 15 and 16, while 12 stands alone.
 */
function groupBooths(rows: Array<{ boothId: string; currentPoints: number }>) {
  const values = [...new Set(rows.map((r) => r.currentPoints))].sort((a, b) => a - b)
  const clusters: number[][] = []
  for (const v of values) {
    const last = clusters[clusters.length - 1]
    if (last && v - last[last.length - 1] <= GROUP_TOLERANCE) last.push(v)
    else clusters.push([v])
  }
  const keyOf = new Map<number, string>()
  const labelOf = new Map<string, string>()
  for (const c of clusters) {
    const key = `${c[0]}-${c[c.length - 1]}`
    labelOf.set(key, c.length === 1 ? `${c[0]} points` : `${c[0]}–${c[c.length - 1]} points`)
    for (const v of c) keyOf.set(v, key)
  }
  return { keyOf, labelOf }
}

/** The boost for a quiet booth: BOOST_MIN at the quiet line, BOOST_MAX at zero scans. */
export function boostFor(currentPoints: number, scans: number, groupMedian: number) {
  const line = groupMedian * QUIET_RATIO
  const quietness = line > 0 ? Math.min(1, Math.max(0, 1 - scans / line)) : 1
  const share = BOOST_MIN + (BOOST_MAX - BOOST_MIN) * quietness
  const extra = Math.max(1, Math.round(currentPoints * share))
  return Math.max(0, Math.min(extra, 100 - currentPoints))
}

/**
 * Which quiet booths to offer a boost, and why every other booth is left alone.
 *
 * `counts` is scans per booth in the compared window; `recent` is scans per booth in the
 * liveness window (a superset). Both count one scan per visitor per booth.
 */
export function suggestBoosts(
  booths: Array<BoothDoc & { id: string }>, counts: Record<string, number>, recent: Record<string, number>, now: number,
  opts: { tooEarly?: boolean } = {},
) {
  const base = booths.map((b) => ({
    boothId: b.id, name: b.nameEn, scans: counts[b.id] ?? 0, recentScans: Math.max(recent[b.id] ?? 0, counts[b.id] ?? 0),
    basePoints: b.points, currentPoints: scheduledPoints(b, now), activeBoost: activeBoost(b, now),
  }))
  const { keyOf, labelOf } = groupBooths(base)
  const groups: BoostGroup[] = []
  const rows: BoostSuggestion[] = []

  for (const [key, label] of labelOf) {
    const members = base.filter((r) => keyOf.get(r.currentPoints) === key)
    const comparable = members.filter((r) => r.recentScans > 0)
    const med = median(comparable.map((r) => r.scans))
    const sufficient = !opts.tooEarly && comparable.length >= MIN_GROUP_SIZE && med >= MIN_GROUP_MEDIAN
    const live = members.filter((r) => r.activeBoost > 0)
    // Quietest first; a tie goes to the booth lower in the running order, so the outcome is stable.
    const quiet = sufficient
      ? comparable.filter((r) => r.activeBoost === 0 && r.scans < med * QUIET_RATIO)
        .sort((a, b) => a.scans - b.scans || a.boothId.localeCompare(b.boothId))
      : []
    const room = Math.max(0, MAX_BOOSTS_PER_GROUP - live.length)
    const offered = new Set(quiet.slice(0, room).map((r) => r.boothId))
    const capped = new Set(quiet.slice(room).map((r) => r.boothId))

    for (const r of members) {
      const reason: BoostReason = r.activeBoost > 0 ? 'boosted'
        : r.recentScans === 0 ? 'no-scans'
        : !sufficient ? 'small-group'
        : offered.has(r.boothId) ? 'quiet'
        : capped.has(r.boothId) ? 'capped'
        : 'typical'
      const boostPoints = reason === 'quiet' ? boostFor(r.currentPoints, r.scans, med) : 0
      rows.push({ ...r, groupKey: key, boostPoints, suggestedPoints: Math.min(100, r.currentPoints + r.activeBoost + boostPoints), reason })
    }
    groups.push({ key, label, size: members.length, comparable: comparable.length, median: med, sufficient, offered: offered.size, live: live.length })
  }

  // Highest-value groups first, then running order inside a group — the order the admin thinks in.
  groups.sort((a, b) => Number(b.key.split('-')[0]) - Number(a.key.split('-')[0]))
  const order = new Map(booths.map((b, i) => [b.id, i]))
  rows.sort((a, b) => groups.findIndex((g) => g.key === a.groupKey) - groups.findIndex((g) => g.key === b.groupKey)
    || (order.get(a.boothId) ?? 0) - (order.get(b.boothId) ?? 0))

  const totalScans = base.reduce((sum, r) => sum + r.scans, 0)
  const offered = rows.filter((r) => r.boostPoints > 0).length
  return { rows, groups, totalScans, offered, sufficient: offered > 0 }
}

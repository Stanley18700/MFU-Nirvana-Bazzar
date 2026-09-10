import { useMemo } from 'react'
import { useBooths, useBoothStats, useBuckets, useEvent, useEventStats, useTiers } from '../../lib/data'
import { countryName } from '../../lib/countries'
import type { CsvRow } from '../../lib/csv'
import type { StringKey } from '../../lib/strings'

/** `'all'` or one of the event's `YYYY-MM-DD` days. */
export type DaySel = string

const VISITOR_TYPES = ['student', 'staff', 'alumni', 'guest'] as const

/**
 * Everything the dashboard derives from the ~120 live stats documents (§6.1), in one place so
 * the screen, its CSV exports and the print view can never disagree about a number.
 */
export function useDashboardModel(day: DaySel) {
  const event = useEvent()
  const ev = useEventStats()
  const booths = useBooths(true)
  const { data: bstats } = useBoothStats()
  const buckets = useBuckets(96)
  const tiers = useTiers()

  const scoped = useMemo(() => {
    if (day === 'all') return { visitors: ev.totals.visitors, stamps: ev.totals.stamps }
    return { visitors: ev.totals.byDay[day]?.visitors ?? 0, stamps: ev.totals.byDay[day]?.stamps ?? 0 }
  }, [day, ev.totals])

  const board = useMemo(() => booths.filter((b) => b.active).map((b) => {
    const s = bstats.find((x) => x.id === b.id)
    const n = day === 'all' ? s?.stamps ?? 0 : s?.byDay?.[day] ?? 0
    return { ...b, stamps: n }
  }).sort((a, b) => b.stamps - a.stamps), [booths, bstats, day])
  const max = Math.max(1, ...board.map((b) => b.stamps))
  const lowest = useMemo(() => new Set(board.length > 4 ? board.slice(-3).map((b) => b.id) : []), [board])

  const timeline = useMemo(() => [...buckets]
    .filter((b) => day === 'all' || b.day === day)
    .sort((a, b) => (a.startsAt as { toMillis(): number }).toMillis() - (b.startsAt as { toMillis(): number }).toMillis())
    .map((b) => ({ t: new Date((b.startsAt as { toMillis(): number }).toMillis()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), stamps: b.total })), [buckets, day])

  const countries = useMemo(() => Object.entries(ev.totals.byCountry).sort((a, b) => b[1] - a[1]), [ev.totals.byCountry])
  const thai = ev.totals.byCountry.TH ?? 0
  const intl = ev.totals.visitors - thai
  const institutions = useMemo(() => Object.entries(ev.totals.byInstitution).sort((a, b) => b[1] - a[1]).slice(0, 10), [ev.totals.byInstitution])
  const schools = useMemo(() => Object.entries(ev.totals.bySchool).sort((a, b) => b[1] - a[1]).slice(0, 10), [ev.totals.bySchool])
  const visitorTypes = VISITOR_TYPES.map((k) => [k, ev.totals.byVisitorType[k] ?? 0] as [string, number])
  /**
   * A key for the screen and the English for the CSV. The exports are the raw material for the
   * project report and get opened in Excel next to last year's, so their field values stay
   * English whatever the console is set to; only what is on screen follows the toggle.
   */
  const funnel: Array<{ key: StringKey; en: string; value: number }> = [
    { key: 'funnel.registered', en: 'Registered', value: ev.totals.visitors },
    { key: 'funnel.oneStamp', en: '1+ stamp', value: ev.totals.visitorsWithStamps },
    { key: 'funnel.tierReached', en: 'Tier reached', value: ev.totals.tierReached },
    { key: 'funnel.redeemed', en: 'Redeemed', value: ev.totals.redeemed },
  ]

  // §4.1 — small-count suppression: groups under 5 fold into Other, and the whole panel stays
  // hidden until 20 visitors have consented.
  const ethnicFolded = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(ev.totals.byEthnicGroup)) out[v < 5 ? 'Other' : k] = (out[v < 5 ? 'Other' : k] ?? 0) + v
    return Object.entries(out).sort((a, b) => b[1] - a[1])
  }, [ev.totals.byEthnicGroup])
  const ethnicVisible = ev.totals.ethnicResponses >= 20
  const ethnicRate = Math.round((ev.totals.ethnicResponses / Math.max(1, ev.totals.ethnicResponses + ev.totals.ethnicDeclines)) * 100)

  const stock = useMemo(() => tiers.filter((t) => t.active).map((t) => {
    const pct = t.stockTotal ? t.stockRemaining / t.stockTotal : 0
    return { id: t.id, name: t.name, remaining: t.stockRemaining, total: t.stockTotal, pct, tone: t.stockRemaining <= 5 ? '#D94A48' : pct < 0.2 ? '#DC8A2A' : '#4C764F' }
  }), [tiers])

  const cross = useMemo(() => crossSchoolTable(ev.totals.crossSchool, booths), [ev.totals.crossSchool, booths])

  const csv = useMemo(() => ({
    leaderboard: board.map((b) => ({ booth: b.nameEn, stamps: b.stamps, points: b.points, zone: b.zone })) as CsvRow[],
    timeline: timeline.map((t) => ({ time: t.t, stamps: t.stamps })) as CsvRow[],
    participation: [
      { metric: 'Thai', value: thai }, { metric: 'International', value: intl },
      ...visitorTypes.map(([k, v]) => ({ metric: k, value: v })),
      ...funnel.map((f) => ({ metric: `funnel: ${f.en}`, value: f.value })),
    ] as CsvRow[],
    countries: countries.map(([c, n]) => ({ code: c, country: countryName(c), visitors: n })) as CsvRow[],
    institutions: [
      ...institutions.map(([k, n]) => ({ kind: 'institution', name: k, visitors: n })),
      ...schools.map(([k, n]) => ({ kind: 'mfu-school', name: k, visitors: n })),
    ] as CsvRow[],
    crossSchool: cross.rows.map(([school, r]) => ({
      school, ...Object.fromEntries(cross.cols.map((c) => [c.shortName, r[c.id] ?? 0])), total: Object.values(r).reduce((s, n) => s + n, 0),
    })) as CsvRow[],
    stock: stock.map((t) => ({ tier: t.name, remaining: t.remaining, total: t.total, percentRemaining: Math.round(t.pct * 100) })) as CsvRow[],
    ethnic: (ethnicVisible ? ethnicFolded.map(([g, n]) => ({ group: g, visitors: n })) : []) as CsvRow[],
  }), [board, timeline, thai, intl, visitorTypes, funnel, countries, institutions, schools, cross, stock, ethnicVisible, ethnicFolded])

  return {
    event, ev, booths, tiers, scoped, board, max, lowest, timeline,
    countries, thai, intl, institutions, schools, visitorTypes, funnel,
    ethnicFolded, ethnicVisible, ethnicRate, ethnicResponses: ev.totals.ethnicResponses,
    stock, cross, csv,
  }
}

export type CrossCol = { id: string; shortName: string; hostUnit: string }

/** The cross-school matrix as the screen shows it: top 12 visitor schools, only booths someone from those schools visited. */
export function crossSchoolTable(matrix: Record<string, Record<string, number>>, booths: CrossCol[]) {
  const rows = Object.entries(matrix)
    .sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0))
    .slice(0, 12)
  const cols = booths.filter((b) => rows.some(([, r]) => r[b.id]))
  const max = Math.max(1, ...rows.flatMap(([, r]) => Object.values(r)))
  return { rows, cols, max }
}

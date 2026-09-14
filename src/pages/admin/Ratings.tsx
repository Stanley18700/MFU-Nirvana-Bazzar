import { useMemo, useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useBooths, useCollection } from '../../lib/data'
import { CsvButton, DataError, fmt } from '../../components/ui'
import { Select } from '../../components/Select'
import { ts } from '../../lib/eventText'
import { useLocale } from '../../lib/locale'
import { ratingAverage, type BoothRatingDoc, type BoothRatingStatsDoc } from '../../../shared/model'

/** Newest first, and capped: a comment feed is for reading, and nobody reads past a few hundred. */
const COMMENT_PAGE = 300

/**
 * What the hall thought of each booth.
 *
 * Two reads, deliberately separate. The table comes from `stats/ratings/items` — one small
 * pre-aggregated document per booth, the same shape as every other counter in the app, so this
 * page costs 76 document reads however many thousand ratings are behind them. The comment feed
 * reads `boothRatings` itself, newest first, because the text is the one thing an aggregate
 * cannot hold.
 *
 * Neither collection carries a visitor id (§10). A comment here cannot be traced to a person,
 * and that is a property of the data, not of this page.
 */
export default function Ratings() {
  const { t } = useLocale()
  const booths = useBooths(true)
  const stats = useCollection<BoothRatingStatsDoc>(collection(db, 'stats/ratings/items'), [], 'the rating counters')
  const comments = useCollection<BoothRatingDoc>(
    query(collection(db, 'boothRatings'), orderBy('ratedAt', 'desc'), limit(COMMENT_PAGE)),
    [], 'the comments',
  )

  const [boothFilter, setBoothFilter] = useState('')
  const [sort, setSort] = useState<'name' | 'best' | 'worst' | 'most'>('best')

  const names = useMemo(() => new Map(booths.map((b) => [b.id, b.nameEn])), [booths])
  const statFor = useMemo(() => new Map(stats.data.map((s) => [s.id, s])), [stats.data])

  /** Every active booth appears, rated or not: "nobody has rated it" is itself worth seeing. */
  const rows = useMemo(() => {
    const out = booths.map((b) => {
      const s = statFor.get(b.id)
      const count = s?.count ?? 0
      return {
        boothId: b.id,
        name: b.nameEn,
        count,
        comments: s?.comments ?? 0,
        avg: ratingAverage(s),
        dist: s?.dist ?? {},
      }
    })
    const byName = (a: typeof out[number], b: typeof out[number]) => a.name.localeCompare(b.name)
    // Unrated booths sink in every score sort — an average of nothing is not a bad average.
    if (sort === 'best') out.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || byName(a, b))
    if (sort === 'worst') out.sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99) || byName(a, b))
    if (sort === 'most') out.sort((a, b) => b.count - a.count || byName(a, b))
    if (sort === 'name') out.sort(byName)
    return out
  }, [booths, statFor, sort])

  const total = rows.reduce((n, r) => n + r.count, 0)
  const overall = total ? rows.reduce((n, r) => n + (r.avg ?? 0) * r.count, 0) / total : null

  const feed = boothFilter ? comments.data.filter((c) => c.boothId === boothFilter) : comments.data
  const withText = feed.filter((c) => c.comment)

  const csvRows = rows.map((r) => ({
    booth: r.name, boothId: r.boothId,
    responses: r.count,
    average: r.avg == null ? '' : r.avg.toFixed(2),
    '1': r.dist['1'] ?? 0, '2': r.dist['2'] ?? 0, '3': r.dist['3'] ?? 0, '4': r.dist['4'] ?? 0, '5': r.dist['5'] ?? 0,
    comments: r.comments,
  }))

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.ratings.title')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('admin.ratings.lead')}</p>
        </div>
        <CsvButton rows={csvRows} name="booth-ratings" />
      </header>

      <DataError error={stats.error} what="the rating counters" />

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t('admin.ratings.responses')} value={fmt(total)} />
        <Tile label={t('admin.ratings.average')} value={overall == null ? '–' : overall.toFixed(2)} />
        <Tile label={t('admin.ratings.rated')} value={`${fmt(rows.filter((r) => r.count > 0).length)} / ${fmt(rows.length)}`} />
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('admin.ratings.byBooth')}</h2>
          <Select
            className="w-52"
            ariaLabel={t('admin.ratings.sort')}
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={[
              { value: 'best', label: t('admin.ratings.sort.best') },
              { value: 'worst', label: t('admin.ratings.sort.worst') },
              { value: 'most', label: t('admin.ratings.sort.most') },
              { value: 'name', label: t('admin.ratings.sort.name') },
            ]}
          />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="py-2 pr-3">{t('admin.ratings.booth')}</th>
                <th className="py-2 pr-3 text-right">{t('admin.ratings.avgShort')}</th>
                <th className="py-2 pr-3 text-right">{t('admin.ratings.n')}</th>
                <th className="py-2">{t('admin.ratings.spread')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.boothId} className="border-t border-rule">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="fig py-2 pr-3 text-right">{r.avg == null ? '–' : r.avg.toFixed(2)}</td>
                  <td className="fig py-2 pr-3 text-right text-ink-soft">{fmt(r.count)}</td>
                  <td className="py-2"><Spread dist={r.dist} count={r.count} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('admin.ratings.comments')}</h2>
          <Select
            className="w-64"
            ariaLabel={t('admin.ratings.filterBooth')}
            value={boothFilter}
            onChange={setBoothFilter}
            options={[{ value: '', label: t('admin.ratings.allBooths') }, ...booths.map((b) => ({ value: b.id, label: b.nameEn }))]}
          />
        </div>
        <DataError error={comments.error} what="the comments" />
        {withText.length === 0
          ? <p className="mt-3 text-sm text-ink-soft">{t('admin.ratings.noComments')}</p>
          : (
            <ul className="mt-3 space-y-2">
              {withText.map((c) => (
                <li key={c.id} className="rounded-xl border border-rule bg-white p-3">
                  <div className="flex items-baseline justify-between gap-3 text-xs text-ink-soft">
                    <span>{names.get(c.boothId) ?? c.boothId}</span>
                    <span>{ts(c.ratedAt)}</span>
                  </div>
                  <div className="mt-1 text-foil" aria-label={`${c.stars} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden className={n <= c.stars ? '' : 'opacity-20'}>★</span>)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
        {comments.data.length >= COMMENT_PAGE && (
          <p className="mt-3 text-xs text-ink-soft">{t('admin.ratings.capped', { n: fmt(COMMENT_PAGE) })}</p>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="fig mt-1 text-2xl">{value}</div>
    </div>
  )
}

/**
 * Five stacked bars, one per score. An average of 3 hides the difference between a booth
 * everyone found middling and a booth half the hall loved and half walked away from, and that
 * difference is the only actionable thing on this page.
 */
function Spread({ dist, count }: { dist: Record<string, number>; count: number }) {
  if (!count) return <span className="text-xs text-ink-soft">–</span>
  return (
    <div className="flex h-4 w-full min-w-[8rem] overflow-hidden rounded-full bg-ink/5">
      {[1, 2, 3, 4, 5].map((n) => {
        const v = dist[String(n)] ?? 0
        if (!v) return null
        // Red at one star through gold at five: the eye reads the shape before the numbers.
        const color = ['#C2410C', '#EA8C3A', '#D9B44A', '#8FBF6A', '#4E9A51'][n - 1]
        return (
          <div
            key={n}
            title={`${n}★ — ${v}`}
            style={{ width: `${(v / count) * 100}%`, background: color }}
          />
        )
      })}
    </div>
  )
}

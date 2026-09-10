import { Link, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { useDashboardModel } from './useDashboardModel'
import { eventDateLine } from '../../lib/eventText'
import { countryName } from '../../lib/countries'
import { Icon, fmt } from '../../components/ui'
import { useLocale } from '../../lib/locale'
import { useLabels } from '../../lib/labels'
import type { VisitorType } from '../../../shared/model'

/**
 * §6.1 — "the whole dashboard exports to a one-page PDF summary for the project report". This
 * is that page, printed through the browser: a single column that fits A4, fixed-size charts
 * (Recharts' ResponsiveContainer does not re-measure under print media), no navigation.
 * Opened from the dashboard's "Print / PDF" link with the same day selection.
 */
export default function Print() {
  const [params] = useSearchParams()
  const day = params.get('day') || 'all'
  const m = useDashboardModel(day)
  const { t, locale } = useLocale()
  const { VISITOR_TYPE_LABEL } = useLabels()
  const dayIndex = m.event.days.indexOf(day)
  const dayLabel = day === 'all' ? t('print.allDays') : `${t('print.day', { n: dayIndex + 1 })} · ${day}`
  const generated = new Date().toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' })
  const age = m.ev.updatedAt ? t('print.countersAge', { min: Math.round((Date.now() - m.ev.updatedAt) / 60000) }) : t('print.countersLive')

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-[190mm] p-6 text-[11px] leading-snug text-[#17414E] print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink/5 p-3 print:hidden">
          <span className="text-sm">{t('print.hint')}</span>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => window.print()}>{Icon.print}{t('print.print')}</button>
            <Link to="/admin" className="btn-ghost">{t('print.back')}</Link>
          </div>
        </div>

        <header className="border-b-2 border-[#17414E] pb-2">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#1F5A6B]">{m.event.nameEn} · {eventDateLine(m.event, false)}</div>
          <h1 className="text-xl font-bold">{t('print.title')} · {dayLabel}</h1>
          <div className="text-[9px] text-[#1F5A6B]">{t('print.generated', { when: generated })} · {age}</div>
        </header>

        <section className="mt-3 grid grid-cols-4 gap-2">
          {([
            [t('print.visitors'), m.scoped.visitors], [t('print.stamps'), m.scoped.stamps],
            [t('print.redeemed'), m.ev.totals.redeemed], [t('print.active15'), m.ev.activeLast15m],
          ] as Array<[string, number]>).map(([l, v]) => (
            <div key={l} className="rounded-lg border border-[#17414E]/15 p-2">
              <div className="text-2xl font-bold leading-none">{fmt(v)}</div>
              <div className="mt-1 text-[9px] uppercase tracking-wider text-[#1F5A6B]">{l}</div>
            </div>
          ))}
        </section>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Panel title={t('print.leaderboard')}>
            <table className="w-full">
              <tbody>
                {m.board.map((b, i) => (
                  <tr key={b.id} className="border-t border-[#17414E]/10">
                    <td className="py-0.5 pr-1 text-right text-[#1F5A6B]">{i + 1}</td>
                    <td className="py-0.5"><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: b.accentColor }} />{b.nameEn}</td>
                    <td className="py-0.5 text-right font-semibold">{fmt(b.stamps)}</td>
                    <td className="py-0.5 pl-2 text-right text-[#1F5A6B]">{b.points} pts</td>
                  </tr>
                ))}
                {m.board.length === 0 && <tr><td className="py-1 text-[#1F5A6B]">{t('print.noBooths')}</td></tr>}
              </tbody>
            </table>
          </Panel>

          <Panel title={t('print.perFive')}>
            {m.timeline.length === 0 ? <p className="text-[#1F5A6B]">{t('print.noScans')}</p> : (
              <AreaChart width={330} height={150} data={m.timeline} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(23,38,63,.12)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#1F5A6B' }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={{ fontSize: 9, fill: '#1F5A6B' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Area type="monotone" dataKey="stamps" stroke="#1A8AA6" strokeWidth={1.5} fill="rgba(26,138,166,.18)" dot={false} isAnimationActive={false} />
              </AreaChart>
            )}
          </Panel>

          <Panel title={t('print.countries', { count: m.countries.length })}>
            <TwoCol rows={m.countries.slice(0, 12).map(([c, n]) => [countryName(c), n])} empty={t('print.noRegistrations')} />
          </Panel>

          <Panel title={t('print.participation')}>
            <div className="grid grid-cols-3 gap-1">
              {/* The visitor types used to print their raw keys — 'student', 'guest'. */}
              {([[t('print.thai'), m.thai], [t('print.international'), m.intl],
                ...m.visitorTypes.map(([k, v]) => [VISITOR_TYPE_LABEL[k as VisitorType] ?? k, v] as [string, number]),
              ] as Array<[string, number]>).map(([l, v]) => (
                <div key={l}><span className="text-base font-bold">{fmt(v)}</span> <span className="text-[9px] uppercase text-[#1F5A6B]">{l}</span></div>
              ))}
            </div>
            <div className="mt-2 text-[9px] uppercase tracking-wider text-[#1F5A6B]">{t('print.funnelTitle')}</div>
            <TwoCol rows={m.funnel.map((f) => [t(f.key), f.value])} />
          </Panel>

          <Panel title={t('print.institutions')}>
            <TwoCol rows={m.institutions} empty="—" />
          </Panel>
          <Panel title={t('print.schools')}>
            <TwoCol rows={m.schools} empty="—" />
          </Panel>

          <Panel title={t('print.stock')}>
            <table className="w-full">
              <tbody>
                {m.stock.map((t) => (
                  <tr key={t.id} className="border-t border-[#17414E]/10">
                    <td className="py-0.5">{t.name}</td>
                    <td className="py-0.5 text-right font-semibold">{fmt(t.remaining)} <span className="font-normal text-[#1F5A6B]">/ {fmt(t.total)}</span></td>
                    <td className="py-0.5 pl-2 text-right" style={{ color: t.tone }}>{Math.round(t.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {m.cross.rows.length > 0 && (
            <Panel title={t('print.cross')}>
              <table className="w-full text-[9px]">
                <thead><tr><th className="text-left font-normal text-[#1F5A6B]">{t('print.school')}</th>{m.cross.cols.map((c) => <th key={c.id} className="px-0.5 text-center">{c.shortName}</th>)}</tr></thead>
                <tbody>
                  {m.cross.rows.map(([school, r]) => (
                    <tr key={school} className="border-t border-[#17414E]/10"><td className="max-w-[28mm] truncate py-0.5">{school}</td>{m.cross.cols.map((c) => <td key={c.id} className="px-0.5 py-0.5 text-center">{r[c.id] || ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {m.ethnicVisible && (
            <Panel title={t('print.ethnic', { rate: m.ethnicRate })}>
              <TwoCol rows={m.ethnicFolded} />
            </Panel>
          )}
        </div>

        <footer className="mt-3 border-t border-[#17414E]/15 pt-1 text-[8px] text-[#1F5A6B]">
          {t('print.footer')}
        </footer>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#1F5A6B]">{title}</h2>
      {children}
    </section>
  )
}

function TwoCol({ rows, empty }: { rows: Array<[string, number]>; empty?: string }) {
  const { t } = useLocale()
  if (!rows.length) return <p className="text-[#1F5A6B]">{empty ?? t('print.nothingYet')}</p>
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([k, n]) => <tr key={k} className="border-t border-[#17414E]/10"><td className="max-w-[60mm] truncate py-0.5">{k}</td><td className="py-0.5 text-right font-semibold">{fmt(n)}</td></tr>)}
      </tbody>
    </table>
  )
}

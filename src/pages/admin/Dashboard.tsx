import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CsvButton, Fig, Flag, fmt } from '../../components/ui'
import { countryName } from '../../lib/countries'
import { dayOf } from '../../../shared/model'
import { useDashboardModel, type DaySel } from './useDashboardModel'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { Readiness } from './Readiness'
import { useLocale } from '../../lib/locale'
import { useLabels } from '../../lib/labels'
import type { VisitorType } from '../../../shared/model'

/** §6.1 — the live dashboard. Reads ~120 small documents, never a scan collection. */
export default function Dashboard() {
  const { t } = useLocale()
  const { VISITOR_TYPE_LABEL } = useLabels()
  const today = dayOf(new Date())
  const dayTabs = useSlidingPill()
  const [day, setDay] = useState<DaySel>('all')
  const m = useDashboardModel(day)
  const eventDays = m.event.days
  useEffect(() => { setDay(eventDays.includes(today) ? today : 'all') }, [eventDays, today])
  const { ev, board, max, lowest, timeline, countries, institutions, schools, stock, csv } = m

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="stamp-text text-ink-soft">
            {t('dash.live')} · {t(ev.fromCache ? 'dash.reconnecting' : 'dash.connected')}
            {ev.updatedAt ? ` · ${t('dash.countersAge', { min: Math.round((Date.now() - ev.updatedAt) / 60000) })}` : ''}
          </div>
          <h1 className="text-2xl font-bold">{t('dash.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div ref={dayTabs} className="tab-group flex gap-1" role="tablist" aria-label={t('dash.daySelector')}>
            {([...eventDays, 'all'] as DaySel[]).map((d, i) => (
              <button key={d} role="tab" aria-selected={day === d} onClick={() => setDay(d)} className="tab">{d === 'all' ? t('dash.allDays') : t('print.day', { n: i + 1 })}</button>
            ))}
          </div>
          {/* Opens in a new tab so the live dashboard stays put; the print view has its own Save-as-PDF button. */}
          <Link to={`/admin/print?day=${day}`} target="_blank" rel="noopener" className="btn-ghost text-sm">{t('dash.printPdf')}</Link>
        </div>
      </header>

      <Readiness />

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fig value={fmt(m.scoped.visitors)} label={t('print.visitors')} />
        <Fig value={fmt(m.scoped.stamps)} label={t('print.stamps')} accent="#1A8AA6" />
        <Fig value={fmt(ev.totals.redeemed)} label={t('print.redeemed')} accent="#9A5A0F" />
        <Fig value={fmt(ev.activeLast15m)} label={t('print.active15')} accent="#4C764F" />
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('dash.leaderboard')}</h2><CsvButton name="leaderboard" rows={csv.leaderboard} /></div>
          <ol className="mt-3 flex flex-col gap-2">
            {board.map((b, i) => (
              // The fixed columns only fit from `sm` up. Below that the name takes the row and the
              // bar, the count and the note sit under it, rather than 396px of tracks fighting over 303.
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:flex-nowrap">
                <span className="w-5 shrink-0 text-right text-ink-soft">{i + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.accentColor }} />
                <span className="min-w-0 flex-1 truncate font-medium lg:w-40 lg:flex-none">{b.nameEn}</span>
                <div className="relative order-1 h-5 w-full min-w-0 flex-1 overflow-hidden rounded bg-ink/5 lg:order-none lg:w-auto">
                  <div className="h-full rounded" style={{ width: `${(b.stamps / max) * 100}%`, background: i === 0 && b.stamps > 0 ? '#F5C63C' : lowest.has(b.id) ? '#DC8A2A' : b.accentColor, opacity: 0.85 }} />
                </div>
                <span className="fig order-1 w-12 shrink-0 text-right text-base lg:order-none">{fmt(b.stamps)}</span>
                <span className="order-1 shrink-0 text-right text-xs lg:order-none lg:w-24">{i === 0 && b.stamps > 0 ? <span className="text-foil">{t('dash.topBooth')}</span> : lowest.has(b.id) ? <span className="text-warn-text">{t('dash.needsTraffic')}</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('print.perFive')}</h2><CsvButton name="timeline" rows={csv.timeline} /></div>
          <div className="mt-3 h-64">
            {timeline.length === 0 ? <p className="grid h-full place-items-center text-sm text-ink-soft">{t('print.noScans')}</p> : (
              <ResponsiveContainer>
                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1A8AA6" stopOpacity={0.35} /><stop offset="100%" stopColor="#1A8AA6" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="rgba(23,38,63,.1)" />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#1F5A6B' }} axisLine={false} tickLine={false} minTickGap={32} />
                  <YAxis tick={{ fontSize: 11, fill: '#1F5A6B' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
                  <Area type="monotone" dataKey="stamps" stroke="#1A8AA6" strokeWidth={2} fill="url(#g)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('print.participation')}</h2><CsvButton name="participation" rows={csv.participation} /></div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><div className="fig text-2xl">{fmt(m.thai)}</div><div className="stamp-text text-ink-soft">{t('print.thai')}</div></div>
            <div><div className="fig text-2xl">{fmt(m.intl)}</div><div className="stamp-text text-ink-soft">{t('print.international')}</div></div>
            {/* These printed the raw enum key — 'student', 'staff' — before the labels existed. */}
            {m.visitorTypes.slice(0, 2).map(([k, v]) => <div key={k}><div className="fig text-2xl">{fmt(v)}</div><div className="stamp-text text-ink-soft">{VISITOR_TYPE_LABEL[k as VisitorType] ?? k}</div></div>)}
          </div>
          <h3 className="stamp-text mt-5 text-ink-soft">{t('print.funnelTitle')}</h3>
          <Funnel steps={m.funnel.map((f) => [t(f.key), f.value] as [string, number])} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('dash.countries', { count: countries.length })}</h2><CsvButton name="countries" rows={csv.countries} /></div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {countries.slice(0, 12).map(([c, n]) => (
              <li key={c} className="flex items-center gap-2">
                <Flag code={c} /><span className="w-36 truncate">{countryName(c)}</span>
                <div className="h-3 flex-1 rounded bg-ink/5"><div className="h-full rounded bg-action/70" style={{ width: `${(n / (countries[0]?.[1] || 1)) * 100}%` }} /></div>
                <span className="fig w-10 text-right">{n}</span>
              </li>
            ))}
            {countries.length === 0 && <li className="text-ink-soft">{t('print.noRegistrations')}</li>}
          </ul>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('dash.institutions')}</h2><CsvButton name="institutions" rows={csv.institutions} /></div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
            <ul className="flex flex-col gap-1">{institutions.map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="fig">{n}</span></li>)}</ul>
            <ul className="flex flex-col gap-1">{schools.map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="fig">{n}</span></li>)}</ul>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-ink-soft">{t('dash.cross')}</h2><CsvButton name="cross-school" rows={csv.crossSchool} /></div>
          <CrossSchool rows={m.cross.rows} cols={m.cross.cols} max={m.cross.max} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="stamp-text text-ink-soft">{t('print.stock')}</h2>
            <div className="flex items-center gap-3"><CsvButton name="prize-stock" rows={csv.stock} /><Link to="/admin/prizes" className="btn-quiet btn-sm">{t('dash.manage')}</Link></div>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {stock.map((t) => (
              <li key={t.id} className="text-sm">
                <div className="flex justify-between"><span className="font-medium">{t.name}</span><span className="fig">{fmt(t.remaining)} <span className="text-ink-soft">/ {fmt(t.total)}</span></span></div>
                <div className="mt-1 h-2 rounded bg-ink/5"><div className="h-full rounded" style={{ width: `${t.pct * 100}%`, background: t.tone }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="stamp-text text-ink-soft">{t('dash.ethnic')}</h2>
            {/* §4.1: an export that touches the sensitive field asks first, even though it is already aggregated and folded. */}
            {m.ethnicVisible && <CsvButton name="ethnic-groups-aggregate" rows={csv.ethnic} confirm={t('dash.ethnicConfirm')} />}
          </div>
          {!m.ethnicVisible ? (
            <p className="mt-3 text-sm text-ink-soft">{t('dash.ethnicHidden', { count: m.ethnicResponses })}</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-soft">{t('dash.ethnicRate', { rate: m.ethnicRate })}</p>
              <ul className="mt-3 flex flex-col gap-1 text-sm">{m.ethnicFolded.map(([k, n]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="fig">{n}</span></li>)}</ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Funnel({ steps }: { steps: Array<[string, number]> }) {
  const max = Math.max(1, steps[0][1])
  return (
    <ol className="mt-2 flex flex-col gap-1.5 text-sm">
      {steps.map(([label, n]) => (
        <li key={label} className="flex items-center gap-2">
          <span className="w-24 text-ink-soft">{label}</span>
          <div className="h-4 flex-1 rounded bg-ink/5"><div className="h-full rounded bg-ink/60" style={{ width: `${(n / max) * 100}%` }} /></div>
          <span className="fig w-12 text-right">{fmt(n)}</span>
        </li>
      ))}
    </ol>
  )
}

function CrossSchool({ rows, cols, max }: { rows: Array<[string, Record<string, number>]>; cols: Array<{ id: string; shortName: string; hostUnit: string }>; max: number }) {
  const { t } = useLocale()
  if (!rows.length) return <p className="mt-3 text-sm text-ink-soft">{t('dash.crossEmpty')}</p>
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-xs">
        <thead><tr><th className="p-1 text-left font-normal text-ink-soft">{t('dash.crossHeader')}</th>{cols.map((c) => <th key={c.id} className="p-1 text-center font-semibold" title={c.hostUnit}>{c.shortName}</th>)}</tr></thead>
        <tbody>
          {rows.map(([school, r]) => (
            <tr key={school}>
              <td className="max-w-[12rem] truncate p-1 font-medium">{school}</td>
              {cols.map((c) => {
                const n = r[c.id] ?? 0
                const own = c.hostUnit.toLowerCase().includes(school.toLowerCase().replace(/^school of /, ''))
                return <td key={c.id} className="p-0.5"><div className={`grid h-7 w-9 place-items-center rounded ${own ? 'ring-1 ring-foil' : ''}`} style={{ background: `rgba(26,138,166,${0.08 + (n / max) * 0.8})`, color: n / max > 0.5 ? '#fff' : '#17414E' }}>{n || ''}</div></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-ink-soft">{t('dash.crossNote')}</p>
    </div>
  )
}

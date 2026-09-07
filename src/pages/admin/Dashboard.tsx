import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useBooths, useBoothStats, useBuckets, useEventStats, useTiers } from '../../lib/data'
import { Fig, Flag, fmt } from '../../components/ui'
import { countryName } from '../../lib/countries'
import { EVENT_DAYS, dayOf } from '../../../shared/model'

type DaySel = 'all' | (typeof EVENT_DAYS)[number]

function csv(rows: Array<Record<string, string | number>>, name: string) {
  if (!rows.length) return
  const head = Object.keys(rows[0])
  const body = rows.map((r) => head.map((h) => JSON.stringify(r[h] ?? '')).join(','))
  const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click()
}

function ExportBtn({ rows, name }: { rows: Array<Record<string, string | number>>; name: string }) {
  return <button className="text-xs text-navy-soft underline" onClick={() => csv(rows, name)}>CSV</button>
}

/** §6.1 — the live dashboard. Reads ~120 small documents, never a scan collection. */
export default function Dashboard() {
  const today = dayOf(new Date())
  const [day, setDay] = useState<DaySel>((EVENT_DAYS as readonly string[]).includes(today) ? (today as DaySel) : 'all')
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
  const lowest = new Set(board.length > 4 ? board.slice(-3).map((b) => b.id) : [])

  const timeline = useMemo(() => [...buckets]
    .filter((b) => day === 'all' || b.day === day)
    .sort((a, b) => (a.startsAt as { toMillis(): number }).toMillis() - (b.startsAt as { toMillis(): number }).toMillis())
    .map((b) => ({ t: new Date((b.startsAt as { toMillis(): number }).toMillis()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), stamps: b.total })), [buckets, day])

  const countries = Object.entries(ev.totals.byCountry).sort((a, b) => b[1] - a[1])
  const thai = ev.totals.byCountry.TH ?? 0
  const intl = ev.totals.visitors - thai
  const institutions = Object.entries(ev.totals.byInstitution).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const schools = Object.entries(ev.totals.bySchool).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const ethnic = Object.entries(ev.totals.byEthnicGroup)
  const ethnicFolded = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [k, v] of ethnic) out[v < 5 ? 'Other' : k] = (out[v < 5 ? 'Other' : k] ?? 0) + v // §4.1 small-count suppression
    return Object.entries(out).sort((a, b) => b[1] - a[1])
  }, [ethnic])

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="stamp-text text-navy-soft">Live · {ev.fromCache ? 'reconnecting' : 'connected'}{ev.updatedAt ? ` · counters ${Math.round((Date.now() - ev.updatedAt) / 60000)} min old` : ''}</div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <div className="flex rounded-lg bg-navy/5 p-1 text-sm" role="tablist" aria-label="Day selector">
          {([...EVENT_DAYS, 'all'] as DaySel[]).map((d, i) => (
            <button key={d} role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={`rounded-md px-3 py-1.5 ${day === d ? 'bg-white font-semibold shadow-sm' : 'text-navy-soft'}`}>{d === 'all' ? 'All' : `Day ${i + 1}`}</button>
          ))}
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fig value={fmt(scoped.visitors)} label="Visitors registered" />
        <Fig value={fmt(scoped.stamps)} label="Stamps collected" accent="#1B52A8" />
        <Fig value={fmt(ev.totals.redeemed)} label="Prizes redeemed" accent="#C8A24A" />
        <Fig value={fmt(ev.activeLast15m)} label="Active last 15 min" accent="#1E8A6E" />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Booth leaderboard</h2><ExportBtn name="leaderboard" rows={board.map((b) => ({ booth: b.nameEn, stamps: b.stamps, points: b.points, zone: b.zone }))} /></div>
          <ol className="mt-3 flex flex-col gap-2">
            {board.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right text-navy-soft">{i + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.accentColor }} />
                <span className="w-40 truncate font-medium">{b.nameEn}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-navy/5">
                  <div className="h-full rounded" style={{ width: `${(b.stamps / max) * 100}%`, background: i === 0 && b.stamps > 0 ? '#C8A24A' : lowest.has(b.id) ? '#D4762A' : b.accentColor, opacity: 0.85 }} />
                </div>
                <span className="fig w-12 text-right text-base">{fmt(b.stamps)}</span>
                <span className="w-24 text-right text-xs">{i === 0 && b.stamps > 0 ? <span className="text-gold">★ top booth</span> : lowest.has(b.id) ? <span className="text-amber">needs traffic</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Stamps per 5 minutes</h2><ExportBtn name="timeline" rows={timeline.map((t) => ({ time: t.t, stamps: t.stamps }))} /></div>
          <div className="mt-3 h-64">
            {timeline.length === 0 ? <p className="grid h-full place-items-center text-sm text-navy-soft">No scans yet</p> : (
              <ResponsiveContainer>
                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1B52A8" stopOpacity={0.35} /><stop offset="100%" stopColor="#1B52A8" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="rgba(23,38,63,.1)" />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#4A5872' }} axisLine={false} tickLine={false} minTickGap={32} />
                  <YAxis tick={{ fontSize: 11, fill: '#4A5872' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
                  <Area type="monotone" dataKey="stamps" stroke="#1B52A8" strokeWidth={2} fill="url(#g)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="stamp-text text-navy-soft">Participation</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><div className="fig text-2xl">{fmt(thai)}</div><div className="stamp-text text-navy-soft">Thai</div></div>
            <div><div className="fig text-2xl">{fmt(intl)}</div><div className="stamp-text text-navy-soft">International</div></div>
            {(['student', 'staff', 'alumni', 'guest'] as const).slice(0, 2).map((k) => <div key={k}><div className="fig text-2xl">{fmt(ev.totals.byVisitorType[k])}</div><div className="stamp-text text-navy-soft">{k}</div></div>)}
          </div>
          <h3 className="stamp-text mt-5 text-navy-soft">Visitor funnel</h3>
          <Funnel steps={[['Registered', ev.totals.visitors], ['1+ stamp', ev.totals.visitorsWithStamps], ['Tier reached', ev.totals.tierReached], ['Redeemed', ev.totals.redeemed]]} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Countries · {countries.length} represented</h2><ExportBtn name="countries" rows={countries.map(([c, n]) => ({ code: c, country: countryName(c), visitors: n }))} /></div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {countries.slice(0, 12).map(([c, n]) => (
              <li key={c} className="flex items-center gap-2">
                <Flag code={c} /><span className="w-36 truncate">{countryName(c)}</span>
                <div className="h-3 flex-1 rounded bg-navy/5"><div className="h-full rounded bg-stamp-blue/70" style={{ width: `${(n / (countries[0]?.[1] || 1)) * 100}%` }} /></div>
                <span className="fig w-10 text-right">{n}</span>
              </li>
            ))}
            {countries.length === 0 && <li className="text-navy-soft">No registrations yet</li>}
          </ul>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Institutions · MFU schools</h2><ExportBtn name="institutions" rows={[...institutions.map(([k, n]) => ({ kind: 'institution', name: k, visitors: n })), ...schools.map(([k, n]) => ({ kind: 'mfu-school', name: k, visitors: n }))]} /></div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
            <ul className="flex flex-col gap-1">{institutions.map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="fig">{n}</span></li>)}</ul>
            <ul className="flex flex-col gap-1">{schools.map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="fig">{n}</span></li>)}</ul>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Cross-school · who visits whose booth</h2></div>
          <CrossSchool matrix={ev.totals.crossSchool} booths={booths} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="stamp-text text-navy-soft">Prize stock</h2><Link to="/admin/prizes" className="text-xs underline text-navy-soft">Manage</Link></div>
          <ul className="mt-3 flex flex-col gap-3">
            {tiers.filter((t) => t.active).map((t) => {
              const pct = t.stockTotal ? t.stockRemaining / t.stockTotal : 0
              const tone = t.stockRemaining <= 5 ? '#E0533D' : pct < 0.2 ? '#D4762A' : '#1E8A6E'
              return (
                <li key={t.id} className="text-sm">
                  <div className="flex justify-between"><span className="font-medium">{t.name}</span><span className="fig">{fmt(t.stockRemaining)} <span className="text-navy-soft">/ {fmt(t.stockTotal)}</span></span></div>
                  <div className="mt-1 h-2 rounded bg-navy/5"><div className="h-full rounded" style={{ width: `${pct * 100}%`, background: tone }} /></div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card">
          <h2 className="stamp-text text-navy-soft">Ethnic groups · aggregate only</h2>
          {ev.totals.ethnicResponses < 20 ? (
            <p className="mt-3 text-sm text-navy-soft">Shown once at least 20 visitors have consented ({ev.totals.ethnicResponses} so far). Groups under 5 are folded into "Other".</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-navy-soft">Response rate {Math.round((ev.totals.ethnicResponses / Math.max(1, ev.totals.ethnicResponses + ev.totals.ethnicDeclines)) * 100)}% · groups under 5 folded into Other</p>
              <ul className="mt-3 flex flex-col gap-1 text-sm">{ethnicFolded.map(([k, n]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="fig">{n}</span></li>)}</ul>
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
          <span className="w-24 text-navy-soft">{label}</span>
          <div className="h-4 flex-1 rounded bg-navy/5"><div className="h-full rounded bg-navy/60" style={{ width: `${(n / max) * 100}%` }} /></div>
          <span className="fig w-12 text-right">{fmt(n)}</span>
        </li>
      ))}
    </ol>
  )
}

function CrossSchool({ matrix, booths }: { matrix: Record<string, Record<string, number>>; booths: Array<{ id: string; shortName: string; hostUnit: string }> }) {
  const rows = Object.entries(matrix).sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0)).slice(0, 12)
  if (!rows.length) return <p className="mt-3 text-sm text-navy-soft">Appears once visitors start scanning.</p>
  const cols = booths.filter((b) => rows.some(([, r]) => r[b.id]))
  const max = Math.max(1, ...rows.flatMap(([, r]) => Object.values(r)))
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-xs">
        <thead><tr><th className="p-1 text-left font-normal text-navy-soft">Visitor's school ↓ · booth →</th>{cols.map((c) => <th key={c.id} className="p-1 text-center font-semibold" title={c.hostUnit}>{c.shortName}</th>)}</tr></thead>
        <tbody>
          {rows.map(([school, r]) => (
            <tr key={school}>
              <td className="max-w-[12rem] truncate p-1 font-medium">{school}</td>
              {cols.map((c) => {
                const n = r[c.id] ?? 0
                const own = c.hostUnit.toLowerCase().includes(school.toLowerCase().replace(/^school of /, ''))
                return <td key={c.id} className="p-0.5"><div className={`grid h-7 w-9 place-items-center rounded ${own ? 'ring-1 ring-gold' : ''}`} style={{ background: `rgba(27,82,168,${0.08 + (n / max) * 0.8})`, color: n / max > 0.5 ? '#fff' : '#17263F' }}>{n || ''}</div></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-navy-soft">Gold ring = a school's own booth. Filled cells elsewhere in the row mean visitors left their own booth.</p>
    </div>
  )
}

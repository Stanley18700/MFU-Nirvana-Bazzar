import { Link, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { useDashboardModel } from './useDashboardModel'
import { eventDateLine } from '../../lib/eventText'
import { countryName } from '../../lib/countries'
import { fmt } from '../../components/ui'

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
  const dayIndex = m.event.days.indexOf(day)
  const dayLabel = day === 'all' ? 'All days' : `Day ${dayIndex + 1} · ${day}`
  const generated = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
  const age = m.ev.updatedAt ? `counters ${Math.round((Date.now() - m.ev.updatedAt) / 60000)} min old` : 'counters live'

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-[190mm] p-6 text-[11px] leading-snug text-[#17263F] print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy/5 p-3 print:hidden">
          <span className="text-sm">In the print dialog choose “Save as PDF” for the report. Landscape is not needed.</span>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
            <Link to="/admin" className="btn-ghost">Back</Link>
          </div>
        </div>

        <header className="border-b-2 border-[#17263F] pb-2">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#4A5872]">{m.event.nameEn} · {eventDateLine(m.event, false)}</div>
          <h1 className="text-xl font-bold">Passport dashboard · {dayLabel}</h1>
          <div className="text-[9px] text-[#4A5872]">Generated {generated} · {age}</div>
        </header>

        <section className="mt-3 grid grid-cols-4 gap-2">
          {([
            ['Visitors registered', m.scoped.visitors], ['Stamps collected', m.scoped.stamps],
            ['Prizes redeemed', m.ev.totals.redeemed], ['Active last 15 min', m.ev.activeLast15m],
          ] as Array<[string, number]>).map(([l, v]) => (
            <div key={l} className="rounded-lg border border-[#17263F]/15 p-2">
              <div className="text-2xl font-bold leading-none">{fmt(v)}</div>
              <div className="mt-1 text-[9px] uppercase tracking-wider text-[#4A5872]">{l}</div>
            </div>
          ))}
        </section>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Panel title="Booth leaderboard">
            <table className="w-full">
              <tbody>
                {m.board.map((b, i) => (
                  <tr key={b.id} className="border-t border-[#17263F]/10">
                    <td className="py-0.5 pr-1 text-right text-[#4A5872]">{i + 1}</td>
                    <td className="py-0.5"><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: b.accentColor }} />{b.nameEn}</td>
                    <td className="py-0.5 text-right font-semibold">{fmt(b.stamps)}</td>
                    <td className="py-0.5 pl-2 text-right text-[#4A5872]">{b.points} pts</td>
                  </tr>
                ))}
                {m.board.length === 0 && <tr><td className="py-1 text-[#4A5872]">No booths</td></tr>}
              </tbody>
            </table>
          </Panel>

          <Panel title="Stamps per 5 minutes">
            {m.timeline.length === 0 ? <p className="text-[#4A5872]">No scans yet</p> : (
              <AreaChart width={330} height={150} data={m.timeline} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(23,38,63,.12)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#4A5872' }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={{ fontSize: 9, fill: '#4A5872' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Area type="monotone" dataKey="stamps" stroke="#1B52A8" strokeWidth={1.5} fill="rgba(27,82,168,.18)" dot={false} isAnimationActive={false} />
              </AreaChart>
            )}
          </Panel>

          <Panel title={`Countries · ${m.countries.length} represented`}>
            <TwoCol rows={m.countries.slice(0, 12).map(([c, n]) => [countryName(c), n])} empty="No registrations yet" />
          </Panel>

          <Panel title="Participation">
            <div className="grid grid-cols-3 gap-1">
              {([['Thai', m.thai], ['International', m.intl], ...m.visitorTypes] as Array<[string, number]>).map(([l, v]) => (
                <div key={l}><span className="text-base font-bold">{fmt(v)}</span> <span className="text-[9px] uppercase text-[#4A5872]">{l}</span></div>
              ))}
            </div>
            <div className="mt-2 text-[9px] uppercase tracking-wider text-[#4A5872]">Visitor funnel</div>
            <TwoCol rows={m.funnel} />
          </Panel>

          <Panel title="Institutions">
            <TwoCol rows={m.institutions} empty="—" />
          </Panel>
          <Panel title="MFU schools">
            <TwoCol rows={m.schools} empty="—" />
          </Panel>

          <Panel title="Prize stock">
            <table className="w-full">
              <tbody>
                {m.stock.map((t) => (
                  <tr key={t.id} className="border-t border-[#17263F]/10">
                    <td className="py-0.5">{t.name}</td>
                    <td className="py-0.5 text-right font-semibold">{fmt(t.remaining)} <span className="font-normal text-[#4A5872]">/ {fmt(t.total)}</span></td>
                    <td className="py-0.5 pl-2 text-right" style={{ color: t.tone }}>{Math.round(t.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {m.cross.rows.length > 0 && (
            <Panel title="Cross-school · visitor's school × booth">
              <table className="w-full text-[9px]">
                <thead><tr><th className="text-left font-normal text-[#4A5872]">School</th>{m.cross.cols.map((c) => <th key={c.id} className="px-0.5 text-center">{c.shortName}</th>)}</tr></thead>
                <tbody>
                  {m.cross.rows.map(([school, r]) => (
                    <tr key={school} className="border-t border-[#17263F]/10"><td className="max-w-[28mm] truncate py-0.5">{school}</td>{m.cross.cols.map((c) => <td key={c.id} className="px-0.5 py-0.5 text-center">{r[c.id] || ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {m.ethnicVisible && (
            <Panel title={`Ethnic groups · aggregate · ${m.ethnicRate}% response`}>
              <TwoCol rows={m.ethnicFolded} />
            </Panel>
          )}
        </div>

        <footer className="mt-3 border-t border-[#17263F]/15 pt-1 text-[8px] text-[#4A5872]">
          Aggregates only — no personal data. Ethnic groups under 5 are folded into “Other” and the panel is omitted entirely below 20 consenting visitors.
        </footer>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#4A5872]">{title}</h2>
      {children}
    </section>
  )
}

function TwoCol({ rows, empty = 'Nothing yet' }: { rows: Array<[string, number]>; empty?: string }) {
  if (!rows.length) return <p className="text-[#4A5872]">{empty}</p>
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([k, n]) => <tr key={k} className="border-t border-[#17263F]/10"><td className="max-w-[60mm] truncate py-0.5">{k}</td><td className="py-0.5 text-right font-semibold">{fmt(n)}</td></tr>)}
      </tbody>
    </table>
  )
}

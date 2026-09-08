import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../lib/auth'
import { ms, useBooth, useBoothStat, useBooths, useEvent, useEventStats } from '../../lib/data'
import { OrganizerBar } from '../../components/OrganizerBar'
import { CsvButton, DataErrors, Fig, LiveDot, Notice, Spinner, fmt } from '../../components/ui'
import { clock } from '../../lib/eventText'
import { dayOf, hourOf } from '../../../shared/model'
import { VISITOR_TYPE_LABEL } from '../../lib/labels'

/** §5.3 — the organizer sees their own booth only. */
export default function BoothStats() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  const booths = useBooths(true)
  const { data: booth, loading } = useBooth(boothId)
  const { data: stat, fromCache } = useBoothStat(boothId)
  const ev = useEventStats()
  const event = useEvent()
  const days = event.days
  const todayStr = dayOf(new Date())
  const [picked, setPicked] = useState(days.includes(todayStr) ? todayStr : days[0])

  const bar = <OrganizerBar boothId={boothId} dark className="mb-4" />
  if (boothId && loading) return <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="on-navy mx-auto min-h-full max-w-2xl px-5 py-6">{bar}<Spinner label="Loading your booth…" /></main></>
  if (!boothId || !booth) {
    // Used to spin forever. A missing claim or a deleted booth is a thing to say, and a way out.
    return (
      <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="on-navy mx-auto min-h-full max-w-2xl px-5 py-6">
        {bar}
        <Notice tone="amber">{!boothId ? 'No booth is linked to this account yet — ask the admin to assign one.' : 'This booth no longer exists. Ask the admin which booth is yours.'}</Notice>
      </main></>
    )
  }

  const day = days.includes(picked) ? picked : days[0]
  const dayIndex = days.indexOf(day) + 1

  // Hours follow the event's opening times rather than a fixed 09–16, and any hour that
  // recorded a stamp outside them is shown too, so an early or late scan is never hidden.
  const start = ms(event.startsAt), end = ms(event.endsAt)
  const h0 = start ? Number(hourOf(new Date(start))) : 9
  const h1 = end ? Number(hourOf(new Date(end))) : 16
  const inRange = Array.from({ length: Math.max(1, h1 - h0 + 1) }, (_, i) => String(h0 + i).padStart(2, '0'))
  const recorded = Object.keys(stat?.byHour ?? {}).filter((k) => k.startsWith(`${day}T`)).map((k) => k.slice(day.length + 1))
  const hours = [...new Set([...inRange, ...recorded])].sort()
  const hourly = hours.map((h) => ({ hour: `${h}:00`, visitors: stat?.byHour?.[`${day}T${h}`] ?? 0 }))
  const vt = stat?.byVisitorType ?? {}
  const types = ['student', 'staff', 'alumni', 'guest'] as const
  const last = ms(stat?.lastStampAt)

  return (
    <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="on-navy mx-auto min-h-full max-w-2xl px-5 py-6">
      {bar}
      {/* `items-start`, as on the kiosk: the status sits at the top of the row, under Sign out. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <div className="stamp-text" style={{ color: booth.accentColor }}>{booth.location} · worth {booth.points} points</div>
          <h1 className="text-2xl font-bold">{booth.nameEn}</h1>
        </div>
        <LiveDot state={fromCache ? 'stale' : 'live'} dark>{fromCache ? 'Reconnecting' : 'Live'}</LiveDot>
      </div>
      <DataErrors className="mt-3" />

      <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Fig value={fmt(stat?.stamps)} label="Visitors stamped" accent={booth.accentColor}
          sub={last ? `Last at ${clock(last)}` : 'None yet'} />
        <Fig value={stat?.rank ? `#${stat.rank}` : '–'} label={`Rank of ${booths.filter((b) => b.active).length} booths`} />
        <Fig value={fmt(ev.totals.stamps)} label="Event total" />
      </section>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="stamp-text text-navy-soft">Visitors per hour · Day {dayIndex}</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Day">
              {days.map((d, i) => (
                <button key={d} role="tab" aria-selected={d === day} onClick={() => setPicked(d)}
                  className="tab bg-navy/5">
                  Day {i + 1}
                </button>
              ))}
            </div>
            <CsvButton rows={hourly.map((h) => ({ day, hour: h.hour, visitors: h.visitors }))} name={`${boothId}-hourly-${day}`} />
          </div>
        </div>
        <div className="mt-3 h-52">
          <ResponsiveContainer>
            <BarChart data={hourly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(233,229,220,.12)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgba(233,229,220,.6)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(233,229,220,.6)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(233,229,220,.08)' }} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, background: '#17263F', color: '#E9E5DC' }} itemStyle={{ color: '#E9E5DC' }} labelStyle={{ color: 'rgba(233,229,220,.6)' }} />
              <Bar dataKey="visitors" fill={booth.accentColor} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card mt-4">
        <div className="flex items-center justify-between">
          <h2 className="stamp-text text-navy-soft">Who visited</h2>
          <CsvButton rows={types.map((k) => ({ visitorType: VISITOR_TYPE_LABEL[k], visitors: vt[k] ?? 0 }))} name={`${boothId}-visitor-types`} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {types.map((k) => (
            <li key={k} className="rounded-xl bg-white/50 p-3"><div className="fig text-2xl">{fmt(vt[k])}</div><div className="stamp-text text-navy-soft">{VISITOR_TYPE_LABEL[k]}</div></li>
          ))}
        </ul>
      </section>

      <section className="card mt-4">
        <div className="flex items-center justify-between">
          <h2 className="stamp-text text-navy-soft">By day</h2>
          <CsvButton rows={days.map((d, i) => ({ day: `Day ${i + 1}`, date: d, visitors: stat?.byDay?.[d] ?? 0 }))} name={`${boothId}-by-day`} />
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {days.map((d, i) => (
            <li key={d} className="rounded-xl bg-white/50 p-3"><div className="fig text-xl xs:text-2xl">{fmt(stat?.byDay?.[d])}</div><div className="stamp-text text-navy-soft">Day {i + 1}</div></li>
          ))}
        </ul>
      </section>
    </main></>
  )
}

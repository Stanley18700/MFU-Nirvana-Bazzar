import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../lib/auth'
import { ms, useBoothStat, useBooths, useEvent, useEventStats } from '../../lib/data'
import { CsvButton, DataErrors, Fig, Spinner, fmt } from '../../components/ui'
import { dayOf, hourOf } from '../../../shared/model'

/** §5.3 — the organizer sees their own booth only. */
export default function BoothStats() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  const booths = useBooths(true)
  const booth = booths.find((b) => b.id === boothId)
  const { data: stat } = useBoothStat(boothId)
  const ev = useEventStats()
  const event = useEvent()
  const days = event.days
  const todayStr = dayOf(new Date())
  const [picked, setPicked] = useState(days.includes(todayStr) ? todayStr : days[0])
  if (!booth) return <Spinner />

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

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <Link to={role === 'admin' ? `/booth?boothId=${boothId}` : '/booth'} className="text-sm text-navy-soft">← Booth screen</Link>
      <div className="stamp-text mt-3" style={{ color: booth.accentColor }}>{booth.location} · worth {booth.points} points</div>
      <h1 className="text-2xl font-bold">{booth.nameEn}</h1>
      <DataErrors className="mt-3" />

      <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Fig value={fmt(stat?.stamps)} label="Visitors stamped" accent={booth.accentColor} />
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
                  className={`rounded-full px-3 py-1 text-xs font-medium ${d === day ? 'bg-navy text-paper' : 'bg-navy/5 text-navy-soft hover:bg-navy/10'}`}>
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
              <CartesianGrid vertical={false} stroke="rgba(23,38,63,.1)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#4A5872' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
              <YAxis tick={{ fontSize: 11, fill: '#4A5872' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(23,38,63,.06)' }} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
              <Bar dataKey="visitors" fill={booth.accentColor} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="stamp-text text-navy-soft">Who visited</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {(['student', 'staff', 'alumni', 'guest'] as const).map((k) => (
            <li key={k} className="rounded-xl bg-white/50 p-3"><div className="fig text-2xl">{fmt(vt[k])}</div><div className="stamp-text text-navy-soft">{k}</div></li>
          ))}
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="stamp-text text-navy-soft">By day</h2>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {days.map((d, i) => (
            <li key={d} className="rounded-xl bg-white/50 p-3"><div className="fig text-xl xs:text-2xl">{fmt(stat?.byDay?.[d])}</div><div className="stamp-text text-navy-soft">Day {i + 1}</div></li>
          ))}
        </ul>
      </section>
    </main>
  )
}

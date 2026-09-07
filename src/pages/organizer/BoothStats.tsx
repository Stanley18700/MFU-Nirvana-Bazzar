import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../lib/auth'
import { useBoothStat, useBooths, useEventStats } from '../../lib/data'
import { Fig, Spinner, fmt } from '../../components/ui'
import { EVENT_DAYS, dayOf } from '../../../shared/model'

/** §5.3 — the organizer sees their own booth only. */
export default function BoothStats() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  const booths = useBooths(true)
  const booth = booths.find((b) => b.id === boothId)
  const { data: stat } = useBoothStat(boothId)
  const ev = useEventStats()
  if (!booth) return <Spinner />

  const today = (EVENT_DAYS as readonly string[]).includes(dayOf(new Date())) ? dayOf(new Date()) : EVENT_DAYS[0]
  const hours = Array.from({ length: 8 }, (_, i) => `${String(9 + i).padStart(2, '0')}`)
  const hourly = hours.map((h) => ({ hour: `${h}:00`, visitors: stat?.byHour?.[`${today}T${h}`] ?? 0 }))
  const vt = stat?.byVisitorType ?? {}

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <Link to={role === 'admin' ? `/booth?boothId=${boothId}` : '/booth'} className="text-sm text-navy-soft">← Booth screen</Link>
      <div className="stamp-text mt-3" style={{ color: booth.accentColor }}>{booth.location} · worth {booth.points} points</div>
      <h1 className="text-2xl font-bold">{booth.nameEn}</h1>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fig value={fmt(stat?.stamps)} label="Visitors stamped" accent={booth.accentColor} />
        <Fig value={stat?.rank ? `#${stat.rank}` : '–'} label={`Rank of ${booths.filter((b) => b.active).length} booths`} />
        <Fig value={fmt(ev.totals.stamps)} label="Event total" />
      </section>

      <section className="card mt-4">
        <h2 className="stamp-text text-navy-soft">Visitors per hour · {today}</h2>
        <div className="mt-3 h-52">
          <ResponsiveContainer>
            <BarChart data={hourly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(23,38,63,.1)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#4A5872' }} axisLine={false} tickLine={false} />
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
          {EVENT_DAYS.map((d, i) => (
            <li key={d} className="rounded-xl bg-white/50 p-3"><div className="fig text-2xl">{fmt(stat?.byDay?.[d])}</div><div className="stamp-text text-navy-soft">Day {i + 1}</div></li>
          ))}
        </ul>
      </section>
    </main>
  )
}

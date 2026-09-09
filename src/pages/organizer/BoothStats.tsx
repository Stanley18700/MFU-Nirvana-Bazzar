import { useState } from 'react'
import { OrganizerPage } from '../../components/OrganizerPage'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../lib/auth'
import { ms, useBooth, useBoothStat, useBooths, useEvent, useEventStats } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { CsvButton, DataErrors, Fig, LiveDot, Notice, Spinner, fmt } from '../../components/ui'
import { clock } from '../../lib/eventText'
import { dayOf, hourOf } from '../../../shared/model'
import { VISITOR_TYPE_LABEL } from '../../lib/labels'
import { onStage } from '../../lib/onStage'

/** §5.3 — the organizer sees their own booth only. */
export default function BoothStats() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  const booths = useBooths(true)
  const { t, pick } = useLocale()
  const dayTabs = useSlidingPill()
  const { data: booth, loading } = useBooth(boothId)
  const { data: stat, fromCache } = useBoothStat(boothId)
  const ev = useEventStats()
  const event = useEvent()
  const days = event.days
  const todayStr = dayOf(new Date())
  const [picked, setPicked] = useState(days.includes(todayStr) ? todayStr : days[0])

  if (boothId && loading) return <OrganizerPage boothId={boothId} booth={booth} marks={undefined}><Spinner label={t('stats.loading')} /></OrganizerPage>
  if (!boothId || !booth) {
    // Used to spin forever. A missing claim or a deleted booth is a thing to say, and a way out.
    return (
      <OrganizerPage boothId={boothId} booth={booth} marks={undefined}>
        <Notice tone="amber">{!boothId ? t('stats.noBooth') : t('stats.boothGone')}</Notice>
      </OrganizerPage>
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
    <OrganizerPage boothId={boothId} booth={booth} marks={undefined}>
      {/* `items-start`, as on the kiosk: the status sits at the top of the row, under Sign out. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <div className="stamp-text text-ink-soft">{t('stats.worth', { location: booth.location, points: booth.points })}</div>
          <h1 className="text-2xl font-bold">{pick(booth.nameEn, booth.nameTh)}</h1>
        </div>
        <LiveDot state={fromCache ? 'stale' : 'live'}>{fromCache ? t('status.reconnecting') : t('status.live')}</LiveDot>
      </div>
      <DataErrors className="mt-3" />

      <section className="mt-5 grid grid-cols-1 gap-2 xs:grid-cols-3 sm:gap-3">
        <Fig value={fmt(stat?.stamps)} label={t('stats.visitorsStamped')} accent={onStage(booth.accentColor, true)}
          sub={last ? t('stats.lastAt', { time: clock(last) }) : t('stats.noneYet')} />
        <Fig value={stat?.rank ? `#${stat.rank}` : '–'} label={t('booth.rankOf', { count: booths.filter((b) => b.active).length })} />
        <Fig value={fmt(ev.totals.stamps)} label={t('booth.eventTotal')} />
      </section>

      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="stamp-text text-ink-soft">{t('stats.perHour', { day: dayIndex })}</h2>
          <div className="flex items-center gap-2">
            <div ref={dayTabs} className="tab-group flex gap-1" role="tablist" aria-label={t('stats.day')}>
              {days.map((d, i) => (
                <button key={d} role="tab" aria-selected={d === day} onClick={() => setPicked(d)}
                  className="tab">
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
              <CartesianGrid vertical={false} stroke="rgba(23,65,78,.10)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#1F5A6B' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
              <YAxis tick={{ fontSize: 11, fill: '#1F5A6B' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(23,65,78,.06)' }} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, background: '#17414E', color: '#CFE3EA' }} itemStyle={{ color: '#CFE3EA' }} labelStyle={{ color: '#CFE3EA' }} />
              <Bar dataKey="visitors" fill={onStage(booth.accentColor, true)} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card mt-4">
        <div className="flex items-center justify-between">
          <h2 className="stamp-text text-ink-soft">{t('stats.whoVisited')}</h2>
          <CsvButton rows={types.map((k) => ({ visitorType: VISITOR_TYPE_LABEL[k], visitors: vt[k] ?? 0 }))} name={`${boothId}-visitor-types`} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {types.map((k) => (
            <li key={k} className="rounded-xl bg-white/50 p-3"><div className="fig text-2xl">{fmt(vt[k])}</div><div className="stamp-text text-ink-soft">{VISITOR_TYPE_LABEL[k]}</div></li>
          ))}
        </ul>
      </section>

      <section className="card mt-4">
        <div className="flex items-center justify-between">
          <h2 className="stamp-text text-ink-soft">{t('stats.byDay')}</h2>
          <CsvButton rows={days.map((d, i) => ({ day: `Day ${i + 1}`, date: d, visitors: stat?.byDay?.[d] ?? 0 }))} name={`${boothId}-by-day`} />
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {days.map((d, i) => (
            <li key={d} className="rounded-xl bg-white/50 p-3"><div className="fig text-xl xs:text-2xl">{fmt(stat?.byDay?.[d])}</div><div className="stamp-text text-ink-soft">Day {i + 1}</div></li>
          ))}
        </ul>
      </section>
    </OrganizerPage>
  )
}

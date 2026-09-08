import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useBooths, useBoothStats, useBuckets, useEvent, useEventStats } from '../../lib/data'
import { Crest, DataErrors, fmt } from '../../components/ui'

/** §6.1 — presentation mode for a hall screen: dark navy, oversized figures, auto-rotating. */
export default function Wall() {
  const ev = useEventStats()
  const event = useEvent()
  const booths = useBooths()
  const { data: bstats } = useBoothStats()
  const buckets = useBuckets(60)
  const [view, setView] = useState<0 | 1>(0)
  useEffect(() => { const id = setInterval(() => setView((v) => (v ? 0 : 1)), 15000); return () => clearInterval(id) }, [])

  // Full screen is an explicit button (and the F key), not a click anywhere: the old page-wide
  // handler gave no hint it existed and threw an unhandled rejection when the browser refused.
  const [fs, setFs] = useState(!!document.fullscreenElement)
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const goFull = useCallback(() => {
    const el = document.documentElement
    if (!el.requestFullscreen) { setHint('Full screen is not available in this browser — press F11.'); return }
    el.requestFullscreen().then(() => setHint(null)).catch(() => setHint('Full screen was blocked — press F11 (⌃⌘F on a Mac).'))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) goFull() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goFull])

  const board = booths.map((b) => ({ ...b, stamps: bstats.find((s) => s.id === b.id)?.stamps ?? 0 })).sort((a, b) => b.stamps - a.stamps)
  const max = Math.max(1, ...board.map((b) => b.stamps))
  const timeline = [...buckets].sort((a, b) => (a.startsAt as { toMillis(): number }).toMillis() - (b.startsAt as { toMillis(): number }).toMillis()).map((b) => ({ t: new Date((b.startsAt as { toMillis(): number }).toMillis()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), stamps: b.total }))

  return (
    <main className="flex min-h-screen flex-col bg-navy-deep p-[4vw] text-paper">
      <header className="flex items-center justify-between">
        <div><div className="stamp-text text-[1.2vw] text-gold">{event.nameEn}</div><h1 className="text-[3vw] font-bold leading-none">Passport live</h1></div>
        <div className="flex items-center gap-[1.5vw]">
          {!fs && <button className="btn-dark px-[1.2vw] py-[0.6vh] text-[1.1vw]" onClick={goFull}>Full screen</button>}
          <Crest className="h-[8vw] w-[8vw] text-gold" />
        </div>
      </header>
      <DataErrors dark className="mt-[2vh] text-[1.2vw]" />
      <section className="mt-[3vh] grid grid-cols-3 gap-[2vw]">
        {[['Visitors', ev.totals.visitors], ['Stamps', ev.totals.stamps], ['Prizes', ev.totals.redeemed]].map(([l, v]) => (
          <div key={l as string} className="rounded-[2vw] bg-white/5 p-[2vw]"><div className="fig text-[7vw] text-gold">{fmt(v as number)}</div><div className="stamp-text text-[1.2vw] text-paper/60">{l as string}</div></div>
        ))}
      </section>
      <section className="mt-[3vh] flex-1">
        {view === 0 ? (
          <ol className="grid grid-cols-2 gap-x-[3vw] gap-y-[1.2vh]">
            {board.map((b, i) => (
              <li key={b.id} className="flex items-center gap-[1vw] text-[1.6vw]">
                <span className="w-[2vw] text-right text-paper/50">{i + 1}</span>
                <span className="w-[16vw] truncate">{b.nameEn}</span>
                <div className="h-[1.6vw] flex-1 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${(b.stamps / max) * 100}%`, background: i === 0 ? '#C8A24A' : b.accentColor }} /></div>
                <span className="fig w-[4vw] text-right">{fmt(b.stamps)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="h-[50vh]">
            <ResponsiveContainer>
              <AreaChart data={timeline}>
                <XAxis dataKey="t" tick={{ fill: 'rgba(233,229,220,.6)', fontSize: 14 }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={{ fill: 'rgba(233,229,220,.6)', fontSize: 14 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Area type="monotone" dataKey="stamps" stroke="#C8A24A" strokeWidth={3} fill="rgba(200,162,74,.25)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <footer className="stamp-text flex items-center justify-between gap-4 text-[1vw] text-paper/40">
        <span>Scan the QR at the welcome sign to start your passport · mfupassport.web.app</span>
        <span>{hint ?? (fs ? 'Esc leaves full screen' : 'Press F for full screen')} · <Link to="/admin" className="link">admin</Link></span>
      </footer>
    </main>
  )
}

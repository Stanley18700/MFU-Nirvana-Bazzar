import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { hasGoogle, hasPassword } from '../../lib/authActions'
import { ms, useBooths, useEvent, useTiers } from '../../lib/data'

type Item = { ok: boolean; label: string; detail?: string; to: string; soft?: boolean }

/**
 * "Are we ready?" on the dashboard, in place of a setup document nobody reads at the desk.
 * Shown until the event starts; afterwards only while something a visitor would notice is
 * still missing. Each line links to the page that fixes it.
 */
export function Readiness() {
  const { user } = useAuth()
  const event = useEvent()
  const booths = useBooths(true)
  const tiers = useTiers()
  const [mail, setMail] = useState<boolean | null>(null)
  useEffect(() => { api.setupStatus({}).then((r) => setMail(r.mailConfigured)).catch(() => setMail(null)) }, [])
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('readiness-hidden') === event.id } catch { return false } })

  const start = ms(event.startsAt)
  const started = start !== null && Date.now() >= start
  const active = booths.filter((b) => b.active)
  const unlinked = active.filter((b) => !b.organizerUid)
  const items: Item[] = [
    { ok: active.length > 0, label: 'At least one active booth', detail: `${active.length} active`, to: '/admin/booths' },
    { ok: tiers.some((t) => t.active), label: 'A prize policy is saved', detail: `${tiers.filter((t) => t.active).length} tiers`, to: '/admin/prizes' },
    { ok: unlinked.length === 0, label: 'Every active booth has an organizer linked', detail: unlinked.length ? `${unlinked.length} without: ${unlinked.slice(0, 3).map((b) => b.shortName || b.nameEn).join(', ')}${unlinked.length > 3 ? '…' : ''}` : undefined, to: '/admin/booths' },
    { ok: hasPassword(user) || hasGoogle(user), label: 'Your admin account can sign in on another device', detail: 'a password or Google', to: '/account' },
    {
      ok: mail === true, soft: true, to: '/admin/users',
      label: mail === null ? 'Invitation email' : mail ? 'Invitation email is configured' : 'Invitation email is not configured',
      detail: mail === null ? 'checking…' : mail ? undefined : 'invites show a copyable link instead — fine for a small team',
    },
  ]
  const hard = items.filter((i) => !i.soft)
  const allHardOk = hard.every((i) => i.ok)
  if (hidden) return null
  if (started && allHardOk) return null

  const done = items.filter((i) => i.ok).length
  return (
    <section className={`card mt-5 border-2 ${allHardOk ? 'border-jade/30' : 'border-amber/40'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="stamp-text text-navy-soft">Ready for the event? · {done} of {items.length}</h2>
        <div className="flex items-center gap-3 text-xs text-navy-soft">
          {start && !started && <span>Starts {new Date(start).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
          {allHardOk && <button className="btn-quiet btn-sm" onClick={() => { setHidden(true); try { localStorage.setItem('readiness-hidden', event.id) } catch { /* private mode */ } }}>Hide</button>}
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm md:grid-cols-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2">
            <span className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full text-center text-[10px] leading-4 text-white ${i.ok ? 'bg-jade' : i.soft ? 'bg-navy/30' : 'bg-amber'}`} aria-hidden>{i.ok ? '✓' : ''}</span>
            <div className="min-w-0">
              <Link to={i.to} className={i.ok ? 'link decoration-transparent' : 'link'}>{i.label}</Link>
              {i.detail && <div className="text-xs text-navy-soft">{i.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

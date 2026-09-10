import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { hasGoogle, hasPassword } from '../../lib/authActions'
import { ms, useBooths, useEvent, useTiers } from '../../lib/data'
import { useLocale } from '../../lib/locale'

type Item = { id: string; ok: boolean; label: string; detail?: string; to: string; soft?: boolean }

/**
 * "Are we ready?" on the dashboard, in place of a setup document nobody reads at the desk.
 * Shown until the event starts; afterwards only while something a visitor would notice is
 * still missing. Each line links to the page that fixes it.
 */
export function Readiness() {
  const { user } = useAuth()
  const { t, locale } = useLocale()
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
    { id: 'booths', ok: active.length > 0, label: t('readiness.booths'), detail: t('readiness.boothsDetail', { count: active.length }), to: '/admin/booths' },
    { id: 'prizes', ok: tiers.some((x) => x.active), label: t('readiness.prizes'), detail: t('readiness.prizesDetail', { count: tiers.filter((x) => x.active).length }), to: '/admin/prizes' },
    {
      id: 'organizers', ok: unlinked.length === 0, label: t('readiness.organizers'), to: '/admin/booths',
      detail: unlinked.length
        ? t('readiness.organizersDetail', {
          count: unlinked.length,
          names: `${unlinked.slice(0, 3).map((b) => b.shortName || b.nameEn).join(', ')}${unlinked.length > 3 ? '…' : ''}`,
        })
        : undefined,
    },
    { id: 'signIn', ok: hasPassword(user) || hasGoogle(user), label: t('readiness.signIn'), detail: t('readiness.signInDetail'), to: '/account' },
    {
      id: 'mail', ok: mail === true, soft: true, to: '/admin/users',
      label: t(mail === null ? 'readiness.mail' : mail ? 'readiness.mailOk' : 'readiness.mailNo'),
      detail: mail === null ? t('readiness.mailChecking') : mail ? undefined : t('readiness.mailDetail'),
    },
  ]
  const hard = items.filter((i) => !i.soft)
  const allHardOk = hard.every((i) => i.ok)
  if (hidden) return null
  if (started && allHardOk) return null

  const done = items.filter((i) => i.ok).length
  return (
    <section className={`card mt-5 border-2 ${allHardOk ? 'border-success/30' : 'border-warn/40'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="stamp-text text-ink-soft">{t('readiness.title')} · {t('readiness.of', { done, total: items.length })}</h2>
        <div className="flex items-center gap-3 text-xs text-ink-soft">
          {start && !started && (
            <span>{t('readiness.starts', {
              when: new Date(start).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            })}</span>
          )}
          {allHardOk && <button className="btn-quiet btn-sm" onClick={() => { setHidden(true); try { localStorage.setItem('readiness-hidden', event.id) } catch { /* private mode */ } }}>{t('readiness.hide')}</button>}
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm md:grid-cols-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2">
            <span className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full text-center text-[10px] leading-4 text-white ${i.ok ? 'bg-success' : i.soft ? 'bg-ink/30' : 'bg-warn'}`} aria-hidden>{i.ok ? '✓' : ''}</span>
            <div className="min-w-0">
              <Link to={i.to} className={i.ok ? 'link decoration-transparent' : 'link'}>{i.label}</Link>
              {i.detail && <div className="text-xs text-ink-soft">{i.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth, useSignOut } from '../lib/auth'
import { useDismissable } from '../lib/useDismissable'
import { useLocale } from '../lib/locale'
import { LangToggle } from './ui'

/** Two letters from a display name, or one from the address — never an image we do not have. */
function initials(name: string | null | undefined, email: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (email ?? '?').slice(0, 1).toUpperCase()
}

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', organizer: 'Booth organizer', visitor: 'Visitor' }

/**
 * Who you are and the way out, in one place, for every role that has a shell to hang it on.
 *
 * A `<details>` disclosure rather than a hand-rolled `role="menu"`: the rows are links plus one
 * button, `Tab` is the right key for that, and claiming to be a menu would owe roving tabindex and
 * arrow keys for no gain. `<summary>` is already announced as a button with its expanded state.
 *
 * The visitor does not use this — their shell IS the tab bar, so Profile is a tab and this page's
 * job is done by `/passport/account`.
 */
export function AccountMenu({ dark = false, up = false, compact = false, className = '' }: { dark?: boolean; up?: boolean; compact?: boolean; className?: string }) {
  const { user, profile, role } = useAuth()
  const { t } = useLocale()
  const loc = useLocation()
  const signOut = useSignOut()
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissable(ref)

  const name = profile?.displayName ?? user?.displayName ?? null
  const email = user?.email ?? null
  const close = () => { if (ref.current) ref.current.open = false }

  return (
    <details ref={ref} className={`relative shrink-0 ${className}`}>
      <summary
        className={`btn-sm flex cursor-pointer list-none items-center gap-2 rounded-full ${dark ? 'btn-dark' : 'btn-quiet'}`}
        aria-label={`${t('nav.account')}${name ? ` — ${name}` : ''}`}
      >
        <span aria-hidden className={`account-avatar grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${dark ? 'bg-white/20 text-white' : 'bg-action text-white'}`}>
          {initials(name, email)}
        </span>
        {!compact && <span className="hidden sm:inline">{t('nav.account')}</span>}
      </summary>

      <div className={`pop pop-right absolute right-0 z-40 flex w-64 flex-col rounded-xl bg-white p-1.5 text-sm text-ink shadow-lg ring-1 ring-black/10 ${up ? 'bottom-full mb-1' : 'mt-1'}`}>
        <div className="px-3 py-2">
          <div className="truncate font-semibold">{name ?? t('account.signedIn')}</div>
          {email && <div className="truncate text-xs text-ink-soft">{email}</div>}
          {profile?.passportNo && <div className="font-mono text-xs tracking-widest text-ink-soft">{profile.passportNo}</div>}
          {role && <div className="stamp-text mt-1 text-ink-soft">{ROLE_LABEL[role] ?? role}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="text-xs text-ink-soft">{t('lang.label')}</span>
          <LangToggle />
        </div>

        <div className="my-1 border-t rule" />

        {/* An admin has a passport of their own to test the visitor side with; nobody else does. */}
        {role === 'admin' && <Link to="/passport" className="menu-item" onClick={close}>{t('nav.myPassport')}</Link>}
        <Link to="/account" state={{ from: loc.pathname + loc.search }} className="menu-item" onClick={close}>
          {t('nav.accountSettings')}
        </Link>

        <div className="my-1 border-t rule" />
        <button type="button" className="menu-item" onClick={() => { close(); void signOut() }}>{t('nav.signOut')}</button>
      </div>
    </details>
  )
}

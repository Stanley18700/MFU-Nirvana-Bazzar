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
export function AccountMenu({ dark = false, up = false, rail }: { dark?: boolean; up?: boolean; rail?: 'full' | 'icon' }) {
  const { user, profile, role } = useAuth()
  const { t } = useLocale()
  const loc = useLocation()
  const signOut = useSignOut()
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissable(ref)

  const name = profile?.displayName ?? user?.displayName ?? null
  const email = user?.email ?? null
  const close = () => { if (ref.current) ref.current.open = false }

  /*
   * Where the panel hangs, and it is not cosmetic: the rail clips its own overflow on one axis
   * while it animates width, and a fixed 16rem panel anchored to the right of a 15rem rail used to
   * spill past the viewport's left edge and lose the first few characters of every line.
   *   full  — expanded rail: the panel spans the row it grew out of, so it cannot outgrow the rail.
   *   icon  — collapsed rail: too narrow to host a panel, so it flies out over the page instead.
   *   bar   — a top bar, where the trigger is already at the right edge.
   */
  const panel = rail === 'full' ? 'left-0 right-0' : rail === 'icon' ? 'left-0 w-64' : 'right-0 w-64'

  return (
    <details ref={ref} className={`relative shrink-0 ${rail === 'full' ? 'w-full' : ''}`}>
      <summary
        className={rail === 'full'
          // Not `.btn`: that is `inline-flex` and unlayered, so it wins over `flex` and shrink-wraps
          // the row to its text. A footer row this size should read as one wide, pressable target.
          ? `flex w-full cursor-pointer list-none items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foil/60 ${dark ? 'text-white hover:bg-white/12 active:bg-white/20' : 'text-ink hover:bg-ink/6 active:bg-ink/10'}`
          : `btn-sm flex cursor-pointer list-none items-center gap-2 rounded-full ${dark ? 'btn-dark' : 'btn-quiet'}`}
        aria-label={`${t('nav.account')}${name ? ` — ${name}` : ''}`}
      >
        <span aria-hidden className={`account-avatar grid shrink-0 place-items-center rounded-full font-bold ${rail === 'full' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]'} ${dark ? 'bg-white/20 text-white' : 'bg-action text-white'}`}>
          {initials(name, email)}
        </span>
        {rail === 'full' ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name ?? t('nav.account')}</span>
              {role && <span className="block truncate text-[11px] text-on-chrome-soft">{ROLE_LABEL[role] ?? role}</span>}
            </span>
            <span aria-hidden className="shrink-0 text-[10px] opacity-70 transition-transform duration-150 [[open]_&]:rotate-180">{up ? '▴' : '▾'}</span>
          </>
        ) : rail !== 'icon' && <span className="hidden sm:inline">{t('nav.account')}</span>}
      </summary>

      <div className={`pop ${up ? 'pop-up' : ''} ${rail ? '' : 'pop-right'} absolute z-40 flex flex-col rounded-xl bg-white p-1.5 text-sm text-ink shadow-lg ring-1 ring-black/10 ${panel} ${up ? 'bottom-full mb-2' : 'mt-1'}`}>
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

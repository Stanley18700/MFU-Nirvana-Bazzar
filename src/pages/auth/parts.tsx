import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { Crest } from '../../components/ui'

/** The navy card every signed-out screen sits in, so /signin matches the landing page. */
export function AuthShell({ title, lead, children, foot, back = '/' }: {
  title: string
  lead?: ReactNode
  children: ReactNode
  foot?: ReactNode
  back?: string | null
}) {
  const event = useEvent()
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-navy" aria-hidden />
      <main className="mx-auto flex min-h-full max-w-md flex-col bg-navy px-6 py-8 text-paper">
        {back && <Link to={back} className="text-sm text-paper/60 hover:text-paper">← Back</Link>}
        <div className="mt-6 flex items-center gap-4">
          <Crest className="h-14 w-14 shrink-0 text-gold" />
          <div className="min-w-0">
            <div className="stamp-text text-gold">{event.nameEn}</div>
            <div className="text-xs text-paper/50">{eventDateLine(event, false)}</div>
          </div>
        </div>

        <div className="page-in mt-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {lead && <p className="mt-2 text-sm text-paper/70">{lead}</p>}
          {children}
        </div>

        {foot && <div className="mt-auto pt-10 text-center text-sm text-paper/60">{foot}</div>}
      </main>
    </>
  )
}

export function GoogleButton({ onClick, busy, label }: { onClick: () => void; busy?: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-paper px-4 py-3.5 font-semibold text-navy-deep transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50">
      <GoogleMark />
      {busy ? 'Opening Google…' : label}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.5z" />
      <path fill="#EA4335" d="M24 10.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.5 2 8.1 6.7 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.3 12.2-9.3z" />
    </svg>
  )
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-paper/40">
      <span className="h-px flex-1 bg-paper/15" />{children}<span className="h-px flex-1 bg-paper/15" />
    </div>
  )
}

/** Notice from components/ui is tuned for the paper background; this one for navy. */
export function DarkNotice({ tone = 'info', children }: { tone?: 'info' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  const cls = {
    info: 'bg-paper/10 text-paper/90',
    amber: 'bg-amber/20 text-amber',
    red: 'bg-vermilion/20 text-[#ffc9bf]',
    green: 'bg-jade/20 text-[#9fe3cd]',
  }[tone]
  return <div className={`rounded-xl px-4 py-3 text-sm ${cls}`} role="status">{children}</div>
}

/** White-on-navy text input; `field` in index.css assumes the paper background. */
export const darkField =
  'mt-1 w-full rounded-lg border border-paper/20 bg-paper/10 px-3.5 py-3 text-paper placeholder:text-paper/35 outline-none transition focus:border-gold focus:bg-paper/15'

export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="stamp-text text-paper/60">{label}</span>
      <input className={darkField} {...input} />
      {hint && <span className="mt-1 block text-xs text-paper/45">{hint}</span>}
    </label>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import type { ScanResult } from '../../../shared/model'
import { ScanResultView } from './ScanResult'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'

/** §4.3 — `/s/<token>`: the booth QR opened with the phone's native camera app. */
export default function ScanLanding() {
  const { token = '' } = useParams()
  const { ready, user, emailVerified, role } = useAuth()
  const nav = useNavigate()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Keyed on the token, not a boolean: navigating /s/A -> /s/B keeps this element mounted, and
  // the second booth must still be stamped.
  const fired = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || fired.current === token) return
    if (role !== 'visitor' && role !== 'admin') return
    fired.current = token
    api.scan({ payload: `/s/${token}` }).then((r) => {
      setResult(r)
      if (r.status === 'success') navigator.vibrate?.(18)
    }).catch((e) => setErr(errorMessage(e)))
  }, [ready, role, token])

  if (!ready) return <Spinner label="Checking your stamp…" />
  // No account, or a half-finished one: sign in / confirm / register and come straight back
  // to this token afterwards, so the visitor never loses the booth they just scanned (§4.3).
  if (!user) return <Navigate to="/signup" state={{ from: `/s/${token}` }} replace />
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: `/s/${token}` }} replace />
  if (!role) return <Navigate to="/join" state={{ from: `/s/${token}` }} replace />
  // Staff phones do not collect stamps; say so on the booth screen instead of bouncing silently.
  if (role === 'organizer') return <Navigate to="/booth" state={{ notice: "Staff accounts do not collect stamps — that code was for a visitor's phone." }} replace />

  return (
    <><FestivalBackdrop hills={false} /><main className="relative mx-auto min-h-full max-w-md p-4 text-ink">
      <header className="flex items-center justify-between gap-2 px-1 py-3">
        <BackLink to="/passport">Passport</BackLink>
        <div className="stamp-text text-ink">Booth check-in</div>
        <span className="w-16" />
      </header>
      <div className="rounded-3xl bg-white text-ink">
        {err ? <div className="p-6"><Notice tone="red">{err}</Notice></div>
          // `replace`: from a camera-opened tab the history is just [/s/token], and Back landing
          // there would re-fire the scan and show "already stamped".
          : result ? <ScanResultView result={result} onRetry={() => nav('/scan', { replace: true })} />
          : <Spinner label="Stamping…" />}
      </div>
    </main></>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import type { ScanResult } from '../../../shared/model'
import { ScanResultView } from './ScanResult'
import { Notice, Spinner } from '../../components/ui'

/** §4.3 — `/s/<token>`: the booth QR opened with the phone's native camera app. */
export default function ScanLanding() {
  const { token = '' } = useParams()
  const { ready, user, emailVerified, role } = useAuth()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (!ready || fired.current) return
    if (role !== 'visitor' && role !== 'admin') return
    fired.current = true
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
  if (role === 'organizer') return <Navigate to="/booth" replace />

  return (
    <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="mx-auto min-h-full max-w-md bg-navy-deep p-4 text-paper">
      <header className="flex items-center justify-between px-1 py-3">
        <Link to="/passport" className="text-sm text-paper/70">← Passport</Link>
        <div className="stamp-text text-gold">Booth check-in</div>
        <span className="w-16" />
      </header>
      <div className="rounded-3xl bg-paper text-navy">
        {err ? <div className="p-6"><Notice tone="red">{err}</Notice></div>
          : result ? <ScanResultView result={result} onRetry={() => window.location.assign('/scan')} />
          : <Spinner label="Stamping…" />}
      </div>
    </main></>
  )
}

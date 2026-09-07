import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { Crest, Notice, Spinner } from '../../components/ui'

type Info = Awaited<ReturnType<typeof api.inviteInfo>>

/** §6.4 — a booth organizer opens the emailed link and lands on their booth screen. */
export default function Invite() {
  const { token = '' } = useParams()
  const { ready, role, refreshClaims } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.inviteInfo({ token }).then(setInfo).catch((e) => setErr(errorMessage(e))) }, [token])

  async function accept() {
    setBusy(true); setErr(null)
    try {
      const r = await api.acceptInvite({ token })
      await refreshClaims()
      nav(r.role === 'admin' ? '/admin' : '/booth', { replace: true })
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col bg-navy px-6 py-10 text-paper">
      <div className="stamp-text text-gold">MFU Go Global International Festival · 16–18 September 2026</div>
      <div className="my-8 flex justify-center"><Crest className="h-28 w-28 text-gold" /></div>
      {!info && !err && <Spinner label="Reading your invitation…" />}
      {err && <Notice tone="red">{err}</Notice>}
      {info && info.status !== 'ok' && (
        <Notice tone="amber">
          {info.status === 'accepted' && 'This invitation has already been used. If that was you, open the app on that device — or ask the admin to resend.'}
          {info.status === 'expired' && 'This invitation has expired. Ask the admin to resend it.'}
          {info.status === 'revoked' && 'This invitation was withdrawn.'}
          {info.status === 'invalid' && 'This link is not a valid invitation.'}
        </Notice>
      )}
      {info && info.status === 'ok' && (
        <div className="page-in">
          <h1 className="text-2xl font-bold">Hello {info.displayName}</h1>
          <p className="mt-2 text-paper/80">
            You are invited to run {info.role === 'admin' ? <b>the admin dashboard</b> : <>the booth screen for <b>{info.boothName}</b></>}.
            Accepting on this device signs you in here — no password. Use the tablet or laptop that will sit on the booth.
          </p>
          <p className="mt-2 text-xs text-paper/60">Sent to {info.email}. The link works once.</p>
          {ready && role && role !== 'visitor' && <div className="mt-4"><Notice tone="amber">This device is already signed in as {role}. Accepting will switch it to this invitation.</Notice></div>}
          <button className="btn-gold mt-6 w-full py-3.5 text-lg" onClick={accept} disabled={!ready || busy}>{busy ? 'Setting up…' : 'Accept and open my booth'}</button>
        </div>
      )}
    </main>
  )
}

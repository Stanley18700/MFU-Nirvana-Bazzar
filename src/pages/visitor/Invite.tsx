import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, friendlyError } from '../../lib/api'
import { authError, signInWithGoogle } from '../../lib/authActions'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { Crest, Notice, Spinner } from '../../components/ui'
import { GoogleButton } from '../auth/parts'

type Info = Awaited<ReturnType<typeof api.inviteInfo>>

/**
 * §6.4 — a booth organizer opens the emailed link and lands on their booth screen.
 * With anonymous sign-in gone they must first sign in as the invited address; acceptInvite
 * refuses any other account, so the page says which one up front.
 */
export default function Invite() {
  const { token = '' } = useParams()
  const { ready, user, role, refreshClaims } = useAuth()
  const event = useEvent()
  const nav = useNavigate()
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.inviteInfo({ token }).then(setInfo).catch((e) => setErr(friendlyError(e))) }, [token])

  const invited = info && info.status === 'ok' ? info.email : null
  const signedInAs = user?.email?.toLowerCase() ?? null
  const wrongAccount = !!(invited && signedInAs && signedInAs !== invited.toLowerCase())

  async function google() {
    setBusy(true); setErr(null)
    try { await signInWithGoogle() } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  async function accept() {
    setBusy(true); setErr(null)
    let r: Awaited<ReturnType<typeof api.acceptInvite>>
    try { r = await api.acceptInvite({ token }) } catch (e) { setErr(friendlyError(e)); setBusy(false); return }
    // The invitation is consumed at this point. A token refresh that fails (flaky venue Wi-Fi)
    // must not read as "accept failed": the claims arrive on the next focus anyway.
    try { await refreshClaims() } catch { /* picked up by the periodic refresh */ }
    nav(r.role === 'admin' ? '/admin' : '/booth', { replace: true })
  }

  return (
    <><div className="fixed inset-0 -z-10 bg-chrome" aria-hidden /><main className="mx-auto flex min-h-full max-w-md flex-col bg-chrome px-6 py-10 text-white">
      <div className="stamp-text text-foil">{event.nameEn} · {eventDateLine(event, false)}</div>
      <div className="my-8 flex justify-center"><Crest className="h-28 w-28 text-foil" /></div>
      {!info && !err && <Spinner label="Reading your invitation…" />}
      {err && <div className="mb-4"><Notice tone="red">{err}</Notice></div>}
      {info && info.status !== 'ok' && (
        <Notice tone="amber">
          {info.status === 'accepted' && 'This invitation has already been used. If that was you, sign in on that device — or ask the admin to resend.'}
          {info.status === 'expired' && 'This invitation has expired. Ask the admin to resend it.'}
          {info.status === 'revoked' && 'This invitation was withdrawn.'}
          {info.status === 'invalid' && 'This link is not a valid invitation.'}
        </Notice>
      )}
      {/*
        * Every one of these is terminal, and this page is opened from an email — so there is no
        * history to go back through and no shell to escape into. An invitation that has already
        * been used is the common case and it says "sign in on that device", so signing in is the
        * first way out.
        */}
      {((info && info.status !== 'ok') || err) && (
        <div className="mt-5 flex flex-col gap-2">
          <Link to="/signin" className="btn-primary">Sign in</Link>
          <Link to="/" className="btn-dark">Back to the start</Link>
        </div>
      )}
      {info && info.status === 'ok' && (
        <div className="page-in">
          <h1 className="text-2xl font-bold">Hello {info.displayName}</h1>
          <p className="mt-2 text-on-chrome-soft">
            You are invited to run {info.role === 'admin' ? <b>the admin dashboard</b> : <>the booth screen for <b>{info.boothName}</b></>}.
            Use the tablet or laptop that will sit on the booth.
          </p>
          <p className="mt-2 text-xs text-on-chrome-soft">Sent to {info.email}. The link works once.</p>

          {!ready ? <div className="mt-6"><Spinner label="Checking this device…" /></div>
            : !user ? (
              <div className="mt-6 flex flex-col gap-3">
                <p className="text-sm text-on-chrome-soft">Sign in as <b className="text-white">{info.email}</b> to accept.</p>
                <GoogleButton onClick={google} busy={busy} label="Continue with Google" />
                <Link to="/signin" state={{ from: `/invite/${token}`, email: info.email }}
                  className="btn-dark">Use an email and password</Link>
                <Link to="/signup" state={{ from: `/invite/${token}`, email: info.email }}
                  className="link self-center text-center text-xs text-on-chrome-soft hover:text-white">No account for that address yet? Create one</Link>
              </div>
            ) : wrongAccount ? (
              <div className="mt-6 flex flex-col gap-3">
                <Notice tone="amber">
                  This device is signed in as <b>{signedInAs}</b>, but the invitation was sent to <b>{invited}</b>.
                  Sign out and sign in with the invited address.
                </Notice>
                <SignOutButton />
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                {role && role !== 'visitor' && (
                  <Notice tone="amber">This account is already {role}. Accepting will switch it to this invitation.</Notice>
                )}
                <p className="text-sm text-on-chrome-soft">Signed in as <b className="text-white">{signedInAs}</b>.</p>
                <button className="btn-gold w-full py-3.5 text-lg" onClick={accept} disabled={busy}>
                  {busy ? 'Setting up…' : info.role === 'admin' ? 'Accept and open the dashboard' : 'Accept and open my booth'}
                </button>
                <SignOutButton />
              </div>
            )}
        </div>
      )}
    </main></>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  return <button className="btn-dark btn-sm self-center" onClick={() => void signOut()}>Sign out of this device</button>
}

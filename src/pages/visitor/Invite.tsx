import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, friendlyError } from '../../lib/api'
import { authError, signInWithGoogle } from '../../lib/authActions'
import { Notice, Spinner } from '../../components/ui'
import { AuthShell, GoogleButton } from '../auth/parts'

type Info = Awaited<ReturnType<typeof api.inviteInfo>>

const DEAD: Record<string, string> = {
  accepted: 'This invitation has already been used. If that was you, sign in on that device — or ask the admin to resend it.',
  expired: 'This invitation has expired. Ask the admin to resend it.',
  revoked: 'This invitation was withdrawn.',
  invalid: 'This link is not a valid invitation.',
}

/**
 * §6.4 — a booth organizer opens the emailed link and lands on their booth screen.
 * With anonymous sign-in gone they must first sign in as the invited address; acceptInvite
 * refuses any other account, so the page says which one up front.
 *
 * On `AuthShell`, like every other screen someone arrives at from an email. It was the last page
 * still standing on the old dark chrome with a gold crest — the look the rest of the app moved off
 * — so a staff member's first sight of the product was a screen belonging to no other part of it.
 */
export default function Invite() {
  const { token = '' } = useParams()
  const { ready, user, role, refreshClaims, redirectError, clearRedirectError } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.inviteInfo({ token }).then(setInfo).catch((e) => setErr(friendlyError(e))) }, [token])

  async function google() {
    setBusy(true); setErr(null); clearRedirectError()
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

  // No back link on any of these: the page is opened from an email, so there is no history behind
  // it and no shell to escape into. Each dead end offers its own way on instead.
  if (!info && !err) return <AuthShell back={null} title="Reading your invitation…"><div className="mt-4"><Spinner /></div></AuthShell>

  const dead = err ?? (info && info.status !== 'ok' ? DEAD[info.status] : null)
  if (dead || !info || info.status !== 'ok') {
    return (
      <AuthShell back={null} title="This invitation cannot be used" lead={dead ?? DEAD.invalid}>
        <div className="mt-5 flex flex-col gap-2">
          <Link to="/signin" className="btn-primary">Sign in</Link>
          <Link to="/" className="btn-quiet">Back to the start</Link>
        </div>
      </AuthShell>
    )
  }

  const invited = info.email
  const signedInAs = user?.email?.toLowerCase() ?? null
  const wrongAccount = !!(signedInAs && signedInAs !== invited.toLowerCase())

  return (
    <AuthShell
      back={null}
      title={`Hello ${info.displayName}`}
      lead={<>
        You are invited to run {info.role === 'admin' ? <b className="text-ink">the admin dashboard</b> : <>the booth screen for <b className="text-ink">{info.boothName}</b></>}.
        Use the tablet or laptop that will sit on the booth.
      </>}
    >
      <p className="mt-2 text-xs text-ink-soft">Sent to {invited}. The link works once.</p>

      {!ready ? <div className="mt-6"><Spinner label="Checking this device…" /></div>
        : !user ? (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-sm text-ink-soft">Sign in as <b className="text-ink">{invited}</b> to accept.</p>
            {/* An organizer opens this from mail, which on a phone is usually an in-app browser —
                the case most likely to come back from Google having failed. */}
            {redirectError && <Notice tone="red">{redirectError}</Notice>}
            <GoogleButton onClick={google} busy={busy} label="Continue with Google" />
            <Link to="/signin" state={{ from: `/invite/${token}`, email: invited }} className="btn-quiet">Use an email and password</Link>
            <Link to="/signup" state={{ from: `/invite/${token}`, email: invited }}
              className="link self-center text-center text-xs text-ink-soft hover:text-ink">No account for that address yet? Create one</Link>
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
            <p className="text-sm text-ink-soft">Signed in as <b className="text-ink">{signedInAs}</b>.</p>
            <button className="btn-gold w-full py-3.5 text-lg" onClick={accept} disabled={busy}>
              {busy ? 'Setting up…' : info.role === 'admin' ? 'Accept and open the dashboard' : 'Accept and open my booth'}
            </button>
            <SignOutButton />
          </div>
        )}
    </AuthShell>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  return <button className="btn-quiet btn-sm self-center" onClick={() => void signOut()}>Sign out of this device</button>
}

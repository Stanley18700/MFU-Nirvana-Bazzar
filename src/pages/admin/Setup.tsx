import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { Notice } from '../../components/ui'

/** One-off: turn the current (anonymous) session into the first admin using the bootstrap key. */
export default function Setup() {
  const { ready, role, refreshClaims } = useAuth()
  const nav = useNavigate()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await api.bootstrapAdmin({ key, displayName: name }); await refreshClaims(); nav('/admin', { replace: true }) } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <main className="mx-auto max-w-md px-5 pt-10 page-in">
      <h1 className="text-2xl font-bold">First-admin setup</h1>
      <p className="mt-1 text-sm text-navy-soft">Enter the bootstrap key you set with <code>firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY</code>. Works once — while no admin exists yet. Add further admins from the admin panel.</p>
      {role === 'admin' && <div className="mt-4"><Notice tone="green">This device is already an admin.</Notice></div>}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="Bootstrap key" type="password" value={key} onChange={(e) => setKey(e.target.value)} required />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary" disabled={!ready || busy}>Make me admin</button>
      </form>
    </main>
  )
}

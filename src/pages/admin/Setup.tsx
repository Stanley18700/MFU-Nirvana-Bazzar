import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { Notice, Spinner } from '../../components/ui'
import { useLocale } from '../../lib/locale'

/** One-off: turn the signed-in account into the first admin using the bootstrap key. */
export default function Setup() {
  const { ready, user, emailVerified, role, refreshClaims } = useAuth()
  const nav = useNavigate()
  const { t } = useLocale()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await api.bootstrapAdmin({ key, displayName: name }); await refreshClaims(); nav('/admin', { replace: true }) } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  // bootstrapAdmin elevates whoever is calling, so there has to be a real account to elevate.
  if (!ready) return <Spinner page />
  if (!user) return <Navigate to="/signin" state={{ from: '/setup' }} replace />
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: '/setup' }} replace />

  return (
    <main className="mx-auto max-w-md px-5 pt-10 page-in">
      <h1 className="text-2xl font-bold">{t('setup.title')}</h1>
      {/* The address and the command stay outside the translated text: one is data and the other
          is a shell command, and neither should ever be reworded by a dictionary. */}
      <p className="mt-1 text-sm text-ink-soft">{t('setup.signedInAs')} <b>{user.email}</b> {t('setup.becomesAdmin')}</p>
      <p className="mt-1 text-sm text-ink-soft">{t('setup.keyBefore')} <code>firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY</code> {t('setup.keyAfter')}</p>
      {role === 'admin' && <div className="mt-4"><Notice tone="green">{t('setup.already')}</Notice></div>}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <input className="field" placeholder={t('setup.yourName')} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder={t('setup.key')} type="password" value={key} onChange={(e) => setKey(e.target.value)} required />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary" disabled={!ready || busy}>{t('setup.submit')}</button>
      </form>
    </main>
  )
}

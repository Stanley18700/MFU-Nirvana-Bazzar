import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { useEthnicGroups, useRefList } from '../../lib/data'
import { COUNTRIES, PINNED_COUNTRIES, countryName } from '../../lib/countries'
import { DataErrors, Notice, Spinner } from '../../components/ui'
import type { VisitorType } from '../../../shared/model'

const TYPES: Array<{ v: VisitorType; label: string }> = [
  { v: 'student', label: 'Student' }, { v: 'staff', label: 'Staff' }, { v: 'alumni', label: 'Alumni' }, { v: 'guest', label: 'External guest' },
]

function guessCountry(): string {
  const loc = navigator.language || ''
  const m = loc.match(/-([A-Z]{2})$/i)
  return m ? m[1].toUpperCase() : 'TH'
}

export default function Join() {
  const { ready, user, role, refreshClaims, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from
  const institutions = useRefList('institutions')
  const schools = useRefList('mfuSchools')
  const ethnic = useEthnicGroups()

  const [f, setF] = useState({
    // Google hands us a name; the visitor can still overwrite it before it goes on the cover.
    displayName: user?.displayName ?? '', visitorType: 'student' as VisitorType, studentId: '', institution: 'MFU', institutionOther: '',
    school: '', countryCode: guessCountry(), ethnicGroup: '', ethnicConsent: false, consent: false,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { if (f.institution !== 'MFU' && f.school) set('school', '') }, [f.institution]) // eslint-disable-line react-hooks/exhaustive-deps

  const countries = useMemo(() => {
    const pinned = PINNED_COUNTRIES.map((c) => ({ code: c, name: countryName(c) }))
    return [...pinned, ...COUNTRIES.filter((c) => !(PINNED_COUNTRIES as readonly string[]).includes(c.code))]
  }, [])
  const ethnicOptions: string[] = ethnic[f.countryCode] ?? []

  if (!ready) return <Spinner page />
  if (role === 'visitor') return <Navigate to={from ?? '/passport'} replace />
  if (role === 'organizer' || role === 'admin') return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!f.consent) { setErr('Please tick the consent box to continue.'); return }
    setBusy(true)
    try {
      await api.join({
        displayName: f.displayName, visitorType: f.visitorType, studentId: f.studentId || undefined,
        institution: f.institution, institutionOther: f.institution === 'Other' ? f.institutionOther : undefined,
        school: f.institution === 'MFU' ? f.school : f.institutionOther || undefined,
        countryCode: f.countryCode,
        ethnicGroup: f.ethnicGroup || undefined, ethnicConsent: f.ethnicConsent,
        consent: true,
      })
      // §4.1 — give the passport a way home. Non-fatal: registration must not fail because
      // the credential could not be linked, and `join` has already succeeded by this point.
      await refreshClaims()
      nav(from ?? '/passport', { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-8 page-in">
      <h1 className="text-2xl font-bold">Start your passport</h1>
      <p className="mt-1 text-sm text-ink-soft">Under a minute — a few details for the organisers, then your passport opens.</p>

      {/* The account email is the contact; it is already confirmed, so it is shown, not asked for. */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border rule bg-white/40 px-3.5 py-3">
        <div className="min-w-0">
          <div className="stamp-text text-ink-soft">Signed in as</div>
          <div className="truncate text-sm font-medium">{user?.email}</div>
        </div>
        <button type="button" className="btn-quiet btn-sm shrink-0" onClick={() => void signOut()}>Not you?</button>
      </div>

      <DataErrors className="mt-4" />

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <label className="block">
          <span className="stamp-text text-ink-soft">Your name</span>
          <input className="field mt-1" required maxLength={80} autoComplete="name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Shown on your passport cover" />
        </label>

        <fieldset>
          <legend className="stamp-text text-ink-soft">I am a</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <label key={t.v} className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium ${f.visitorType === t.v ? 'border-action bg-action/10 text-ink' : 'border-ink/15 bg-white/60'}`}>
                <input type="radio" name="vt" className="sr-only" checked={f.visitorType === t.v} onChange={() => set('visitorType', t.v)} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        {f.visitorType !== 'guest' && (
          <label className="block">
            <span className="stamp-text text-ink-soft">Student / staff ID <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <input className="field mt-1" maxLength={40} inputMode="numeric" value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
          </label>
        )}

        <label className="block">
          <span className="stamp-text text-ink-soft">University / institution</span>
          <input className="field mt-1" required list="institutions" value={f.institution} onChange={(e) => set('institution', e.target.value)} placeholder="Start typing…" />
          <datalist id="institutions">{institutions.map((i) => <option key={i} value={i} />)}</datalist>
        </label>

        {f.institution === 'Other' && (
          <label className="block">
            <span className="stamp-text text-ink-soft">Institution name</span>
            <input className="field mt-1" required maxLength={120} value={f.institutionOther} onChange={(e) => set('institutionOther', e.target.value)} />
          </label>
        )}

        {f.institution === 'MFU' && (
          <label className="block">
            <span className="stamp-text text-ink-soft">School / office</span>
            <input className="field mt-1" required list="schools" value={f.school} onChange={(e) => set('school', e.target.value)} placeholder="Start typing…" />
            <datalist id="schools">{schools.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        )}

        <label className="block">
          <span className="stamp-text text-ink-soft">Country of origin</span>
          <select className="field mt-1" required value={f.countryCode} onChange={(e) => { set('countryCode', e.target.value); set('ethnicGroup', ''); set('ethnicConsent', false) }}>
            {countries.map((c, i) => (
              <option key={c.code} value={c.code}>{c.name}{i === PINNED_COUNTRIES.length - 1 ? '  ────────' : ''}</option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border rule bg-white/40 p-3">
          <label className="block">
            <span className="stamp-text text-ink-soft">Ethnic group / community <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <p className="mt-1 text-xs text-ink-soft">
              MFU serves students from many communities across the Mekong region. The Office of International Affairs asks this only to show, in aggregate, that the festival reached them. It is never shown with your name.
            </p>
            <input className="field mt-2" list="ethnic" maxLength={80} value={f.ethnicGroup} onChange={(e) => set('ethnicGroup', e.target.value)} placeholder="Type, choose, or leave blank" />
            <datalist id="ethnic">
              <option value="Prefer not to say" />
              {ethnicOptions.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>
          {f.ethnicGroup && f.ethnicGroup !== 'Prefer not to say' && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.ethnicConsent} onChange={(e) => set('ethnicConsent', e.target.checked)} />
              <span>I consent to my ethnic group being collected for aggregate event statistics only. <span className="text-ink-soft">(Leave unticked and it will not be stored.)</span></span>
            </label>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} required />
          <span>
            I consent to MFU collecting the details above and my booth check-in times for running this activity and for aggregate event statistics, kept for 90 days after the event.{' '}
            <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">Privacy notice</a>
          </span>
        </label>

        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy}>{busy ? 'Creating…' : 'Create my passport'}</button>
      </form>
    </main>
  )
}

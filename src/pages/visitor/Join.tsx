import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { useEthnicGroups, useRefList } from '../../lib/data'
import { COUNTRIES, PINNED_COUNTRIES, countryName } from '../../lib/countries'
import { DataErrors, LangToggle, Notice, Spinner } from '../../components/ui'
import { Select } from '../../components/Select'
import type { VisitorType } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'

/** Sentinel for the select: not a country code, and no ISO code is 8 characters. */
const OTHER_COUNTRY = '__other__'

const TYPES: Array<{ v: VisitorType; label: StringKey }> = [
  { v: 'student', label: 'v.join.type.student' }, { v: 'staff', label: 'v.join.type.staff' },
  { v: 'alumni', label: 'v.join.type.alumni' }, { v: 'guest', label: 'v.join.type.guest' },
]

function guessCountry(): string {
  const loc = navigator.language || ''
  const m = loc.match(/-([A-Z]{2})$/i)
  return m ? m[1].toUpperCase() : 'TH'
}

export default function Join() {
  const { t } = useLocale()
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
  // The country search panel: shut until somebody says their country is not one of the nine.
  const [findCountry, setFindCountry] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { if (f.institution !== 'MFU' && f.school) set('school', '') }, [f.institution]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Nine countries and a way out, rather than a wheel of 256.
   *
   * Those nine answer this for nearly everyone at an MFU festival, so they *are* the question;
   * the other 247 live behind "Other country", which opens a search over the full A-Z list.
   * Two earlier arrangements failed on a phone: 256 in one run, and then the nine lifted to the
   * top and *removed* from the alphabetical part — where a visitor scrolling to T for Thailand
   * did not find it, because it had been moved.
   */
  const common = useMemo(
    () => PINNED_COUNTRIES.map((code) => ({ code, name: countryName(code) })),
    [],
  )
  const isCommon = (PINNED_COUNTRIES as readonly string[]).includes(f.countryCode)
  /** COUNTRIES is already A-Z, so a filter of it stays A-Z. An empty query lists all of them. */
  const countryMatches = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    return q ? COUNTRIES.filter((x) => x.name.toLowerCase().includes(q)) : COUNTRIES
  }, [countryQuery])

  /** Country decides which ethnic-group list is offered, so changing it invalidates both. */
  function chooseCountry(code: string) {
    set('countryCode', code); set('ethnicGroup', ''); set('ethnicConsent', false)
  }
  const ethnicOptions: string[] = ethnic[f.countryCode] ?? []

  if (!ready) return <Spinner page />
  if (role === 'visitor') return <Navigate to={from ?? '/passport'} replace />
  if (role === 'organizer' || role === 'admin') return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!f.consent) { setErr(t('v.join.consentRequired')); return }
    // `Select` is a disclosure, not a form control, so the browser no longer checks this one.
    if (f.institution === 'MFU' && !f.school) { setErr(t('v.join.schoolRequired')); return }
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
      {/* The longest thing a visitor reads in the whole app, and the first: the switch belongs
          beside its heading, not three screens away in a menu that does not exist yet. */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('v.join.title')}</h1>
        <LangToggle className="mt-0.5 shadow-card" />
      </div>
      <p className="mt-1 text-sm text-ink-soft">{t('v.join.lead')}</p>

      {/* The account email is the contact; it is already confirmed, so it is shown, not asked for. */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border rule bg-white/40 px-3.5 py-3">
        <div className="min-w-0">
          <div className="stamp-text text-ink-soft">{t('v.join.signedIn')}</div>
          <div className="truncate text-sm font-medium">{user?.email}</div>
        </div>
        <button type="button" className="btn-quiet btn-sm shrink-0" onClick={() => void signOut()}>{t('v.join.notYou')}</button>
      </div>

      <DataErrors className="mt-4" />

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <label className="block">
          <span className="stamp-text text-ink-soft">{t('v.join.name')}</span>
          <input className="field mt-1" required maxLength={80} autoComplete="name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder={t('v.join.namePlaceholder')} />
        </label>

        <fieldset>
          <legend className="stamp-text text-ink-soft">{t('v.join.iAm')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {TYPES.map((ty) => (
              <label key={ty.v} className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium ${f.visitorType === ty.v ? 'border-action bg-action/10 text-ink' : 'border-ink/15 bg-white/60'}`}>
                <input type="radio" name="vt" className="sr-only" checked={f.visitorType === ty.v} onChange={() => set('visitorType', ty.v)} />
                {t(ty.label)}
              </label>
            ))}
          </div>
        </fieldset>

        {f.visitorType !== 'guest' && (
          <label className="block">
            <span className="stamp-text text-ink-soft">{t('v.join.id')} <span className="font-normal normal-case tracking-normal">{t('v.join.optional')}</span></span>
            <input className="field mt-1" maxLength={40} inputMode="numeric" value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
          </label>
        )}

        {/*
          * `Select`, not an `<input list>`. A datalist draws its suggestions in the OS, so on a
          * phone it is a grey system sheet under a rounded teal form and on a desktop it is a
          * plain list that no style here reaches — the very thing Select exists to replace. The
          * list is closed anyway: every institution ends at "Other", which opens the free-text
          * field below.
          */}
        <div>
          <label htmlFor="join-institution" className="stamp-text block text-ink-soft">{t('v.join.institution')}</label>
          <Select
            id="join-institution" ariaLabel={t('v.join.institution')} className="mt-1"
            value={f.institution} onChange={(v) => set('institution', v)}
            placeholder={t('v.join.choose')}
            options={institutions.map((i) => ({ value: i, label: i }))}
          />
        </div>

        {f.institution === 'Other' && (
          <label className="block">
            <span className="stamp-text text-ink-soft">{t('v.join.institutionName')}</span>
            <input className="field mt-1" required maxLength={120} value={f.institutionOther} onChange={(e) => set('institutionOther', e.target.value)} />
          </label>
        )}

        {f.institution === 'MFU' && (
          <div>
            <label htmlFor="join-school" className="stamp-text block text-ink-soft">{t('v.join.school')}</label>
            <Select
              id="join-school" ariaLabel={t('v.join.school')} className="mt-1"
              value={f.school} onChange={(v) => set('school', v)}
              placeholder={t('v.join.choose')}
              options={schools.map((x) => ({ value: x, label: x }))}
            />
          </div>
        )}

        <div>
          <label htmlFor="join-country" className="stamp-text block text-ink-soft">{t('v.join.country')}</label>
          {/*
            * Nine options and a way out, rather than 256. Whatever has been chosen from the
            * search stays in the list as its own option, so the field always shows the answer
            * rather than reading "Other country" back at somebody who already answered.
            */}
          <Select
            id="join-country" ariaLabel={t('v.join.country')} className="mt-1"
            value={f.countryCode}
            onChange={(v) => {
              if (v === OTHER_COUNTRY) { setFindCountry(true); setCountryQuery(''); return }
              setFindCountry(false)
              chooseCountry(v)
            }}
            options={[
              ...common.map((x) => ({ value: x.code, label: x.name })),
              ...(!isCommon && f.countryCode ? [{ value: f.countryCode, label: countryName(f.countryCode) }] : []),
              { value: OTHER_COUNTRY, label: t('v.join.otherCountry') },
            ]}
          />

          {findCountry && (
            <div className="mt-2 rounded-xl border rule bg-white p-2">
              <input
                autoFocus type="search" className="field w-full" value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder={t('v.join.searchCountry')} aria-label={t('v.join.searchCountry')}
                // Enter in a one-line field submits the form; here it should pick the only match.
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (countryMatches.length === 1) { chooseCountry(countryMatches[0].code); setFindCountry(false) }
                }}
              />
              {/* Capped and scrollable: the whole A-Z list is here when nothing is typed. */}
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {countryMatches.map((x) => (
                  <li key={x.code}>
                    <button
                      type="button"
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink/6 ${f.countryCode === x.code ? 'font-semibold text-action' : ''}`}
                      onClick={() => { chooseCountry(x.code); setFindCountry(false) }}
                    >
                      {x.name}
                    </button>
                  </li>
                ))}
                {countryMatches.length === 0 && (
                  <li className="px-3 py-3 text-sm text-ink-soft">{t('v.join.noCountry')}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border rule bg-white/40 p-3">
          <label className="block">
            <span className="stamp-text text-ink-soft">{t('v.join.ethnic')} <span className="font-normal normal-case tracking-normal">{t('v.join.optional')}</span></span>
            <p className="mt-1 text-xs text-ink-soft">{t('v.join.ethnicNote')}</p>
            <input className="field mt-2" list="ethnic" maxLength={80} value={f.ethnicGroup} onChange={(e) => set('ethnicGroup', e.target.value)} placeholder={t('v.join.ethnicPlaceholder')} />
            <datalist id="ethnic">
              {/* The stored value stays English whichever way the toggle is set: it is data the
                  organisers report on, not a label. Only the option's own text is translated. */}
              <option value="Prefer not to say" label={t('v.join.preferNot')} />
              {ethnicOptions.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>
          {f.ethnicGroup && f.ethnicGroup !== 'Prefer not to say' && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.ethnicConsent} onChange={(e) => set('ethnicConsent', e.target.checked)} />
              <span>{t('v.join.ethnicConsent')} <span className="text-ink-soft">{t('v.join.ethnicConsentNote')}</span></span>
            </label>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} required />
          <span>
            {t('v.join.consent')}{' '}
            <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">{t('v.join.privacy')}</a>
          </span>
        </label>

        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy}>{busy ? t('v.join.creating') : t('v.join.create')}</button>
      </form>
      {/* The one screen a booth host who is not on anyone list reliably lands on: the guard sends
          every roleless account here. Without this they would have to be told the URL. */}
      <p className="mt-6 text-center text-xs text-ink-soft">
        {t('v.join.staffPrompt')}{' '}
        <Link to="/booth-access" className="link">{t('v.join.staffLink')}</Link>
      </p>
    </main>
  )
}

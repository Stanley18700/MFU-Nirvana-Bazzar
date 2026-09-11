import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { useEthnicGroups, useRefList } from '../../lib/data'
import { Toast, type Msg } from '../../components/ui'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'
import { countryName } from '../../lib/countries'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'

type Tab = 'institutions' | 'mfuSchools' | 'ethnicGroups'

// Keys, not words: module-level, so a translated label here could not follow the toggle.
const TABS: Array<{ id: Tab; label: StringKey; blurb: StringKey }> = [
  { id: 'institutions', label: 'refData.tab.institutions', blurb: 'refData.blurb.institutions' },
  { id: 'mfuSchools', label: 'refData.tab.schools', blurb: 'refData.blurb.schools' },
  { id: 'ethnicGroups', label: 'refData.tab.ethnic', blurb: 'refData.blurb.ethnic' },
]

/** One list per line, so a non-developer can paste from a spreadsheet. */
function Lines({ value, onChange, rows = 14 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  // Defensive: a stray non-list field in the document must never take the page down.
  const joined = Array.isArray(value) ? value.join('\n') : ''
  const [text, setText] = useState(joined)
  useEffect(() => { setText(joined) }, [joined])
  return (
    <textarea
      className="field mt-1 font-mono text-xs" rows={rows} value={text}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean)) }}
    />
  )
}

/** §4.1 / §13 — edit the registration form's suggestion lists without a redeploy or a reseed. */
export default function RefData() {
  const { t } = useLocale()
  const tabs = useSlidingPill()
  const [tab, setTab] = useState<Tab>('institutions')
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)

  const institutions = useRefList('institutions')
  const mfuSchools = useRefList('mfuSchools')
  const ethnic = useEthnicGroups()

  const [draftList, setDraftList] = useState<string[] | null>(null)
  const [draftEthnic, setDraftEthnic] = useState<Record<string, string[]> | null>(null)
  const [newCountry, setNewCountry] = useState('')

  const live = tab === 'institutions' ? institutions : mfuSchools
  const dirty = tab === 'ethnicGroups' ? draftEthnic !== null : draftList !== null
  const list = draftList ?? live
  const ethnicDraft = draftEthnic ?? ethnic

  // `next`, not `t`: `t` is the translate function in this scope now.
  function switchTab(next: Tab) {
    if (next === tab) return
    // Switching tabs used to throw the draft away silently.
    if (dirty && !window.confirm(t('refData.discard'))) return
    setTab(next); setDraftList(null); setDraftEthnic(null); setMsg(null)
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      if (tab === 'ethnicGroups') {
        const r = await api.saveRefData({ name: 'ethnicGroups', byCountry: ethnicDraft })
        setMsg({ tone: 'green', text: t('refData.savedCountries', { count: r.countries ?? 0 }) })
        setDraftEthnic(null)
      } else {
        const r = await api.saveRefData({ name: tab, list })
        setMsg({ tone: 'green', text: t('refData.savedEntries', { count: r.count ?? 0 }) })
        setDraftList(null)
      }
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  const meta = TABS.find((x) => x.id === tab)!
  useUnsavedGuard(dirty)

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">{t('refData.title')}</h1>
      <p className="mt-1 text-sm text-ink-soft">{t('refData.lead')}</p>

      {/* This row wraps, which is what --tab-y in the hook is for. */}
      <nav ref={tabs} className="tab-group mt-4 flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button key={x.id} onClick={() => switchTab(x.id)} role="tab" aria-selected={tab === x.id}
            className="tab px-4 py-2 text-sm">
            {t(x.label)}
          </button>
        ))}
      </nav>

      <Toast msg={msg} onClose={() => setMsg(null)} />

      <section className="card mt-4">
        <p className="text-xs text-ink-soft">{t(meta.blurb)}</p>

        {tab === 'ethnicGroups' ? (
          <div className="mt-4 flex flex-col gap-4">
            {Object.keys(ethnicDraft).sort().map((cc) => (
              <div key={cc}>
                <div className="flex items-center justify-between gap-2">
                  <label className="stamp-text text-ink-soft">{cc} · {countryName(cc)} · {ethnicDraft[cc].length}</label>
                  <button className="btn-danger-soft btn-sm"
                    onClick={() => { const n = { ...ethnicDraft }; delete n[cc]; setDraftEthnic(n) }}>
                    {t('refData.removeCountry')}
                  </button>
                </div>
                <Lines rows={Math.min(12, Math.max(4, ethnicDraft[cc].length + 1))} value={ethnicDraft[cc]}
                  onChange={(v) => setDraftEthnic({ ...ethnicDraft, [cc]: v })} />
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 border-t rule pt-4">
              <label className="text-sm">{t('refData.addCountry')}
                <input className="field mt-1 w-28 uppercase" maxLength={2} value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="MM" />
              </label>
              <button className="btn-ghost" disabled={newCountry.length !== 2 || !!ethnicDraft[newCountry]}
                onClick={() => { setDraftEthnic({ ...ethnicDraft, [newCountry]: [] }); setNewCountry('') }}>
                {t('refData.add')} {newCountry && countryName(newCountry)}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-3 block text-sm">{t('refData.onePerLine', { count: list.length })}
              <Lines value={list} onChange={setDraftList} />
            </label>
            <p className="mt-1 text-xs text-ink-soft">
              {t('refData.sortNote')}
              {tab === 'institutions' && ` ${t('refData.keepOther')}`}
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !dirty} onClick={save}>
            {t(busy ? 'common.saving' : 'common.save')}
          </button>
          <button className="btn-ghost" disabled={busy || !dirty}
            onClick={() => { setDraftList(null); setDraftEthnic(null); setMsg(null) }}>
            {t('common.discardChanges')}
          </button>
        </div>
      </section>
    </div>
  )
}

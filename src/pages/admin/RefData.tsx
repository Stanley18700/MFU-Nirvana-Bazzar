import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { useEthnicGroups, useRefList } from '../../lib/data'
import { Toast, type Msg } from '../../components/ui'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'
import { countryName } from '../../lib/countries'

type Tab = 'institutions' | 'mfuSchools' | 'ethnicGroups'

const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
  { id: 'institutions', label: 'Institutions', blurb: 'Universities offered in the registration form. Visitors can still type anything — this is a suggestion list.' },
  { id: 'mfuSchools', label: 'MFU schools', blurb: 'Offered when a visitor picks MFU as their institution.' },
  { id: 'ethnicGroups', label: 'Ethnic groups', blurb: 'Per country of origin. Sensitive data under PDPA s.26: optional for the visitor, gated behind its own consent, never shown per person, and suppressed below 5 in aggregate. The Office of International Affairs owns this wording.' },
]

/** One list per line, so a non-developer can paste from a spreadsheet. */
function Lines({ value, onChange, rows = 14 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  const [text, setText] = useState(value.join('\n'))
  useEffect(() => { setText(value.join('\n')) }, [value])
  return (
    <textarea
      className="field mt-1 font-mono text-xs" rows={rows} value={text}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean)) }}
    />
  )
}

/** §4.1 / §13 — edit the registration form's suggestion lists without a redeploy or a reseed. */
export default function RefData() {
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
  const ethnicLive = useMemo(
    () => Object.fromEntries(Object.entries(ethnic).map(([k, v]) => [k, v ?? []])) as Record<string, string[]>,
    [ethnic],
  )
  const ethnicDraft = draftEthnic ?? ethnicLive

  function switchTab(t: Tab) {
    if (t === tab) return
    // Switching tabs used to throw the draft away silently.
    if (dirty && !window.confirm('Discard the unsaved changes on this list?')) return
    setTab(t); setDraftList(null); setDraftEthnic(null); setMsg(null)
  }

  async function save() {
    setBusy(true); setMsg(null)
    try {
      if (tab === 'ethnicGroups') {
        const r = await api.saveRefData({ name: 'ethnicGroups', byCountry: ethnicDraft })
        setMsg({ tone: 'green', text: `Saved ${r.countries} countries. The registration form picks this up immediately.` })
        setDraftEthnic(null)
      } else {
        const r = await api.saveRefData({ name: tab, list })
        setMsg({ tone: 'green', text: `Saved ${r.count} entries. The registration form picks this up immediately.` })
        setDraftList(null)
      }
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  const meta = TABS.find((t) => t.id === tab)!
  useUnsavedGuard(dirty)

  return (
    <div className="page-in">
      <h1 className="text-2xl font-bold">Reference lists</h1>
      <p className="mt-1 text-sm text-navy-soft">
        What the registration form suggests. Editable here so the lists can change during the
        event without a redeploy — they used to be settable only by re-running the seed script.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)} role="tab" aria-selected={tab === t.id}
            className="tab bg-navy/5 px-4 py-2 text-sm">
            {t.label}
          </button>
        ))}
      </nav>

      <Toast msg={msg} onClose={() => setMsg(null)} />

      <section className="card mt-4">
        <p className="text-xs text-navy-soft">{meta.blurb}</p>

        {tab === 'ethnicGroups' ? (
          <div className="mt-4 flex flex-col gap-4">
            {Object.keys(ethnicDraft).sort().map((cc) => (
              <div key={cc}>
                <div className="flex items-center justify-between gap-2">
                  <label className="stamp-text text-navy-soft">{cc} · {countryName(cc)} · {ethnicDraft[cc].length}</label>
                  <button className="btn-danger-soft btn-sm"
                    onClick={() => { const n = { ...ethnicDraft }; delete n[cc]; setDraftEthnic(n) }}>
                    Remove country
                  </button>
                </div>
                <Lines rows={Math.min(12, Math.max(4, ethnicDraft[cc].length + 1))} value={ethnicDraft[cc]}
                  onChange={(v) => setDraftEthnic({ ...ethnicDraft, [cc]: v })} />
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 border-t rule pt-4">
              <label className="text-sm">Add a country (ISO code)
                <input className="field mt-1 w-28 uppercase" maxLength={2} value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="MM" />
              </label>
              <button className="btn-ghost" disabled={newCountry.length !== 2 || !!ethnicDraft[newCountry]}
                onClick={() => { setDraftEthnic({ ...ethnicDraft, [newCountry]: [] }); setNewCountry('') }}>
                Add {newCountry && countryName(newCountry)}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-3 block text-sm">One per line · {list.length} entries
              <Lines value={list} onChange={setDraftList} />
            </label>
            <p className="mt-1 text-xs text-navy-soft">
              Saved sorted alphabetically, with duplicates and blank lines dropped.
              {tab === 'institutions' && ' Keep "Other" in the list — the form shows a free-text box when it is chosen.'}
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-ghost" disabled={busy || !dirty}
            onClick={() => { setDraftList(null); setDraftEthnic(null); setMsg(null) }}>
            Discard changes
          </button>
        </div>
      </section>
    </div>
  )
}

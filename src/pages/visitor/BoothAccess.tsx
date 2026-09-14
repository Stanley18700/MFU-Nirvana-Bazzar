import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { useBooths, useDoc } from '../../lib/data'
import { api, friendlyError } from '../../lib/api'
import { Notice, Spinner } from '../../components/ui'
import { Select } from '../../components/Select'
import { AuthShell } from '../auth/parts'
import { useLocale } from '../../lib/locale'
import type { StaffRequestDoc } from '../../../shared/model'

/**
 * "I am running a booth, and nobody has my email address."
 *
 * The invitation flow cannot reach this person: `inviteOrganizer` needs an address and
 * `acceptInvite` refuses any caller whose verified email differs from the invited one. So they ask
 * here instead, and an admin decides. Filing this grants nothing — that is the whole design, and
 * why a screen anyone can open is safe to have.
 *
 * Outside every guard, like `/invite/:token`: the person has no role yet, and a guard would send
 * them to `/join` to become a visitor, which is not what they came for.
 */
export default function BoothAccess() {
  const { t } = useLocale()
  const { ready, user, role, refreshClaims } = useAuth()
  const nav = useNavigate()
  const booths = useBooths()
  const mine = useDoc<StaffRequestDoc>(user ? doc(db, 'staffRequests', user.uid) : null, [user?.uid], 'your request')
  const [boothId, setBoothId] = useState('')
  const [newName, setNewName] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!ready) return <AuthShell back="/" title={t('v.staff.title')}><div className="mt-4"><Spinner /></div></AuthShell>

  // Already staff — nothing to ask for. Sent on rather than shown a form that would be refused.
  if (role === 'organizer') return <AuthShell back="/" title={t('v.staff.title')} lead={t('v.staff.alreadyStaff')}><Link to="/booth" className="btn-primary mt-4 block py-3 text-center">{t('v.staff.toBooth')}</Link></AuthShell>
  if (role === 'admin') return <AuthShell back="/" title={t('v.staff.title')} lead={t('v.staff.alreadyStaff')}><Link to="/admin" className="btn-primary mt-4 block py-3 text-center">{t('v.staff.toAdmin')}</Link></AuthShell>

  if (!user) {
    return (
      <AuthShell back="/" title={t('v.staff.title')} lead={t('v.staff.signInFirst')}>
        <div className="mt-5 flex flex-col gap-3">
          <Link to="/signin" state={{ from: '/booth-access' }} className="btn-primary py-3 text-center">{t('v.staff.signIn')}</Link>
          <Link to="/signup" state={{ from: '/booth-access' }} className="btn-quiet py-3 text-center font-semibold text-ink">{t('v.staff.signUp')}</Link>
        </div>
      </AuthShell>
    )
  }

  const req = mine.data
  /*
   * Approved but the claim has not landed yet — `setCustomUserClaims` does not touch a token
   * already minted, so the row flips before the role does. Offering the refresh here turns a
   * confusing gap of up to fifteen minutes into a button.
   */
  if (req?.status === 'approved') {
    return (
      <AuthShell back={null} title={t('v.staff.approvedTitle')} lead={t('v.staff.approvedLead')}>
        <button
          className="btn-primary mt-4 w-full py-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await refreshClaims() } catch { /* the periodic refresh will get it */ }
            setBusy(false)
            nav('/booth', { replace: true })
          }}
        >{t(busy ? 'v.staff.opening' : 'v.staff.openBooth')}</button>
      </AuthShell>
    )
  }

  if (req?.status === 'pending') {
    return (
      <AuthShell back="/" title={t('v.staff.pendingTitle')} lead={t('v.staff.pendingLead')}>
        <div className="mt-4"><Notice>{req.boothId ? t('v.staff.pendingBooth', { booth: booths.find((b) => b.id === req.boothId)?.nameEn ?? req.boothId }) : t('v.staff.pendingNew', { booth: req.newBoothName ?? '' })}</Notice></div>
      </AuthShell>
    )
  }

  const rejected = req?.status === 'rejected'
  const ok = (!!boothId || !!newName.trim()) && !(boothId && newName.trim())

  async function submit() {
    setBusy(true); setErr(null)
    try {
      await api.requestBoothAccess({
        ...(boothId ? { boothId } : { newBoothName: newName.trim() }),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <AuthShell back="/" title={t('v.staff.title')} lead={t('v.staff.lead')}>
      {rejected && <div className="mt-4"><Notice tone="amber">{req?.decisionNote || t('v.staff.rejected')}</Notice></div>}
      {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}

      <div className="mt-5">
        <label htmlFor="ba-booth" className="mb-1 block text-xs font-medium text-ink-soft">{t('v.staff.pickBooth')}</label>
        <Select
          id="ba-booth" ariaLabel={t('v.staff.pickBooth')}
          value={boothId}
          onChange={(v) => { setBoothId(v); if (v) setNewName('') }}
          placeholder={t('v.staff.pickPlaceholder')}
          options={booths.map((b) => ({ value: b.id, label: b.nameEn }))}
        />
      </div>

      {/* Deliberately an either/or, not two fields that might both be filled: an admin reading the
          request should never have to guess which one the person meant. */}
      <div className="mt-4">
        <label htmlFor="ba-new" className="mb-1 block text-xs font-medium text-ink-soft">{t('v.staff.orType')}</label>
        <input
          id="ba-new" className="field" value={newName} maxLength={120}
          placeholder={t('v.staff.orTypePlaceholder')}
          onChange={(e) => { setNewName(e.target.value); if (e.target.value) setBoothId('') }}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="ba-note" className="mb-1 block text-xs font-medium text-ink-soft">{t('v.staff.note')}</label>
        <input id="ba-note" className="field" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>

      <button className="btn-primary mt-5 w-full py-3" disabled={!ok || busy} onClick={submit}>
        {t(busy ? 'v.staff.sending' : 'v.staff.send')}
      </button>
      <p className="mt-3 text-xs text-ink-soft">{t('v.staff.foot')}</p>
    </AuthShell>
  )
}

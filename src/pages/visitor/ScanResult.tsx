import { Link } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { useBooths, useDoc } from '../../lib/data'
import type { SurveyDoc } from '../../../shared/model'
import { Stamp } from '../../components/Stamp'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const booths = useBooths()
  const booth = 'boothId' in result ? booths.find((b) => b.id === result.boothId) : undefined

  if (result.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected animate tilt={(Math.random() * 8 - 4) | 0 || 5} size={300} />}
        <div>
          <div className="stamp-text text-ink-soft">Stamp collected</div>
          <div className="fig mt-1 text-4xl text-ink">+{result.pointsAwarded} points</div>
          <div className="mt-1 text-sm text-ink-soft">{booth?.nameEn} · {result.points} points total · {result.stampCount} stamps</div>
        </div>
        {result.unlockedTierIds.length > 0 && <Notice tone="green">You just unlocked a prize tier. Check the Prize page.</Notice>}
        {/* Offered only once the stamp is safely in the passport, and never in the way of it. */}
        <SurveyOffer boothId={result.boothId} accent={booth?.accentColor} />
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>Scan another</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">My stamps</Link>
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected size={240} className="pulse-once" />}
        <div className="font-semibold">Already stamped here</div>
        <div className="text-sm text-ink-soft">{booth?.nameEn} is in your passport. Try a booth you have not visited.</div>
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>Scan another</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">See what's left</Link>
        </div>
      </div>
    )
  }
  const map = {
    expired: { tone: 'amber' as const, text: 'That code has expired — the booth screen changes every 20 seconds. Scan it again.' },
    invalid: { tone: 'red' as const, text: 'Invalid code. Point your camera at the booth screen, or type the 6 characters shown under the QR.' },
    rate_limited: { tone: 'amber' as const, text: 'Too fast — give it a few seconds and try again.' },
    not_registered: { tone: 'amber' as const, text: 'Create your passport first, then scan.' },
  }[result.status]
  return (
    <div className="flex flex-col gap-4 p-6 page-in">
      <Notice tone={map.tone}>{map.text}</Notice>
      {result.status === 'not_registered' ? <Link to="/join" className="btn-primary">Create my passport</Link> : <button className="btn-primary" onClick={onRetry}>Try again</button>}
    </div>
  )
}

/**
 * The booth's invitation to answer a few questions, if it has published any.
 *
 * Read straight from `surveys/{boothId}` rather than through the callable: this renders in the
 * middle of the scan flow, and a visitor who is about to walk to the next booth should not wait
 * on a round trip to find out there is nothing to ask. Renders nothing at all when the booth has
 * no live survey, which is the common case.
 *
 * `surveyTaken` is checked so a second scan of a booth they already answered says nothing. The
 * rules let a visitor read only their own marker.
 */
function SurveyOffer({ boothId, accent }: { boothId: string; accent?: string }) {
  const { user } = useAuth()
  const { data: survey } = useDoc<SurveyDoc>(doc(db, 'surveys', boothId), [boothId])
  const { data: taken } = useDoc(user ? doc(db, 'surveyTaken', `${user.uid}_${boothId}`) : null, [user?.uid, boothId])

  const count = survey?.questions?.length ?? 0
  if (!survey?.active || count === 0 || taken) return null

  return (
    <div className="w-full rounded-xl border border-navy/10 bg-white/50 p-4 text-left">
      <div className="stamp-text" style={{ color: accent }}>{survey.title || 'A few questions'}</div>
      <p className="mt-1 text-sm text-navy-soft">
        {count} question{count === 1 ? '' : 's'} from this booth. Optional — your points are already saved.
      </p>
      <Link to={`/survey/${boothId}`} className="btn-primary mt-3 w-full">Answer</Link>
    </div>
  )
}

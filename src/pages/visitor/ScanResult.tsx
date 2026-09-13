import { Link } from 'react-router-dom'
import { stampMarks } from '../../lib/eventText'
import { useLocale } from '../../lib/locale'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { useBooths, useDoc, useEvent } from '../../lib/data'
import type { SurveyDoc } from '../../../shared/model'
import { Stamp } from '../../components/Stamp'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const booths = useBooths()
  const marks = stampMarks(useEvent())
  const { t, pick } = useLocale()
  const booth = 'boothId' in result ? booths.find((b) => b.id === result.boothId) : undefined

  if (result.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected animate tilt={(Math.random() * 8 - 4) | 0 || 5} size={300} {...marks} />}
        <div>
          <div className="stamp-text text-ink-soft">{t('res.collected')}</div>
          <div className="fig mt-1 text-4xl text-ink">{t('res.plusPoints', { n: result.pointsAwarded })}</div>
          <div className="mt-1 text-sm text-ink-soft">{t('res.totalLine', { booth: pick(booth?.nameEn, booth?.nameTh), points: result.points, stamps: result.stampCount })}</div>
        </div>
        {result.unlockedTierIds.length > 0 && <Notice tone="green">{t('res.unlocked')}</Notice>}
        {/* Offered only once the stamp is safely in the passport, and never in the way of it. */}
        <SurveyOffer boothId={result.boothId} accent={booth?.accentColor} />
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>{t('res.another')}</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">{t('res.myStamps')}</Link>
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected size={240} className="pulse-once" {...marks} />}
        <div className="font-semibold">{t('res.already')}</div>
        <div className="text-sm text-ink-soft">{t('res.alreadyLine', { booth: pick(booth?.nameEn, booth?.nameTh) })}</div>
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>{t('res.another')}</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">{t('res.seeLeft')}</Link>
        </div>
      </div>
    )
  }
  const map = {
    expired: { tone: 'amber' as const, text: t('res.expired') },
    invalid: { tone: 'red' as const, text: t('res.invalid') },
    rate_limited: { tone: 'amber' as const, text: t('res.rateLimited') },
    not_registered: { tone: 'amber' as const, text: t('res.notRegistered') },
  }[result.status]
  return (
    <div className="flex flex-col gap-4 p-6 page-in">
      <Notice tone={map.tone}>{map.text}</Notice>
      {result.status === 'not_registered' ? <Link to="/join" className="btn-primary">{t('res.createPassport')}</Link> : <button className="btn-primary" onClick={onRetry}>{t('res.tryAgain')}</button>}
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
  const { t } = useLocale()
  const { user } = useAuth()
  const { data: survey } = useDoc<SurveyDoc>(doc(db, 'surveys', boothId), [boothId])
  const { data: taken } = useDoc(user ? doc(db, 'surveyTaken', `${user.uid}_${boothId}`) : null, [user?.uid, boothId])

  const count = survey?.questions?.length ?? 0
  if (!survey?.active || count === 0 || taken) return null

  return (
    <div className="w-full rounded-xl border border-ink/10 bg-sky-100 p-4 text-left">
      <div className="stamp-text" style={{ color: accent }}>{survey.title || t('res.surveyTitle')}</div>
      <p className="mt-1 text-sm text-ink-soft">
        {count === 1 ? t('res.surveyCountOne') : t('res.surveyCount', { n: count })}
      </p>
      <Link to={`/survey/${boothId}`} className="btn-primary mt-3 w-full">{t('res.answer')}</Link>
    </div>
  )
}

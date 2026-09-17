import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, errorMessage, type SurveyOffer } from '../../lib/api'
import { useBooth } from '../../lib/data'
import { EVENT_SURVEY_ID } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import { useCooldown } from '../../lib/useCooldown'
import { SurveyForm, useAnswers, useMissing } from '../../components/SurveyForm'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { BoardingPass } from '../../components/BoardingPass'
import { SurveyReward } from '../../components/SurveyReward'
import { FestivalBackdrop } from '../auth/parts'
import { useFestivalSurvey } from '../../lib/festivalSurvey'

/**
 * How long the two in-page ways out are held when the visitor arrived by tapping "Take it" on
 * the gift offer, rather than by choosing the survey themselves.
 *
 * **This is a soft hold and nothing more.** The tab bar, the browser's own back gesture and a
 * reload all still work, and none of them are worth fighting — a form you genuinely cannot leave
 * is how you lose the whole session, not just the answers. What it buys is the second or two in
 * which somebody actually reads the first question instead of reflexively tapping past. The
 * countdown is always visible for the same reason: a button that is dead with no explanation
 * reads as a broken app, which costs more than it gains.
 */
const GIFT_HOLD_SECONDS = 10

/**
 * The booth's questions, offered after the stamp is already in the passport.
 *
 * Nothing here can cost the visitor anything: the points were awarded by `scan` before this
 * page existed, and Skip is a first-class way out rather than something hidden in a corner. A
 * survey that feels compulsory at a busy booth is a survey people resent answering.
 */
export default function Survey() {
  const { boothId = '' } = useParams()
  const nav = useNavigate()
  /*
   * The festival survey rides on the booth machinery under a reserved id, so everything below
   * works unchanged — but there is no booth behind it, and a page that says "Booth" in the
   * header and sends you back to the scanner afterwards would be wrong for it. Only the chrome
   * differs: where the visitor came from, and where they are sent next.
   */
  const festival = boothId === EVENT_SURVEY_ID
  // While the gift QR is being withheld, "your prize is not affected" is no longer true: the
  // points are safe but the hand-over is waiting on this form, and the line has to say so.
  const fs = useFestivalSurvey()
  const gatingGift = festival && fs.gate
  const { t, pick } = useLocale()
  const { data: booth } = useBooth(festival ? null : boothId)
  const home = festival ? '/passport/prize' : '/scan'
  const { answers, setAnswers } = useAnswers()
  const [offer, setOffer] = useState<SurveyOffer | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [done, setDone] = useState(false)
  const [rewardIndex, setRewardIndex] = useState<number | null>(null)

  /*
   * `?from=gift` is set by the gift offer's CTA and by nothing else, so choosing the survey from
   * the cover row or the Prize card is never held. A query param rather than router state so it
   * is obvious in the address bar what put the hold there.
   */
  const [params] = useSearchParams()
  const fromGift = festival && params.get('from') === 'gift'
  const { left: holdLeft } = useCooldown(GIFT_HOLD_SECONDS, fromGift)
  const holding = fromGift && !done && holdLeft > 0

  useEffect(() => {
    let live = true
    api.surveyForBooth({ boothId })
      .then((o) => { if (live) setOffer(o) })
      .catch((e) => { if (live) setErr(errorMessage(e)) })
    return () => { live = false }
  }, [boothId])

  const questions = offer?.status === 'ok' ? offer.questions : []
  const missing = useMissing(questions, answers)

  async function submit() {
    setTried(true)
    if (missing.length) {
      // Take them to the first unanswered required question rather than only saying there is one.
      document.getElementById(`q-${missing[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true); setErr(null)
    try {
      const res = await api.submitSurveyResponse({ boothId, answers })
      setRewardIndex(res.rewardIndex)
      setDone(true)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <><FestivalBackdrop hills={false} /><main className="relative mx-auto flex min-h-full max-w-md flex-col text-ink">
      <header className="flex items-center justify-between gap-2 px-5 py-4">
        {holding
          ? <span className="w-16 text-sm text-ink-soft/70" aria-live="off">{t('v.survey.holdBack', { s: holdLeft })}</span>
          : <BackLink to={festival ? '/passport/prize' : '/passport/stamps'}>{festival ? t('v.back.prize') : t('v.back.passport')}</BackLink>}
        <div className="stamp-text truncate text-ink">
          {festival ? t('v.survey.title') : booth ? pick(booth.nameEn, booth.nameTh) : t('v.survey.booth')}
        </div>
        <span className="w-16" />
      </header>
      <div className="flex-1 px-5 pb-8">{children}</div>
    </main></>
  )

  if (err && !offer) return shell(<Notice tone="red">{err}</Notice>)
  if (!offer) return shell(<Spinner label={t('v.survey.opening')} />)

  if (done) {
    return shell(
      <div className="flex flex-col items-center gap-4 py-10 text-center page-in">
        <div className="text-5xl" aria-hidden>✓</div>
        <div>
          <div className="stamp-text text-ink">{t('v.survey.thanks')}</div>
          <p className="mt-1 text-ink-soft">
            {festival
              ? t('v.survey.thanksFestival')
              : t('v.survey.thanksBooth', { booth: booth ? pick(booth.nameEn, booth.nameTh) : t('v.survey.booth') })}
          </p>
        </div>
        {/* The wheel, which renders the boarding pass itself when that is what came up. The bare
            pass is the fallback for a submission that carried no prize — a booth survey, or a
            festival answer given before the wheel shipped. */}
        {festival && (rewardIndex === null
          ? <BoardingPass className="w-full text-left" />
          : <SurveyReward rewardIndex={rewardIndex} className="w-full" />)}
        {/* For someone already past the threshold: the gift QR is now waiting on the Prize tab. */}
        {festival && <p className="text-sm text-ink-soft">{t('v.survey.qrReady')}</p>}
        <Link to={home} className="btn-primary w-full py-3.5 text-lg">
          {festival ? t('v.survey.backPrize') : t('v.survey.scanAnother')}
        </Link>
        <Link to="/passport/stamps" className="text-sm text-ink-soft underline">{t('v.survey.myStamps')}</Link>
      </div>,
    )
  }

  if (offer.status === 'none' || offer.status === 'done') {
    return shell(
      <div className="flex flex-col gap-4 py-6 page-in">
        <Notice tone="info">
          {offer.status === 'done'
            ? (festival ? t('v.survey.doneFestival') : t('v.survey.doneBooth'))
            : (festival ? t('v.survey.noneFestival') : t('v.survey.noneBooth'))}
        </Notice>
        <Link to={home} className="btn-primary">{festival ? t('v.survey.backPrize') : t('v.survey.scanAnother')}</Link>
      </div>,
    )
  }

  return shell(
    <div className="page-in">
      {offer.headerImageUrl && <img src={offer.headerImageUrl} alt="" className="mb-4 max-h-40 w-full rounded-xl object-cover" />}
      <h1 className="text-2xl font-bold">{offer.title}</h1>
      {offer.description && <p className="mt-1 text-sm text-ink-soft">{offer.description}</p>}
      <p className="mt-2 text-xs text-ink-soft">
        {t('v.survey.count', { n: questions.length })}
        {' · '}
        {gatingGift ? t('v.survey.gateRelease') : festival ? t('v.survey.noPrizeEffect') : t('v.survey.pointsSaved')}
      </p>

      {/* The questions sit on a white panel, the same surface every passport card uses. */}
      <div className="card card-static mt-5 p-3">
        {/* Anchors for the scroll-to-first-missing jump. */}
        {questions.map((q) => <span key={q.id} id={`q-${q.id}`} />)}
        <SurveyForm questions={questions} answers={answers} onChange={setAnswers}
          showErrors={tried} accent={booth?.accentColor} />
      </div>

      {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
      {tried && missing.length > 0 && (
        <div className="mt-4"><Notice tone="amber">{t('v.survey.missing', { n: missing.length })}</Notice></div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button className="btn-gold py-3.5 text-lg" onClick={submit} disabled={busy}>
          {busy ? t('v.survey.sending') : t('v.survey.submit')}
        </button>
        <button className="text-sm text-ink-soft underline disabled:no-underline disabled:opacity-60"
          onClick={() => nav(home, { replace: true })} disabled={holding}>
          {holding
            ? t('v.survey.holdSkip', { s: holdLeft })
            : festival ? t('v.survey.notNow') : t('v.survey.skip')}
        </button>
      </div>
    </div>,
  )
}

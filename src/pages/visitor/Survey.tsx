import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, errorMessage, type SurveyOffer } from '../../lib/api'
import { useLocale } from '../../lib/locale'
import { useBooth } from '../../lib/data'
import { SurveyForm, useAnswers, useMissing } from '../../components/SurveyForm'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'

/**
 * The booth's questions, offered after the stamp is already in the passport.
 *
 * Nothing here can cost the visitor anything: the points were awarded by `scan` before this
 * page existed, and Skip is a first-class way out rather than something hidden in a corner. A
 * survey that feels compulsory at a busy booth is a survey people resent answering.
 */
export default function Survey() {
  const { t, pick } = useLocale()
  const { boothId = '' } = useParams()
  const nav = useNavigate()
  const { data: booth } = useBooth(boothId)
  const { answers, setAnswers } = useAnswers()
  const [offer, setOffer] = useState<SurveyOffer | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [done, setDone] = useState(false)

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
      await api.submitSurveyResponse({ boothId, answers })
      setDone(true)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <><FestivalBackdrop hills={false} /><main className="relative mx-auto flex min-h-full max-w-md flex-col text-ink">
      <header className="flex items-center justify-between gap-2 px-5 py-4">
        <BackLink to="/passport/stamps">{t('pp.passport')}</BackLink>
        <div className="stamp-text truncate text-ink">{pick(booth?.nameEn, booth?.nameTh) || t('vsurvey.booth')}</div>
        <span className="w-16" />
      </header>
      <div className="flex-1 px-5 pb-8">{children}</div>
    </main></>
  )

  if (err && !offer) return shell(<Notice tone="red">{err}</Notice>)
  if (!offer) return shell(<Spinner label={t('vsurvey.opening')} />)

  if (done) {
    return shell(
      <div className="flex flex-col items-center gap-4 py-10 text-center page-in">
        <div className="text-5xl" aria-hidden>✓</div>
        <div>
          <div className="stamp-text text-ink">{t('vsurvey.thankYou')}</div>
          <p className="mt-1 text-ink-soft">{t('vsurvey.hasAnswers', { booth: pick(booth?.nameEn, booth?.nameTh) })}</p>
        </div>
        <Link to="/scan" className="btn-primary w-full py-3.5 text-lg">{t('vsurvey.scanAnother')}</Link>
        <Link to="/passport/stamps" className="text-sm text-ink-soft underline">{t('vsurvey.myStamps')}</Link>
      </div>,
    )
  }

  if (offer.status === 'none' || offer.status === 'done') {
    return shell(
      <div className="flex flex-col gap-4 py-6 page-in">
        <Notice tone="info">
          {offer.status === 'done'
            ? t('vsurvey.already')
            : t('vsurvey.nothing')}
        </Notice>
        <Link to="/scan" className="btn-primary">{t('vsurvey.scanAnother')}</Link>
      </div>,
    )
  }

  return shell(
    <div className="page-in">
      {offer.headerImageUrl && <img src={offer.headerImageUrl} alt="" className="mb-4 max-h-40 w-full rounded-xl object-cover" />}
      <h1 className="text-2xl font-bold">{offer.title}</h1>
      {offer.description && <p className="mt-1 text-sm text-ink-soft">{offer.description}</p>}
      <p className="mt-2 text-xs text-ink-soft">
        {questions.length} question{questions.length === 1 ? '' : 's'} · your stamp and points are already saved
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
        <div className="mt-4"><Notice tone="amber">
          {missing.length === 1 ? t('vsurvey.missingOne') : t('vsurvey.missing', { n: missing.length })}
        </Notice></div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button className="btn-gold py-3.5 text-lg" onClick={submit} disabled={busy}>
          {busy ? t('vsurvey.sending') : t('vsurvey.submit')}
        </button>
        <button className="text-sm text-ink-soft underline" onClick={() => nav('/scan', { replace: true })}>
          {t('vsurvey.skip')}
        </button>
      </div>
    </div>,
  )
}

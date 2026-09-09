import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, errorMessage, type SurveyOffer } from '../../lib/api'
import { useBooth } from '../../lib/data'
import { SurveyForm, useAnswers, useMissing } from '../../components/SurveyForm'
import { DarkNotice, Spinner } from '../../components/ui'

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
    <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="mx-auto flex min-h-full max-w-md flex-col bg-navy-deep text-paper">
      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/passport/stamps" className="text-sm text-paper/70">← Passport</Link>
        <div className="stamp-text text-gold">{booth?.nameEn ?? 'Booth'}</div>
        <span className="w-16" />
      </header>
      <div className="flex-1 px-5 pb-8">{children}</div>
    </main></>
  )

  if (err && !offer) return shell(<DarkNotice tone="red">{err}</DarkNotice>)
  if (!offer) return shell(<Spinner label="Opening the questions…" />)

  if (done) {
    return shell(
      <div className="flex flex-col items-center gap-4 py-10 text-center page-in">
        <div className="text-5xl" aria-hidden>✓</div>
        <div>
          <div className="stamp-text text-gold">Thank you</div>
          <p className="mt-1 text-paper/80">{booth?.nameEn} has your answers.</p>
        </div>
        <Link to="/scan" className="btn-gold w-full py-3.5 text-lg">Scan another booth</Link>
        <Link to="/passport/stamps" className="text-sm text-paper/60 underline">My stamps</Link>
      </div>,
    )
  }

  if (offer.status === 'none' || offer.status === 'done') {
    return shell(
      <div className="flex flex-col gap-4 py-6 page-in">
        <DarkNotice tone="info">
          {offer.status === 'done'
            ? 'You have already answered this booth\'s questions. Thank you.'
            : 'This booth is not asking anything at the moment.'}
        </DarkNotice>
        <Link to="/scan" className="btn-gold">Scan another booth</Link>
      </div>,
    )
  }

  return shell(
    <div className="page-in">
      {offer.headerImageUrl && <img src={offer.headerImageUrl} alt="" className="mb-4 max-h-40 w-full rounded-xl object-cover" />}
      <h1 className="text-2xl font-bold">{offer.title}</h1>
      {offer.description && <p className="mt-1 text-sm text-paper/75">{offer.description}</p>}
      <p className="mt-2 text-xs text-paper/55">
        {questions.length} question{questions.length === 1 ? '' : 's'} · your stamp and points are already saved
      </p>

      {/*
        * A paper panel, exactly as Scan.tsx frames a scan result: `card` is a light surface, and
        * the page around it is navy with light text, so without resetting the colour here the
        * questions render light-on-light and cannot be read.
        */}
      <div className="mt-5 rounded-3xl bg-paper p-3 text-navy">
        {/* Anchors for the scroll-to-first-missing jump. */}
        {questions.map((q) => <span key={q.id} id={`q-${q.id}`} />)}
        <SurveyForm questions={questions} answers={answers} onChange={setAnswers}
          showErrors={tried} accent={booth?.accentColor} />
      </div>

      {err && <div className="mt-4"><DarkNotice tone="red">{err}</DarkNotice></div>}
      {tried && missing.length > 0 && (
        <div className="mt-4"><DarkNotice tone="amber">
          {missing.length} required question{missing.length === 1 ? '' : 's'} still to answer.
        </DarkNotice></div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button className="btn-gold py-3.5 text-lg" onClick={submit} disabled={busy}>
          {busy ? 'Sending…' : 'Submit'}
        </button>
        <button className="text-sm text-paper/60 underline" onClick={() => nav('/scan', { replace: true })}>
          Skip — I would rather keep scanning
        </button>
      </div>
    </div>,
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection, useDoc } from '../../lib/data'
import { api, errorMessage } from '../../lib/api'
import { CsvButton, DataError, Notice, Spinner, fmt } from '../../components/ui'
import { ts } from '../../lib/eventText'
import { useLocale } from '../../lib/locale'
import {
  EVENT_SURVEY_ID, FESTIVAL_SURVEY,
  type SurveyAnswer, type SurveyDoc, type SurveyQuestion, type SurveyResponseDoc,
} from '../../../shared/model'

/**
 * The one survey the festival itself asks, on the page a visitor opens for their prize.
 *
 * It is stored as a booth survey under a reserved id (`EVENT_SURVEY_ID`), so everything here
 * is the existing machinery: `saveSurvey` writes it, `setSurveyActive` publishes it, the
 * visitor renderer draws it, `surveyResponses` holds the answers. This page is only the three
 * things an admin needs that the booth builder does not offer — install the standard question
 * set, publish it, and read the results without leaving the console.
 *
 * Answers carry no visitor id (§10), which is why they can be read here in full.
 */
export default function FestivalSurvey() {
  const { t } = useLocale()
  const { data: survey, loading } = useDoc<SurveyDoc>(doc(db, 'surveys', EVENT_SURVEY_ID), [], 'the festival survey')
  const responses = useCollection<SurveyResponseDoc>(
    query(collection(db, 'surveyResponses'), where('boothId', '==', EVENT_SURVEY_ID)),
    [], 'the festival responses',
  )
  const [busy, setBusy] = useState<'' | 'install' | 'publish'>('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const questions = survey?.questions ?? []
  const live = !!survey?.active && questions.length > 0

  /**
   * Writing the standard set is `saveSurvey` like any other edit, so it is audited, and so the
   * previous question set is retired to a version document rather than overwritten. That is
   * what stops a re-install mid-event from relabelling answers already given.
   */
  async function install() {
    setBusy('install'); setErr(null); setMsg(null)
    try {
      await api.saveSurvey({
        boothId: EVENT_SURVEY_ID,
        title: FESTIVAL_SURVEY.title,
        description: FESTIVAL_SURVEY.description,
        questions: FESTIVAL_SURVEY.questions,
        // Never published by a write: publishing is its own, deliberate action below.
        active: !!survey?.active,
      })
      setMsg(t('admin.fsurvey.installed'))
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy('') }
  }

  async function publish(active: boolean) {
    setBusy('publish'); setErr(null); setMsg(null)
    try {
      await api.setSurveyActive({ boothId: EVENT_SURVEY_ID, active })
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy('') }
  }

  if (loading) return <Spinner />

  const answered = responses.data.length
  const installedDiffers = questions.length > 0 && normalise(questions) !== normalise(FESTIVAL_SURVEY.questions)

  return (
    <div className="page-in">
      <header>
        <h1 className="text-2xl font-bold">{t('admin.fsurvey.title')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('admin.fsurvey.lead')}</p>
      </header>

      {err && <div className="mt-4"><Notice tone="red">{err}</Notice></div>}
      {msg && <div className="mt-4"><Notice tone="green">{msg}</Notice></div>}

      <section className="card card-static mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="stamp-text text-ink-soft">{t('admin.fsurvey.state')}</div>
            <div className="mt-1 font-semibold">
              {questions.length === 0
                ? t('admin.fsurvey.notInstalled')
                : live ? t('admin.fsurvey.live') : t('admin.fsurvey.draft')}
            </div>
            <div className="mt-1 text-sm text-ink-soft">
              {t('admin.fsurvey.counts', { q: fmt(questions.length), n: fmt(answered) })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-quiet" onClick={() => void install()} disabled={busy !== ''}>
              {questions.length === 0 ? t('admin.fsurvey.install') : t('admin.fsurvey.reinstall')}
            </button>
            {questions.length > 0 && (
              <button
                className={live ? 'btn-ghost' : 'btn-primary'}
                onClick={() => void publish(!live)}
                disabled={busy !== ''}
              >
                {live ? t('admin.fsurvey.unpublish') : t('admin.fsurvey.publish')}
              </button>
            )}
          </div>
        </div>

        {questions.length === 0 && (
          <p className="mt-3 text-sm text-ink-soft">{t('admin.fsurvey.installHint')}</p>
        )}
        {installedDiffers && (
          <div className="mt-3"><Notice tone="amber">{t('admin.fsurvey.edited')}</Notice></div>
        )}
        {questions.length > 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            {t('admin.fsurvey.editHint')}{' '}
            <Link className="underline" to={`/booth/survey?boothId=${EVENT_SURVEY_ID}`}>{t('admin.fsurvey.openBuilder')}</Link>
          </p>
        )}
      </section>

      <DataError error={responses.error} what="the festival responses" />

      {questions.length > 0 && (
        <Results questions={questions} responses={responses.data} answered={answered} />
      )}
    </div>
  )
}

/**
 * One block per question. Closed questions get counts and a bar; open ones get the text.
 *
 * Everything is computed here from the responses already loaded rather than from a counter,
 * because this is read a handful of times after the festival, not once a second during it —
 * and a few hundred documents is a smaller thing to maintain than another aggregate.
 */
function Results({ questions, responses, answered }: {
  questions: SurveyQuestion[]
  responses: Array<SurveyResponseDoc & { id: string }>
  answered: number
}) {
  const { t } = useLocale()

  const csvRows = responses.map((r) => {
    const row: Record<string, string | number> = { submitted: ts(r.submittedAt), version: r.surveyVersion ?? 1 }
    for (const q of questions) row[q.id] = flat(r.answers?.[q.id])
    return row
  })

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t('admin.fsurvey.results', { n: fmt(answered) })}</h2>
        <CsvButton rows={csvRows} name="festival-feedback" />
      </div>

      {answered === 0
        ? <p className="mt-3 text-sm text-ink-soft">{t('admin.fsurvey.noneYet')}</p>
        : (
          <div className="mt-3 space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="card card-static p-4">
                <div className="text-sm font-semibold leading-snug">{q.title}</div>
                <QuestionResult q={q} responses={responses} />
              </div>
            ))}
          </div>
        )}
    </section>
  )
}

function QuestionResult({ q, responses }: { q: SurveyQuestion; responses: Array<SurveyResponseDoc & { id: string }> }) {
  const { t } = useLocale()
  const values = responses.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== '')

  if (q.kind === 'scale' || q.kind === 'rating') {
    const nums = values.filter((v): v is number => typeof v === 'number')
    const lo = q.kind === 'scale' ? q.scaleMin ?? 1 : 1
    const hi = q.kind === 'scale' ? q.scaleMax ?? 5 : q.stars ?? 5
    const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
    const buckets: Array<[number, number]> = []
    for (let n = lo; n <= hi; n++) buckets.push([n, nums.filter((v) => v === n).length])
    return (
      <div className="mt-2">
        <div className="fig text-2xl">{mean == null ? '–' : mean.toFixed(2)}</div>
        <div className="mt-2 space-y-1">
          {buckets.map(([n, c]) => <Bar key={n} label={String(n)} count={c} total={nums.length} />)}
        </div>
      </div>
    )
  }

  if (q.kind === 'choice' || q.kind === 'dropdown' || q.kind === 'checkboxes') {
    const picked = values.flatMap((v) => (Array.isArray(v) ? v : [v as string]))
    return (
      <div className="mt-2 space-y-1">
        {(q.options ?? []).map((o) => (
          <Bar key={o} label={o} count={picked.filter((p) => p === o).length} total={picked.length} />
        ))}
      </div>
    )
  }

  // short | paragraph | date — the words themselves, newest first as they came back.
  const texts = values.filter((v): v is string => typeof v === 'string')
  if (!texts.length) return <p className="mt-2 text-sm text-ink-soft">{t('admin.fsurvey.noAnswers')}</p>
  return (
    <ul className="mt-2 space-y-1">
      {texts.map((v, i) => (
        <li key={i} className="whitespace-pre-wrap border-l-2 rule pl-3 text-sm">{v}</li>
      ))}
    </ul>
  )
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-1/2 shrink-0 truncate text-ink-soft" title={label}>{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink/5">
        <span className="block h-full rounded-full bg-sky-700" style={{ width: `${pct}%` }} />
      </span>
      <span className="fig w-10 shrink-0 text-right">{count}</span>
    </div>
  )
}

/** One cell of CSV. Checkbox answers become a semicolon list, which Excel will not split. */
function flat(v: SurveyAnswer | undefined): string | number {
  if (v === undefined) return ''
  if (Array.isArray(v)) return v.join('; ')
  return v
}

/**
 * The stored questions compared to the ones this build ships, ignoring differences that are
 * not edits.
 *
 * `cleanQuestions` on the server rebuilds every question field by field: it emits its own key
 * order and sets `imageUrl: null` on questions that never had an image. A plain
 * `JSON.stringify` comparison therefore reports "edited" the instant the standard set is
 * installed, having compared the shape of the round trip rather than the wording — which is
 * exactly what it did on the first deploy.
 */
function normalise(questions: SurveyQuestion[]): string {
  return JSON.stringify(questions.map((q) => Object.fromEntries(
    Object.entries(q)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  )))
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { ms, useCollection, useDoc } from '../../lib/data'
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
  const [busy, setBusy] = useState<'' | 'install' | 'publish' | 'gate'>('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const questions = survey?.questions ?? []
  const live = !!survey?.active && questions.length > 0
  const gating = live && survey?.gateGift === true

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
      // `gateGift` is left out on purpose: publishing must never re-arm a gate somebody took down.
      await api.setSurveyActive({ boothId: EVENT_SURVEY_ID, active })
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy('') }
  }

  /**
   * The gate on its own, so the prize desk can stop withholding the gift QR the moment the
   * queue backs up without unpublishing the survey and losing the answers still coming in.
   */
  async function setGate(gateGift: boolean) {
    setBusy('gate'); setErr(null); setMsg(null)
    try {
      await api.setSurveyActive({ boothId: EVENT_SURVEY_ID, active: true, gateGift })
      setMsg(gateGift ? t('admin.fsurvey.gateOnDone') : t('admin.fsurvey.gateOffDone'))
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

        {live && (
          <div className="mt-4 rounded-2xl border border-foil/40 bg-foil/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{t('admin.fsurvey.gateTitle')}</div>
                <div className="mt-1 text-sm text-ink-soft">
                  {gating ? t('admin.fsurvey.gateOn') : t('admin.fsurvey.gateOff')}
                </div>
              </div>
              <button
                className={gating ? 'btn-ghost' : 'btn-gold'}
                onClick={() => void setGate(!gating)}
                disabled={busy !== ''}
              >
                {gating ? t('admin.fsurvey.gateStop') : t('admin.fsurvey.gateStart')}
              </button>
            </div>
          </div>
        )}
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

/** How many free-text answers are drawn before the rest go behind "show all". */
const TEXT_PAGE = 50

type QStat =
  | { kind: 'num'; counts: Map<number, number>; sum: number; total: number }
  | { kind: 'opt'; counts: Map<string, number>; total: number }
  | { kind: 'text'; texts: string[] }

/**
 * Every tally for every question, in ONE pass over the responses.
 *
 * It used to be worked out inside the render: each of the fourteen blocks walked the whole list,
 * and a closed question walked it again per option — so a five-option question read every
 * response five times. That is fine for the twenty answers it was written against and quietly
 * quadratic at festival scale: the page re-renders on every submission, because the responses
 * are live, so a thousand answers meant tens of thousands of comparisons between one visitor
 * pressing Send and the next.
 *
 * Keyed on the responses, so it is recomputed when an answer actually arrives and not merely
 * because something else on the page changed.
 */
function useQuestionStats(questions: SurveyQuestion[], responses: Array<SurveyResponseDoc & { id: string }>) {
  return useMemo(() => {
    const out = new Map<string, QStat>()
    for (const q of questions) {
      if (q.kind === 'scale' || q.kind === 'rating') {
        const lo = q.kind === 'scale' ? q.scaleMin ?? 1 : 1
        const hi = q.kind === 'scale' ? q.scaleMax ?? 5 : q.stars ?? 5
        const counts = new Map<number, number>()
        // Seeded so a value nobody picked still gets its bar, rather than the row vanishing.
        for (let n = lo; n <= hi; n++) counts.set(n, 0)
        out.set(q.id, { kind: 'num', counts, sum: 0, total: 0 })
      } else if (q.kind === 'choice' || q.kind === 'dropdown' || q.kind === 'checkboxes') {
        const counts = new Map<string, number>()
        for (const o of q.options ?? []) counts.set(o, 0)
        out.set(q.id, { kind: 'opt', counts, total: 0 })
      } else {
        out.set(q.id, { kind: 'text', texts: [] })
      }
    }
    for (const r of responses) {
      for (const q of questions) {
        const v = r.answers?.[q.id]
        if (v === undefined || v === '') continue
        const s = out.get(q.id)
        if (!s) continue
        if (s.kind === 'num') {
          if (typeof v === 'number') { s.sum += v; s.total++; s.counts.set(v, (s.counts.get(v) ?? 0) + 1) }
        } else if (s.kind === 'opt') {
          for (const p of Array.isArray(v) ? v : [v as string]) {
            if (typeof p !== 'string') continue
            s.counts.set(p, (s.counts.get(p) ?? 0) + 1)
            s.total++
          }
        } else if (typeof v === 'string') {
          s.texts.push(v)
        }
      }
    }
    return out
  }, [questions, responses])
}

/**
 * One block per question. Closed questions get counts and a bar; open ones get the text.
 *
 * Everything is computed from the responses already loaded rather than from a counter: the
 * answers carry no visitor id, so there is nothing to aggregate them by, and one pass over the
 * list (above) is cheaper than another set of counters to keep honest.
 */
function Results({ questions, responses, answered }: {
  questions: SurveyQuestion[]
  responses: Array<SurveyResponseDoc & { id: string }>
  answered: number
}) {
  const { t } = useLocale()
  const stats = useQuestionStats(questions, responses)

  /*
   * Shaped like a Google Forms export, which is what the organisers know how to read: one row
   * per response, a Timestamp first, then one column per question headed by the question's own
   * wording rather than its id. Two questions with the same title are kept apart by their id.
   * `columns` pins the order to the survey's, so an unanswered optional question still has its
   * column and a question nobody answered yet does not vanish from the file.
   */
  const header = (q: SurveyQuestion) => {
    const title = q.title.trim() || q.id
    return questions.some((o) => o.id !== q.id && o.title.trim() === title) ? `${title} [${q.id}]` : title
  }
  const csvColumns = ['Timestamp', ...questions.map(header), 'Survey version']
  // Memoised for the same reason as the tallies: this builds one row per response with a column
  // per question, and it was being rebuilt on every render of the page rather than when the
  // answers changed. Nothing reads it until the button is pressed.
  const csvRows = useMemo(() => responses
    .slice()
    .sort((a, b) => (ms(a.submittedAt) ?? 0) - (ms(b.submittedAt) ?? 0))
    .map((r) => {
      const row: Record<string, string | number> = { Timestamp: ts(r.submittedAt), 'Survey version': r.surveyVersion ?? 1 }
      for (const q of questions) row[header(q)] = flat(r.answers?.[q.id])
      return row
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [responses, questions])

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t('admin.fsurvey.results', { n: fmt(answered) })}</h2>
        <CsvButton rows={csvRows} columns={csvColumns} name="festival-feedback" />
      </div>

      {answered === 0
        ? <p className="mt-3 text-sm text-ink-soft">{t('admin.fsurvey.noneYet')}</p>
        : (
          <div className="mt-3 space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="card card-static p-4">
                <div className="text-sm font-semibold leading-snug">{q.title}</div>
                <QuestionResult q={q} stat={stats.get(q.id)} />
              </div>
            ))}
          </div>
        )}
    </section>
  )
}

/** Draws one question's precomputed tally. Does no counting of its own. */
function QuestionResult({ q, stat }: { q: SurveyQuestion; stat?: QStat }) {
  const { t } = useLocale()
  if (!stat) return null

  if (stat.kind === 'num') {
    const mean = stat.total ? stat.sum / stat.total : null
    return (
      <div className="mt-2">
        <div className="fig text-2xl">{mean == null ? '–' : mean.toFixed(2)}</div>
        <div className="mt-2 space-y-1">
          {[...stat.counts.entries()].map(([n, c]) => (
            <Bar key={n} label={String(n)} count={c} total={stat.total} />
          ))}
        </div>
      </div>
    )
  }

  if (stat.kind === 'opt') {
    return (
      <div className="mt-2 space-y-1">
        {(q.options ?? []).map((o) => (
          <Bar key={o} label={o} count={stat.counts.get(o) ?? 0} total={stat.total} />
        ))}
      </div>
    )
  }

  if (!stat.texts.length) return <p className="mt-2 text-sm text-ink-soft">{t('admin.fsurvey.noAnswers')}</p>
  return <TextAnswers texts={stat.texts} />
}

/**
 * The words themselves — but not all of them at once.
 *
 * Three of the fourteen questions are free text, so drawing every answer meant three list items
 * per visitor: at a thousand answers, three thousand paragraphs of arbitrary length in the DOM,
 * rebuilt every time somebody pressed Send. The page stopped scrolling long before the numbers
 * above it stopped being readable. The first fifty are enough to get the sense of it, the rest
 * are one press away, and the CSV has had every one of them all along.
 */
function TextAnswers({ texts }: { texts: string[] }) {
  const { t } = useLocale()
  const [all, setAll] = useState(false)
  const shown = all ? texts : texts.slice(0, TEXT_PAGE)
  return (
    <>
      <ul className="mt-2 space-y-1">
        {shown.map((v, i) => (
          <li key={i} className="whitespace-pre-wrap border-l-2 rule pl-3 text-sm">{v}</li>
        ))}
      </ul>
      {texts.length > TEXT_PAGE && (
        <button type="button" className="btn-quiet btn-sm mt-2" onClick={() => setAll((v) => !v)}>
          {all ? t('admin.fsurvey.showFewer') : t('admin.fsurvey.showAll', { n: fmt(texts.length) })}
        </button>
      )}
    </>
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

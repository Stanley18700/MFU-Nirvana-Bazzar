import { useMemo, useState } from 'react'
import { OrganizerPage } from '../../components/OrganizerPage'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { ms, useBooth, useBoothStat, useCollection, useDoc } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { CsvButton, DataErrors, Fig, Notice, Spinner, fmt } from '../../components/ui'
import { clock } from '../../lib/eventText'
import { hasOptions, type SurveyAnswer, type SurveyDoc, type SurveyQuestion, type SurveyResponseDoc } from '../../../shared/model'
import { onChrome } from '../../lib/onChrome'

/** Free text is listed, not charted; everything else groups into counts. */
const isText = (q: SurveyQuestion) => q.kind === 'short' || q.kind === 'paragraph' || q.kind === 'date'

/**
 * What the booth's answers add up to.
 *
 * There is deliberately no name, passport number or visitor id anywhere on this page, because
 * there is none in the data: `surveyResponses` documents carry answers and a timestamp and
 * nothing else (§10 — sensitive answers are never shown per person). "Who said this?" is a
 * question this screen cannot answer, by construction rather than by omission.
 */
export default function SurveyResults() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  const { t, pick } = useLocale()
  const { data: booth, loading } = useBooth(boothId)
  const survey = useDoc<SurveyDoc>(boothId ? doc(db, 'surveys', boothId) : null, [boothId], 'this survey')
  const { data: stat } = useBoothStat(boothId)
  const [showAll, setShowAll] = useState(false)

  const responses = useCollection<SurveyResponseDoc>(
    boothId
      ? query(collection(db, 'surveyResponses'), where('boothId', '==', boothId), orderBy('submittedAt', 'desc'), limit(1000))
      : null,
    [boothId],
    'the survey answers',
  )

  const questions = survey.data?.questions ?? []
  const rows = responses.data

  /** One row per response, columns named by question — the shape an organizer wants in Excel. */
  const csv = useMemo(() => rows.map((r, i) => {
    const out: Record<string, string | number> = {
      response: rows.length - i,
      submitted: ms(r.submittedAt) ? new Date(ms(r.submittedAt)!).toISOString() : '',
    }
    for (const q of questions) out[q.title || q.id] = formatAnswer(r.answers?.[q.id])
    return out
  }), [rows, questions])

  const shell = (children: React.ReactNode) => (
    <OrganizerPage boothId={boothId} booth={booth} marks={undefined}>{children}</OrganizerPage>
  )
  if (boothId && loading) return shell(<Spinner label={t('stats.loading')} />)
  if (!boothId || !booth) return shell(<Notice tone="amber">{!boothId ? t('stats.noBooth') : t('stats.boothGone')}</Notice>)

  const stamped = stat?.stamps ?? 0
  const rate = stamped > 0 ? Math.round((rows.length / stamped) * 100) : null
  const builder = `/booth/survey${role === 'admin' ? `?boothId=${boothId}` : ''}`

  return shell(
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <div className="stamp-text" style={{ color: onChrome(booth.accentColor) }}>Survey results</div>
          <h1 className="text-2xl font-bold">{pick(booth.nameEn, booth.nameTh)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={builder} className="btn-dark btn-sm">Edit the questions</Link>
          <CsvButton rows={csv} name={`${boothId}-survey-responses`} label="Export CSV" />
        </div>
      </div>
      <DataErrors dark className="mt-3" />

      <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Fig value={fmt(rows.length)} label="Responses" accent={onChrome(booth.accentColor)}
          sub={rows.length ? `last at ${clock(ms(rows[0].submittedAt) ?? 0)}` : 'none yet'} />
        <Fig value={rate === null ? '–' : `${rate}%`} label="Of those stamped" sub={`${fmt(stamped)} collected the stamp`} />
        <Fig value={survey.data?.active ? 'Live' : 'Draft'} label="Status" sub={`${questions.length} question${questions.length === 1 ? '' : 's'}`} />
      </section>

      {questions.length === 0 && (
        <div className="mt-4"><Notice tone="info">
          This booth has no questions yet. <Link to={builder} className="underline">Build the survey</Link> and publish it.
        </Notice></div>
      )}

      {questions.length > 0 && rows.length === 0 && (
        <div className="mt-4"><Notice tone="info">
          No answers yet. {survey.data?.active
            ? 'Visitors are offered the survey after they collect this booth\'s stamp.'
            : 'The survey is still a draft, so nobody has been asked.'}
        </Notice></div>
      )}

      {rows.length > 0 && questions.map((q, i) => (
        <QuestionResult key={q.id} q={q} index={i} rows={rows} accent={onChrome(booth.accentColor)}
          boothId={boothId} showAll={showAll} />
      ))}

      {rows.length > 0 && (
        <section className="card mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="stamp-text text-ink-soft">Every response · {fmt(rows.length)}</h2>
            <div className="flex items-center gap-2">
              <button className="btn-quiet btn-sm" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show 20' : 'Show all'}
              </button>
              <CsvButton rows={csv} name={`${boothId}-survey-responses`} />
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            In the order they arrived. Answers are not linked to a visitor — nobody's name or
            passport number is stored with them.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-soft">
                  <th className="py-1 pr-2">#</th><th className="pr-2">When</th>
                  {questions.map((q, i) => <th key={q.id} className="pr-2">{q.title || `Q${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 20)).map((r, i) => (
                  <tr key={r.id} className="border-t rule align-top">
                    <td className="py-1.5 pr-2 text-xs text-ink-soft tabular-nums">{rows.length - i}</td>
                    <td className="pr-2 text-xs text-ink-soft">{ms(r.submittedAt) ? clock(ms(r.submittedAt)!) : '–'}</td>
                    {questions.map((q) => (
                      <td key={q.id} className="max-w-[16rem] pr-2">{formatAnswer(r.answers?.[q.id]) || <span className="text-ink-soft">–</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!showAll && rows.length > 20 && (
            <p className="mt-2 text-xs text-ink-soft">Showing the 20 most recent of {fmt(rows.length)}.</p>
          )}
        </section>
      )}
    </>,
  )
}

// ---------- one question's answers ----------

function QuestionResult({ q, index, rows, accent, boothId, showAll }: {
  q: SurveyQuestion
  index: number
  rows: Array<SurveyResponseDoc & { id: string }>
  accent: string
  boothId: string
  showAll: boolean
}) {
  const answered = rows.filter((r) => r.answers?.[q.id] !== undefined)
  const skipped = rows.length - answered.length

  // Counts per option / per point on the scale. Options come from the question rather than from
  // the answers, so an option nobody picked still shows as a zero instead of vanishing.
  const buckets = useMemo(() => {
    if (isText(q)) return []
    const keys: string[] = hasOptions(q.kind)
      ? [...(q.options ?? [])]
      : q.kind === 'scale'
        ? Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, i) => String((q.scaleMin ?? 1) + i))
        : Array.from({ length: q.stars ?? 5 }, (_, i) => String(i + 1))
    const count = new Map(keys.map((k) => [k, 0]))
    for (const r of answered) {
      const a = r.answers[q.id]
      for (const v of Array.isArray(a) ? a : [a]) {
        const k = String(v)
        if (count.has(k)) count.set(k, count.get(k)! + 1)
      }
    }
    return keys.map((k) => ({ label: k, count: count.get(k) ?? 0 }))
  }, [q, answered])

  // Only meaningful where the answer is a number.
  const average = useMemo(() => {
    if (q.kind !== 'scale' && q.kind !== 'rating') return null
    const nums = answered.map((r) => r.answers[q.id]).filter((a): a is number => typeof a === 'number')
    if (!nums.length) return null
    return nums.reduce((s, n) => s + n, 0) / nums.length
  }, [q, answered])

  const texts = isText(q)
    ? answered.map((r) => ({ id: r.id, text: formatAnswer(r.answers[q.id]), at: ms(r.submittedAt) }))
    : []
  const top = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <section className="card mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            <span className="text-ink-soft">{index + 1}.</span> {q.title || `Question ${index + 1}`}
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {fmt(answered.length)} answered{skipped > 0 && ` · ${fmt(skipped)} skipped`}
            {average !== null && ` · average ${average.toFixed(1)}${q.kind === 'rating' ? ` of ${q.stars ?? 5}` : ''}`}
          </p>
        </div>
        <CsvButton
          rows={isText(q)
            ? texts.map((x, i) => ({ response: i + 1, answer: x.text }))
            : buckets.map((b) => ({ option: b.label, count: b.count }))}
          name={`${boothId}-q${index + 1}`} />
      </div>

      {!isText(q) && buckets.length > 0 && (
        <>
          {/* A labelled bar list rather than a chart for options: option text is long and a
              rotated x-axis label is unreadable on the tablet these screens run on. */}
          {hasOptions(q.kind) ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {buckets.map((b) => (
                <li key={b.label} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words">{b.label}</span>
                    <span className="fig shrink-0 tabular-nums">{b.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-ink/5">
                    <div className="h-2 rounded-full" style={{ width: `${(b.count / top) * 100}%`, background: accent }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 h-40">
              <ResponsiveContainer>
                <BarChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(22,35,58,.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(22,35,58,.05)' }} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
                  <Bar dataKey="count" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {isText(q) && (
        texts.length === 0
          ? <p className="mt-3 text-sm text-ink-soft">Nobody answered this one.</p>
          : <ul className="mt-3 flex flex-col gap-2">
              {(showAll ? texts : texts.slice(0, 10)).map((x) => (
                <li key={x.id} className="rounded-lg bg-white/50 px-3 py-2 text-sm">
                  <span className="break-words">{x.text}</span>
                  {x.at && <span className="ml-2 text-xs text-ink-soft">{clock(x.at)}</span>}
                </li>
              ))}
              {!showAll && texts.length > 10 && (
                <li className="text-xs text-ink-soft">…and {fmt(texts.length - 10)} more — use Show all, or export the CSV.</li>
              )}
            </ul>
      )}
    </section>
  )
}

/** One answer as a single cell: checkboxes join with a comma, numbers and text pass through. */
function formatAnswer(a: SurveyAnswer | undefined): string {
  if (a === undefined || a === null) return ''
  if (Array.isArray(a)) return a.join(', ')
  return String(a)
}

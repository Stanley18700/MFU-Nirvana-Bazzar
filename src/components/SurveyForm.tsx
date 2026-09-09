import { useMemo, useState } from 'react'
import { answerIsEmpty, type SurveyAnswer, type SurveyQuestion } from '../../shared/model'

export type Answers = Record<string, SurveyAnswer>

/**
 * Renders a booth's questions and collects the answers.
 *
 * One component, two callers: the visitor's survey page and the live preview in the organizer's
 * builder. That is deliberate — an organizer who is happy with the preview has seen the real
 * thing, not an approximation of it, and a new question type cannot render correctly in one
 * place and wrongly in the other.
 *
 * `readOnly` is the preview: everything is laid out and interactive to look at, but nothing is
 * submitted.
 */
export function SurveyForm({ questions, answers, onChange, showErrors = false, readOnly = false, accent }: {
  questions: SurveyQuestion[]
  answers: Answers
  onChange: (a: Answers) => void
  /** Turns the required-question hints on — set once the visitor has tried to submit. */
  showErrors?: boolean
  readOnly?: boolean
  accent?: string
}) {
  const set = (id: string, v: SurveyAnswer | undefined) => {
    const next = { ...answers }
    if (v === undefined) delete next[id]
    else next[id] = v
    onChange(next)
  }

  return (
    <ol className="flex flex-col gap-4">
      {questions.map((q, i) => {
        const missing = showErrors && q.required && answerIsEmpty(answers[q.id])
        return (
          <li key={q.id} className={`card ${missing ? 'ring-1 ring-danger' : ''}`}>
            <fieldset disabled={readOnly} className="min-w-0">
              <legend className="text-sm font-semibold">
                <span className="text-ink-soft">{i + 1}.</span> {q.title || <span className="text-ink-soft">(no question text yet)</span>}
                {q.required && <span className="ml-1 text-danger-text" aria-label="required">*</span>}
              </legend>
              {q.help && <p className="mt-1 text-xs text-ink-soft">{q.help}</p>}
              {q.imageUrl && (
                // Organizer-supplied artwork of unknown proportions: cap the height so one tall
                // image cannot push the questions under it off the screen.
                <img src={q.imageUrl} alt="" className="mt-2 max-h-56 w-auto rounded-lg object-contain" />
              )}
              <div className="mt-3">
                <QuestionInput q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} accent={accent} />
              </div>
              {missing && <p className="mt-2 text-xs text-danger-text">This one is required.</p>}
            </fieldset>
          </li>
        )
      })}
    </ol>
  )
}

function QuestionInput({ q, value, onChange, accent }: {
  q: SurveyQuestion
  value: SurveyAnswer | undefined
  onChange: (v: SurveyAnswer | undefined) => void
  accent?: string
}) {
  switch (q.kind) {
    case 'short':
      return <input className="field" maxLength={300} value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)} />

    case 'paragraph':
      return <textarea className="field" rows={4} maxLength={2000} value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)} />

    case 'date':
      return <input className="field" type="date" value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)} />

    case 'dropdown':
      return (
        <select className="field" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">— choose —</option>
          {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )

    case 'choice':
      return (
        <div className="flex flex-col gap-1.5">
          {(q.options ?? []).map((o) => (
            <label key={o} className="flex items-start gap-2 text-sm">
              {/* Grouped by question id, so two questions on the page never share a selection. */}
              <input type="radio" name={q.id} className="mt-0.5" checked={value === o} onChange={() => onChange(o)} />
              <span className="min-w-0">{o}</span>
            </label>
          ))}
          {value !== undefined && (
            <button type="button" className="self-start text-xs underline text-ink-soft" onClick={() => onChange(undefined)}>
              Clear
            </button>
          )}
        </div>
      )

    case 'checkboxes': {
      const picked = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-col gap-1.5">
          {(q.options ?? []).map((o) => (
            <label key={o} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={picked.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked ? [...picked, o] : picked.filter((x) => x !== o)
                  onChange(next.length ? next : undefined)
                }} />
              <span className="min-w-0">{o}</span>
            </label>
          ))}
        </div>
      )
    }

    case 'scale': {
      const lo = q.scaleMin ?? 1, hi = q.scaleMax ?? 5
      const steps = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
      return (
        <div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.title}>
            {steps.map((n) => {
              const on = value === n
              return (
                <button key={n} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? undefined : n)}
                  className={`h-11 min-w-11 rounded-lg border px-2 text-sm tabular-nums ${on ? 'border-transparent text-white' : 'border-ink/15 hover:bg-ink/5'}`}
                  style={on ? { background: accent ?? '#12708A' } : undefined}>
                  {n}
                </button>
              )
            })}
          </div>
          {(q.scaleMinLabel || q.scaleMaxLabel) && (
            <div className="mt-1 flex justify-between text-xs text-ink-soft">
              <span>{q.scaleMinLabel}</span><span>{q.scaleMaxLabel}</span>
            </div>
          )}
        </div>
      )
    }

    case 'rating': {
      const stars = q.stars ?? 5
      const chosen = typeof value === 'number' ? value : 0
      return (
        <div className="flex items-center gap-1" role="radiogroup" aria-label={q.title}>
          {Array.from({ length: stars }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={chosen === n} aria-label={`${n} of ${stars}`}
              onClick={() => onChange(chosen === n ? undefined : n)}
              className="p-1 text-2xl leading-none"
              style={{ color: n <= chosen ? (accent ?? '#C8A24A') : 'rgba(22,35,58,.22)' }}>
              ★
            </button>
          ))}
          {chosen > 0 && <span className="ml-2 text-sm text-ink-soft tabular-nums">{chosen} / {stars}</span>}
        </div>
      )
    }
  }
}

/** Ids of the required questions still blank — drives both the submit guard and the hint text. */
export function useMissing(questions: SurveyQuestion[], answers: Answers): string[] {
  return useMemo(
    () => questions.filter((q) => q.required && answerIsEmpty(answers[q.id])).map((q) => q.id),
    [questions, answers],
  )
}

/** Answers state plus a reset, so the visitor page and the preview share the same wiring. */
export function useAnswers(initial: Answers = {}) {
  const [answers, setAnswers] = useState<Answers>(initial)
  return { answers, setAnswers, reset: () => setAnswers({}) }
}

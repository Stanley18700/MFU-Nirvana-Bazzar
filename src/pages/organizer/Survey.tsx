import { useEffect, useRef, useState } from 'react'
import { OrganizerPage } from '../../components/OrganizerPage'
import { Link, useSearchParams } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { ref as sref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { useBooth, useDoc } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { SurveyForm } from '../../components/SurveyForm'
import { DataErrors, Notice, Spinner, Toast, fmt, type Msg } from '../../components/ui'
import { useUnsavedGuard } from '../../lib/useUnsavedGuard'
import { num } from '../../lib/form'
import { onStage } from '../../lib/onStage'
import {
  EVENT_SURVEY_ID, OPTION_LIMIT, QUESTION_KINDS, QUESTION_LIMIT, blankQuestion, hasOptions, surveyProblems,
  type QuestionKind, type SurveyDoc, type SurveyQuestion,
} from '../../../shared/model'

/** Stable enough for a document key and short enough to read in an export header. */
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * The booth's own survey builder (§5.3 — an organizer sees and edits their own booth only).
 *
 * Kept in local state and saved in one go rather than written per keystroke: a survey is
 * half-finished for most of the time it is being written, and a live-syncing draft would mean
 * visitors seeing questions mid-sentence. `active` is the publish switch, and the server
 * refuses to publish anything that would not render.
 */
export default function Survey() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') : claimBooth
  /*
   * The festival's own survey is stored under a reserved id with no booth behind it (see
   * EVENT_SURVEY_ID). An admin edits its wording here rather than in a redeploy, so the two
   * places that insist on a booth document give way for it: the guard below, and the heading.
   * Nothing else in the builder cares what the id refers to.
   */
  const festival = boothId === EVENT_SURVEY_ID
  const { t, pick } = useLocale()
  const { data: booth, loading } = useBooth(festival ? null : boothId)
  const saved = useDoc<SurveyDoc>(boothId ? doc(db, 'surveys', boothId) : null, [boothId], 'this survey')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState<'save' | 'publish' | 'clear' | null>(null)
  const [preview, setPreview] = useState(false)

  // Adopt what is stored once. Re-syncing on every snapshot would throw away the draft the
  // moment the organizer's own save came back through the listener.
  useEffect(() => {
    if (loaded || saved.loading || !boothId) return
    const s = saved.data
    if (s) {
      setTitle(s.title ?? '')
      setDescription(s.description ?? '')
      setHeaderImageUrl(s.headerImageUrl ?? null)
      setQuestions(s.questions ?? [])
    }
    setLoaded(true)
  }, [saved.loading, saved.data, loaded, boothId])

  const dirty = loaded && (
    title !== (saved.data?.title ?? '')
    || description !== (saved.data?.description ?? '')
    || headerImageUrl !== (saved.data?.headerImageUrl ?? null)
    || JSON.stringify(questions) !== JSON.stringify(saved.data?.questions ?? [])
  )
  useUnsavedGuard(dirty)

  const problems = surveyProblems(title, questions)
  const published = saved.data?.active === true
  const responses = saved.data?.responseCount ?? 0

  const patch = (i: number, p: Partial<SurveyQuestion>) =>
    setQuestions(questions.map((q, j) => (j === i ? { ...q, ...p } : q)))

  function add(kind: QuestionKind) {
    if (questions.length >= QUESTION_LIMIT) { setMsg({ tone: 'amber', text: `${QUESTION_LIMIT} questions is the limit.` }); return }
    setQuestions([...questions, blankQuestion(kind, newId())])
  }

  /**
   * Changing type keeps the wording and drops only what cannot carry over — options are
   * meaningless on a scale, and a scale's range is meaningless on a checkbox list.
   */
  function retype(i: number, kind: QuestionKind) {
    const old = questions[i]
    const fresh = blankQuestion(kind, old.id)
    patch(i, { ...fresh, title: old.title, help: old.help, required: old.required, imageUrl: old.imageUrl,
      ...(hasOptions(kind) && hasOptions(old.kind) ? { options: old.options } : {}) })
  }

  function move(i: number, by: -1 | 1) {
    const j = i + by
    if (j < 0 || j >= questions.length) return
    const next = [...questions]
    ;[next[i], next[j]] = [next[j], next[i]]
    setQuestions(next)
  }

  async function save(alsoPublish?: boolean) {
    if (!boothId) return
    const active = alsoPublish ?? published
    if (active && problems.length) { setMsg({ tone: 'red', text: problems[0] }); return }
    setBusy(alsoPublish === undefined ? 'save' : 'publish'); setMsg(null)
    try {
      await api.saveSurvey({ boothId, title, description, headerImageUrl, questions, active })
      setMsg({ tone: 'green', text: active ? 'Saved and live — visitors see it after they collect this booth\'s stamp.' : 'Saved as a draft. Visitors see nothing until you publish it.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  async function togglePublished() {
    if (!boothId) return
    if (dirty) { setMsg({ tone: 'amber', text: 'Save your changes first — publishing sends whatever is stored, not what is on screen.' }); return }
    setBusy('publish'); setMsg(null)
    try {
      const r = await api.setSurveyActive({ boothId, active: !published })
      setMsg({ tone: 'green', text: r.active ? 'Live now.' : 'Taken down. Answers already given are kept.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  async function clearAll() {
    if (!boothId) return
    if (!window.confirm('Remove every question and unpublish? Answers already collected are kept.')) return
    setBusy('clear'); setMsg(null)
    try {
      await api.deleteSurvey({ boothId })
      setQuestions([]); setTitle(saved.data?.title ?? ''); setLoaded(false)
      setMsg({ tone: 'green', text: 'Questions removed. The responses are still under Results.' })
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(null) }
  }

  const shell = (children: React.ReactNode) => (
    <OrganizerPage boothId={boothId} booth={booth} marks={undefined}>{children}</OrganizerPage>
  )
  if (boothId && !festival && loading) return shell(<Spinner label={t('stats.loading')} />)
  if (!boothId || (!booth && !festival)) return shell(<Notice tone="amber">{!boothId ? t('stats.noBooth') : t('stats.boothGone')}</Notice>)

  return shell(
    <>
      <Toast msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <div className="stamp-text" style={{ color: booth ? onStage(booth.accentColor) : undefined }}>Survey</div>
          <h1 className="text-2xl font-bold">
            {festival ? 'Festival feedback' : booth ? pick(booth.nameEn, booth.nameTh) : ''}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs ${published ? 'bg-success/20 text-success-text' : 'bg-white/10 text-ink-soft'}`}>
            {published ? 'Live' : 'Draft'}
          </span>
          <Link to={`/booth/survey/results${role === 'admin' ? `?boothId=${boothId}` : ''}`} className="btn-quiet btn-sm">
            Results{responses ? ` · ${fmt(responses)}` : ''}
          </Link>
        </div>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        {festival
          ? 'Offered on the prize page to any visitor with at least one stamp. Answering is optional and never changes their points, and you see the answers without seeing who gave them. The results live under Festival feedback in the admin console.'
          : "Offered to a visitor straight after they collect this booth's stamp. Answering is optional and never changes their points, and you see the answers without seeing who gave them."}
      </p>
      <DataErrors className="mt-3" />

      <section className="card mt-5">
        <h2 className="stamp-text text-ink-soft">The form</h2>
        <label className="mt-3 block text-sm">Title
          <input className="field mt-1" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Tell us about your visit" />
        </label>
        <label className="mt-3 block text-sm">Description <span className="text-ink-soft">(optional)</span>
          <textarea className="field mt-1" rows={2} maxLength={1000} value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder="Two or three questions, about 30 seconds." />
        </label>
        <ImageField boothId={boothId} slot="header" url={headerImageUrl} onChange={setHeaderImageUrl}
          label="Header image (optional)" onError={(text) => setMsg({ tone: 'red', text })} />
      </section>

      <section className="mt-4 flex flex-col gap-3">
        {questions.map((q, i) => (
          <QuestionCard key={q.id} q={q} index={i} count={questions.length} boothId={boothId}
            onPatch={(p) => patch(i, p)} onRetype={(k) => retype(i, k)} onMove={(by) => move(i, by)}
            onDuplicate={() => setQuestions([...questions.slice(0, i + 1), { ...q, id: newId() }, ...questions.slice(i + 1)])}
            onRemove={() => setQuestions(questions.filter((_, j) => j !== i))}
            onError={(text) => setMsg({ tone: 'red', text })} />
        ))}
      </section>

      <section className="card mt-4">
        <h2 className="stamp-text text-ink-soft">Add a question</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_KINDS.map((k) => (
            <button key={k.kind} className="btn-quiet btn-sm" onClick={() => add(k.kind)}>+ {k.label}</button>
          ))}
        </div>
      </section>

      {problems.length > 0 && (
        <div className="glass mt-4 p-3">
          <Notice tone="amber">
            <span className="font-semibold">Not publishable yet</span>
            <ul className="mt-1 ml-4 list-disc">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Notice>
        </div>
      )}

      {/* On glass: this row is at the foot of the page, which is where the campus is brightest, and
          two of its five controls are quiet ones that vanish over a lawn. */}
      {/*
        * Two fixed rows on a phone — the two saves, then the two quiet ones — and one row from
        * `sm` up (`sm:contents` dissolves the pairs). Five pills left to wrap at 390px landed
        * in a different order on every survey, with Remove all beside Save; that one now lives
        * on its own at the foot of the page.
        */}
      <div className="glass mt-5 flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2 sm:contents">
          <button className="btn-primary flex-1 sm:flex-none" onClick={() => save()} disabled={!!busy || !dirty}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          {!published
            ? <button className="btn-gold flex-1 sm:flex-none" onClick={() => save(true)} disabled={!!busy || problems.length > 0}>Save and publish</button>
            : <button className="btn-quiet flex-1 sm:flex-none" onClick={togglePublished} disabled={!!busy}>Take it down</button>}
        </div>
        <div className="flex gap-2 sm:contents">
          <button className="btn-ghost flex-1 sm:flex-none" disabled={!!busy || !dirty}
            onClick={() => { setLoaded(false); setMsg(null) }}>Discard changes</button>
          <button className="btn-quiet flex-1 sm:ml-auto sm:flex-none" onClick={() => setPreview((p) => !p)} disabled={questions.length === 0}>
            {preview ? 'Hide preview' : 'Preview'}
          </button>
        </div>
      </div>

      {preview && questions.length > 0 && (
        <section className="mt-5">
          <h2 className="stamp-text text-ink-soft">Preview — exactly what a visitor sees</h2>
          <div className="mt-3">
            {/* The visitor's own renderer, read-only. Nothing here is an approximation. */}
            <SurveyForm questions={questions} answers={{}} onChange={() => undefined} readOnly accent={booth ? onStage(booth.accentColor) : undefined} />
          </div>
        </section>
      )}

      {/* Destructive and rare, so last and alone — never a thumb-width from Save. */}
      <div className="mt-5 flex justify-end">
        <button className="btn-danger-soft" onClick={clearAll} disabled={!!busy || (!saved.data && questions.length === 0)}>
          Remove all questions
        </button>
      </div>
    </>,
  )
}

// ---------- one question ----------

function QuestionCard({ q, index, count, boothId, onPatch, onRetype, onMove, onDuplicate, onRemove, onError }: {
  q: SurveyQuestion
  index: number
  count: number
  boothId: string
  onPatch: (p: Partial<SurveyQuestion>) => void
  onRetype: (k: QuestionKind) => void
  onMove: (by: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
  onError: (text: string) => void
}) {
  const options = q.options ?? []
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="stamp-text text-ink-soft">Question {index + 1}</span>
        <select className="field w-auto" value={q.kind} onChange={(e) => onRetype(e.target.value as QuestionKind)}>
          {QUESTION_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={q.required} onChange={(e) => onPatch({ required: e.target.checked })} />
          Required
        </label>
        {/* Buttons rather than drag: these screens are used on a tablet, one-handed, standing up.
            On a phone the four take a row of their own (`basis-full`) rather than wrapping one
            at a time; the arrows are icon buttons so the touch bump reaches them. */}
        <div className="flex basis-full items-center justify-end gap-1 sm:ml-auto sm:basis-auto">
          <button className="btn-quiet btn-sm btn-icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
          <button className="btn-quiet btn-sm btn-icon-sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">↓</button>
          <button className="btn-quiet btn-sm" onClick={onDuplicate}>Duplicate</button>
          <button className="btn-danger-soft btn-sm" onClick={onRemove}>Remove</button>
        </div>
      </div>

      <input className="field mt-3" maxLength={300} value={q.title} onChange={(e) => onPatch({ title: e.target.value })}
        placeholder="What do you want to ask?" />
      <input className="field mt-2 text-sm" maxLength={300} value={q.help ?? ''}
        onChange={(e) => onPatch({ help: e.target.value })} placeholder="Help text under the question (optional)" />

      <ImageField boothId={boothId} slot={q.id} url={q.imageUrl ?? null} onChange={(u) => onPatch({ imageUrl: u })}
        label="Image (optional)" onError={onError} />

      {hasOptions(q.kind) && (
        <div className="mt-3">
          <div className="stamp-text text-ink-soft">Options</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-ink-soft tabular-nums">{i + 1}</span>
                <input className="field" maxLength={200} value={o}
                  onChange={(e) => onPatch({ options: options.map((x, j) => (j === i ? e.target.value : x)) })} />
                <button className="btn-danger-soft btn-sm btn-icon-sm" disabled={options.length <= 2}
                  onClick={() => onPatch({ options: options.filter((_, j) => j !== i) })} aria-label={`Remove option ${i + 1}`}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn-quiet btn-sm mt-2" disabled={options.length >= OPTION_LIMIT}
            onClick={() => onPatch({ options: [...options, ''] })}>+ Option</button>
        </div>
      )}

      {q.kind === 'scale' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="text-sm">From
            <input className="field mt-1" type="number" min={0} max={10} value={q.scaleMin ?? 1}
              onChange={(e) => onPatch({ scaleMin: num(e.target.value, 1, { min: 0, max: 10 }) })} />
          </label>
          <label className="text-sm">To
            <input className="field mt-1" type="number" min={1} max={11} value={q.scaleMax ?? 5}
              onChange={(e) => onPatch({ scaleMax: num(e.target.value, 5, { min: 1, max: 11 }) })} />
          </label>
          <label className="text-sm">Label for the low end
            <input className="field mt-1" maxLength={40} value={q.scaleMinLabel ?? ''}
              onChange={(e) => onPatch({ scaleMinLabel: e.target.value })} placeholder="Not at all" />
          </label>
          <label className="text-sm">Label for the high end
            <input className="field mt-1" maxLength={40} value={q.scaleMaxLabel ?? ''}
              onChange={(e) => onPatch({ scaleMaxLabel: e.target.value })} placeholder="Very much" />
          </label>
        </div>
      )}

      {q.kind === 'rating' && (
        <label className="mt-3 block text-sm sm:w-40">How many stars
          <input className="field mt-1" type="number" min={3} max={10} value={q.stars ?? 5}
            onChange={(e) => onPatch({ stars: num(e.target.value, 5, { min: 3, max: 10 }) })} />
        </label>
      )}
    </div>
  )
}

/**
 * One image, uploaded straight to Storage under `surveys/{boothId}/`, which the storage rules
 * let this booth's organizer write and nobody else's. The URL is only saved onto the survey
 * when the whole form is saved, so an upload on an abandoned draft costs a stray file and
 * nothing more.
 */
function ImageField({ boothId, slot, url, onChange, label, onError }: {
  boothId: string
  slot: string
  url: string | null
  onChange: (u: string | null) => void
  label: string
  onError: (text: string) => void
}) {
  const [busy, setBusy] = useState(false)
  // Collapsed until asked for. Most questions have no image, and a file input on every card
  // made a five-question survey scroll twice as far as it needed to.
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function pick(file: File) {
    setBusy(true)
    try {
      if (!file.type.startsWith('image/')) throw new Error('That is not an image file.')
      if (file.size > 2 * 1024 * 1024) throw new Error('Images must be under 2 MB.')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const r = sref(storage, `surveys/${boothId}/${slot}.${ext}`)
      await uploadBytes(r, file, { contentType: file.type })
      onChange(await getDownloadURL(r))
    } catch (e) { onError(errorMessage(e)) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  const remove = async () => {
    // Best effort on the file; what matters is that the survey stops pointing at it.
    if (url) await deleteObject(sref(storage, url)).catch(() => undefined)
    onChange(null)
    setOpen(false)
  }

  if (!url && !open) {
    return (
      <button type="button" className="btn-quiet btn-sm mt-2" onClick={() => setOpen(true)}>
        + {label}
      </button>
    )
  }
  return (
    <div className="mt-3">
      <div className="stamp-text text-ink-soft">{label}</div>
      {url
        ? <img src={url} alt="" className="mt-2 max-h-32 w-auto rounded-lg object-contain" />
        : (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/*" className="field w-auto text-sm" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f) }} />
            {busy && <span className="text-xs text-ink-soft">Uploading…</span>}
          </div>
        )}
      <button className="btn-danger-soft btn-sm mt-2" onClick={remove}>
        {url ? 'Remove image' : 'Cancel'}
      </button>
    </div>
  )
}

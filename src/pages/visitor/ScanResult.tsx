import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { stampMarks } from '../../lib/eventText'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { useBooths, useDoc, useEvent } from '../../lib/data'
import { RATING_COMMENT_MAX } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import { Stamp } from '../../components/Stamp'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const { t, pick } = useLocale()
  const booths = useBooths()
  const marks = stampMarks(useEvent())
  const booth = 'boothId' in result ? booths.find((b) => b.id === result.boothId) : undefined
  /*
   * Held here, not inside the card, because it is what releases the two buttons below: the
   * rating is the one thing standing between a stamp and the next booth. `RatingCard` sets it
   * the moment there is nothing left to ask — a score sent, a booth already rated, or a call
   * that failed — so the lock can never outlive a reason for it.
   */
  const [done, setDone] = useState(false)

  if (result.status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected animate tilt={(Math.random() * 8 - 4) | 0 || 5} size={300} {...marks} />}
        <div>
          <div className="stamp-text text-ink-soft">{t('v.res.collected')}</div>
          <div className="fig mt-1 text-4xl text-ink">{t('v.res.plusPoints', { n: result.pointsAwarded })}</div>
          <div className="mt-1 text-sm text-ink-soft">{t('v.res.summary', {
            booth: booth ? pick(booth.nameEn, booth.nameTh) : '', points: result.points, stamps: result.stampCount,
          })}</div>
        </div>
        {result.unlockedTierIds.length > 0 && <Notice tone="green">{t('v.res.unlocked')}</Notice>}
        {/* Asked only once the stamp is safely in the passport, and never in the way of it. */}
        <RatingCard boothId={result.boothId} accent={booth?.accentColor} onDone={() => setDone(true)} />
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry} disabled={!done}>{t('v.res.scanAnother')}</button>
          {done
            ? <Link to="/passport/stamps" className="btn-primary flex-1">{t('v.res.myStamps')}</Link>
            : <span aria-disabled className="btn-primary pointer-events-none flex-1 opacity-40">{t('v.res.myStamps')}</span>}
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center page-in">
        {booth && <Stamp booth={booth} collected size={240} className="pulse-once" {...marks} />}
        <div className="font-semibold">{t('v.res.already')}</div>
        <div className="text-sm text-ink-soft">{t('v.res.alreadyNote', { booth: booth ? pick(booth.nameEn, booth.nameTh) : '' })}</div>
        <div className="flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={onRetry}>{t('v.res.scanAnother')}</button>
          <Link to="/passport/stamps" className="btn-primary flex-1">{t('v.res.whatsLeft')}</Link>
        </div>
      </div>
    )
  }
  const map = {
    expired: { tone: 'amber' as const, text: t('v.res.expired') },
    invalid: { tone: 'red' as const, text: t('v.res.invalid') },
    rate_limited: { tone: 'amber' as const, text: t('v.res.tooFast') },
    not_registered: { tone: 'amber' as const, text: t('v.res.notRegistered') },
  }[result.status]
  return (
    <div className="flex flex-col gap-4 p-6 page-in">
      <Notice tone={map.tone}>{map.text}</Notice>
      {result.status === 'not_registered' ? <Link to="/join" className="btn-primary">{t('v.res.createPassport')}</Link> : <button className="btn-primary" onClick={onRetry}>{t('v.res.tryAgain')}</button>}
    </div>
  )
}

/**
 * How was this booth? A score, and a sentence if they want to leave one.
 *
 * Score and comment go up in **one** call, which is why the star does not submit on its own: a
 * rating is anonymous and cannot be found again from the marker, so there is no second write to
 * attach a comment to afterwards. Two taps for someone with nothing to add, which is the price
 * of not silently discarding what the other kind of visitor typed.
 *
 * Three things stop "required" from becoming a trap in a hall with bad signal:
 *
 *  - someone who already rated this booth is released at once and never sees the card;
 *  - a failed send releases them too, with an apology rather than a locked screen — a lost data
 *    point is cheaper than a visitor stranded on a dead page;
 *  - if the marker cannot be read at all, they are released rather than held behind a query.
 *
 * `boothRated` is read straight from Firestore rather than through a callable: this renders
 * mid-scan, and the rules already let a visitor read their own marker and nothing else.
 */
function RatingCard({ boothId, accent, onDone }: { boothId: string; accent?: string; onDone: () => void }) {
  const { t } = useLocale()
  const { user } = useAuth()
  const { data: rated, loading, error } = useDoc(user ? doc(db, 'boothRated', `${user.uid}_${boothId}`) : null, [user?.uid, boothId])

  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Guards the double tap and the tap that lands while the first call is still open.
  const inFlight = useRef(false)

  // Nothing to ask: rated on an earlier scan, or we cannot tell and will not hold them for it.
  const skip = !!rated || !!error || !user
  useEffect(() => { if (skip) onDone() }, [skip, onDone])

  const send = async () => {
    if (inFlight.current || stars === 0) return
    inFlight.current = true
    setBusy(true)
    const text = comment.trim()
    try {
      await api.rateBooth({ boothId, stars, ...(text ? { comment: text } : {}) })
      setSent(true)
      onDone()
    } catch (e) {
      console.warn('rateBooth failed', e)
      setFailed(true)
      onDone()
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  if (skip || loading) return null

  if (failed) {
    return <div className="w-full"><Notice tone="amber">{t('v.rate.failed')}</Notice></div>
  }

  if (sent) {
    return (
      <div className="w-full rounded-xl border border-ink/10 bg-sky-100 p-4 text-center">
        <div className="stamp-text" style={{ color: accent }}>{t('v.rate.thanks')}</div>
        <div className="mt-1 text-2xl tracking-[0.15em] text-foil" aria-label={t('v.rate.rated', { n: stars })}>
          {[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden className={n <= stars ? '' : 'opacity-20'}>★</span>)}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl border border-ink/10 bg-sky-100 p-4 text-left">
      <div className="stamp-text" style={{ color: accent }}>{t('v.rate.title')}</div>
      <p className="mt-1 text-sm text-ink-soft">{t('v.rate.lead')}</p>

      <div
        className="mt-3 flex justify-center gap-1"
        role="radiogroup"
        aria-label={t('v.rate.aria')}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={n === 1 ? t('v.rate.star', { n }) : t('v.rate.stars', { n })}
            disabled={busy}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => setStars(n)}
            // 44px of target: a phone held one-handed in a crowded hall.
            className="grid h-11 w-11 place-items-center rounded-lg text-3xl leading-none transition-transform active:scale-90 disabled:opacity-50"
            style={{ color: n <= (hover || stars) ? '#C9A227' : undefined }}
          >
            <span aria-hidden>{n <= (hover || stars) ? '★' : '☆'}</span>
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-ink-soft">{t('v.rate.comment')}</span>
        <textarea
          className="field mt-1 w-full"
          rows={2}
          maxLength={RATING_COMMENT_MAX}
          value={comment}
          disabled={busy}
          onChange={(e) => setComment(e.target.value.slice(0, RATING_COMMENT_MAX))}
          placeholder={t('v.rate.placeholder')}
        />
      </label>

      <button className="btn-primary mt-3 w-full" onClick={() => void send()} disabled={busy || stars === 0}>
        {busy ? t('v.rate.sending') : stars === 0 ? t('v.rate.pick') : t('v.rate.send')}
      </button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { SURVEY_REWARDS } from '../../shared/model'
import { useLocale } from '../lib/locale'
import { BoardingPass } from './BoardingPass'

/**
 * The wheel a visitor spins once, right after they submit the festival survey.
 *
 * **It does not decide anything.** `submitSurveyResponse` rolled the prize and stored it on
 * `surveyTaken`; this only animates to the index it was handed. That split is the whole point —
 * a wheel that picked its own result could be re-spun by pulling to refresh.
 *
 * Built for a phone held one-handed in daylight, which sets most of what looks fussy below:
 * the wheel is sized off the viewport rather than a fixed pixel width so it survives a 320px
 * screen; the spin is ONE `transform` transition so it composites on the GPU instead of
 * stuttering against the points ring on cheap Android; `prefers-reduced-motion` drops straight
 * to the result, because a spinning wheel is a real way to make somebody queasy and a festival
 * is a bad place to find that out; and the sheet keeps the safe-area padding so the button does
 * not sit under an iPhone's home indicator.
 */
const TURNS = 4
const SPIN_MS = 3200
const SEG = 360 / SURVEY_REWARDS.length

/** Segment fills, alternating light and dark so no two neighbours read the same, and so every
 *  label can carry a colour with real contrast against its own wedge in direct sun. */
const FILLS = ['var(--color-foil)', 'var(--color-action)', 'var(--color-orange-500)', 'var(--color-green-700)']
const LABEL_ON = ['var(--color-ink)', '#FFFFFF', 'var(--color-ink)', '#FFFFFF']

/** Point on the rim, measuring clockwise from 12 o'clock. */
function at(angle: number, radius: number) {
  const a = ((angle - 90) * Math.PI) / 180
  return [50 + radius * Math.cos(a), 50 + radius * Math.sin(a)] as const
}

function wedge(i: number) {
  const [x1, y1] = at(i * SEG, 50)
  const [x2, y2] = at((i + 1) * SEG, 50)
  return `M50,50 L${x1.toFixed(2)},${y1.toFixed(2)} A50,50 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`
}

export function SurveyReward({ rewardIndex, className = '' }: { rewardIndex: number; className?: string }) {
  const { t } = useLocale()
  const reward = SURVEY_REWARDS[rewardIndex]
  const [landed, setLanded] = useState(false)
  const reduced = useRef(false)

  if (reduced.current === false && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  const still = reduced.current

  // Start at rest, then hand the browser a new angle on the next frame — a transition only runs
  // if the value changes after the element is already on screen.
  const [spun, setSpun] = useState(false)
  useEffect(() => {
    if (still) { setSpun(true); setLanded(true); return }
    const frame = requestAnimationFrame(() => setSpun(true))
    const done = setTimeout(() => setLanded(true), SPIN_MS)
    return () => { cancelAnimationFrame(frame); clearTimeout(done) }
  }, [still])

  // Bring the winning wedge's centre under the pointer at 12 o'clock.
  const angle = spun ? TURNS * 360 - (rewardIndex * SEG + SEG / 2) : 0

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div className="relative" style={{ width: 'min(80vw, 320px)' }}>
        {/* Pointer. Sits above the rim so it never overlaps a label. */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-2xl leading-none drop-shadow" aria-hidden>▼</div>
        <svg viewBox="0 0 100 100" className="w-full rounded-full shadow-lg" role="img"
          aria-label={t('v.reward.wheelLabel')}
          style={{
            transform: `rotate(${angle}deg)`,
            transition: still ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(.16,.84,.26,1)`,
            willChange: 'transform',
          }}>
          {SURVEY_REWARDS.map((r, i) => {
            const [lx, ly] = at(i * SEG + SEG / 2, 30)
            return (
              <g key={i}>
                <path d={wedge(i)} fill={FILLS[i % FILLS.length]} />
                {/*
                  * Each label counter-rotates by exactly what the wheel is doing, so it stays
                  * upright throughout — at this size a label tilted 135° is genuinely hard to
                  * read, and the result is read at rest. It has to be a CSS transform sharing
                  * the wheel's transition rather than the SVG `transform` attribute: the
                  * attribute does not tween, so the labels would snap to their final angle the
                  * instant the spin began and ride round visibly crooked.
                  */}
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                  fill={LABEL_ON[i % LABEL_ON.length]} fontSize="9" fontWeight="700"
                  style={{
                    transform: `rotate(${-angle}deg)`,
                    transformOrigin: `${lx}px ${ly}px`,
                    transition: still ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(.16,.84,.26,1)`,
                  }}>
                  {r.kind === 'pass' ? t('v.reward.segPass') : t('v.reward.segPoints', { n: r.points })}
                </text>
              </g>
            )
          })}
          <circle cx="50" cy="50" r="7" fill="white" stroke="var(--color-ink)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Announced once it has settled, so a screen reader is not read a result mid-spin. */}
      <div aria-live="polite" className="min-h-[3.5rem] text-center">
        {landed ? (
          <>
            <div className="stamp-text text-ink">
              {reward.kind === 'pass' ? t('v.reward.wonPass') : t('v.reward.wonPoints', { n: reward.points })}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {reward.kind === 'pass' ? t('v.reward.passLead') : t('v.reward.pointsLead')}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">{t('v.reward.spinning')}</p>
        )}
      </div>

      {landed && reward.kind === 'pass' && <BoardingPass className="w-full text-left" />}
    </div>
  )
}

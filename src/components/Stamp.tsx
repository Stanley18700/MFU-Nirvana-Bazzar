import type { BoothDoc } from '../../shared/model'

interface Props {
  booth: Pick<BoothDoc, 'shortName' | 'accentColor' | 'badgeThumbUrl' | 'badgeUrl' | 'nameEn'>
  collected: boolean
  size?: number
  tilt?: number
  animate?: boolean
  points?: number
  className?: string
  /** Arc text, from the live event. Defaults keep the seeded look. */
  markTop?: string
  markBottom?: string
}

/**
 * §2.5 — the generated fallback stamp: a circular ink ring in the booth's accent with the
 * short name in letter-spaced uppercase, plus the event mark. An uploaded badge replaces the
 * centre; uncollected slots are a faint outline.
 */
export function Stamp({ booth, collected, size = 88, tilt = 0, animate = false, points, className = '', markTop = 'MFU GO GLOBAL', markBottom = '2026 · CHIANG RAI' }: Props) {
  const color = collected ? booth.accentColor : 'rgba(23,38,63,.28)'
  const badge = booth.badgeThumbUrl || booth.badgeUrl
  // maxWidth keeps a fixed px stamp inside its grid cell on a 320px phone (§12.11).
  const style = { width: size, height: size, maxWidth: '100%', ['--tilt' as string]: `${tilt}deg`, transform: animate ? undefined : `rotate(${tilt}deg)` }
  return (
    <div className={`relative select-none ${animate ? 'stamp-land' : ''} ${className}`} style={style} aria-hidden>
      {badge && collected ? (
        <img src={badge} alt="" className="h-full w-full rounded-full object-cover" style={{ filter: collected ? undefined : 'grayscale(1) opacity(.3)' }} />
      ) : (
        <svg viewBox="0 0 100 100" className="h-full w-full" style={{ color, mixBlendMode: collected ? 'multiply' : 'normal' }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray={collected ? undefined : '3 3'} />
          <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <defs>
            <path id="arcTop" d="M 18 50 A 32 32 0 0 1 82 50" />
            <path id="arcBot" d="M 82 50 A 32 32 0 0 1 18 50" />
          </defs>
          <text fill="currentColor" fontSize="7" fontWeight="600" letterSpacing="1.6" fontFamily="inherit">
            <textPath href="#arcTop" startOffset="50%" textAnchor="middle">{markTop}</textPath>
          </text>
          <text fill="currentColor" fontSize="6.5" fontWeight="600" letterSpacing="1.4">
            <textPath href="#arcBot" startOffset="50%" textAnchor="middle">{markBottom}</textPath>
          </text>
          <text x="50" y="47" textAnchor="middle" fill="currentColor" fontSize={booth.shortName.length > 3 ? 15 : 19} fontWeight="700" letterSpacing="1.5">
            {booth.shortName}
          </text>
          <text x="50" y="62" textAnchor="middle" fill="currentColor" fontSize="7.5" fontWeight="700" letterSpacing="2">
            {collected ? 'ADMITTED' : `${points ?? ''} PTS`}
          </text>
          {collected && <line x1="24" y1="70" x2="76" y2="70" stroke="currentColor" strokeWidth="1.2" />}
        </svg>
      )}
    </div>
  )
}

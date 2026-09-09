import { useId } from 'react'
import type { BoothDoc } from '../../shared/model'

interface Props {
  booth: Pick<BoothDoc, 'shortName' | 'accentColor' | 'badgeThumbUrl' | 'badgeUrl' | 'nameEn'>
  collected: boolean
  /** Label **width** in px; height follows the 105 × 74 visa proportion. Under 150 the field block drops away. */
  size?: number
  tilt?: number
  animate?: boolean
  points?: number
  className?: string
  /** Issuing line and the "issued in / on" value, from the live event. Defaults keep the seeded look. */
  markTop?: string
  markBottom?: string
}

const RATIO = 105 / 74
const VB_W = 420
const VB_H = 296

const az = (s: string | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '<')
const pad = (s: string, n: number) => (az(s) + '<'.repeat(n)).slice(0, n)

function mrzLines(shortName: string, validFor: string, serial: string, points: number | undefined) {
  const l1 = pad('V<THA' + pad(shortName, 4) + '<<' + az(validFor), 44)
  const l2 = pad(pad(serial, 9) + '2THA2609160M260918' + pad('P' + (points ?? 0), 5), 44)
  return [l1, l2]
}

/**
 * §2.5 — the collectable, drawn as a visa label rather than a round entry cachet: ICAO MRV-B
 * proportion (105 × 74), a field block, a visa number in mono and a two-line machine-readable
 * zone. The booth's accent colours the frame, tint, number and cachet; every field value stays
 * ink, because seven of the nine accents fall below 4.5:1 on white. An uploaded badge replaces the
 * generated rosette; uncollected slots are the same label, dashed and faint — an unissued form.
 *
 * Two levels of detail, chosen by width: under 150px the field block drops away and the booth
 * code carries the label, the way a real visa reads at a glance.
 */
export function Stamp({ booth, collected, size = 148, tilt = 0, animate = false, points, className = '', markTop = 'MFU INTERFEST', markBottom = '2026 · CHIANG RAI' }: Props) {
  const uid = useId().replace(/:/g, '')
  const dense = size >= 150
  const accent = booth.accentColor
  const badge = booth.badgeThumbUrl || booth.badgeUrl
  const shortName = booth.shortName || 'MFU'
  const num = 'MFU' + az(shortName) + '26'
  const ink = collected ? '#17414E' : 'rgba(23,65,78,.34)'
  const inkSoft = collected ? '#1F5A6B' : 'rgba(23,65,78,.30)'
  const line = collected ? accent : 'rgba(23,65,78,.30)'
  const mrz = mrzLines(shortName, booth.nameEn || markTop, num, points)
  // maxWidth keeps a fixed px label inside its grid cell on a 320px phone (§12.11); aspect-ratio keeps the height honest when it shrinks.
  const style = { width: size, maxWidth: '100%', aspectRatio: `${RATIO}`, ['--tilt' as string]: `${tilt}deg`, transform: animate ? undefined : `rotate(${tilt}deg)` }
  const label = { fontWeight: 600, letterSpacing: 1.1, fill: inkSoft }
  const value = { fontWeight: 700, fill: ink }
  const mono = { fontFamily: 'var(--font-mono)', fontWeight: 600, fill: ink }
  const display = { fontFamily: 'var(--font-display)', fontWeight: 800, fill: ink }
  const emblemX = dense ? 330 : 210, emblemY = dense ? 122 : 148

  return (
    <div className={`relative shrink-0 select-none ${animate ? 'stamp-land' : ''} ${className}`} style={style} aria-hidden>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-full w-full">
        <defs>
          <pattern id={`t-${uid}`} width="9" height="9" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
            <rect width="1.1" height="9" fill={accent} opacity={collected ? 0.16 : 0.07} />
          </pattern>
          <pattern id={`m-${uid}`} width="10.6" height="14" patternUnits="userSpaceOnUse">
            <rect width="6.4" height="14" fill="#17414E" opacity={collected ? 0.5 : 0.14} />
          </pattern>
          <clipPath id={`c-${uid}`}><rect width={VB_W} height={VB_H} rx="8" /></clipPath>
          <clipPath id={`e-${uid}`}><circle cx={emblemX} cy={emblemY} r="42" /></clipPath>
        </defs>

        <g clipPath={`url(#c-${uid})`}>
          <rect width={VB_W} height={VB_H} rx="8" fill="#fff" />
          <rect width={VB_W} height={VB_H} fill={`url(#t-${uid})`} />
          <g opacity={collected ? 0.5 : 0.28}>
            <circle cx={emblemX} cy={emblemY} r="52" fill="none" stroke={accent} strokeWidth="10" opacity=".35" />
            <circle cx={emblemX} cy={emblemY} r="41" fill="none" stroke={accent} strokeWidth="1.5" />
            <circle cx={emblemX} cy={emblemY} r="63" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="2 5" />
          </g>
          {badge && (
            <image href={badge} x={emblemX - 42} y={emblemY - 42} width="84" height="84" preserveAspectRatio="xMidYMid slice" clipPath={`url(#e-${uid})`} opacity={collected ? 1 : 0.35} />
          )}
        </g>
        <rect x="7" y="7" width={VB_W - 14} height={VB_H - 14} rx="5" fill="none" stroke={line} strokeWidth="3" strokeDasharray={collected ? undefined : '7 6'} />
        <rect x="15" y="15" width={VB_W - 30} height={VB_H - 30} rx="2" fill="none" stroke={line} strokeWidth="1" opacity=".5" />
        <rect x=".5" y=".5" width={VB_W - 1} height={VB_H - 1} rx="8" fill="none" stroke="rgba(23,65,78,.12)" />

        {dense ? (
          <>
            <text x="28" y="44" style={display} fontSize="30" letterSpacing="1.5">VISA</text>
            <text x="106" y="43" lang="th" style={{ fontFamily: 'Mitr, var(--font-sans)', fill: inkSoft }} fontSize="17">วีซ่า</text>
            <text x="28" y="60" style={label} fontSize="8">{markTop} · PASSPORT</text>
            <text x={VB_W - 28} y="33" textAnchor="end" style={label} fontSize="8">VISA NO. / N° DU VISA</text>
            <text x={VB_W - 28} y="52" textAnchor="end" style={{ ...mono, fill: collected ? accent : inkSoft }} fontSize="15" letterSpacing="1">{num}</text>
            <line x1="28" y1="72" x2={VB_W - 28} y2="72" stroke={line} strokeWidth="1" opacity=".6" />

            <text x="28" y="94" style={label} fontSize="8">VALID FOR / VALABLE POUR</text>
            <text x="28" y="112" style={value} fontSize="15">{(booth.nameEn || markTop).slice(0, 17)}</text>
            <text x="28" y="138" style={label} fontSize="8">FROM – UNTIL / DU – AU</text>
            <text x="28" y="155" style={mono} fontSize="12.5">16–18 SEP 2026</text>
            <text x="28" y="181" style={label} fontSize="8">ISSUED IN / ON</text>
            <text x="28" y="197" style={{ ...mono, fill: inkSoft }} fontSize="10.5">{markBottom}</text>
            <text x="186" y="94" style={label} fontSize="8">TYPE</text>
            <text x="186" y="112" style={mono} fontSize="12.5">B</text>
            <text x="186" y="138" style={label} fontSize="8">ENTRIES</text>
            <text x="186" y="155" style={mono} fontSize="12.5">01</text>
            <text x="186" y="181" style={label} fontSize="8">STAY / SÉJOUR</text>
            <text x="186" y="197" style={mono} fontSize="12.5">3 DAYS</text>
            {!badge && (
              <text x={emblemX} y="134" textAnchor="middle" style={display} fontSize={az(shortName).length > 3 ? 34 : 42} letterSpacing="1">{shortName}</text>
            )}
          </>
        ) : (
          <>
            <text x="24" y="42" style={display} fontSize="26" letterSpacing="1.5">VISA</text>
            <text x={VB_W - 24} y="40" textAnchor="end" style={{ ...mono, fill: collected ? accent : inkSoft }} fontSize="17" letterSpacing="1">{num}</text>
            <line x1="24" y1="58" x2={VB_W - 24} y2="58" stroke={line} strokeWidth="1.4" opacity=".6" />
            {!badge && (
              <text x={emblemX} y="152" textAnchor="middle" style={display} fontSize={az(shortName).length > 3 ? 72 : 92} letterSpacing="1">{shortName}</text>
            )}
            <text x={emblemX} y="196" textAnchor="middle" style={{ ...value, fill: collected ? accent : inkSoft }} fontSize="26" letterSpacing="4">{collected ? 'ADMITTED' : `${points ?? 0} PTS`}</text>
          </>
        )}

        <rect x="15" y={VB_H - 68} width={VB_W - 30} height="53" fill="rgba(23,65,78,.045)" />
        {collected && dense ? (
          <g style={mono}>
            <text x="28" y={VB_H - 44} fontSize="13" textLength={VB_W - 56} lengthAdjust="spacingAndGlyphs" opacity=".9">{mrz[0]}</text>
            <text x="28" y={VB_H - 25} fontSize="13" textLength={VB_W - 56} lengthAdjust="spacingAndGlyphs" opacity=".9">{mrz[1]}</text>
          </g>
        ) : (
          <g>
            <rect x="28" y={VB_H - 56} width={VB_W - 56} height="14" fill={`url(#m-${uid})`} />
            <rect x="28" y={VB_H - 36} width={VB_W - 130} height="14" fill={`url(#m-${uid})`} />
          </g>
        )}

        {collected && dense && (
          <g transform="rotate(-8 330 197)" style={{ mixBlendMode: 'multiply' }}>
            <rect x="256" y="176" width="148" height="42" rx="4" fill="none" stroke={accent} strokeWidth="2.5" />
            <rect x="261" y="181" width="138" height="32" rx="2" fill="none" stroke={accent} strokeWidth="1" />
            <text x="330" y="199" textAnchor="middle" style={{ fontWeight: 700, fill: accent }} fontSize="15" letterSpacing="2.2">ADMITTED</text>
            <text x="330" y="210" textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fill: accent }} fontSize="8" letterSpacing="1">{markBottom}</text>
          </g>
        )}
        {!collected && dense && (
          <text x="330" y="192" textAnchor="middle" style={label} fontSize="11">{points != null ? `${points} PTS · NOT ISSUED` : 'NOT ISSUED'}</text>
        )}
      </svg>
    </div>
  )
}

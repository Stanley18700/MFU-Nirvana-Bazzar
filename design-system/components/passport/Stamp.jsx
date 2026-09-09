import React from 'react'

/**
 * The collectable, drawn as a machine-readable visa label rather than a round
 * entry-stamp cachet: ICAO MRV-B proportion (105 × 74 mm), a trilingual-style
 * field block, a visa number, and a two-line 44-character MRZ in OCR-ish mono.
 * A booth with no uploaded emblem gets the generated rosette — the fallback is
 * the default look, not an error state. Uncollected slots are the same label,
 * dashed, faint and unissued (no MRZ ink, no ADMITTED cachet).
 *
 * Two levels of detail, chosen by width: under 150px the field block drops away
 * and the booth code carries the label, the way a real visa reads at a glance.
 */

const RATIO = 105 / 74
const VB_W = 420
const VB_H = 296

const az = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '<')
const pad = (s, n) => (az(s) + '<'.repeat(n)).slice(0, n)

function mrzLines({ shortName, validFor, serial, points }) {
  const l1 = pad('V<THA' + pad(shortName, 4) + '<<' + az(validFor), 44)
  const l2 = pad(pad(serial, 9) + '2THA2609160M260918' + pad('P' + (points ?? 0), 5), 44)
  return [l1, l2]
}

export function Stamp({
  shortName = 'MFU',
  collected = false,
  size = 260,
  tilt = 0,
  points,
  badgeUrl,
  animate = false,
  markTop = 'MFU INTER FEST',
  markBottom = '2026 · CHIANG RAI',
  validFor,
  serial,
  entries = '01',
  visaType = 'B',
  stay = '3 DAYS',
  accent = 'var(--sky-800)',
}) {
  const width = size
  const height = Math.round(size / RATIO)
  const dense = width >= 150
  const uid = React.useMemo(() => 'v' + Math.random().toString(36).slice(2, 8), [])
  const num = serial || 'MFU' + az(shortName) + '26'
  const ink = collected ? 'var(--ink-900)' : 'rgba(23,65,78,.34)'
  const inkSoft = collected ? 'var(--ink-600)' : 'rgba(23,65,78,.30)'
  const line = collected ? accent : 'rgba(23,65,78,.30)'
  const mrz = mrzLines({ shortName, validFor: validFor || markTop, serial: num, points })
  const style = {
    width, height, maxWidth: '100%', flex: '0 0 auto',
    ['--tilt']: `${tilt}deg`,
    transform: animate ? undefined : `rotate(${tilt}deg)`,
    animation: animate ? 'mfu-drop-settle var(--dur-drop) var(--ease-settle) both' : undefined,
  }
  const label = { fontFamily: 'var(--font-body)', fontWeight: 600, letterSpacing: 1.1, fill: inkSoft }
  const value = { fontFamily: 'var(--font-body)', fontWeight: 700, fill: ink }
  const mono = { fontFamily: 'var(--font-mono)', fontWeight: 600, fill: ink }

  return (
    <div aria-hidden style={{ ...style, position: 'relative', userSelect: 'none' }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <pattern id={`t-${uid}`} width="9" height="9" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
            <rect width="9" height="9" fill="none" />
            <rect width="1.1" height="9" fill={accent} opacity={collected ? 0.16 : 0.07} />
          </pattern>
          <pattern id={`m-${uid}`} width="10.6" height="14" patternUnits="userSpaceOnUse">
            <rect width="6.4" height="14" fill="var(--ink-900)" opacity={collected ? 0.5 : 0.14} />
          </pattern>
          <clipPath id={`c-${uid}`}><rect x="0" y="0" width={VB_W} height={VB_H} rx="8" /></clipPath>
        </defs>

        <g clipPath={`url(#c-${uid})`}>
          <rect width={VB_W} height={VB_H} rx="8" fill="var(--pure-white)" />
          <rect width={VB_W} height={VB_H} fill={`url(#t-${uid})`} />
          <g opacity={collected ? 0.5 : 0.28}>
            <circle cx={dense ? 330 : 210} cy={dense ? 122 : 148} r="52" fill="none" stroke={accent} strokeWidth="10" opacity=".35" />
            <circle cx={dense ? 330 : 210} cy={dense ? 122 : 148} r="41" fill="none" stroke={accent} strokeWidth="1.5" />
            <circle cx={dense ? 330 : 210} cy={dense ? 122 : 148} r="63" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="2 5" />
          </g>
          {badgeUrl && (
            <image href={badgeUrl} x={dense ? 288 : 166} y={dense ? 80 : 104} width="84" height="84" preserveAspectRatio="xMidYMid slice" clipPath={`url(#c-${uid})`} opacity={collected ? 1 : 0.35} />
          )}
        </g>
        <rect x="7" y="7" width={VB_W - 14} height={VB_H - 14} rx="5" fill="none" stroke={line} strokeWidth="3" strokeDasharray={collected ? undefined : '7 6'} />
        <rect x="15" y="15" width={VB_W - 30} height={VB_H - 30} rx="2" fill="none" stroke={line} strokeWidth="1" opacity=".5" />
        <rect x=".5" y=".5" width={VB_W - 1} height={VB_H - 1} rx="8" fill="none" stroke="rgba(23,65,78,.12)" />

        {dense ? (
          <>
            <text x="28" y="44" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fill: ink }} fontSize="30" letterSpacing="1.5">VISA</text>
            <text x="106" y="43" style={{ fontFamily: 'var(--font-thai-display)', fill: inkSoft }} fontSize="17">วีซ่า</text>
            <text x="28" y="60" style={label} fontSize="8">{markTop} · GO GLOBAL PASSPORT</text>
            <text x={VB_W - 28} y="33" textAnchor="end" style={label} fontSize="8">VISA NO. / N° DU VISA</text>
            <text x={VB_W - 28} y="52" textAnchor="end" style={{ ...mono, fill: collected ? accent : inkSoft }} fontSize="15" letterSpacing="1">{num}</text>
            <line x1="28" y1="72" x2={VB_W - 28} y2="72" stroke={line} strokeWidth="1" opacity=".6" />

            <text x="28" y="94" style={label} fontSize="8">VALID FOR / VALABLE POUR</text>
            <text x="28" y="112" style={value} fontSize="15">{(validFor || markTop).slice(0, 17)}</text>
            <text x="28" y="138" style={label} fontSize="8">FROM – UNTIL / DU – AU</text>
            <text x="28" y="155" style={mono} fontSize="12.5">16–18 SEP 2026</text>
            <text x="28" y="181" style={label} fontSize="8">ISSUED IN / ON</text>
            <text x="28" y="197" style={{ ...mono, fill: inkSoft }} fontSize="10.5">{markBottom}</text>
            <g>
              <text x="186" y="94" style={label} fontSize="8">TYPE</text>
              <text x="186" y="112" style={mono} fontSize="12.5">{visaType}</text>
              <text x="186" y="138" style={label} fontSize="8">ENTRIES</text>
              <text x="186" y="155" style={mono} fontSize="12.5">{entries}</text>
              <text x="186" y="181" style={label} fontSize="8">STAY / SÉJOUR</text>
              <text x="186" y="197" style={mono} fontSize="12.5">{stay}</text>
            </g>
            {!badgeUrl && (
              <text x="330" y="134" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fill: ink }} fontSize={az(shortName).length > 3 ? 34 : 42} letterSpacing="1">{shortName}</text>
            )}
          </>
        ) : (
          <>
            <text x="24" y="42" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fill: ink }} fontSize="26" letterSpacing="1.5">VISA</text>
            <text x={VB_W - 24} y="40" textAnchor="end" style={{ ...mono, fill: collected ? accent : inkSoft }} fontSize="17" letterSpacing="1">{num}</text>
            <line x1="24" y1="58" x2={VB_W - 24} y2="58" stroke={line} strokeWidth="1.4" opacity=".6" />
            <text x="210" y="152" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fill: ink }} fontSize={az(shortName).length > 3 ? 72 : 92} letterSpacing="1">{shortName}</text>
            <text x="210" y="196" textAnchor="middle" style={{ ...value, fill: collected ? accent : inkSoft }} fontSize="26" letterSpacing="4">{collected ? 'ADMITTED' : `${points ?? 0} PTS`}</text>
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
            <text x="330" y="199" textAnchor="middle" style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fill: accent }} fontSize="15" letterSpacing="2.2">ADMITTED</text>
            <text x="330" y="210" textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fill: accent }} fontSize="8" letterSpacing="1">{markBottom}</text>
          </g>
        )}
        {!collected && dense && (
          <text x="330" y="192" textAnchor="middle" style={{ ...label, fill: inkSoft }} fontSize="11">{points != null ? `${points} PTS · NOT ISSUED` : 'NOT ISSUED'}</text>
        )}
      </svg>
    </div>
  )
}

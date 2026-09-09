import React from 'react'

/**
 * The booth screen's code frame: white card, thick accent ring, and a countdown
 * that traces the frame's own border rather than an inscribed circle, so it
 * reads along every edge. Legible at 3 metres.
 */
export function QRFrame({ size = 260, accent = 'var(--sky-700)', progress = 1, urgent = false, children }) {
  const FRAME_PAD = 20, ACCENT = 10, GAP = 4, RING = 4, CORNER = 32
  const inset = ACCENT + GAP + RING
  const box = size + 2 * FRAME_PAD + 2 * inset
  return (
    <div style={{ position: 'relative', display: 'inline-block', flex: '0 0 auto', boxSizing: 'content-box', width: size, height: size, borderRadius: 'var(--radius-2xl)', background: '#fff', padding: FRAME_PAD, boxShadow: `0 0 0 ${ACCENT}px ${accent}, var(--shadow-float)` }}>
      <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', color: 'var(--ink-900)' }}>{children}</div>
      <svg aria-hidden style={{ position: 'absolute', top: -inset, left: -inset, width: box, height: box, overflow: 'visible', pointerEvents: 'none' }} viewBox={`0 0 ${box} ${box}`}>
        <rect
          x={RING / 2} y={RING / 2} width={box - RING} height={box - RING}
          rx={CORNER + inset - RING / 2} fill="none" strokeWidth={RING} strokeLinecap="butt"
          stroke={urgent ? 'var(--orange-600)' : 'rgba(255,255,255,.85)'}
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress}
          style={{ transition: 'stroke-dashoffset 110ms linear, stroke var(--dur-base) var(--ease-standard)' }}
        />
      </svg>
    </div>
  )
}

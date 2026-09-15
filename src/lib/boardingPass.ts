/**
 * The festival boarding pass, drawn on a canvas. Pure drawing — no React, no Firestore — so it
 * can be rendered and looked at outside the app (scripts/check-boarding-pass.mjs does exactly
 * that in headless Chromium).
 */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

export interface PassData { name: string; passportNo: string; stamps: number; points: number; eventName: string; dates: string }

/** 1080×1350 (4:5) — the size a phone gallery and Instagram both take without cropping. */
export async function drawPass(d: PassData): Promise<string> {
  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif'

  // Sky, the same ground the passport cover sits on.
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#7FD3F0'); sky.addColorStop(1, '#BFE9F7')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (const [x, y, r] of [[160, 150, 70], [230, 130, 90], [310, 160, 60], [860, 1230, 80], [940, 1210, 100], [1020, 1250, 60]] as const) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }

  /*
   * Layout first, paint second. The card's height and the tear line depend on how many lines
   * the visitor's name takes and whether the logo loaded, and the card has to be painted
   * before anything sits on it — so every y is decided here, then drawn below.
   */
  const cx = 80, cy = 200, cw = W - 160, inner = cw - 88, left = cx + 44
  const logo = await loadImage('/brand/logo-festival-tagline.webp').catch(() => null)
  const logoH = logo ? (logo.height / logo.width) * 500 : 0
  const nameFont = `800 54px ${SANS}`
  ctx.font = nameFont
  const nameLines = countLines(ctx, d.name || 'Festival visitor', inner, 2)
  let y = cy + 160
  const logoY = y
  y += logo ? logoH + 28 : 0
  const titleY = logo ? 0 : y + 30
  if (!logo) { ctx.font = `800 44px ${SANS}`; y = titleY + countLines(ctx, d.eventName.toUpperCase(), inner, 2) * 52 + 10 }
  const dateY = y + 8
  const passengerY = dateY + 70
  const nameY = passengerY + 42
  const figuresY = nameY + nameLines * 62 + 34
  const tearY = figuresY + 108
  const stubY = tearY + 40
  const ch = tearY - cy + 232
  if (cy + ch > H - 40) throw new Error('pass overflow')

  // The card, with a perforated tear-off strip at the bottom.
  ctx.save()
  ctx.shadowColor = 'rgba(23,65,78,0.25)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16
  roundRect(ctx, cx, cy, cw, ch, 36); ctx.fillStyle = '#FFFFFF'; ctx.fill()
  ctx.restore()
  ctx.fillStyle = sky
  ctx.beginPath(); ctx.arc(cx, tearY, 22, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + cw, tearY, 22, 0, Math.PI * 2); ctx.fill()
  ctx.setLineDash([14, 12]); ctx.strokeStyle = 'rgba(23,65,78,0.25)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx + 40, tearY); ctx.lineTo(cx + cw - 40, tearY); ctx.stroke()
  ctx.setLineDash([])

  // Header band.
  roundRectTop(ctx, cx, cy, cw, 120, 36); ctx.fillStyle = '#17414E'; ctx.fill()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#F5C63C'; ctx.font = `700 30px ${SANS}`; ctx.letterSpacing = '6px'
  ctx.fillText('BOARDING PASS', left, cy + 60)
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'right'; ctx.fillStyle = '#FFFFFF'; ctx.font = `600 26px ${SANS}`
  ctx.fillText('GLOBAL CITIZEN', cx + cw - 44, cy + 60)
  ctx.textAlign = 'left'

  // Festival logo, or the event name in type when the image did not load.
  if (logo) ctx.drawImage(logo, left, logoY, 500, logoH)
  else { ctx.fillStyle = '#17414E'; ctx.font = `800 44px ${SANS}`; wrapText(ctx, d.eventName.toUpperCase(), left, titleY, inner, 52, 2) }
  ctx.fillStyle = '#5B7C87'; ctx.font = `500 26px ${SANS}`
  fitText(ctx, `${d.dates} · Mae Fah Luang University, Chiang Rai`, left, dateY, inner)

  // Passenger.
  label(ctx, 'PASSENGER', left, passengerY)
  ctx.fillStyle = '#17414E'; ctx.font = nameFont
  wrapText(ctx, d.name || 'Festival visitor', left, nameY, inner, 62, 2)

  // Three figures: the passport number gets the wider column.
  const c1 = inner * 0.42, c2 = inner * 0.29
  figure(ctx, 'PASSPORT NO', d.passportNo || '—', left, figuresY, 'mono')
  figure(ctx, 'STAMPS', fmt(d.stamps), left + c1, figuresY)
  figure(ctx, 'POINTS', fmt(d.points), left + c1 + c2, figuresY)

  // Stub: thank-you, tagline, and a barcode drawn from the passport number.
  ctx.fillStyle = '#17414E'; ctx.font = `700 28px ${SANS}`
  fitText(ctx, 'Thank you for your feedback · ขอบคุณสำหรับความคิดเห็น', left, stubY, inner)
  ctx.fillStyle = '#5B7C87'; ctx.font = `500 22px ${SANS}`
  fitText(ctx, 'Bridging Cultures, Building Global Citizens · Global Relations Division, MFU', left, stubY + 44, inner)
  barcode(ctx, d.passportNo || d.name || 'MFU', left, stubY + 84, inner, 44)

  return canvas.toDataURL('image/png')
}

/** Draws one line, shrinking the font until it fits `maxW`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const m = /(\d+)px/.exec(ctx.font)
  let size = m ? Number(m[1]) : 24
  while (ctx.measureText(text).width > maxW && size > 12) {
    size -= 1
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`)
  }
  ctx.fillText(text, x, y)
}

/** How many lines `wrapText` will use, with the current font. */
function countLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): number {
  const words = text.split(/\s+/)
  let line = '', lines = 1
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { lines++; line = w; if (lines >= maxLines) break } else line = test
  }
  return Math.min(lines, maxLines)
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = '#5B7C87'
  ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.letterSpacing = '4px'
  ctx.fillText(text, x, y)
  ctx.letterSpacing = '0px'
}

function figure(ctx: CanvasRenderingContext2D, name: string, value: string, x: number, y: number, kind: 'num' | 'mono' = 'num') {
  label(ctx, name, x, y)
  ctx.fillStyle = kind === 'mono' ? '#B8860B' : '#17414E'
  ctx.font = kind === 'mono'
    ? '700 40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    : '800 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  fitText(ctx, value, x, y + 60, kind === 'mono' ? 340 : 220)
}

/** Deterministic bars from the text — decoration that looks like a barcode, not a real symbology. */
function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number) {
  let hsh = 2166136261
  const bars: number[] = []
  for (let i = 0; i < 80; i++) {
    hsh ^= seed.charCodeAt(i % seed.length); hsh = Math.imul(hsh, 16777619) >>> 0
    bars.push(1 + (hsh % 4))
  }
  const total = bars.reduce((a, b) => a + b, 0) + bars.length
  const unit = w / total
  let px = x
  ctx.fillStyle = '#17414E'
  for (const b of bars) { ctx.fillRect(px, y, b * unit, h); px += (b + 1) * unit }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 3): number {
  const words = text.split(/\s+/)
  let line = '', lines = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lineH; lines++
      if (lines >= maxLines - 1) { line = w; break }
      line = w
    } else line = test
  }
  if (line) {
    while (ctx.measureText(line).width > maxW && line.length > 1) line = line.slice(0, -2) + '…'
    ctx.fillText(line, x, y)
  }
  return y + lineH
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + w, y, r); ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.lineTo(x + w, y + h); ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image ${src}`))
    img.src = src
  })
}

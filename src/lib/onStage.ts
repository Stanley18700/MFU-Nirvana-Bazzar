/**
 * The organizer's ground at its darkest: the wave field itself, which is what an accent lands on
 * where there is no frosted pane over it — the survey's eyebrow, for one. Measured from the
 * screen, an accent tuned against the pane instead came out 3.5:1 there against a promised 4.5.
 */
const STAGE = '#7EDFF2'
/** Ink, never black: what an accent is darkened toward. */
const INK = '#17414E'
const cache = new Map<string, string>()

const chan = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (hex: string) => { const [r, g, b] = parse(hex).map(chan); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const mix = (hex: string, toward: string, t: number) => {
  const b = parse(toward)
  return '#' + parse(hex).map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * A booth's accent, deepened only as far as it must be to be legible on the organizer's ground.
 *
 * The design system paints the booth screen's eyebrow, title and manual code in the booth's own
 * colour, and on a sky ground most of the nine seeded accents cannot carry that unaided — the
 * gold sits at 1.4:1 and the mint at 1.6:1. Each is mixed toward ink in 5% steps until it clears
 * its threshold, which keeps the hue and spends only what it must.
 *
 * `large` is the whole reason this is worth doing carefully. Display type — the booth name, the
 * manual code, a figure — owes 3:1, and chart bars and other graphics owe the same. Body-sized
 * text owes 4.5:1. Held to 4.5 everywhere the bright accents arrive as mud; at 3:1 they stay
 * recognisably the booth's own colour.
 *
 * Text and graphics only. The QR's ring keeps the raw accent: it sits against the white card,
 * which is what it was picked against.
 */
export function onStage(accent: string, large = false): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return accent
  const key = `${accent}:${large}`
  const hit = cache.get(key)
  if (hit) return hit
  const need = large ? 3 : 4.5
  let out = accent
  for (let t = 0.05; t <= 1 && ratio(out, STAGE) < need; t += 0.05) out = mix(accent, INK, t)
  cache.set(key, out)
  return out
}

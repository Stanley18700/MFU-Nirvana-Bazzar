/** The organizer's ground. Every caller of this helper paints a booth accent onto it. */
const STAGE = '#0D5A70'
const cache = new Map<string, string>()

const chan = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (hex: string) => { const [r, g, b] = parse(hex).map(chan); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const toWhite = (hex: string, t: number) =>
  '#' + parse(hex).map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('').toUpperCase()

/**
 * A booth's accent, lifted only as far as it must be to be legible on the organizer's ground.
 *
 * The design system paints the booth screen's eyebrow, title and manual code in the booth's own
 * colour, and several of the nine seeded accents cannot carry that unaided — the two greens sit
 * at 1.5:1 and 1.0:1 on the stage. Each is mixed toward white in 5% steps until it clears its
 * threshold, which keeps the hue and spends only what it must.
 *
 * `large` is the whole reason this is worth doing carefully. Display type — the 42px booth name,
 * the manual code, a figure — owes 3:1, and chart bars and other graphics owe the same. Body-sized
 * text owes 4.5:1. Held to 4.5 everywhere, the red booth arrives as pale pink and the two green
 * booths as grey sage: exactly the wash this is supposed to prevent. At 3:1 six of the nine are
 * used as drawn.
 *
 * Text and graphics only. The QR's ring keeps the raw accent: it sits against the white card,
 * where the unlifted colour is the stronger of the two.
 */
export function onChrome(accent: string, large = false): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return accent
  const key = `${accent}:${large}`
  const hit = cache.get(key)
  if (hit) return hit
  const need = large ? 3 : 4.5
  let out = accent
  for (let t = 0.05; t <= 1 && ratio(out, STAGE) < need; t += 0.05) out = toWhite(accent, t)
  cache.set(key, out)
  return out
}

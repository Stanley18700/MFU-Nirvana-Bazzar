const CHROME = '#17414E'
const AA = 4.5
const cache = new Map<string, string>()

const chan = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (hex: string) => { const [r, g, b] = parse(hex).map(chan); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const toWhite = (hex: string, t: number) =>
  '#' + parse(hex).map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('').toUpperCase()

/**
 * A booth's accent, lifted until it is legible as text on the chrome ground.
 *
 * The design system paints the booth screen's eyebrow, title and manual code in the booth's own
 * colour. Three of the nine seeded accents cannot carry that: the two greens land at 2.1:1 and
 * 1.4:1 on chrome, and the red at 3.4:1 — a hall display nobody can read from three metres. Each
 * is mixed toward white in 5% steps until it clears 4.5:1, which keeps the hue and only spends
 * what it must; the six accents that already pass are returned untouched.
 *
 * Text only. The QR's ring keeps the raw accent: it sits against the white card, where the
 * unlifted colour is the stronger of the two.
 */
export function onChrome(accent: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return accent
  const hit = cache.get(accent)
  if (hit) return hit
  let out = accent
  for (let t = 0.05; t <= 1 && ratio(out, CHROME) < AA; t += 0.05) out = toWhite(accent, t)
  cache.set(accent, out)
  return out
}

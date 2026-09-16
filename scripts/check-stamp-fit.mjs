/**
 * Every booth's name and code, through the visa's own fitter.
 *
 * The visa has two fixed fields and no way to scroll: the "valid for" line between two labels
 * 35 units apart, and the booth code inside the rosette. Both used to be one line at one size,
 * so 55 of the 76 names arrived truncated — "British Council Thailand" as "British Council T" —
 * and 67 of the codes ran off the right edge of the card.
 *
 * This runs the shipped fitter over the seeded roster and asserts nothing is dropped and nothing
 * overflows. It needs no browser and no emulator: `node scripts/check-stamp-fit.mjs`.
 */
import { DISPLAY, MARK_BOX, MARK_BOX_SMALL, NAME_BOX, fitBlock, fitName, runWidth } from '../src/lib/stampText.ts'
import { SEED_BOOTHS } from '../functions/src/booths.data.ts'

/** The card is 420 wide with a 15-unit margin. The rosette sits at 330 on the detailed variant
 *  and at 210 on the small one, where the code is all the card has room to say. */
const CARD_RIGHT = 405
const CARD_LEFT = 15
const EMBLEM_X = 330
const EMBLEM_X_SMALL = 210
/**
 * The webfont loads with `display=swap`, so the first paint uses the system fallback, which
 * measures about 6% wider than IBM Plex. A line that only just fits must still fit then.
 */
const FALLBACK = 1.06

const problems = []
const seen = { name: {}, mark: {} }

for (const booth of SEED_BOOTHS) {
  const name = booth.nameEn
  const code = booth.shortName || 'MFU'

  const fitted = fitName(name)
  seen.name[`${fitted.size}px x${fitted.lines.length}`] = (seen.name[`${fitted.size}px x${fitted.lines.length}`] ?? 0) + 1

  if (fitted.lines.join(' ') !== name.split(/\s+/).join(' ')) {
    problems.push(`name dropped text: "${name}" -> ${JSON.stringify(fitted.lines)}`)
  }
  for (const line of fitted.lines) {
    const w = runWidth(line, fitted.size)
    if (w * FALLBACK > NAME_BOX + 8) {
      problems.push(`name overflows at ${fitted.size}px: ${Math.round(w * FALLBACK)}u > ${NAME_BOX + 8} — "${line}"`)
    }
  }
  if (fitted.lines.length > 3) problems.push(`name takes ${fitted.lines.length} lines: "${name}"`)

  for (const [label, box, sizes, cx] of [
    ['code', MARK_BOX, [42, 36, 31, 27, 23, 20, 17, 14, 12], EMBLEM_X],
    ['code (small)', MARK_BOX_SMALL, [92, 78, 66, 56, 46, 40, 34, 28, 24], EMBLEM_X_SMALL],
  ]) {
    const mark = fitBlock(code, box, sizes, 2, DISPLAY)
    if (label === 'code') seen.mark[`${mark.size}px x${mark.lines.length}`] = (seen.mark[`${mark.size}px x${mark.lines.length}`] ?? 0) + 1
    if (mark.lines.join(' ') !== code.split(/\s+/).join(' ')) {
      problems.push(`${label} dropped text: "${code}" -> ${JSON.stringify(mark.lines)}`)
    }
    for (const line of mark.lines) {
      const half = (runWidth(line, mark.size, DISPLAY) * FALLBACK) / 2
      if (cx + half > CARD_RIGHT) problems.push(`${label} runs off the card at ${mark.size}px: x=${Math.round(cx + half)} > ${CARD_RIGHT} — "${line}"`)
      if (cx - half < CARD_LEFT) problems.push(`${label} runs off the card at ${mark.size}px: x=${Math.round(cx - half)} < ${CARD_LEFT} — "${line}"`)
    }
  }
}

console.log(`${SEED_BOOTHS.length} booths`)
console.log('  name :', seen.name)
console.log('  code :', seen.mark)
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log('\nevery name and code fits its field in full')

/**
 * Fitting text into the visa's two fixed fields, with the advance widths of the faces they are
 * set in. Kept apart from the component because it is arithmetic, not rendering — and because a
 * check can then run it over the whole booth roster without a browser (scripts/check-stamp-fit.mjs).
 */
/**
 * Advance widths for IBM Plex Sans Thai 700 — the face the "valid for" field is set in — in
 * hundredths of an em, for code points 32–126, with the marks that appear in booth names after it.
 * Measured from the loaded face rather than averaged: a name of Ws runs 0.97em a character and a
 * name of ls 0.30, so a single average overflows the box on one and wastes half of it on the other.
 */
const ADVANCE = '2432496360977227343460603140314660606060606060606060333360606050906967657061597272435670538272716671676258696597676561334633605660576152615636556029295830896056616140503860548456535237403760'
const MARKS: Record<string, number> = { '¡': 32, '·': 36, 'Í': 43, '–': 59, '—': 78, 'é': 56, '’': 30, 'ก': 60, 'ง': 54, 'ด': 62, 'ป': 61, 'ม': 61, 'ล': 57, 'ะ': 34, 'า': 41, 'ำ': 41 }

export function charWidth(ch: string) {
  const i = ch.codePointAt(0) ?? 32
  if (i >= 32 && i < 127) return Number(ADVANCE.slice((i - 32) * 2, (i - 32) * 2 + 2)) / 100
  // Thai vowels and tone marks sit above or below the consonant and take no room of their own.
  if (i === 0x0e31 || (i >= 0x0e34 && i <= 0x0e3a) || (i >= 0x0e47 && i <= 0x0e4e)) return 0
  return (MARKS[ch] ?? 60) / 100
}

/**
 * `face` scales the table for the display font the booth code is set in. Baloo 2 measures between
 * 0.92 and 0.97 of IBM Plex across the roster's names; 0.97 is the one that never under-counts.
 */
export const runWidth = (s: string, size: number, face = 1) => size * face * [...s].reduce((n, ch) => n + charWidth(ch), 0)
export const DISPLAY = 0.97

/**
 * x=28 to the TYPE column at x=186, less a gutter. The gutter is not decoration: the font loads
 * with `display=swap`, so the first paint is the system fallback, which runs about 6% wider than
 * IBM Plex. At 146 the widest name in the roster reaches x=181 on the fallback and x=173 once the
 * webfont lands — clear of the column either way.
 */
export const NAME_BOX = 146

/**
 * The booth code inside the rosette, centred at x=330 on a card whose inner edge is 405. Half of
 * 138 is 69, which lands at 399 on the webfont and just inside 405 when the fallback renders it
 * wider. The small variant is centred at 210 with far more room either side.
 */
export const MARK_BOX = 138
/*
 * The small card is a 132px thumbnail in a list that already carries the booth's name beside it,
 * so the mark is an identifying cachet rather than a headline. At 300 the median mark ran 65% of
 * the card's width and the widest 71%, which buried the rosette it is supposed to sit inside. At
 * 190 every mark lands near 180 units whether it is "ADT" at 92px or "Campus France" over two
 * lines at 46 — the same optical footprint, which is what a stamp wants.
 */
export const MARK_BOX_SMALL = 190

/**
 * The booth's name, set as large as it can be and still be read in full.
 *
 * It used to be `name.slice(0, 17)`, which truncated 55 of the festival's 77 booths — "British
 * Council Thailand" arrived as "British Council T". Nothing about a visa says the holder's name
 * may be cut off, and a stamp is the one thing a visitor keeps.
 *
 * Two lines are tried before a smaller size, because 15px over two lines reads better than 12px
 * over one. Three lines are the last resort and force 10px: the field is 35 units tall, between
 * the label above it and the one below, and three lines of anything larger runs into them.
 */
/**
 * Greedy word wrap at one size, with the width of the box and of the face it is set in.
 *
 * `broke` says a word had to be split inside itself, which is a last resort rather than a fit:
 * the caller uses it to keep trying smaller sizes instead of settling for "Khatuli / stiwa".
 */
export function wrapAt(text: string, box: number, size: number, face: number) {
  const lines: string[] = []
  let cur = ''
  let broke = false
  const flush = () => {
    // Anything still too wide on a line of its own has nowhere to break but inside itself.
    while (runWidth(cur, size, face) > box && cur.length > 1) {
      let cut = cur.length - 1
      while (cut > 1 && runWidth(cur.slice(0, cut), size, face) > box) cut--
      lines.push(cur.slice(0, cut))
      cur = cur.slice(cut)
      broke = true
    }
    if (cur) lines.push(cur)
    cur = ''
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word
    if (!cur || runWidth(next, size, face) <= box) { cur = next; continue }
    flush()
    cur = word
  }
  flush()
  return { lines, broke }
}

/**
 * The largest of `sizes` at which `text` fits the box in `maxLines` or fewer, without splitting a
 * word. Falls back to the smallest size offered and returns whatever that gives — more lines than
 * asked for, possibly a split word — so a caller can see it did not fit rather than being handed
 * a silently shortened string. Nothing here ever drops text.
 */
export function fitBlock(text: string, box: number, sizes: number[], maxLines: number, face = 1) {
  let last = { size: sizes[0], lines: [text], broke: false }
  for (const size of sizes) {
    const { lines, broke } = wrapAt(text, box, size, face)
    last = { size, lines, broke }
    if (lines.length <= maxLines && !broke) return last
  }
  return last
}

/**
 * The band between the two labels is 33 units — "valid for" sits at a baseline of 94 and "from –
 * until" at 138 — and a line of type stands 1.32 times its own size. So the size a line may take
 * depends on how many lines there are: one can have the full 15, two have to come down to 13 or
 * the block pushes into both labels, and three to 9.
 *
 * Measured rather than guessed: at 15px over two lines the block ran 7.3 units into the label
 * above it and 5.1 into the one below, against the 1 to 3 units every other label and value on
 * this card overlap by.
 */
export function fitName(name: string) {
  const one = fitBlock(name, NAME_BOX, [15], 1)
  if (one.lines.length === 1 && !one.broke) return one
  const two = fitBlock(name, NAME_BOX, [13, 12, 11], 2)
  if (two.lines.length <= 2 && !two.broke) return two
  // The last two sizes are for the two names in the roster that 9px cannot fit in three lines.
  return fitBlock(name, NAME_BOX, [9, 8, 7], 3)
}

/** Where the name's `i`th baseline falls, for a block of `n` lines set at `size`. */
export function nameBaseline(i: number, n: number, size: number) {
  if (n === 1) return 112
  // Centre the block's em box on the band, then step down by the leading.
  return 113 - ((n - 1) * size * 1.1) / 2 + size * 0.39 + i * size * 1.1
}

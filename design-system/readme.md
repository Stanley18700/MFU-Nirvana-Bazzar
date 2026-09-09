# MFU International Festival 2026 — Design System

The brand and interface system for **MFU International Festival 2026** (16–18 September 2026,
Mae Fah Luang University, Chiang Rai) and for **MFU InterFest Passport**, the digital stamp-trail
app built for it.

**One theme, everywhere.** Sky blue, paper-cut collage and torn-paper letters — taken from the
official project concept deck and key visual — carry the posters, the signage, the decks *and*
every application surface: the guest app, the booth kiosk and the admin console. There is no
separate product palette. A visitor who sees the poster at the gate and opens the passport on
their phone should recognise the same festival.

Surfaces are addressed through the `--app-*` semantic tokens in `tokens/theme-app.css`, so a
guest screen, a kiosk and a dashboard are the same system at different densities.

---

## Sources this was built from

| Source | What it gave |
|---|---|
| `uploads/Project Concept Overview_MFU International Festival 2026.pdf` (14 slides, supplied by the user) | The MOOD & TONE palette (slide 9), the theme words, the key-visual motif list (slide 11), the design summary (slide 12), the logo (slide 10) |
| Attached codebase `MFU-Event-Planning/` | The whole passport product's **structure and behaviour**: `src/components/*`, `src/pages/{visitor,organizer,admin,auth}/*`, `src/index.css` (motion curves, component anatomy, the booth-accent rule), `spec/spec.md` §2 "Visual design language", `spec/concept.html` (the bilingual 5-slide proposal deck), `README.md`, `SETUP.md`. Its navy/paper prototype palette was deliberately **not** carried forward |
| `spec/concept.html` | The ADT school logo (embedded base64, extracted to `assets/logo-adt-school.png`) and the deck's own type and layout conventions |

Public prototype referenced by the repo: `https://cnacha-mfu.github.io/mfupassport/`.
Planned production host: `mfupassport.web.app`. No Figma file was supplied.

### What the festival is

MFU is building an annual signature event around the university's internationalisation —
international students and staff, global partnerships, exchange, joint research. The stated
ambition, from the concept deck: as Kasetsart owns the agricultural fair, MFU should own
*International Festival*. Five pillars: **Celebrate MFU's International Identity**,
**Building Global Citizens**, **Bringing the World to Chiang Rai**, **Learning Through
Experience** (Explore → Experience → Participate → Connect), and **Zero Waste in Practice**.

### What the passport is

A digital passport for the festival, built by the School of Applied Digital Technology (ADT).
Visitors register in under a minute, collect a stamp at each booth by scanning a rotating QR
code on their own phone, and redeem a souvenir at a points threshold — Explorer 50, Voyager
100, Globetrotter 150, against 170 points available in the hall. Booth points are priced by
distance from the entrance (entrance 10, middle 15, far corner 20), which is what makes a
visitor walk the whole floor. It solves the two things that go wrong at every multi-unit event:
visitors never reach the far booths, and the organisers have no figures for the project report.

---

## CONTENT FUNDAMENTALS

**Bilingual, Thai first in Thai contexts.** The concept deck sets Thai as the primary line with
English underneath at ~0.5–0.86em, lighter weight, muted colour — never a flag, never a
language toggle. The app interface is English-only, but the typeface carries Thai so a booth or
school name supplied in Thai renders in the same design.

**Sentence case for everything except labels.** Headlines and buttons are sentence case
("Scan a booth", "See what's worth most"). Only eyebrows, stamp text and stat labels go
uppercase, and those are always letter-spaced and small.

**You, not the user; we, not the organisers.** Visitor copy addresses the reader directly:
"Point your camera at the booth screen." "Show your Prize page at the desk." Institutional copy
speaks as *we*: "We are left estimating attendance by eye."

**Say the thing, then the number.** The brand writes matter-of-factly and lets figures carry the
weight. From the deck: "Ready in one week." "0 installs." "100 paper backups." From the app:
"170 points still on the floor." "Far-corner booths pay 20 points." No adjectives doing a
number's job.

**Errors are one sentence a person can act on.** The app's own vocabulary, verbatim:
"You are not allowed to read this booth. Sign out and back in; if it persists, the security
rules need a fix." / "Offline — showing the last saved copy of the leaderboard." /
"Nothing to export yet." Never a code, never an apology, never an exclamation mark.

**Fallbacks are described as intended, not broken.** "Fallback is not an error state" is a
literal line in the spec. A booth with no artwork gets a generated stamp and the copy says so
neutrally.

**Emoji.** Not used in interface copy or headings. Two exceptions, both from the source:
country flags render as Unicode regional-indicator pairs in data rows (`<Flag />`), and 🌐
stands in for an unknown country. Nothing else.

**Vibe.** The festival voice is warm and inviting — "Experience the world in one place!",
"Bridging cultures, building global citizens" — one exclamation mark per poster, in the kicker
pill only. The product voice is calm, precise and slightly institutional. The two never blend
in one sentence.

---

## VISUAL FOUNDATIONS

**Colour.** One palette for brand and product alike. Four named brand colours, from the deck: ฟ้าคราม Sky Blue `#7EDFF2`,
เขียวธรรมชาติ Lush Green `#4C764F`, ส้มสดใส Bright Orange `#FABD6D`, ขาวบริสุทธิ์ Pure White.
Sky is the default ground for almost everything; green is the earth and the sustainability
line; orange is energy and reward. Around them sits a palette of thirteen **paper scraps**
sampled from the torn-paper logo — coral, red, terracotta, pink, sage, turquoise, cerulean,
gold, kraft, cream, taupe, forest. Scraps colour *content* (activity labels, stamp ink, booth
keys) and never chrome; nine of them are fixed as the `--booth-*` accents, assigned round-robin
so a booth's colour is stable all event. Accents are **fill only** — the identity dot, the stamp
ink, the kiosk frame ring, a leaderboard bar. A booth's *name* or *points* is never tinted with
its accent: seven of the nine fall below 4.5:1 on white, so labels stay `--app-ink`. Ink is a deep teal `#17414E`, never black. One accent
dominates any given screen.

**Application surfaces.** `--app-page` is full sky for the guest phone; `--app-page-quiet`
drops to sky-100 for the console, so white panels read against it. `--app-panel` is white,
`--app-chrome` is green-900 — the console sidebar, the booth kiosk ground and the passport
cover, each with the paper-cut campus set behind it at 14–22% opacity. `--app-foil` (gold-400)
marks reward states only: tier pips, the unlocked visa border, the crest. `--app-action` is
sky-900 — the darkest sky step, and the only one that carries white text; sky-500 to sky-700 are
fills. `--app-reward` is orange-400 under ink, never under white.

**Type.** Display is rounded and chunky, matching the torn-paper letterforms: **Baloo 2**
at 700/800, tracking −.02em. Body is **IBM Plex Sans Thai** 300/400/500/600/700 — one family
carrying Thai and Latin in the same design, which is why the deck and the app both use it. Thai
display headings fall through to **Mitr**. Figures are always tabular, 700–800, tracking −.03em.
Eyebrows and stamp text are uppercase at .14em / .2em. **IBM Plex Mono** (`--font-mono`) is the
one machine voice: visa numbers, the booth visa's machine-readable zone, kiosk codes. Never
body copy, never a heading.

**Backgrounds.** Full-bleed sky, either flat `--sky-500` or the supplied wave field
(`assets/bg-sky-waves.png`). Over it: white paper-cut clouds, and a paper-cut mountain range at
the foot of the composition (`assets/illus-campus-papercut.png` — the real MFU campus, cut in
layered paper). Never a gradient mesh, never a photographic background, never a dark mode.
Torn-paper scraps and translucent masking-tape strips are the only texture.

**Imagery.** Warm, saturated, flat-illustrated, no grain and no photography in the supplied set.
The cultural-ambassador figures are drawn in national dress against the paper mountains; the
line-art globe, rockets, balloons and map pins are single-weight black outlines used as spot
marks. Where a photograph is needed, use a placeholder and ask — this system ships no stock imagery.

**Corner radii.** Two shape languages. Chrome is soft: 14px on inputs, 20px on panels, 28px on
cards, 36px on the booth code frame, full pills on every button and label chip. Content that
stands for a *collected experience* is a paper scrap: 2px radius, hard edges, no shadow blur.

**Cards.** White (or cream) ground, 24px padding, 20–28px radius, a soft teal-tinted shadow, and
**no border**. Separation comes from the shadow against the sky ground. The only line a card
carries is an optional 3px accent rule along the top edge, keying it to a booth's colour.

**Shadows.** Six steps, all tinted `rgba(23,65,78,…)` — never neutral grey.
`--shadow-sm` → `--shadow-float` for elevation; `--shadow-paper` is a hard 2px/3px offset with
no blur, used only on paper scraps; `--shadow-text-poster` is the hard 2px drop under white
poster type. Inner shadow appears once, on the well behind a segmented control.

**Borders.** 1px hairlines at 14% ink for table rules and the tab bar's top edge; 2px for a
focus ring or a highlighted prize tier; 3px for a card's accent rule; a 10px ring of solid booth
accent around the booth code frame. Dashed 1px marks *empty* — an uncollected stamp slot.

**Transparency and blur.** Sparingly and only over the sky ground: the passport tab bar is white
at 94% over a 14px blur, so the sky reads through it. Chips over photography or illustration use
the `--scrim-photo` protection gradient rather than a translucent capsule; over flat sky they
use a solid capsule. **Text is never set in an alpha-tinted colour.** Secondary copy on the
green chrome uses the solid `--app-ink-on-chrome-soft` (`#CFE0D3`, 9:1) rather than white at
partial opacity, and `--ink-500` and `--orange-600` are fill colours only — their text
equivalents are `--ink-600` and `--status-warning-text`.

**Motion.** Paper drops, settles and drifts. Six durations, 120ms to 900ms. A stamp lands from
1.5× scale with a 6–10° rotation over 420ms on `--ease-settle`, one overshoot, never two, plus a
single 18ms haptic pulse. Page turns are a 320ms horizontal slide with a slight scale. A prize
seal draws itself in over 900ms. The booth code cross-fades in 260ms starting from 0.55 opacity,
not 0, so a phone pointed at the screen mid-swap can still decode it. All of it collapses to 1ms
under `prefers-reduced-motion: reduce`.

**Hover.** Fills **darken**, never lighten. Cards lift 2px and deepen their shadow. Ghost
buttons go from 6% to 12% ink. Links move from `--sky-800` to `--ink-900`. No underline
appears or disappears on hover.

**Press.** `scale(.98)`, 120ms. No colour change on press — the shrink is the whole signal.

**Focus.** A 3px sky ring at 20% opacity plus a solid `--sky-700` border. Danger fields swap
both to the danger colour. Focus is never removed.

**Layout.** Phone-first for visitors: a 448px max-width column, 20px gutters, a fixed bottom tab
bar and a raised scan circle. Desktop for the console: a 232px fixed sidebar in navy, fluid
content to 1280px. Booth kiosks are full-bleed with viewport-relative padding and a 24px text
floor. Posters and decks use the `--gutter-desktop` clamp, 28px to 104px.

### Intentional additions

Everything in `components/` maps to something in the supplied sources, with three exceptions,
each added because the source implies it without packaging it:

- **`Icon`** — the codebase exports the four glyphs as a plain object (`Icon.cover`, `Icon.scan`, …).
  Wrapped as a component so consumers get one API and one stroke weight.
- **`ScrapLabel`** and **`PosterHeading`** — the torn-paper activity label and the poster
  headline lockup are used repeatedly across the official key visual and the concept deck but
  exist there only as flattened artwork. Componentised so brand work can reproduce them exactly.

---

## THE BOOTH VISA

**The collectable is a visa label, not a round entry cachet.** `Stamp` draws an ICAO MRV-B
proportioned label (105 × 74 mm — the same aspect as the sticker pasted into a real passport,
per Doc 9303 Part 7), because a festival passport that hands out *visas* reads as a document
rather than a loyalty card, and because a landscape label holds the booth's name, dates and
points without the cramped ring-of-microtext problem.

What is on it: the `VISA` mark with its Thai counterpart, the issuing line, a visa number top
right in mono, a field block borrowed from the standard sticker (`VALID FOR`, `FROM – UNTIL`,
`TYPE`, `ENTRIES`, `STAY`, `ISSUED IN / ON`, with the second language under the first), the
booth code set large over a rosette, an overprinted `ADMITTED` cachet, and a two-line
44-character machine-readable zone in `--font-mono` using only `A–Z`, `0–9` and the `<` filler.
Security tint is a diagonal accent hatch at 16%.

**Two levels of detail, chosen by width.** `size` is the label's *width*; height follows the
ratio. At 150px and up the field block and real MRZ render. Below that — the stamp grid, a
booth sheet — the field block drops away, the booth code carries the label and the MRZ becomes
texture. Same object, read at arm's length or at a glance.

**Accent is fill, data is ink.** The booth accent colours the frame, the tint, the visa number
and the cachet; every field value stays `--app-ink`, because seven of the nine booth accents
fall below 4.5:1 on white. Unissued slots are the same label, dashed and faint, with no MRZ
ink and no cachet — an unissued form, not an error.

---

## ICONOGRAPHY

**There is no icon library, and that is the system.** The passport app defines exactly four
line glyphs — `cover`, `stamps`, `prize`, `scan` — hand-drawn on a 24px box, `fill: none`,
`stroke: currentColor`, stroke width 1.8 (2.0 for `scan`, which is larger). They live in
`components/passport/Icon.jsx`, copied from `src/components/ui.tsx`. No icon font, no sprite
sheet, no Lucide, no Heroicons, no CDN dependency. If an action needs a glyph that is not one
of those four, use a word instead — the codebase does exactly that ("Print card", "CSV",
"Copy", "⛶").

**Two glyphs are Unicode, not SVG.** `⛶` (U+26F6) is the booth screen's full-screen control,
and country flags are regional-indicator pairs via `<Flag code="TH" />`, with `🌐` for unknown
codes. Those are the only pictographic characters anywhere in the interface.

**Marks and illustrations are raster PNGs**, extracted from the supplied PDF and deck — the
torn-paper festival logo, the Global MFU seal, the ADT school mark, the paper-cut campus, the
line-art globe with map pins, and the rocket. They are placed as images, never redrawn.
`Crest` is the one exception: a two-ring-and-star SVG that the app itself draws as a placeholder
foil mark on the passport cover.

**No logo was invented.** The Mae Fah Luang University crest appears only inside the supplied
key visual; no standalone file was provided, so where the university mark is needed, use the key
visual or set the university name in plain type. See "Caveats".

---

## Index

### Root
- `styles.css` — the entry point. `@import` lines only; link this one file.
- `readme.md` — this document.
- `SKILL.md` — Agent Skills front matter, for use in Claude Code.
- `thumbnail.html` — the system's homepage tile.

### `tokens/`
`fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `shape.css` · `motion.css` ·
`theme-app.css` (the `--app-*` surface semantics and the nine booth accents) ·
`base.css` (element defaults and link colours).

### `components/`
| Group | Components |
|---|---|
| `core/` | **Button**, **Card**, **Fig**, **Spinner** |
| `forms/` | **Field**, **CopyButton**, **CsvButton** |
| `feedback/` | **Notice** |
| `navigation/` | **TabBar**, **DaySelector** |
| `passport/` | **Stamp** (the booth visa label), **QRFrame**, **Icon**, **Flag**, **Crest** |
| `festival/` | **ScrapLabel**, **PosterHeading** |

Each has a `.d.ts` props contract and a `.prompt.md` with a usage example. Each directory has
one `@dsCard` HTML showing its states.

### `ui_kits/`
- `passport-app/` — **guest**: cover, stamp grid, prize visa, live scan. Click-through.
- `booth-organizer/` — **organizer**: the kiosk code screen, booth statistics, prize desk.
- `admin-console/` — **admin**: live dashboard, leaderboard, participation, countries, booth setup.

### `guidelines/`
Twenty-nine specimen cards across **Colors** (9), **Type** (5), **Shape** (3), **Spacing** (2),
**Motion** (1) and **Brand** (8).

### `templates/`
- `festival-deck/` — bilingual slide deck in the festival brand.

### `assets/`
| File | What it is |
|---|---|
| `logo-festival.png` | The torn-paper festival logo lockup |
| `logo-festival-tagline.png` | The same lockup with "Bridging Cultures, Building Global Citizens" |
| `logo-global-mfu.png` | Global MFU circular seal |
| `logo-adt-school.png` | School of Applied Digital Technology mark |
| `key-visual-poster.png` | The master key visual, 1600×2000 |
| `illus-campus-papercut.png` | Paper-cut MFU campus and mountains |
| `illus-globe-mappins.png` | Line-art globe with map pins and a balloon |
| `illus-rocket.png` | Paper-cut rocket |
| `bg-sky-waves.png` | Sky wave field, 2630×1480 |
| `shape-torn-terracotta.png` | Torn terracotta paper scrap, for edges and sidebars |

---

## Caveats and open questions

- **No font files were supplied.** Baloo 2, IBM Plex Sans Thai, IBM Plex Mono and Mitr are loaded from Google
  Fonts. Baloo 2 was chosen to match the rounded, chunky torn-paper letterforms in the logo;
  the poster's actual Latin display face is unknown. **If the festival has a licensed display
  face, send the files and this substitution should be replaced.**
- **No Mae Fah Luang University logo file.** Only the flattened key visual contains the crest.
- **The prototype's navy/paper palette is gone.** All three surfaces now run on the festival
  theme, per your direction. The old values are still readable in
  `MFU-Event-Planning/src/index.css` if any of them need to come back.
- **No booth badge artwork was supplied**, so every stamp in the kits uses the generated
  fallback ring — which is the intended default.
- Slides 13–14 of the concept PDF point to a shared folder (tentative programme, booth details)
  that was not included.

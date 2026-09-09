# Design sync notes

Claude Design project: **MFU International Festival 2026 Design System**
(`https://claude.ai/design/p/f3c3aa54-6cf0-47d7-8569-775b59bc3d73`).

This repo **pulls** from that project (the reverse of the stock `/design-sync` flow, which pushes a
repo's components up). `design-system/` is a read-only mirror of the project's tokens, components,
UI-kit screens and docs; the app itself consumes the values through `src/index.css` (`@theme`).

## Pulled 2026-09-09

- Mirrored: readme, SKILL.md, styles.css, tokens/*, components/**/{jsx,d.ts,prompt.md},
  ui_kits/**/{screens.jsx,README.md}, templates/festival-deck/support.js.
- Not mirrored (presentation harness only, still in the project): `components/*/*.card.html`,
  `guidelines/*.html` (29 specimen cards), `thumbnail.html`, `_ds_bundle.js`, `_ds_manifest.json`,
  `templates/festival-deck/FestivalDeck.dc.html`, `ds-base.js`.
- **Assets over ~190 KB come back truncated from the design tool** (256 KiB response cap), so these
  must be downloaded from the project by hand and dropped into `design-system/assets/`:
  `logo-festival.png`, `logo-festival-tagline.png`, `bg-sky-waves.png`, `key-visual-poster.png`.
  `illus-campus-papercut.png` was supplied this way and is now present (2421 x 1131, 3.0 MB); the
  runtime copy is `public/brand/illus-campus-papercut.webp` — cropped to its alpha box, 1600px
  wide, 81 KB. Also skipped (small, base64 only in-context): `illus-rocket.png`,
  `shape-torn-terracotta.png`. Present: `logo-global-mfu.png`, `illus-globe-mappins.png`,
  `logo-adt-school.png` (extracted from `spec/concept.html`).
- The booth kiosk now stands on the real campus paper-cut, faded into the chrome from 42% height so
  its skyline does not cut a hard edge behind the QR. The cover and admin sidebar still use the
  drawn `PaperHills`, and the festival logo is still missing.

## Contrast findings (fixed in the app; worth fixing upstream too)

- `tokens/base.css` sets `h1–h4 { color: var(--text-heading) }` (ink-900). On `--app-chrome`
  (green-900) that is **1.06:1** — the kiosk title in the Organizer kit is invisible. The app sets
  headings on chrome to white explicitly. Upstream fix: scope the heading colour to light grounds,
  or set `color: inherit` on headings inside chrome surfaces.
- The Organizer kit sets the eyebrow and the manual code in the booth accent. As text on green-900:
  booth-3 2.2:1, booth-9 1.5:1, booth-1 3.6:1, booth-8 4.3:1, booth-2 4.5:1. The app keeps the
  accent as a fill (frame ring + a dot beside the eyebrow) and sets both texts white / on-chrome-soft.
- `--ink-700` on `--sky-500` is 3.4:1; the app uses `ink-soft` (ink-600, 5.0:1) for all muted text.
- `DaySelector` inactive labels use `--ink-500` (3.4:1 on white) — the app's `.tab` uses ink-600.
- `PosterHeading` kicker: white on `--scrap-sage` is 2.5:1. Not used in the app.
- Field focus border `--sky-700` is 2.8:1 on white; the app uses sky-800 (4.0:1) for the border.

## Mapping (design token → Tailwind utility in `src/index.css`)

`--app-ink`→`ink`, `--app-ink-soft`→`ink-soft`, `--app-chrome`→`chrome`, `--app-ink-on-chrome-soft`
→`on-chrome-soft`, `--app-action`→`action`, `--app-foil`→`foil`, `--app-reward`→`reward`,
`--app-page`→`page`, `--app-page-quiet`→`page-quiet`, status fills/text/bg → `success|warn|danger`
(`-text`, `-bg`). Booth accents live in `shared/model.ts` (`ACCENTS`); existing booth records keep
their stored colour.

## 2026-09-09 — rename and signed-out visuals

- Product renamed **MFU Go Global Passport → MFU InterFest Passport**; the seeded event is now
  "MFU International Festival 2026" (Thai: เทศกาลนานาชาติ MFU 2026); stamp fallback mark
  `MFU INTERFEST`. Kept as data identifiers: `EVENT_ID` `mfu-go-global-2026`, passport prefix
  `MFU-GG`, hosting `mfupassport.web.app`, the `cnacha-mfu/mfupassport` repo. The mirror's
  `design-system/readme.md` carries the new name; the Claude Design project's own readme still says
  "Go Global" — push it up if wanted (needs one upload approval).
- The **live Firestore event document** still carries the old `nameEn`; change it in Admin → Event
  or reseed. The landing page reads the name from there.
- Signed-out screens (landing, sign in, sign up, forgot, verify, account) share `FestivalBackdrop`
  (`src/pages/auth/parts.tsx`): SVG paper-cut mountains standing in for the missing
  `illus-campus-papercut.png`, paper clouds, and `illus-globe-mappins.png` inverted to white line
  art. The Global MFU seal (`public/brand/logo-global-mfu.png`) replaces the placeholder star crest
  on those screens. Both PNGs used by the app live in `public/brand/`.
- `.link` no longer sets a colour: as unlayered CSS it outranked `text-*` utilities, which turned
  the foil links on chrome sky-900 (2.3:1). Links inherit `currentColor` or set their own class.

## 2026-09-09 — signed-out screens moved to the sky brand

- Per the user, the landing and auth screens no longer sit on green chrome (that ground stays for
  the kiosk, cover card, admin sidebar, booth stats and account). `FestivalBackdrop` is now the key
  visual's sky: wave bands (sky-300/400), a paper sun, white paper-cut clouds, the black line-art
  globe, and three paper hills (green-300/400/500) at the foot. The passport pages reuse it with
  `hills={false}`. Auth forms sit in a white card; `Field` in `parts.tsx` now uses `.field`.
- `ScrapLabel` (parts.tsx) is the app's torn-paper label; tones are limited to pairs that clear
  4.5:1 — forest/red with white, orange/sky/cream with ink. Sage with white (2.5:1) is not offered.
- Landing/auth text protection: `.haze` (sky at 60% over an 8px blur, 28px corner) behind the header
  and copy blocks; the seal and buttons stay on open sky. Ambient motion: clouds drift ±14px over
  26s/34s, the sun breathes over 12s, the globe keeps its 9s drift — transform only, all off under
  `prefers-reduced-motion`.
- The globe was swapped for `PaperRocket` (parts.tsx), a flat paper-cut SVG in the poster's rocket
  colours, because `illus-rocket.png` was also truncated by the tool. `.haze` is now a soft-edged
  pseudo-element (radial mask over the blur), so clouds pass under type as haze with no card edge.
- Rocket placement: it first sat beside the seal and crowded it. Now it flies in the empty band
  between the header and the seal, bleeding off the right edge on phones; on `sm` it moves clear of
  the sun (right 13%, top 21%).

## 2026-09-09 — navigation, shells and the icon departure

**One deliberate departure from the design system.** `readme.md` states that four line glyphs are
the whole inventory and that a word does the rest. That still holds for the visitor app. The admin
console's sidebar now collapses to a 72px icon rail, which cannot show ten words, so eleven more
glyphs live in `Icon` (`src/components/ui.tsx`) plus `person` for the visitor's Profile tab:
`person, menu, dashboard, screen, desk, draw, event, booths, prizes, users, audit, lists`. All are
in the system's own language — line only, no fills, 1.8 stroke, `currentColor`, 24px box. **Push
these to the Claude Design project** so the two stop diverging, or tell us to drop the collapse.

Other things worth carrying upstream:

- The design system's `TabBar` keeps the scan circle inside the bar's own box (`paddingTop: 56`).
  The app had it as a separate `fixed` layer and it floated over page content; it matches the
  component now. Worth stating explicitly in the component's prompt notes.
- `.seg` and `.tab` are now pill carriers with a sliding `::before` driven by `useSlidingPill`
  (`src/lib/useSlidingPill.ts`). The design system's segmented controls still swap backgrounds.
- Motion durations are `@theme` tokens ported from `design-system/tokens/motion.css`, so
  `prefers-reduced-motion` zeroes the scale in one block. `--ease-enter` is new and has no
  counterpart in the design system: it is for movement that answers a click, where
  `--ease-standard`'s slow head reads as lag.
- Touch targets are raised to 44px under `@media (pointer: coarse)` only. The design system's 28px
  `.btn-sm` metrics are right beside 12px text on a laptop and wrong for the booth tablet.

## 2026-09-09 — chrome is deep teal, not dark green

**Second deliberate departure, at the user's direction.** `tokens/theme-app.css` sets
`--app-chrome` and `--app-cover` to `green-900` (#1E3F2A). Dark green is no longer used as a ground
anywhere in the app: chrome is `#17414E`, the deep teal the design system itself calls `--ink-900`
and describes as "sampled from the key visual's body copy". `--app-chrome-soft` follows to
`#1F5A6B` and `--app-ink-on-chrome-soft` to `#CFE3EA` so the soft white is teal-tinted rather than
green-tinted.

Nothing lost on contrast: every foreground that cleared the green clears the teal within a tenth of
a point (white 11.0:1 against 11.7:1; foil 6.9 against 7.2; the soft white 8.3 against 8.5).

Green survives where it is the subject rather than the ground: the paper mountains, the "connected"
dot, the success state, and `--booth-3`/`--booth-9`.

Three new tokens with no design-system counterpart: `--color-success-on-chrome` #BDE8C4,
`--color-warn-on-chrome` #FFD9A3, `--color-danger-on-chrome` #FFC9BF. The system's `*-text` status
values are tuned for white and unreadable on chrome — success is 2.2:1 there — and the `.on-chrome`
block was already restating them inline. Naming them lets a page that frames a white card, and so
cannot take `.on-chrome` wholesale, still reach the right value. The prize desk is that page.

Also, per the design system's own kits, the admin rail and the passport cover now carry the
paper-cut mountains behind them (`PaperHills` in `src/pages/auth/parts.tsx`, at 14% and 18%), and
the rail leads with the university seal. The kits use `assets/logo-festival.png` and
`assets/illus-campus-papercut.png` for this; the campus is now in hand, the logo is not.

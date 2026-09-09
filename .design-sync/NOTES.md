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
  `logo-festival.png`, `logo-festival-tagline.png`, `illus-campus-papercut.png`, `bg-sky-waves.png`,
  `key-visual-poster.png`. Also skipped (small, base64 only in-context): `illus-rocket.png`,
  `shape-torn-terracotta.png`. Present: `logo-global-mfu.png`, `illus-globe-mappins.png`,
  `logo-adt-school.png` (extracted from `spec/concept.html`).
- Because the campus paper-cut and the festival logo are missing, the kiosk, cover and admin
  sidebar do not yet place them. Add `<img>`s once the files are in `public/`.

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

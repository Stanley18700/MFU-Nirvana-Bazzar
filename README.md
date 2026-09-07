# MFU Go Global Passport

A digital passport for the **MFU Go Global International Festival**, 16–18 September 2026.
Visitors collect a stamp at each booth by scanning a rotating QR code on their own phone, and
redeem a prize once they reach a threshold.

Built by the School of Applied Digital Technology, Mae Fah Luang University.

## Contents

| Path | What it is |
|---|---|
| `spec/spec.md` | Product and technical specification — the working document |
| `spec/concept.html` | The 5-slide proposal deck (bilingual, for university committees) |
| `demo/index.html` | Clickable prototype, all three roles — open it in a browser, no build step |
| `demo/organizer.html` | Opens the prototype straight into the booth organizer's screens |
| `demo/admin.html` | Opens the prototype straight into the admin dashboard |

## Live prototype

**https://cnacha-mfu.github.io/mfupassport/** — visitor, organizer and admin, no install.

> **This URL is public.** A GitHub Pages site is readable by anyone with the link even though this
> repository is private, so Pages is published from the **`gh-pages`** branch, which holds only the
> three prototype pages. The specification stays on `main` and is not served. After changing
> anything under `demo/`, copy it across or the live site will be stale:
>
> ```bash
> git checkout gh-pages && git checkout main -- demo && mv demo/*.html . && rmdir demo
> git commit -am "Update prototype" && git push && git checkout main
> ```

## The prototype

`demo/index.html` is a single self-contained file with mock data and no backend. Open it directly,
or serve the folder:

```bash
cd demo && python -m http.server 8000   # then open http://localhost:8000
```

Use the role switcher in the top bar, or open one role directly:

- **Visitor** (`index.html`) — passport cover, stamp grid, prize page, registration form, and a
  scanner with three simulated outcomes (new stamp, already stamped, expired code).
- **Organizer** (`organizer.html`) — three screens: the booth QR screen with a code that genuinely
  rotates every 20 seconds, the booth's own statistics, and the prize desk (scan, confirm, void).
- **Admin** (`admin.html`) — live dashboard with day selector, user and invitation tables, booth
  artwork, prize policy and stock.

`organizer.html` and `admin.html` are thin entry points into the same prototype
(`index.html?role=…&solo=1`), which hides the role switcher — useful when showing one audience only
their own screens. There is one copy of the code, not three.

## The three roles

- **Visitor** — registers in under a minute, scans booths, redeems prizes, and sees how many
  of each prize are left, live.
- **Organizer** — runs one booth's screen; it operates itself all day.
- **Admin** — live statistics, user CRUD and roles, booth CRUD, prize policy, and the event
  itself: create it, run it, archive it, and start the next one.

## Reusable, event to event

The event is a Firestore document, not a build-time constant. Its name, dates, days, QR
rotation period, passport prefix and default zone points all live on `events/{id}`, and the
admin creates, edits, archives and replaces it from **`/admin/event`** without a redeploy.

Archiving freezes the event's totals to `archives/{id}` and then clears the stamps, unlocks,
counters and visitor progress, which is what makes the booth ids safe to reuse — stamps are
keyed `scans/{visitorId}_{boothId}`, so without the clear a returning visitor could never
re-stamp a `booth-01` belonging to a different event. See `SETUP.md` §8.

## The app (`proto1.0`)

The real application now lives at the repo root — Vite + React + TypeScript client in `src/`,
Cloud Functions in `functions/`, shared token/model code in `shared/`, Firestore rules and indexes
alongside. **See `SETUP.md`** for creating the Firebase project, deploying, seeding the twelve booths
and making the first admin. `spec/` and `demo/` are unchanged.

```bash
npm install && npm --prefix functions install
npm run emulators    # Auth, Firestore, Functions, UI (see SETUP.md §7)
npm run dev          # against those emulators
npm run e2e          # 145-check end-to-end run through the real rules and triggers (scripts/e2e/)
npm run deploy       # build client + functions, deploy everything
```

## Planned stack

Firebase throughout: Cloud Firestore, Firebase Hosting (`mfupassport.web.app`), Cloud Functions v2,
Firebase Auth with custom claims, Cloud Storage for booth artwork. Client is a Vite + React SPA.
See `spec/spec.md` §9 for the reasoning.

## Badge points

Badges are not worth the same. Each booth carries a points value, and prize tiers are thresholds
on the **sum of points** — Explorer 50, Voyager 100, Globetrotter 150, against 170 available in the
hall. Points are priced by how far into the hall a booth sits (entrance 10, middle 15, far corner
20), which is what makes a visitor walk past the entrance row. See `spec/spec.md` §6.6.

## Two things to know before building

- **Booth QR codes rotate** on a TOTP-shaped HMAC with a 20-second period, computed client-side from
  a booth secret, so a photographed code sent to a friend is dead on arrival. Booth secrets live in a
  collection that security rules deny to every client.
- **Ethnic group is sensitive data** under Thailand's PDPA (s.26). It is optional, gated behind its
  own separate consent, never shown in any per-person view, and suppressed in aggregate below 5
  people. See `spec/spec.md` §4.1 and §10.

Open questions are listed at the end of `spec/spec.md`.

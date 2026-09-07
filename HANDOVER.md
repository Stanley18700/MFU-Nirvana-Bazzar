# Handover — MFU Go Global Passport

**Status date:** 4 September 2026 · **Branch:** `proto1.0` · **Event:** 16–18 September 2026
**Deadline that matters:** a live demo for the supervisor, ~7–9 September.

Read this first, then `SETUP.md` (deploy steps) and `spec/spec.md` (the product spec, which the
code follows section by section — comments in the code cite `§` numbers from it).

---

## 1. One-paragraph summary

A digital stamp-collecting passport for a three-day university festival. Visitors register on
their own phone, scan a rotating QR at each of 12 booths, earn points weighted by how far into the
hall the booth is, and redeem prizes at a desk. Organizers get a self-running booth screen; admins
get a live dashboard, CRUD, invitations, prize policy, stock and a stage draw. Stack: Vite + React +
TypeScript client, Firebase (Firestore, Cloud Functions v2, Auth, Hosting, Storage), region
`asia-southeast1`. The whole codebase (~4,500 lines) was written on 4 September; it typechecks and
builds cleanly but **has never been run against a Firebase project.** That is the gap.

## 2. Where things stand — honest checklist

| Area | State |
|---|---|
| Spec, concept deck, clickable mock (`spec/`, `demo/`) | Done by the supervisor, unchanged, on `main` |
| Application code (client + functions + rules + seed) | Written, `tsc` and `vite build` pass |
| Firebase project | Exists: **`mfu-passport`** (Stanley's personal Google account). Web app config partly known — see §5 |
| Console setup (Auth providers, Firestore, Storage, Blaze) | **Unverified** — nobody has confirmed these are enabled |
| `.env.local`, `functions/.env` | Not created (templates `.env.local.example`, `functions/.env.example` exist) |
| Secrets (`ADMIN_BOOTSTRAP_KEY`, `EMAILJS_PRIVATE_KEY`) | Not set |
| Dependencies installed on the dev machine | Partially (`npm install` was interrupted in both root and `functions/`) — rerun both |
| Deployed | **Never** |
| Seeded (12 booths, 3 tiers, reference lists) | Never |
| Runtime testing against Firestore | **None.** Expect a handful of first-deploy bugs (wrong field path, missing index, rules too tight). Budget half a day |
| Tested on a real phone camera | No |
| Committed to git | **No** — 20 new files are uncommitted on `proto1.0`. Commit first, before anything else |
| Stray files to delete | `app-src.tgz`, `mfupassport-app.tgz` in the repo root (transfer leftovers, gitignored) |

## 3. Steps left, in order

1. **Commit.** `git add -A && git commit -m "Add app v0.1"` on `proto1.0`. Push.
2. **Firebase console** (Stanley's account for now, university account later — see §7):
   Authentication → enable *Anonymous* and *Email/Password* with *Email link* on; Firestore in
   `asia-southeast1`, production mode; Storage, same region; upgrade to **Blaze** (Functions need it);
   redeem the $50 GCP coupon on that billing account; set a $20 budget alert.
3. **Config.** Project settings → Your apps → copy `firebaseConfig`. Create `.env.local` from the
   example (fill `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID`); copy `functions/.env.example`
   to `functions/.env`.
4. **Tooling.** `npm install`, `npm --prefix functions install`, `npm i -g firebase-tools`,
   `firebase login`, `firebase use mfu-passport`.
5. **Secrets.** `firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY` (any long random string; used
   once). `firebase functions:secrets:set EMAILJS_PRIVATE_KEY` (type `none` unless EmailJS is set up —
   the function declares the secret so it must exist).
6. **Deploy.** `npm run deploy` (builds client + functions, deploys hosting, functions, rules,
   indexes, storage rules). First functions deploy takes 3–6 min and may prompt to enable APIs.
7. **Seed.** `npm run seed` (needs `gcloud auth application-default login` or a service-account key
   in `GOOGLE_APPLICATION_CREDENTIALS`). Idempotent.
8. **First admin.** Open `https://mfu-passport.web.app/setup`, enter the bootstrap key. Works only
   while no admin exists.
9. **Test the loop end to end** and fix what breaks (see §6 for where bugs are most likely):
   `/join` on a phone → `/booth?boothId=booth-01` on a laptop as admin → scan → `/admin` shows the
   stamp within a second → lower a tier threshold in `/admin/prizes` → `/passport/prize` shows the
   rotating code → `/redeem` confirms it → stock decrements → `/admin/users` sends an invite →
   open the link on another device → lands on `/booth`.
10. **Demo prep.** Print a QR to `https://mfu-passport.web.app/join` for the "welcome sign". Have
    the dashboard on the projector, one laptop/tablet as a booth, phones from the audience.

Optional before the meeting: EmailJS for real invite emails (SETUP.md §2; ~15 min). Without it the
admin gets a copyable link instead, which is fine for a demo.

## 4. Code map — where to look for what

```
shared/token.ts        Booth QR scheme (spec §5.2): HMAC-SHA256(secret, boothId:counter), 20 s period,
                       6-char base32 token = manual code. Web Crypto only — runs in browser AND functions.
shared/model.ts        Firestore document types, constants (EVENT_ID, EVENT_DAYS, zone points, accents).
                       Copied into functions/src/shared by scripts/copy-shared.mjs at build (gitignored there).

functions/src/index.ts     exports + global options (region, cpu/memory caps)
functions/src/lib.ts       admin SDK init, requireRole(), validators, rate limiter, audit(), shard refs
functions/src/visitor.ts   join, scan (incl. manual-code brute-force match), redemptionCode, requestRestore, requestErasure
functions/src/organizer.ts boothSession (only path to a booth secret), lookupRedemption, confirmRedemption, voidRedemption
functions/src/admin.ts     users/roles, booths (+rotateBoothSecret), prize policy (+preview), adjustStock, runDraw,
                           invites (inviteOrganizer/resend/revoke/inviteInfo/acceptInvite), bootstrapAdmin, refreshRanks
functions/src/triggers.ts  onScanCreate (updates all counters + creates tierUnlocks), onUserWrite, rankBooths (1 min),
                           sweepActive (1 min), purgePersonalData (daily, no-op until 17 Dec 2026)
functions/src/mailer.ts    EmailJS server-side; returns false when unconfigured so callers fall back to a link
functions/src/seed.ts      12 booths + secrets, 3 tiers with stock, refData lists. `--emulator`, `--admin <uid>`

src/lib/firebase.ts    SDK init from VITE_* env; auto-connects to emulators when no API key in dev
src/lib/auth.tsx       AuthProvider: anonymous sign-in on load, custom-claim role/boothId, refresh on focus + 15 min
src/lib/api.ts         typed wrappers for every callable
src/lib/data.ts        onSnapshot hooks; useEventStats() sums the 10 shards client-side
src/pages/visitor/     Landing, Join, PassportLayout, Cover, Stamps, Prize, Scan, ScanResult, ScanLanding (/s/:token), Restore, Invite
src/pages/organizer/   Booth (rotating QR), BoothStats, Redeem (prize desk)
src/pages/admin/       AdminLayout, Dashboard, Booths, Users (+invites), Prizes (+stock, void), Draw, Audit, Wall, Setup
src/components/        Stamp (generated fallback stamp SVG), QR, Scanner (BarcodeDetector → zxing-wasm), ui
firestore.rules        clients never write users/scans/tierUnlocks/stats/auditLog; boothSecrets denied to all clients
firestore.indexes.json composite indexes; add one if a query fails with "requires an index" (the error gives a link)
```

Firestore paths that differ slightly from the spec's sketch (deliberate, so paths alternate
collection/document): `stats/event/shards/{0..9}`, `stats/booths/items/{boothId}`,
`stats/buckets/items/{eventId_yyyymmddhhmm}`.

## 5. Credentials and accounts the next developer needs

- **Firebase project `mfu-passport`** — owned by Stanley's Google account. He must add the next
  developer as **Editor** (Project settings → Users and permissions) or hand over the account.
- **Web app config** — known so far: `projectId mfu-passport`, `authDomain mfu-passport.firebaseapp.com`,
  `storageBucket mfu-passport.firebasestorage.app`, `messagingSenderId 451027884644`.
  **Still needed:** `apiKey` and `appId` (console → Project settings → Your apps).
- **$50 GCP coupon** — Stanley has it; must be redeemed on the Blaze billing account.
- **GitHub repo** `cnacha-mfu/mfupassport` (private) — supervisor owns it; branches `main`,
  `proto1.0`, `gh-pages` (public mock only — never push the app there).
- **EmailJS** — no account yet. Optional.
- Nothing else. No SMTP, no domain, no custom DNS.

## 6. Known gaps and likely first bugs

Deviations from `spec/spec.md`, all deliberate for v0.1:

- Invite acceptance upgrades the anonymous account on the device that opens the link (single-use,
  bound to the invited email) instead of a Firebase email-link sign-in.
- No Resize Images extension — badge uploads are used at their uploaded size (client caps 512 KB).
- Booth ranks recompute every 1 min (Cloud Scheduler floor), not 30 s.
- App Check not enforced. Turn on reCAPTCHA Enterprise App Check before the real event.
- No one-page PDF export of the dashboard (CSV per panel exists).
- Restore-by-email path is wired but depends on EmailJS; untested.

Where to expect trouble on first run:

- **Firestore rules** — a listener silently returns nothing if a rule denies it. Watch the browser
  console for `permission-denied`. Most likely spots: `stats/**` reads for organizers, `tierUnlocks`
  query for visitors.
- **Missing composite index** — the error message contains a link that creates it; also add it to
  `firestore.indexes.json`.
- **Custom claims lag** — after `join` / `acceptInvite` / `setUserRole` the client must refresh its
  ID token (`refreshClaims()` is called; if a page still thinks the user has no role, reload).
- **Cloud Functions v2 options** — `cpu: 1` with `concurrency: 40` in `index.ts`; if deploy rejects
  the combination, drop `concurrency` to 1.
- **Scheduler** — `onSchedule` functions need the Cloud Scheduler API enabled; deploy prompts for it.
- **Camera** — `BarcodeDetector` exists on Android Chrome; iOS Safari uses the zxing-wasm fallback,
  which downloads its WASM from jsDelivr on first use. Test on an iPhone before the demo.
- **Manual code entry** — server matches a bare 6-char code against every active booth × 2 counters;
  fine for 12 booths.

## 7. Open questions for the supervisor (from spec §13, still open)

Final booth count and which days each booth is present; prize quantities per tier (seed assumes
600 / 250 / 120); who owns the Firebase project and billing long-term (must move off a student
account — repeat SETUP.md §1–5 on the university project, `firebase use <id>`, re-seed); sanity-check
zone/point values against the real floor plan; Office of International Affairs to review the
ethnic-group suggestion lists (`refData/ethnicGroups`, editable without deploy) and the draft
`public/privacy.html`; institution list scope; EmailJS vs university SMTP.

## 8. Working practices that were in effect

- The app lives at the repo root next to `spec/` and `demo/`; work on `proto1.0`, PR to `main`.
- After changing anything under `demo/`, re-sync `gh-pages` (command in README). The app itself is
  **not** on GitHub Pages and must not be — it needs Firebase Hosting rewrites for `/s/:token`.
- Never commit `.env.local`, `functions/.env`, `functions/.secret.local`, service-account keys.
- Every consequential write goes through a callable; if you find yourself adding a client-side
  `setDoc` to `users`, `scans`, `tierUnlocks` or `stats`, stop — rules will deny it, by design.
- Points are frozen at scan time and tier unlocks are never revoked (spec §6.6–6.7). Keep it that way.

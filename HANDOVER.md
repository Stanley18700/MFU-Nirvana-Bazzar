# Handover — MFU Go Global Passport

**Status date:** 7 September 2026 · **Branch:** `proto1.0` · **Event:** 16–18 September 2026
**Live:** https://mfu-passport.web.app — deployed and seeded 7 September 2026
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
| Runtime testing against the **emulator** | **Done, 7 Sep.** `npm run e2e` — 150 checks through the real rules and triggers, all passing (scripts/e2e/). Eight defects found and fixed on 7 Sep, three more on 8 Sep (savePrizePolicy audit write, voided tier shown as locked, invite "used/revoked" states unreachable); the prize desk's typed passport-number lookup was added on 8 Sep |
| Reusable events (`/admin/event`, archive & restart) | **Built and tested.** The event is a document, not a constant |
| Live prize stock on the visitor's side | **Built.** Exact count on every tier, always |
| Mobile layout for every non-admin screen | **Done.** `xs` breakpoint added; booth kiosk, stamp grid, scanner, prize page and prize desk fixed at 320px |
| Firebase project | Exists: **`mfu-passport`** (Stanley's personal Google account). Web app config partly known — see §5 |
| Console setup (Auth providers, Firestore, Storage, Blaze) | **Done** — verified by a successful deploy and seed |
| `.env.local`, `functions/.env` | Both exist and are correct |
| Secrets (`ADMIN_BOOTSTRAP_KEY`, `EMAILJS_PRIVATE_KEY`) | Both set in Secret Manager. `EMAILJS_PRIVATE_KEY` is the placeholder `none`, so invites show a copyable link instead of emailing — replace it and redeploy the functions when the real key is available |
| Dependencies installed on the dev machine | Installed in both root and `functions/`. Firebase CLI 15.29, Java 21 present |
| Deployed | **Yes, 7 Sep** — https://mfu-passport.web.app. All 38 functions, rules, indexes, storage rules |
| Seeded (12 booths, 3 tiers, reference lists) | **Yes, 7 Sep** — 12 booths (190 points on the floor, see SETUP.md §4), 3 tiers at full stock, all three refData lists |
| Runtime testing against **real Firestore** | **Partial.** Verified live: the live event document reads without auth, 12 booths, 3 tiers, refData, and `boothSecrets` + `stats` correctly denied to a visitor. The scan/redeem loop on real devices is still untested |
| Tested on a real phone camera | No |
| Committed to git | Committed on `proto1.0`. Push to `github.com/cnacha-mfu/mfupassport` tree `proto1.0` |
| Stray files to delete | `app-src.tgz`, `mfupassport-app.tgz` in the repo root (transfer leftovers, gitignored) |
| Remaining blockers | None for the demo. Open: the first admin still has to be created at `/setup`, and the loop has not been walked on real phones |

## 3. Steps left, in order

> **Steps 1–6 are done as of 7 September** — the project is deployed and seeded at
> https://mfu-passport.web.app. What is actually left is step 7 onward: create the first admin
> at `/setup`, walk the loop on real devices, and prepare the demo. The list below is kept as
> the record of what was done, and as the recipe for standing the app up on the university's
> Firebase project later (§7).

1. **Firebase console** (Stanley's account for now, university account later — see §7):
   Authentication → enable *Google* and *Email/Password* (Anonymous stays off, *Email link* off),
   customise the three account templates and point their action URL at `/auth/action` (SETUP.md §1a); Firestore in
   `asia-southeast1`, production mode; Storage, same region; upgrade to **Blaze** (Functions need it);
   redeem the $50 GCP coupon on that billing account; set a $20 budget alert.
2. **Config.** Project settings → Your apps → copy `firebaseConfig`. Create `.env.local` from the
   example (fill `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID`); copy `functions/.env.example`
   to `functions/.env`.
3. **Tooling.** `npm install`, `npm --prefix functions install`, `npm i -g firebase-tools`,
   `firebase login`, `firebase use mfu-passport`.
4. **Secrets.** `firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY` (any long random string; used
   once). `firebase functions:secrets:set EMAILJS_PRIVATE_KEY` (type `none` unless EmailJS is set up —
   the function declares the secret so it must exist).
5. **Deploy.** `npm run deploy` (builds client + functions, deploys hosting, functions, rules,
   indexes, storage rules). First functions deploy takes 3–6 min and may prompt to enable APIs.
6. **Seed.** `npm run seed` (needs `gcloud auth application-default login` or a service-account key
   in `GOOGLE_APPLICATION_CREDENTIALS`). Idempotent.
7. **First admin.** Open `https://mfu-passport.web.app/setup`, enter the bootstrap key. Works only
   while no admin exists.
8. **Test the loop end to end** and fix what breaks (see §6 for where bugs are most likely):
   `/join` on a phone → `/booth?boothId=booth-01` on a laptop as admin → scan → `/admin` shows the
   stamp within a second → lower a tier threshold in `/admin/prizes` → `/passport/prize` shows the
   rotating code → `/redeem` confirms it → stock decrements → `/admin/users` sends an invite →
   open the link on another device → lands on `/booth`.
9. **Demo prep.** Print a QR to `https://mfu-passport.web.app/join` for the "welcome sign". Have
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
functions/src/visitor.ts   join (contact + verification taken from the ID token), scan (incl. manual-code brute-force
                           match), redemptionCode, syncAccount (Auth email -> users/{uid}.contact), requestErasure
functions/src/organizer.ts boothSession (only path to a booth secret), lookupRedemption, confirmRedemption, voidRedemption
functions/src/admin.ts     users/roles, booths (+rotateBoothSecret), prize policy (+preview), adjustStock, runDraw,
                           invites (inviteOrganizer/resend/revoke/inviteInfo/acceptInvite), bootstrapAdmin, refreshRanks
functions/src/triggers.ts  onScanCreate (updates all counters + creates tierUnlocks), onUserWrite, rankBooths (1 min),
                           sweepActive (1 min), purgePersonalData (daily, no-op until 17 Dec 2026)
functions/src/mailer.ts    EmailJS server-side, booth invitations only; returns false when unconfigured so the
                           caller falls back to a copyable link. The three account mails come from
                           Firebase Auth's own templates instead (SETUP.md §1a)
functions/src/seed.ts      12 booths + secrets, 3 tiers with stock, refData lists. `--emulator`, `--admin <uid>`

src/lib/firebase.ts    SDK init from VITE_* env; auto-connects to emulators when no API key in dev
src/lib/auth.tsx       AuthProvider: no sign-in of its own — reports {user, emailVerified, role, boothId},
                       custom-claim refresh on focus + 15 min, repairs users/{uid}.contact after an email change
src/lib/authActions.ts Google popup (redirect fallback), sign-up/in, verification, reset, email + password change,
                       and the Firebase auth/* error-code -> plain-English table
src/lib/api.ts         typed wrappers for every callable
src/lib/data.ts        onSnapshot hooks; useEventStats() sums the 10 shards client-side
src/pages/visitor/     Landing, Join, PassportLayout, Cover, Stamps, Prize, Scan, ScanResult, ScanLanding (/s/:token), Invite
src/pages/auth/        SignIn, SignUp, ForgotPassword, VerifyEmail, Account (email/password/sign-out/erasure),
                       Action (/auth/action — verifyEmail, resetPassword, verifyAndChangeEmail, recoverEmail)
src/pages/organizer/   Booth (rotating QR), BoothStats, Redeem (prize desk)
src/pages/admin/       AdminLayout, Dashboard, Event (lifecycle + danger zone), Booths, Users (+invites),
                       Prizes (+stock, void), Draw, Audit, Wall, Setup
src/lib/eventText.ts   visitor-facing event copy derived from the live event document
scripts/e2e/           end-to-end run against the emulators (`npm run e2e`): lib.mjs + four ordered steps
docs/UAT.md            the manual acceptance checklist (screens, devices, mail) and the known-gaps register
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
- **Web app config** — in `.env.local` on the dev machine (gitignored, and deliberately *not*
  in the committed `.env.local.example`). Re-read it any time from the console: **Project
  settings → General → Your apps → Web app → SDK setup and configuration**.
- **EmailJS ids** — in `functions/.env` on the dev machine, likewise not committed. The private
  key is in Secret Manager.
- **$50 GCP coupon** — Stanley has it; must be redeemed on the Blaze billing account.
- **GitHub repo** `cnacha-mfu/mfupassport` (private) — supervisor owns it; branches `main`,
  `proto1.0`, `gh-pages` (public mock only — never push the app there).
- **EmailJS** — no account yet. Optional.
- Nothing else. No SMTP, no domain, no custom DNS.

## 6. Known gaps and likely first bugs

Deviations from `spec/spec.md`, all deliberate for v0.1:

- Invite acceptance promotes the account signed in on the device that opens the link. It is
  single-use and refuses any address but the invited one, so the organizer must sign in as that
  address (Google or a password) before pressing Accept.
- No Resize Images extension — badge uploads are used at their uploaded size (client caps 512 KB).
- Booth ranks recompute every 1 min (Cloud Scheduler floor), not 30 s.
- App Check not enforced. Turn on reCAPTCHA Enterprise App Check before the real event.
- The dashboard's "one-page PDF" is the browser's Save-as-PDF of `/admin/print`, not a generated
  file. Every panel has a CSV button; the ethnic-group one asks for confirmation first.
- `ethnicGroup` sits on `users/{uid}`, and Firestore rules cannot hide one field: an admin who
  reads a user document can technically see it. No admin screen renders it per person (the
  Users drawer says so); the dashboard only ever shows the folded aggregate. Spec §10's "rules
  deny ethnicGroup to every client except the owner" would need a sub-document — backlog.
- A hard (PDPA) delete decrements the visitor counters through `onUserWrite`; spec §10 says
  counters stay intact. Accepted: the totals then describe the people who are still registered.
- An email/password account cannot reach the passport until the address is confirmed; a Google
  account arrives confirmed and skips that step. Deliberate — but it means Firebase's mail
  deliverability is on the critical path on day one. Test it to an mfu.ac.th address before the
  event, and move Templates → SMTP settings to an MFU server if it lands in spam.
- Restore-by-email is gone. Signing in *is* the restore: the passport hangs off the account,
  not the device.
- Every account on the live project predates this and is anonymous, including the admin. They
  cannot sign in once Anonymous is off; `npm run rescue:admin` attaches an address and password
  to the account holding the admin claim, and SETUP.md §1b has the order to do it in. The four
  anonymous visitor passports are not recoverable — test data, but check before switching over.

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

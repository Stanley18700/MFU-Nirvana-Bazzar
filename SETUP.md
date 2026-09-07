# Setting up and deploying MFU Go Global Passport

This is the checklist from zero to a live demo at `https://mfu-passport.web.app`.
Steps marked **(you)** happen in a browser on your own account; everything else is a command
in the repo root on your Windows machine (PowerShell or Git Bash).

## 0. Prerequisites (once)

```bash
node -v            # 20 or 22
npm install -g firebase-tools
firebase login
npm install                       # root: Vite + React client
npm --prefix functions install    # Cloud Functions
```

## 1. Create the Firebase project **(you)**

1. https://console.firebase.google.com → **Add project**. Ours is **`mfu-passport`**, so the site is
   `https://mfu-passport.web.app`. (`.firebaserc` already points there.)
2. **Authentication → Get started** → enable **Anonymous** and **Email/Password** (turn on
   *Email link (passwordless sign-in)* inside it).
3. **Firestore Database → Create database** → location **asia-southeast1** → production mode.
4. **Storage → Get started** → same location → production mode.
5. ~~Register a web app~~ — done (4 Sep 2026): app "MFU Passport", config below.
6. **Upgrade to Blaze** (Cloud Functions require it). Then redeem the GCP coupon on that billing
   account (https://console.cloud.google.com/billing → *Credits*, or the link on the coupon) and set a
   **budget alert** at $20. Realistic cost for the event is a few dollars.

## 2. Point the repo at the project

```bash
firebase use --add            # pick the project, alias "default" — updates .firebaserc
```

Copy `.env.local.example` to `.env.local` — it is already filled in for project `mfu-passport`:

```ini
VITE_FIREBASE_API_KEY=AIzaSyDSSW4Dex46vD-RpFhGBs06qj4TmxYsgfA
VITE_FIREBASE_AUTH_DOMAIN=mfu-passport.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mfu-passport
VITE_FIREBASE_STORAGE_BUCKET=mfu-passport.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=451027884644
VITE_FIREBASE_APP_ID=1:451027884644:web:c7ac084bafe1a7572d1d71
VITE_APP_ORIGIN=https://mfu-passport.web.app
```

Functions read their parameters from `functions/.env` (copy `functions/.env.example`; also not committed):

```ini
APP_ORIGIN=https://mfu-passport.web.app
EMAILJS_SERVICE_ID=service_glzv23b        # EmailJS account: Stanley's (Nyan Sint Zaw)
EMAILJS_TEMPLATE_INVITE=template_yuoog5d  # "Booth invitation" template
EMAILJS_TEMPLATE_RESTORE=                 # not created yet; restore-by-email stays disabled until it is
EMAILJS_PUBLIC_KEY=2mRZJpDrdwx4TIsjo
```

Secrets go in Secret Manager, not in files:

```bash
firebase functions:secrets:set ADMIN_BOOTSTRAP_KEY     # invent a long random string; you use it once
firebase functions:secrets:set EMAILJS_PRIVATE_KEY     # only if you set up EmailJS; otherwise enter any placeholder
```

## 3. Deploy

```bash
npm run build                          # client → dist/
npm --prefix functions run build       # functions → functions/lib
firebase deploy                        # hosting + functions + rules + indexes + storage rules
```

First deploy of functions takes 3–6 minutes and may ask you to enable APIs — answer yes.
If it complains about **App Check**, that is fine for the prototype; it is not enforced yet.

## 4. Seed the event (12 booths, prize tiers, reference lists)

```bash
gcloud auth application-default login     # once; or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
npm run seed
```

(`gcloud` comes with the Google Cloud SDK. Alternative without it: in the Firebase console →
Project settings → Service accounts → *Generate new private key*, save it outside the repo, then
`set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json` before `npm run seed`.)

## 5. Make yourself admin

Open `https://mfu-passport.web.app/setup` on your laptop, enter your name and the
`ADMIN_BOOTSTRAP_KEY`. This works only while no admin exists. Add further admins from
**Admin → Users & invites** (invite with role *Admin*).

## 6. The demo, end to end

| Device | URL | What happens |
|---|---|---|
| Laptop (you) | `/admin` | Live dashboard. Keep it on the projector. |
| Tablet / second laptop | `/booth?boothId=booth-01` (as admin) — or invite an organizer and open their link on that device | Booth screen with the rotating QR and manual code |
| Anyone's phone | `/join` (or scan the welcome-sign QR to `/join`) | Register in under a minute |
| Same phone | Scan the booth screen with the phone camera **or** tap *Scan* in the app | Stamp lands, points added, dashboard updates within a second |
| Prize desk phone/laptop | `/redeem` (admin, or an organizer of the booth flagged *prize desk* — booth-01 in the seed) | Scan the visitor's rotating code, hand over, stock decrements |

To reach a prize tier quickly in a demo, temporarily lower the *Explorer* threshold in
**Admin → Prizes & stock** (e.g. to 10), or set a booth's points high in **Admin → Booths**.

## 7. Local development (no Firebase project needed)

```bash
npm --prefix functions run build
npm run emulators        # Auth 9099, Firestore 8080, Functions 5001, UI 4000
npm run seed:emulator    # in a second terminal
npm run dev              # http://localhost:5173 — auto-connects to the emulators when .env.local has no API key
```

If the Functions emulator reports *"Cannot determine backend specification. Timeout after
10000"*, that is the discovery step timing out because the machine's Node is newer than the
`nodejs20` runtime the functions declare. It is not a code problem — raise the budget:

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase emulators:start
```

### The automated end-to-end check

```bash
npm run e2e     # resets the emulator, reseeds, then runs scripts/e2e.mjs
```

It drives the whole loop through the client SDK, so it goes through the real security rules
and Firestore triggers: bootstrap an admin, register a visitor, stamp nine booths, confirm a
duplicate scan is refused, redeem a prize and watch stock drop, archive the event, purge it,
create the next event, go live, and confirm a reused `booth-01` can be stamped again and
passport numbering restarts with the new prefix. 32 checks; all should pass.

Note `scan` is rate-limited to 10 calls per minute per visitor, which is why the script
stamps nine booths and keeps one call in reserve for the duplicate-scan check.

Set `VITE_USE_EMULATOR=true` in `.env.local` to force the emulators even with a real config present.
Emulator Auth has no real email sending; use `/setup` with the bootstrap key set in
`functions/.secret.local` (`ADMIN_BOOTSTRAP_KEY=dev`).

## 8. Running the app again for the next event

The event is a document, not a constant, so nothing here needs a redeploy. From
**Admin → Event**:

1. **Archive & start a new event** (danger zone). Type the event name to confirm, and choose
   what carries over: the booths (counters reset, every QR secret replaced), the prize policy
   (stock restored to the loaded-in figure), and whether visitor accounts are reset or deleted
   outright for PDPA. The event's totals are frozen to `archives/{eventId}` **before** anything
   is cleared, so the numbers survive.
2. **Create** the next event — name, dates, days, QR rotation period, passport prefix and the
   default points per zone.
3. Add its booths and prize policy if you did not carry them over.
4. **Go live.** This demotes the previous event and refuses if there is no active booth or no
   prize policy.

The clearing runs as a series of small paged calls with a progress list, because a full
three-day event is far more `scans` documents than a 30-second callable can delete in one go.

> Practise this on a throwaway event before using it on real data — it cannot be undone.

## 9. Moving to the university's account later

Nothing in the code is tied to your account. Create the new project under the university's Google
account, repeat steps 1–5 there, and switch with `firebase use <new-project-id>` plus a new
`.env.local`. Data does not move automatically; re-run the seed, and export/import Firestore with
`gcloud firestore export` if real registrations must carry over.

## Where things are

```
src/                 Vite + React client (visitor, organizer, admin)
shared/              token.ts (booth QR HMAC) and model.ts — shared with functions verbatim
functions/src/       Cloud Functions v2: visitor.ts, organizer.ts, admin.ts, triggers.ts, mailer.ts, seed.ts
firestore.rules      §7.4 — clients never write the collections that matter
firestore.indexes.json, storage.rules, firebase.json
spec/                Your supervisor's spec and concept deck (unchanged)
demo/                The original clickable mock (unchanged; still served on GitHub Pages)
```

## Changes since v0.1 (September 2026)

Three things the last meeting asked for, plus the defects the first test pass turned up.

**The app is reusable.** The event is a document, not a compile-time constant — see §8 above
and the amendment at `spec/spec.md` §7.1. `EVENT_ID`, `EVENT_DAYS` and `ZONE_POINTS` survive
only as seed defaults. New callables: `createEvent`, `updateEvent`, `goLive`, `archiveEvent`,
`purgeEventData`, `listEvents`. New admin page at `/admin/event`.

**Visitors see prizes remaining, live.** The exact count is on every active tier, always, on
both the Prize page and the passport cover. This deliberately supersedes the 20% rule in
`spec/spec.md` §4.4 (amended there). No backend change was needed.

**Every screen except admin works on a phone.** An `xs` (380px) breakpoint was added, and the
booth kiosk screen, the stamp grid, the scanner, the prize page and the prize desk were fixed
to hold together at 320px — acceptance criterion 11, which was not met before.

Defects found and fixed:

| What | Why it mattered |
|---|---|
| `draws` had no security rule | The stage-draw history at `/admin/draw` silently returned nothing |
| No `/r/:token` route | A prize-desk phone scanning the visitor's QR with its **native camera** landed on `/` |
| `EVENT_END` was the literal `2026-09-18` | After that date every organizer invitation was issued **already expired** |
| The retention purge used a literal `2026-12-17` | It would have purged a *future* event's live visitors |
| Booth `activeDays` were filtered against the `EVENT_DAYS` literal | A new event's booths silently got `activeDays: []` |
| Counter shards could be resurrected at **negative** values by a purge | Deleting a visitor fires `onUserWrite`, whose decrement lands after the shards are cleared; the purge now clears them last and again after a settle |
| A stale cached event could reject valid QR codes | The counter derives from the event's QR period, so a warm instance holding the old period rejected good codes right after a new event went live. `scan` now re-reads once on the failure path; writes that bake the event into a durable record (passport prefix, booth `eventId`, invite expiry) always read fresh |
| `npm run emulators` pointed at a non-existent `.emulator-data` | The documented local-dev command failed on a clean checkout |
| `npm run seed:emulator` did not exist at the repo root | SETUP.md §7 referenced a script that was only in `functions/` |

## Known gaps versus spec/spec.md (prototype v0.1)

- Organizer invites sign in the *device that opens the link* (anonymous account upgraded and
  bound to the invited email), rather than a full Firebase email-link sign-in. Single-use and
  email-bound, as the spec requires; upgrade path is one function.
- Resize Images extension is not installed: badges are used at upload size (kept under 512 KB).
- Ranks recompute every minute (Cloud Scheduler floor), not every 30 s.
- App Check is not enforced yet. Enable reCAPTCHA Enterprise App Check before the real event.
- No PDF export of the dashboard yet (CSV per panel works).
- The admin screens are laid out for a laptop and are not part of the mobile work.
- Going live with a *different* QR rotation period has a sub-30-second window in which warm
  function instances hold the old period. `scan` recovers on its own (one extra read on the
  failure path), but switch events before doors open rather than mid-session.

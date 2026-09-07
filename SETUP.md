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
2. **Authentication → Get started** → under *Sign-in method* enable exactly two providers:
   - **Google** — pick a support email; nothing else to fill in.
   - **Email/Password** — the top toggle only. Leave *Email link (passwordless sign-in)* **off**.

   Leave **Anonymous** disabled. It used to be how a passport existed before the form was
   filled in; the app now requires a real account, and `join` refuses a caller with no
   confirmed email address.

   Then, still under Authentication:
   - **Settings → Authorised domains** — `mfu-passport.web.app`, `mfu-passport.firebaseapp.com`
     and `localhost` are there by default. Add any other domain the app is served from, or
     Google sign-in and every emailed link will be rejected.
   - **Templates** — see §1a.
3. **Firestore Database → Create database** → location **asia-southeast1** → production mode.
4. **Storage → Get started** → same location → production mode.
5. ~~Register a web app~~ — done (4 Sep 2026): app "MFU Passport", config below.
6. **Upgrade to Blaze** (Cloud Functions require it). Then redeem the GCP coupon on that billing
   account (https://console.cloud.google.com/billing → *Credits*, or the link on the coupon) and set a
   **budget alert** at $20. Realistic cost for the event is a few dollars.

## 1a. The three account emails **(you)**

Firebase Auth sends these itself — they do **not** go through EmailJS or Cloud Functions.
**Authentication → Templates** has one editable template each:

| Template | Sent when | Triggered from |
| --- | --- | --- |
| **Email address verification** | someone signs up with an email and password, or asks for the link again | `sendVerification` in `src/lib/authActions.ts` |
| **Password reset** | "Forgot your password?" on `/signin` | `sendReset` |
| **Email address change** | a new address is entered on `/account`; the account only moves once the link in it is tapped | `changeEmail` (`verifyBeforeUpdateEmail`) |

Changing an address also arms Firebase's fourth, non-optional mail — a notice to the **old**
address with an undo link. That link lands on `/auth/action?mode=recoverEmail`, which the app
handles; there is nothing to switch on.

For each of the three, click the pencil and:

1. Set the **sender name** to something recognisable (e.g. *MFU Go Global Passport*).
2. Edit the subject and body — the defaults say "Firebase" and mention the project id.
3. Click **Customise action URL** and set it to `https://mfu-passport.web.app/auth/action`.

Step 3 is what keeps people inside the passport: `src/pages/auth/Action.tsx` handles
`verifyEmail`, `resetPassword`, `verifyAndChangeEmail` and `recoverEmail` at that path. Skip it
and the links still work, but on Google's own `firebaseapp.com/__/auth/action` page.

Firebase's free tier sends these from `noreply@mfu-passport.firebaseapp.com`, which some
university mail filters treat harshly. If delivery is poor, point *Templates → SMTP settings*
at an MFU SMTP account and the sender becomes an mfu.ac.th address.

## 1b. Migrating a project that already ran on anonymous accounts

Skip this on a fresh project. It mattered on `mfu-passport`, where `/setup` promoted the
anonymous account of whichever browser used the one-shot bootstrap key.

> **Already done on `mfu-passport`** (7 Sep 2026). The admin, `kq0X8iI6ySU3JfQDrBuNyaGjIVR2`,
> now carries `6731503077@lamduan.mfu.ac.th` with a password and a verified address, keeping its
> uid and claim. Two anonymous visitor passports remain and cannot be recovered; two further
> anonymous accounts never registered. Read on only when standing this up somewhere new.

Turning Anonymous off does not delete those accounts; it stops anyone signing back into one.
They have no email and no password, so:

- **Existing visitor passports cannot be recovered.** The stamps stay in Firestore, but nobody
  can prove they own the uid. On a pre-event project that is test data; if it is not, export
  `users` and `scans` before you start.
- **The admin would be locked out**, and `bootstrapAdmin` will not help — it refuses once an
  admin exists.

So give the admin a real credential first. This runs through the Admin SDK, so it needs
application-default credentials (§7), not `firebase login`, and works no matter which client
build is currently deployed:

```bash
npm run rescue:admin -- --list          # who holds the admin claim, and how they sign in
npm run rescue:admin -- --email you@mfu.ac.th --password '<at least 10 characters>'
```

It attaches the address and password to the account that already holds the claim and marks it
verified — the uid, the custom claim and `users/{uid}` are untouched, so the admin simply gains
a way in. Add `--uid` when more than one admin exists. Other sessions on that account are
signed out, because they still carry the pre-change token.

Order of operations:

1. `firebase deploy` (functions and hosting).
2. `npm run rescue:admin -- --email … --password …`
3. Sign in at `/signin` and check the admin panel opens.
4. Only then switch **Anonymous** off in the console.

## 2. Point the repo at the project

```bash
firebase use --add            # pick the project, alias "default" — updates .firebaserc
```

Copy `.env.local.example` to `.env.local` (gitignored) and paste the values from the console —
**Project settings → General → Your apps → Web app → SDK setup and configuration**:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project-id>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<project number>
VITE_FIREBASE_APP_ID=1:...:web:...
VITE_APP_ORIGIN=https://<project-id>.web.app
```

> Real values belong only in `.env.local`, never in `.env.local.example` or in this file — both
> are committed. `VITE_APP_ORIGIN` must match the Hosting domain exactly, because booth QR
> payloads embed it.

Functions read their parameters from `functions/.env` (copy `functions/.env.example`; also not committed):

```ini
APP_ORIGIN=https://<project-id>.web.app
# From the EmailJS dashboard, for the booth invitation — the only mail EmailJS still sends.
# Optional: leave blank and invites fall back to a copyable link. Keep the real ids in
# functions/.env only, never in the committed example.
EMAILJS_SERVICE_ID=
EMAILJS_TEMPLATE_INVITE=
EMAILJS_PUBLIC_KEY=
```

> The EmailJS **public key** is not as harmless as the name suggests: with the service and
> template ids it can send mail from the account if browser requests are enabled, which is
> exactly why `spec/spec.md` §6.4 chose the server-side path. Keep all four out of git.

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

### The first deploy will probably half-fail — this is normal

On the very first deploy the two Firestore-triggered functions fail while everything else
succeeds:

```
Validation failed for trigger …/onuserwrite-…: Invalid resource state for "":
Permission denied while using the Eventarc Service Agent.
```

Eventarc's service agent is created on demand and its IAM binding takes a couple of minutes to
propagate. It is not a code fault. **Wait ~2 minutes and redeploy** — the second attempt
succeeds:

```bash
firebase deploy --only functions:onScanCreate,functions:onUserWrite,hosting --force
```

Include `hosting` in that retry: a functions failure aborts the deploy **before the hosting
release**, so the site serves Firebase's "Site Not Found" 404 until you deploy hosting again,
even though the file upload reported success.

### "Cannot determine backend specification. Timeout after 10000"

Seen on 7 Sep 2026 deploying from a Windows machine running Node 24. Before uploading anything,
the CLI starts the functions bundle locally on a spare port to ask it which functions exist, and
gives that handshake 10 seconds. The bundle itself loads in well under a second (check with
`node -e "require('./functions/lib/index.js')"`), so this is the CLI being slow to reach it, not
a fault in the code — the same thing the emulator section below describes. Give it a bigger
budget; the value is in **seconds**:

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=120 npm run deploy
```

As with the Eventarc case, the failure happens before the hosting release, so nothing has
changed on the live site when you see it; rerunning the whole deploy is safe.

## 4. Seed the event (12 booths, prize tiers, reference lists)

```bash
gcloud auth application-default login     # once; or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
npm run seed
```

The seed writes through the Admin SDK, so it uses **application-default credentials, not your
`firebase login`**. Those are two separate identities: if ADC belongs to a different Google
account you get `7 PERMISSION_DENIED — Missing or insufficient permissions`, even though
`firebase deploy` works perfectly. Check with `gcloud auth list` before blaming the code, and
re-authenticate for the right account:

```bash
gcloud auth application-default login --account=<you>@mfu.ac.th
```

Note this overwrites the machine's ADC for every tool that uses it, so if the existing
credentials matter, copy `%APPDATA%\gcloud\application_default_credentials.json` aside first
and put it back afterwards.

> **The seed puts 190 points on the floor, not the 170 the spec claims.** Its zone split is
> 3 entrance / 4 middle / 5 far (3x10 + 4x15 + 5x20 = 190); `spec/spec.md` §6.6 describes
> 170, which implies 5 / 4 / 3. Nothing breaks — every tier is still reachable, with 40 points
> of slack above the top threshold instead of 20 — but more of the hall's value sits in the far
> corner than the spec's design intended. This is spec §13's open "sanity-check zone/point
> values against the real floor plan", and it needs the planners to settle it: either re-zone
> the booths in **Admin → Booths** or correct the spec and README. Points are now event data,
> so either fix is a few clicks, not a redeploy.

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
`nodejs20` runtime the functions declare. It is not a code problem — raise the budget (seconds;
the same variable fixes the identical error from `firebase deploy`, see §3):

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
passport numbering restarts with the new prefix. 37 checks; all should pass.

Note `scan` is rate-limited to 10 calls per minute per visitor, which is why the script
stamps nine booths and keeps one call in reserve for the duplicate-scan check.

Set `VITE_USE_EMULATOR=true` in `.env.local` to force the emulators even with a real config present.

The Auth emulator sends no mail and has no Google provider, so locally:

- Sign up on `/signup` with any email and password. Nothing arrives in an inbox — the
  verification link is printed in the **emulator's Auth log** and listed in the emulator UI at
  http://127.0.0.1:4000/auth. Open it and the tab waiting on `/verify-email` moves on by itself.
  The same holds for password-reset and email-change links.
- "Continue with Google" opens the emulator's own account-picker page instead of Google's.
- `npm run e2e` skips the inbox entirely: `signUpVerified()` flips `emailVerified` through the
  emulator's owner API, which is the stand-in for clicking the link.
- Make the first admin at `/setup` with the bootstrap key from `functions/.secret.local`
  (`ADMIN_BOOTSTRAP_KEY=dev`) — sign in first, since it promotes the signed-in account.

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

- Organizer invites are accepted by *an account signed in as the invited address* — the person
  signs in with Google or an email and password first, then presses Accept. Single-use and
  email-bound, as the spec requires; upgrade path is one function.
- Resize Images extension is not installed: badges are used at upload size (kept under 512 KB).
- Ranks recompute every minute (Cloud Scheduler floor), not every 30 s.
- App Check is not enforced yet. Enable reCAPTCHA Enterprise App Check before the real event.
- No PDF export of the dashboard yet (CSV per panel works).
- The admin screens are laid out for a laptop and are not part of the mobile work.
- Going live with a *different* QR rotation period has a sub-30-second window in which warm
  function instances hold the old period. `scan` recovers on its own (one extra read on the
  failure path), but switch events before doors open rather than mid-session.

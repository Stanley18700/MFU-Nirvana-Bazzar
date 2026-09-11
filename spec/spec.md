# MFU InterFest Passport — Product & Technical Specification

**Version:** 1.0 (draft)
**Date:** 2 September 2026
**Owner:** School of Applied Digital Technology (ADT), Mae Fah Luang University
**Companion document:** `spec/concept.html` (proposal deck, 5 slides)

---

## 1. Overview

A mobile-first web app for *MFU International Festival 2026*. Visitors carry a
digital passport on their own phone, collect a stamp (badge) at each booth by scanning
a QR code displayed at that booth, and redeem a prize once they reach a threshold.

**Event:** 16–18 September 2026, 09:00–16:00 daily (three days, 21 hours of floor time).

Three roles use the system:

| Role | Primary surface | Purpose |
|---|---|---|
| **Visitor** | Phone browser | Scan QR at booths, collect stamps, redeem prize |
| **Organizer** (booth staff) | Booth screen / tablet | Display rotating QR, watch own booth's live count |
| **Admin** | Laptop dashboard | Live event statistics, user & booth CRUD, prize policy |

### 1.1 The three-day event

One passport spans all three days. Consequences, decided here so they are not
re-litigated during the build:

- A visitor registers once. Returning on day 2 restores the same passport from the
  device's stored credential, with the stamps from day 1 already in it.
- One stamp per booth **for the whole event**, not per day. Re-scanning a booth on a
  later day shows "already stamped here".
- A booth may not be present all three days. Each booth carries `activeDays`, and the top
  prize threshold sits below the total points available, so nobody is locked out of the top
  tier by a booth that was not there on the day they came.
- The stamp grid shows every booth for the whole event, not just today's, so a visitor
  can see what is still missing and come back for it. Booths not present today are
  labelled with the day they appear.
- Statistics are bucketed per day as well as in total; the dashboard has a day selector
  (Day 1 / Day 2 / Day 3 / All).

### 1.2 Non-goals for v1

- No native mobile app. Browser only.
- No payments, no ticketing, no seat booking.
- No social feed, chat, or photo upload.
- No offline-first sync beyond what the Firestore SDK cache gives us. A short network
  blip is tolerated; a full outage falls back to the 100 paper passports and rubber
  stamps described in the concept deck.

### 1.3 Design principles

1. **Simple.** A visitor should finish registration in under a minute and never need
   instructions. Booth staff operate nothing — the booth screen runs itself.
2. **Passport-like.** The interface borrows the visual language of a real passport:
   a cover, inner pages, ink stamps, a data page, entry marks.
3. **Colorful and chic.** Deep passport navy as the ground, with a bright per-booth
   accent palette. Restrained typography, generous whitespace, one accent per screen.
4. **English interface.** Every user-facing string in the app is English. This is an
   international festival at a university where English is the medium of instruction,
   and the visitors the activity is designed to bring together do not share Thai as a
   common language — so one English interface serves everyone rather than privileging
   one group. (The concept deck at `spec/concept.html` remains bilingual: it addresses
   university committees, which is a different audience.)

   Two consequences worth stating, since English-only is a real trade-off:
   - Booth and school names may be *supplied* in Thai. Those are proper nouns, and the
     data model keeps both `nameTh` and `nameEn`. The UI renders the English name; the
     Thai name is stored so a language toggle can be added later without a migration.
   - Printed material at the welcome sign — the one place a visitor is standing still
     with a person beside them — should carry a short Thai line beside the English, so
     nobody is turned away at registration by the language alone. That is a poster
     decision, not an app one, but it belongs in the plan.

---

## 2. Visual design language

### 2.1 Concept

The app *is* a passport. Navigation between the visitor screens is a page turn.

- **Cover** — deep navy, gold foil crest, the visitor's name embossed. This is the
  landing/home screen.
- **Data page** — the visitor's details, photo-free, with a machine-readable strip at
  the bottom that doubles as their redemption code.
- **Stamp pages** — a grid of stamp slots, one per booth. Empty slots are faint
  outlines; collected slots hold a colored, slightly rotated ink stamp — the booth's own
  **badge artwork**, uploaded by the admin, or a generated fallback stamp if none was
  uploaded (see 2.5).
- **Visa page** — the prize/redemption screen, styled as an entry visa with a seal.

### 2.2 Palette

Carried forward from `concept.html` and extended with booth accents.

```css
--navy:        #17263F;  /* RETIRED 2026-09 — see design-system/tokens/theme-app.css; chrome is now green-900 #1E3F2A, ink #17414E */
--navy-soft:   #4A5872;  /* secondary text */
--paper:       #E9E5DC;  /* page ground */
--paper-2:     #DFDACE;  /* card ground */
--stamp-blue:  #1B52A8;  /* primary accent, links, active state */
--seal:        #0F2E6E;  /* seals, emphasis */
--gold:        #C8A24A;  /* foil, prize state */
--rule:        rgba(23,38,63,.16);
```

Booth accent ring (assigned round-robin at booth creation and stored on the booth
record, so a booth's color is stable all event):

```
#E0533D  vermilion    #1B52A8  stamp blue   #1E8A6E  jade
#C8A24A  gold         #7B4EA8  amethyst     #D4762A  amber
#2A7FB8  cerulean     #B23A63  magenta      #4E8B32  olive
```

Rule: one accent dominates any given screen. The booth accent colors the stamp ink and
that booth's row in the dashboard; it never colors chrome.

### 2.3 Typography

- **IBM Plex Sans Thai**, weights 300 / 400 / 500 / 600 / 700. The interface is English,
  but this face is still the right choice: it matches the deck, its Latin is the same
  design as IBM Plex Sans, and it carries Thai glyphs — so a booth or school name
  supplied in Thai renders in the same typeface instead of falling back to a mismatched
  system font.
- Numerals in statistics and the stamp counter: tabular figures, weight 700,
  letter-spacing `-.03em`.
- Stamp text: uppercase, letter-spaced, small.

### 2.4 Motion

- Page turn between passport pages: 320 ms ease-out, horizontal slide plus slight scale.
- Stamp landing after a successful scan: 420 ms — the stamp drops in from 1.6x scale
  with a 6–10 degree random rotation and settles, one short haptic pulse
  (`navigator.vibrate(18)`).
- Prize unlock: gold seal draws itself in, then a brief confetti burst.
- All motion respects `prefers-reduced-motion: reduce` — animations become instant
  opacity changes.

### 2.5 Booth and badge artwork

Each booth carries two optional images, both uploaded by the admin (section 6.3):

| Image | Where it appears | Spec |
|---|---|---|
| **Badge** | The stamp in the visitor's grid, the booth card, the leaderboard row | Square, transparent PNG or SVG preferred, 512×512 minimum, under 512 KB |
| **Booth photo** | The booth detail card a visitor opens from the grid, and the booth's own screen header | Landscape 16:9, JPEG or PNG, 1600×900 recommended, under 2 MB |

Handling:

- Uploads go to Cloud Storage under `booths/{boothId}/badge.*` and
  `booths/{boothId}/photo.*`. The Resize Images extension generates a 256 px badge
  thumbnail and an 800 px photo variant; the app loads the variants, never the originals.
- **Fallback is not an error state.** A booth with no badge gets a generated stamp: a
  circular ink ring in the booth's accent color with its short name set in
  letter-spaced uppercase, plus the event mark. This is the default, and it looks
  deliberate — the deck's `ADMITTED` stamp is exactly this. Uploading a badge is an
  enhancement, so no booth blocks the event by not sending artwork.
- Badges are composited into the stamp animation with the same drop, tilt and settle as
  the generated stamp, and desaturated to a faint outline in an uncollected slot, so an
  empty grid still reads as a passport waiting to be filled rather than a gallery.
- Uploaded artwork is validated server-side for MIME type and dimensions; anything else
  is rejected with a clear message rather than silently resized.

### 2.6 Accessibility

- WCAG 2.1 AA contrast for all text.
- Every stamp slot has a text label; color is never the only signal (a collected slot
  also carries a check mark and a date).
- Full keyboard operation on the admin dashboard.
- Booth screen legible at 3 m: minimum 24 px body text, QR minimum 320 px square.

---

## 3. Roles and permissions

```
admin      -> everything below, plus user CRUD, role changes, prize policy, booth CRUD
organizer  -> own booth's QR screen, own booth's live count, event total
visitor    -> own passport, scan, redeem
```

- A user has exactly one role.
- An organizer is linked to exactly one booth (`users.booth_id`). Reassigning is an
  admin action.
- The first admin is seeded by a one-off admin script at deploy time.
- Role lives in two places: a **Firebase Auth custom claim** (`role`, and `boothId` for
  organizers), which is what Firestore security rules and Cloud Functions enforce, and a
  mirrored field on the user document, which is what the admin UI lists and filters.
  The claim is the authority; the document field is for display.
- Changing a role writes the claim and the document in one callable function. Firebase
  ID tokens last an hour, so the client calls `getIdToken(true)` on app focus and every
  15 minutes, making a role change take effect within 15 minutes without the user
  signing in again.

---

## 4. Visitor experience

### 4.1 Registration

Entry point: the welcome sign at the hall entrance carries a static QR to `/join`.
No app install, no password.

**Form (single screen):**

| # | Field | Type | Required | Notes |
|---|---|---|---|---|
| 1 | Display name | text | yes | Shown on the passport cover |
| 2 | Visitor type | radio | yes | Student / Staff / Alumni / External guest |
| 3 | Student / staff ID | text | no | Free text; blank for external guests |
| 4 | **University / institution** | combobox | yes | Searchable list, MFU first, then Thai and regional universities, plus free-text `Other` for anything not listed |
| 5 | **School / faculty** | combobox | conditional | Shown only when the institution is MFU, populated with MFU's schools; free text for other institutions |
| 6 | **Country of origin** | combobox | yes | Full ISO 3166 list with flags, the common ones (Thailand, Myanmar, China, Laos, Cambodia, Vietnam, Nepal, India, Bhutan) pinned to the top |
| 7 | **Ethnic group / tribe** | combobox | **no — optional** | Self-identified. Suggestions filtered by the selected country; free text always allowed; an explicit "Prefer not to say" |
| 8 | Phone or email | text | yes | Used only to restore a passport; one contact = one passport |
| 9 | Consent | checkbox | yes | PDPA consent, links to the notice |
| 10 | Ethnicity consent | checkbox | conditional | A separate tick, shown only if field 7 is filled (see below) |

**Affiliation is two fields, not one.** "MFU / School of Applied Digital Technology" and
"Chiang Rai Rajabhat University" both need to be expressible, so institution and
school/faculty are stored separately. The cross-school panel on the dashboard groups by
school when the institution is MFU and by institution otherwise — which is what makes
the "did visitors leave their own school's booth" question answerable.

**Visitor type is no longer nationality.** Thai vs. international is now *derived* from
country of origin rather than asked as a radio button, which removes an awkward
self-classification and gives a far better breakdown for the report: not just
"international", but Myanmar, China, Nepal, and so on. The old four-way split still
appears on the dashboard, computed as `country == TH ? 'thai' : 'international'` crossed
with student/staff/guest.

**Ethnic group / tribe — handled as sensitive data.** Under Thailand's PDPA, ethnic and
racial data is *sensitive* personal data (Section 26) and needs explicit separate
consent, not the blanket registration consent. So:

- The field is **always optional**, with "prefer not to say" given equal visual weight
  to the other choices — never buried at the bottom of a list.
- Ticking a **separate consent line** ("I consent to my ethnic group being collected for aggregate event statistics") is
  required before the value is stored. Leave it unticked and the field is discarded
  client-side, not stored and ignored.
- A one-line explanation sits directly above the field, saying why it is asked: MFU
  serves a genuinely multi-ethnic student body from across the Mekong region, and the
  Office of International Affairs wants to show that the festival reached it — not just
  which passports were held.
- It is **never displayed** on a visitor's own passport, on booth screens, or in any
  per-person view in the admin panel. It exists only in aggregate.
- Admin exports containing it require a separate confirmation, and small-count
  suppression applies: any ethnic group with fewer than **5** visitors is folded into
  "Other" in every chart and export, so a single person from a small group cannot be
  identified from the statistics.
- It is purged with the other personal fields 90 days after the event.

**Suggestion lists** are seeded per country, self-identified and non-exhaustive, with
free text always available:

- **Myanmar** — Bamar, Shan, Karen (Kayin), Rakhine, Mon, Chin, Kachin, Kayah, Pa-O,
  Wa, Danu, Palaung (Ta'ang), Rohingya, Chinese-Myanmar, Indian-Myanmar
- **Thailand** — Central Thai, Northern Thai (Lanna), Isan, Southern Thai, Akha, Lahu,
  Lisu, Hmong, Karen, Mien (Yao), Tai Lue, Tai Yai (Shan), Thai-Chinese, Thai Malay
- **China** — Han, Zhuang, Hui, Dai, Yi, Miao, Tibetan, Uyghur
- **Laos** — Lao Loum, Lao Theung, Lao Soung, Hmong, Khmu
- **Nepal / India / Bhutan / Cambodia / Vietnam** — comparable lists, and free text

Lists are stored in Firestore (`refData/ethnicGroups`), not hard-coded, so the Office of
International Affairs can correct or extend them without a deploy. Ordering within a
country list is alphabetical in the local language, deliberately not by population size.

**Time budget** still holds: fields 4–7 are comboboxes with type-ahead and sensible
defaults (country pre-filled from the browser locale, institution defaulting to MFU),
so the common case is four taps and a name.

On first load the app signs the visitor in **anonymously with Firebase Auth**, so a
passport exists before any form is filled. Submitting the form writes the visitor
document and sets the `role: 'visitor'` custom claim. The anonymous credential persists
in IndexedDB, so the passport survives closing the browser and needs no password.

If the same contact registers again on a new device, the app does not create a
duplicate: it sends an **email link sign-in** to that contact and, on click, links the
new device to the existing account (`linkWithCredential`, or a sign-in that adopts the
existing visitor document).


### 4.2 The passport

Bottom tab bar with three pages, plus a persistent floating **Scan** button:

1. **Cover / Home** — name, passport number (`MFU-GG-0000`), **points total**, a progress
   arc toward the next tier, a three-pip tier track, and the next reward in plain language
   ("10 more points to Voyager").
2. **Stamps** — a grid of every booth in the event. Collected slots show the colored stamp,
   the collection time and the points earned. **Uncollected slots show what the booth is
   worth**, and are sorted by value so the 20-point booths lead — this is what turns the
   points into a route. Tapping a slot opens a card with the booth's full name, host unit,
   location, zone and description.
3. **Prize** — current tier status, what is unlocked, and the redemption code when a
   tier is reached.

### 4.3 Scanning

- Tapping **Scan** opens the camera via `BarcodeDetector` where available, falling back
  to a WASM decoder (`zxing-wasm`) on browsers without it.
- If camera permission is denied, a **manual entry** field accepts the 6-character code
  printed beneath the QR on the booth screen.
- The QR encodes a URL: `https://mfupassport.web.app/s/<token>`. Scanning with the phone's native
  camera app therefore also works — the URL opens the app and posts the token
  automatically. This matters: many visitors will not open our scanner first.

**Result states:**

| State | Message (TH / EN) | Visual |
|---|---|---|
| Success | Stamp collected · **+N points** | Stamp animation, booth accent, haptic |
| Already collected | Already stamped here | Existing stamp pulses once, no error tone |
| Expired token | Code expired, scan again | Amber notice, retry button |
| Invalid token | Invalid code | Red notice |
| Rate limited | Too fast, try again shortly | Amber notice |
| Not registered | Register first | Redirect to `/join`, token preserved |

### 4.4 Redemption

When a visitor's stamp count reaches a tier threshold, the Prize page shows:

- The tier name and the reward.
- A **redemption code**: a rotating 8-character alphanumeric code plus a QR, refreshed
  every 30 seconds — so a screenshot cannot be forwarded to a friend.
- Tier state: `unlocked` -> `redeemed` (after prize-desk confirmation).
- Live **remaining stock** for the tier ("43 left").

  > **Amended, September 2026 (event planners' request).** The count is now shown on
  > **every active tier, at all times**, on both the Prize page and the passport cover —
  > not only once stock falls below 20%. The original rule avoided a number ticking down
  > all morning; the planners asked for the remaining figure to be visible to visitors
  > live, and that request wins. Low stock is still coloured amber under 20% and the
  > out-of-stock note still replaces the figure at zero. No backend change was needed:
  > `prizeTiers/{tierId}.stockRemaining` was already world-readable to any signed-in
  > client and already streaming through `useTiers()`.

Prize-desk staff (an organizer whose booth carries the `is_prize_desk` flag, or an
admin) opens `/redeem`, scans the visitor's code, sees the visitor's name, tier, and
stamp count, and taps **Hand over prize**. The server marks the tier
redeemed, decrements stock, and records who confirmed it. A tier can be redeemed exactly
once; a second attempt shows when and by whom it was already redeemed.

The prize desk screen also shows a live **stock strip** across the top — one figure per
tier, remaining out of total — so the staff on the desk know what is left without
counting boxes, and can tell the queue before people reach the front.

---

## 5. Organizer (booth) experience

### 5.1 Booth QR screen — `/booth`

Full-screen, designed for a tablet or laptop propped on the booth table. It auto-enters
fullscreen, requests a wake lock, and needs no interaction all day.

Layout:

- Booth name, large.
- The rotating **QR code**, minimum 320 px, centered, on the booth's accent ring.
- Beneath it, the same token as a 6-character **manual code**, spaced for reading aloud.
- A thin countdown ring around the QR showing time until the next rotation.
- Bottom bar: "Visitors here: 148" and "Event total: 1,204",
  both live.
- Top-right: a small connection dot — green when the Firestore listener is attached,
  amber when the SDK reports cached/stale data, red when offline, with a "codes still
  valid" reassurance line, since tokens are computed locally from the booth secret.

### 5.2 QR rotation

The QR **must** change over time so a photographed code cannot be shared with people who
never visited the booth. This is the core anti-abuse requirement.

**Scheme:** time-based HMAC, TOTP-shaped.

```
period      = 20 seconds
counter     = floor(unix_seconds / period)
digest      = HMAC-SHA256(booth.secret, booth.id + ":" + counter)
token       = base32(digest)[0..5]        # 6 chars, also shown as the manual code
qr_payload  = https://mfupassport.web.app/s/<booth.id>.<counter>.<token>
```

- The booth screen computes tokens **client-side** from a booth secret handed out once
  by the `boothSession` callable function at screen start, so rotation continues through
  a network drop.
- The `scan` callable function accepts the current counter and the previous one — a
  **grace window of one period** (a real token is valid 20–40 s), covering the seconds
  between a visitor pointing the camera and the request landing.
- `secret` is 32 random bytes, generated at booth creation, stored in a
  `boothSecrets/{boothId}` collection that **security rules deny to every client**, and
  reachable only through Cloud Functions (Admin SDK) — so it can never be read from a
  visitor's device even by an authenticated visitor. It is rotatable from the admin
  panel.
- The period is configurable per event (10–60 s). 20 s is the default: short enough that
  a forwarded screenshot is dead on arrival, long enough for a slow phone camera.

**Additional guards:**

- Per-visitor limit: one successful stamp per booth, enforced structurally — the scan
  document ID is `{visitorId}_{boothId}`, written inside a transaction that fails if the
  document already exists — and at most 10 scan attempts per minute across all booths.
- Per-booth anomaly flag: if a booth's stamp rate exceeds 5x its rolling median, the
  admin dashboard raises a warning. It does not block — a genuinely busy booth is the
  success case, so this informs rather than enforces.
- Scan records store a coarse client fingerprint (user-agent hash plus IP `/24`) for
  after-the-fact review only, never for blocking.

### 5.3 Booth statistics

The organizer sees, for their own booth only:

- Live visitor count, updating without refresh.
- Visitors per hour, as a small bar chart across event hours.
- Split by visitor type (Thai / International / Staff / Guest).
- What this badge is worth in points, shown on the booth screen — visitors ask, and staff
  should not have to guess.
- Their booth's rank among all booths — shown as "Rank 4 of 12" — plus the event
  total, so a quiet booth can see it is quiet and react.

---

## 6. Admin experience

### 6.1 Dashboard — `/admin`

A **day selector** sits at the top right — Day 1 (16 Sep) / Day 2 (17) / Day 3 (18) /
All — and scopes every panel below it. It defaults to today during the event and to All
afterwards.

Above the fold, four large figures in the deck's `.fig` style:

- **Total visitors registered**
- **Total stamps collected**
- **Prizes redeemed**
- **Active in the last 15 minutes**

Below:

| Panel | Content |
|---|---|
| **Booth leaderboard** | Every booth, ranked by stamps, with its accent color, live count, and a sparkline of the last hour. The **top booth** is highlighted in gold; the **three lowest** are flagged amber with a "needs traffic" hint. Updates live. |
| **Timeline** | Stacked area chart of stamps per 5-minute bucket over the event, all booths. |
| **Visitor funnel** | Registered -> 1+ stamp -> tier 1 reached -> redeemed. |
| **Participation split** | Thai vs. international vs. staff vs. guest, as counts and share. |
| **Countries** | Visitors by country of origin — a ranked bar list with flags, and a headline count of "N countries represented", which is the single most quotable figure for an international festival report. |
| **Ethnic groups** | Aggregate only, groups under 5 folded into "Other", with the response rate shown alongside so the reader knows what share chose not to answer. Hidden entirely if fewer than 20 visitors consented. |
| **Institutions** | Visitors by university/institution, and within MFU by school. |
| **Cross-school** | Matrix of visitor school/institution x booth host unit, showing whether visitors leave their own school's booth. |
| **Points distribution** | How many visitors sit in each point band, with the tier thresholds marked. The band just below a threshold is the actionable number — those visitors are one far-corner booth away, and a floor announcement can be aimed at them. |
| **Completion** | Distribution of stamp counts (how many visitors have 1, 2, 3 … stamps). |
| **Prize stock** | Per tier: remaining out of total, used today vs. the whole event, and burn rate per hour with a projected run-out time. Amber below 20%, red below 5 items. |
| **Returning visitors** | How many of today's visitors also attended an earlier day — only meaningful from day 2, so the panel hides itself on day 1. |

Every panel exports to CSV. The whole dashboard exports to a one-page PDF summary for
the project report — this is the "no figures for the report" problem from the deck,
solved directly.

A **presentation mode** (`/admin/wall`) shows the leaderboard and total on a hall
screen: dark navy, oversized figures, auto-rotating between leaderboard and timeline.

### 6.2 User management — `/admin/users`

- Table of all users: name, role, affiliation, booth (organizers), stamps, registered
  time, last seen.
- Search by name / ID / contact. Filter by role, affiliation, visitor type.
- **Create** — an organizer or admin (name, contact, booth assignment). Visitors
  self-register, but an admin can create one at the desk for a walk-up guest.
- **Read** — a detail drawer with the user's full scan history: booth, time, and the
  route they walked.
- **Update** — edit any field; **change role** (visitor / organizer / admin) from a
  dropdown, with a confirmation step when granting admin.
- **Delete** — soft delete (`deleted_at`), which anonymizes the contact field and
  retains the scan rows for statistics. Hard delete is available for PDPA erasure
  requests and removes the scan rows too.
- Bulk actions: assign role, assign booth, export selection.
- Every mutation writes an audit log row (actor, action, target, before/after, time),
  viewable at `/admin/audit`.

### 6.3 Booth management — `/admin/booths`

CRUD on booths: name (English, plus an optional Thai name held for later), host unit, location, description, accent color,
`activeDays` (which of 16–18 September this booth is present), active flag, prize-desk
flag, organizer assignment, and **rotate secret** — which invalidates any photographed
code instantly. That is the emergency lever if a code is found circulating in a group
chat.

**Artwork.** Each booth row has a badge slot and a photo slot (specs in section 2.5).
Drag-and-drop or file picker, with a live preview showing exactly how the badge will
look as a stamp on the visitor's grid — tilted, in the booth's accent, beside its
neighbours — because a badge that looks fine as a square file often looks wrong as a
stamp. Uploads go straight to Cloud Storage from the client under an admin-only rules
path; the callable records the resulting URLs on the booth document. Removing an image
restores the generated fallback stamp.

A **booth artwork checklist** at the top of the page shows how many booths still have no
badge, so the admin can chase the missing ones before the event rather than discovering
them on the morning.

### 6.4 Organizer invitations — `/admin/users` → **Invite booth organizer**

Booth staff are invited by email from the admin panel. They never register themselves,
and there is no password.

**Flow**

1. Admin fills in name, email, and the booth to assign, then sends. Bulk invite accepts
   a pasted list or a CSV of `name, email, booth` for all twelve booths at once.
2. The `inviteOrganizer` callable creates an `invites/{inviteId}` document with a
   single-use token, a 14-day expiry, and status `sent`, then sends the email.
3. The email carries a link to `/invite/<token>` in Thai and English: the event name and
   dates, which booth they will run, and one button.
4. Opening the link signs them in with a **Firebase Auth email link** for that address,
   creates or updates their user document, sets the `organizer` role claim and
   `boothId`, and marks the invite `accepted`. They land directly on their booth screen.
5. The admin sees invite status per organizer — `sent`, `opened`, `accepted`, `expired`
   — and can **resend** or **revoke**. Revoking invalidates the token immediately.

The link is single-use and bound to the invited email address, so a forwarded invite
cannot be accepted by someone else. Expiry is 14 days, or the end of the event,
whichever comes first.

**Sending mail.** The invite is sent from the `inviteOrganizer` **Cloud Function**,
never from the browser.

You asked about **EmailJS**, and it works here — with one constraint that matters.
EmailJS's normal mode is browser-side with a *public* key, which is fine for a contact
form but wrong for this: anyone who opens dev tools gets a key that sends mail from the
university's account. So we use EmailJS's server-side path instead — a POST to
`https://api.emailjs.com/api/v1.0/email/send` with the **private** key as `accessToken`,
issued from the Cloud Function, with the key held in Secret Manager and "Allow EmailJS
API for non-browser applications" enabled in the EmailJS dashboard. Same service, same
free tier, no key in the client.

Two alternatives worth knowing, since the mailer is a single interface in the code and
swapping it is a one-file change:

| Option | Trade-off |
|---|---|
| **EmailJS, server-side** (chosen) | No SMTP credentials to procure, template editing in a web UI a non-developer can use. Free tier is 200 emails/month — ample for ~12 organizer invites, but it is a third party holding a sending key |
| Firebase **Trigger Email** extension | Sends through SMTP the university already owns; better deliverability from an `mfu.ac.th` address; needs SMTP credentials from IT |
| Firebase Auth email link, unmodified | Zero extra services, but the default template is bare and cannot carry the booth name and event branding |

Recommendation: build on EmailJS now because it unblocks the one-week runway, and keep
the mailer behind an interface so that if IT supplies SMTP credentials before the event,
switching to Trigger Email is a configuration change rather than a rewrite. Deliverability
is the reason to care — invites sent from a third party to `@mfu.ac.th` inboxes are more
likely to land in spam than mail from the university's own server, so whichever is used,
send the twelve invites **a week early**, not on the morning of the 16th, and watch the
`opened` column.

> **Amended, September 2026 — the mailer is Resend, not EmailJS.** The prediction above held:
> the mailer was one interface and the swap was one file, `functions/src/mailer.ts`, plus the
> parameter names.
>
> EmailJS was chosen for "template editing in a web UI a non-developer can use", and that turned
> out to be the reason to leave. Using it from a server needed four pieces of configuration for
> one message — a private key, a public key, a service id and a dashboard template id — and the
> wording of the only email this app sends lived somewhere nobody working on the repository
> could see or review. Resend needs a key and a verified sender, and takes the HTML in the
> request, so the invitation is now `inviteHtml` in that file: reviewed in a pull request,
> changed by a deploy.
>
> What did not change: mail still goes out only from the Cloud Function and never the browser,
> the key still lives in Secret Manager, and an unconfigured mailer still returns a copyable
> single-use link rather than failing. The deliverability point in the paragraph above stands
> whichever service is used — Resend needs a DNS-verified sending domain, which is itself the
> thing that makes the mail land.

### 6.5 Prize policy — `/admin/prizes`

The policy is data, not code, and is editable during the event.

A policy is an ordered list of tiers:

| Field | Meaning |
|---|---|
| `name` | Tier label |
| `thresholdPoints` | **Points** required to unlock the tier |
| `reward` | What the visitor receives |
| `stockTotal` | Inventory loaded in, per tier. **Required** — inventory is tracked in the app only, there is no paper tally |
| `stockRemaining` | Decremented atomically on each confirmed redemption |
| `grantsDrawEntry` | Boolean — enters the visitor in the closing stage draw |
| `active` | Toggle without deleting |

Default policy:

1. **Explorer — 50 points** — a souvenir on the spot.
2. **Voyager — 100 points** — a larger souvenir.
3. **Globetrotter — 150 points** — a special souvenir plus entry to the closing stage draw.

Against the 170 points on the floor (see 6.6), the top tier leaves 20 points of slack, so a
visitor can reach it without a clean sweep — which matters, because two booths are absent on
some days and nobody should be locked out of the top prize by the timetable.

### 6.6 Badge points — `/admin/booths`

**Badges are not worth the same.** Each booth carries a `points` value the admin sets, and
prize tiers are thresholds on the *sum of points*, not on a count of booths.

This is the mechanism that fixes the problem the concept deck opens with — "visitors never
reach the whole hall", because they stop at the booths near the entrance. A count-based
threshold treats a booth by the door and a booth in the far corner as interchangeable, so a
visitor rationally collects the five easiest and leaves. Pricing the far corner at double
makes the walk worth taking, without asking anyone to visit every booth.

**Pricing is by reach, not by importance.** This distinction needs stating plainly to the
booth hosts, because the natural reading of "your badge is worth 10 and theirs is worth 20"
is a judgement about the unit. It is not: it is a judgement about the walk. The default:

| Zone | Points | Rationale |
|---|---|---|
| Entrance row | 10 | Visitors arrive here anyway |
| Middle hall | 15 | A short detour |
| Far corner | 20 | The booths that were empty last year |

With 12 booths that gives **170 points** on the floor. Points are also the right lever for a
booth whose activity genuinely takes longer — a 15-minute workshop can be priced above a
30-second demo, so visitors are not penalised for choosing the substantial activity.

**Rules that follow from this:**

- **Points are frozen at scan time.** Each scan records `pointsAwarded`, and a visitor's
  total is the sum of those. Re-pricing a booth mid-event changes what *future* scans are
  worth and never moves anyone's total, in either direction. Recomputing from the booth's
  current value would silently take points away from a visitor who has already made the walk
  — the same principle as never revoking an unlocked tier.
- **Points must be visible before the visit, not after.** The stamp grid shows what each
  uncollected booth is worth, and sorts uncollected booths by value. A points system the
  visitor only discovers on arrival changes nobody's route and is therefore pointless.
- **The top threshold must stay reachable.** The tier editor blocks any threshold above the
  total points available and warns within 10 of it. With booths absent on some days, a
  threshold set at exactly the maximum is unreachable for anyone who attends one day.
- **The booth leaderboard still ranks by visitors, not points.** Ranking by points would
  restate what the admin set. If a 20-point booth is still in the bottom three, the points
  are not the problem and something else needs fixing.
- Changing a booth's points is audit-logged like any other admin mutation.

### 6.7 Prize policy editing rules

- Lowering a threshold immediately unlocks the tier for everyone who now qualifies.
- Raising a threshold **never revokes** an already-unlocked or redeemed tier. Unlocks
  are recorded as facts at the moment they happen, not recomputed from current policy.
  Without this rule, a mid-event edit would take prizes away from visitors who already
  earned them, at the prize desk, in front of the queue.
- Every policy change is audit-logged with the previous version, and the admin sees
  "this will unlock tier X for 34 visitors" before confirming.

**Inventory rules** (no paper tally — the app is the only record):

- `stockRemaining` is decremented inside the same transaction that marks a tier
  redeemed, so two prize-desk staff scanning simultaneously can never take the count
  below zero. The second one gets "Out of stock" rather than a silent overdraw.
- At zero, the tier still **unlocks** for qualifying visitors — they earned it — but the
  redemption screen reads "This prize has run out" with an admin-set
  note (for example, a collection point or a later date). Hiding the unlock would make
  the app look broken to someone who did the work.
- **Restock** is an admin action (`adjustStock`) that adds to `stockTotal` and
  `stockRemaining` together, with a reason field, audit-logged. Counts are never edited
  by typing over them — every change is an adjustment with a reason, so the end-of-event
  figures reconcile against what was physically loaded in.
- A **low-stock alert** appears on the dashboard at 20% and again at 5 items remaining.
- An admin can **void a redemption** (wrong person, handed over twice, prize damaged),
  which returns the item to stock, reopens the tier for that visitor, and is
  audit-logged with a mandatory reason. Without this, one mistake at a busy desk is
  permanent.
- Because a three-day event carries stock across days, the dashboard shows stock used
  per day as well as in total, so the team can see day 1 burn rate before day 2 opens.

A **stage draw** tool at `/admin/draw` picks random winners from visitors holding a tier
with `grants_draw_entry`, with an animated draw suitable for projection, and logs the
result.

---

## 7. Data model — Cloud Firestore

One Firestore database in Native mode, region `asia-southeast1` (Singapore — nearest to
Chiang Rai). Timestamps stored as Firestore `Timestamp`, rendered in `Asia/Bangkok`.

Firestore has no joins and no unique indexes, so the model leans on **deterministic
document IDs** for uniqueness and on **pre-aggregated counter documents** for statistics.
Both choices are load-bearing, not stylistic.

### 7.1 Collections

> **Amended, September 2026 — the event is data, not a constant.** `EVENT_ID`,
> `EVENT_DAYS` and `ZONE_POINTS` were compile-time constants, which made the app a
> single-use build. The live event is now the one `events/{eventId}` document with
> `status: 'live'`, carrying `days[]`, `passportPrefix` and `zonePoints`, and the admin
> creates, edits, archives and replaces it from `/admin/event` without a redeploy. The
> constants survive only as seed defaults and last-resort fallbacks.
>
> The app still runs **one event at a time**. Rather than event-scoping the deterministic
> ids `scans/{visitorId}_{boothId}` and `tierUnlocks/{visitorId}_{tierId}`, the stats
> paths, the rules and every query, an event is **archived** — its totals frozen to
> `archives/{eventId}` — and its working data purged. Purging `scans` and `tierUnlocks`
> is precisely what makes booth ids safe to reuse: without it, a returning visitor could
> never re-stamp a `booth-01` that belongs to a different event.

```
events/{eventId}
  nameTh, nameEn, startsAt, endsAt, qrPeriodSeconds, active, boothCount, createdAt,
  days[], passportPrefix, zonePoints, status: 'draft'|'live'|'archived', archivedAt

archives/{eventId}                            # frozen before a purge; admin-read only
  eventId, nameEn, nameTh, days, startsAt, endsAt, archivedAt, archivedBy,
  totals: { visitors, stamps, points, redeemed },
  booths: [{ id, nameEn, points, stamps }],
  tiers: [{ id, name, thresholdPoints, stockTotal, stockRemaining, redeemed }],
  draws: [{ winners, names, createdAt }]

users/{uid}                                  # uid = Firebase Auth uid
  role: 'visitor' | 'organizer' | 'admin'    # mirrors the custom claim
  displayName, studentId
  visitorType: 'student'|'staff'|'alumni'|'guest'
  institution, institutionOther               # university; 'MFU' for our own
  school                                      # MFU school / faculty, or free text
  countryCode                                 # ISO 3166-1 alpha-2, e.g. 'MM'
  isInternational                             # derived: countryCode != 'TH'
  ethnicGroup, ethnicConsentAt                # sensitive; both null unless consented
  contact, contactVerified
  boothId                                    # organizers only
  passportNo                                 # 'MFU-GG-0000'
  stampCount                                 # denormalized, incremented on scan
  points                                     # denormalized sum of scans.pointsAwarded
  stampedBoothIds: string[]                  # denormalized, for the stamp grid
  daysAttended: string[]                     # ['2026-09-16', ...]
  consentAt, createdAt, lastSeenAt, deletedAt

booths/{boothId}
  eventId, nameTh, nameEn, hostUnit, location,
  descriptionTh, descriptionEn, accentColor,
  points                                     # what this badge is worth, set by the admin
  zone                                       # 'entrance' | 'middle' | 'far' — why it is worth that
  badgeUrl, badgeThumbUrl, photoUrl, photoThumbUrl,
  activeDays: string[]                       # ['2026-09-16','2026-09-17','2026-09-18']
  isPrizeDesk, active, sortOrder, organizerUid, createdAt
  # NOTE: no secret here — this document is world-readable

invites/{inviteId}
  email, displayName, boothId, tokenHash, role: 'organizer'|'admin',
  status: 'sent'|'opened'|'accepted'|'revoked'|'expired',
  sentAt, sentBy, openedAt, acceptedAt, expiresAt, acceptedUid

refData/institutions                          # university list, editable without deploy
refData/mfuSchools                            # MFU school / faculty list
refData/ethnicGroups                          # { [countryCode]: string[] }

boothSecrets/{boothId}                       # rules: deny all client access
  secret (base64, 32 bytes), rotatedAt, rotatedBy

scans/{visitorId}_{boothId}                  # deterministic ID = one stamp per booth
  visitorId, boothId, eventId, scannedAt, day ('2026-09-16'),
  pointsAwarded                              # frozen at scan time, never recomputed
  counter, uaHash, ipPrefix,
  visitorType, institution, school, countryCode, isInternational
                                             # copied for aggregation without a join
                                             # NOTE: ethnicGroup is deliberately NOT copied here

prizeTiers/{tierId}
  eventId, name, thresholdPoints, reward,
  stockTotal, stockRemaining, outOfStockNoteTh, outOfStockNoteEn,
  grantsDrawEntry, active, sortOrder

stockAdjustments/{autoId}                     # every stock change, never an overwrite
  tierId, delta, reason, actorUid, createdAt,
  kind: 'load-in'|'restock'|'redeem'|'void'|'correction'

tierUnlocks/{visitorId}_{tierId}             # deterministic ID = unlock once
  visitorId, tierId, unlockedAt, pointsAtUnlock, stampCountAtUnlock,
  redeemedAt, redeemedBy, redemptionNote,
  voidedAt, voidedBy, voidReason

auditLog/{autoId}
  actorUid, action, targetType, targetId, before, after, createdAt

stats/event                                  # single live document, see 7.2
  visitors, stamps, points, redeemed, activeLast15m,
  pointsBuckets: { '0-24': n, '25-49': n, ... },   # how far visitors actually get
  byVisitorType: { student, staff, alumni, guest },
  byCountry: { [countryCode]: count },
  byInstitution: { [key]: count },
  bySchool: { [key]: count },
  byEthnicGroup: { [key]: count },           # admin-read only, suppressed below 5 in the UI
  ethnicResponses, ethnicDeclines,
  byDay: { '2026-09-16': { visitors, stamps }, ... },
  updatedAt

stats/booths/{boothId}                       # one live counter per booth
  boothId, stamps, rank, byVisitorType, byDay, lastStampAt, updatedAt

stats/buckets/{eventId}_{yyyymmddhhmm}       # 5-minute timeline buckets
  startsAt, day, total, perBooth: { boothId: count }
```

### 7.2 Counters and aggregation

Counting scans with a query at read time would cost one document read per scan on every
dashboard refresh. Instead an `onCreate` Cloud Function trigger on `scans/{id}` updates,
in a single batched write:

- `stats/event` — total stamps, visitor-type breakdown (atomic `FieldValue.increment`)
- `stats/booths/{boothId}` — that booth's count
- `stats/buckets/...` — the 5-minute timeline bucket
- `users/{visitorId}` — `stampCount`, `points` and `stampedBoothIds`
- `tierUnlocks/...` — creates an unlock document if a threshold is now met

The dashboard and the booth screen then read **a handful of small documents**, live,
through `onSnapshot`. Cost and latency are flat in the number of scans.

Firestore's per-document write ceiling is roughly one write per second sustained. At a
peak of ~1,500 visitors over a day this is comfortable, but the closing rush is not
uniform, so `stats/event` is written as a **10-shard distributed counter**
(`stats/event/shards/{0..9}`, each incremented at random) and summed by the client. Booth
and bucket documents stay unsharded — their traffic is a tenth of the event total.

Ranking (top booth, three lowest) is computed by a scheduled function every 30 seconds,
which reads the 12 booth counters and writes `rank` back. Sorting 12 documents client-side
would also work; the stored rank exists so the organizer's "Rank 4 of 12" line does not
require reading every other booth.

### 7.3 Composite indexes

Declared in `firestore.indexes.json`:

- `scans`: `boothId ASC, scannedAt DESC` — booth scan history
- `scans`: `visitorId ASC, scannedAt ASC` — a visitor's walked route
- `scans`: `eventId ASC, scannedAt DESC` — event feed and CSV export
- `users`: `role ASC, createdAt DESC` — admin user table
- `users`: `role ASC, affiliation ASC, createdAt DESC` — filtered user table
- `tierUnlocks`: `tierId ASC, redeemedAt ASC` — redemption reconciliation

### 7.4 Security rules (shape)

```
users/{uid}         read: own document, or admin. write: Cloud Functions only.
booths/{id}         read: any signed-in user. write: admin only.
boothSecrets/{id}   read/write: never from a client.
scans/{id}          read: own scans, or admin. write: Cloud Functions only.
prizeTiers/{id}     read: any signed-in user. write: admin only.
tierUnlocks/{id}    read: own, or admin/prize desk. write: Cloud Functions only.
stats/**            read: admin, or organizer (booth + event totals). write: Functions.
auditLog/{id}       read: admin. write: Cloud Functions only.
```

Every write that matters — scans, unlocks, redemptions, role changes — goes through a
Cloud Function, never a direct client write. Rules are the second line of defence, not
the first. Rules are exercised by the emulator end-to-end run (`npm run e2e`, `scripts/e2e/`), including the negative cases in §12.13; there is no CI yet.

---

## 8. API — callable functions and live reads

There is no REST layer. Reads that need to be live come straight from Firestore via
`onSnapshot`; writes go through **Cloud Functions callables** (v2, region
`asia-southeast1`), which get the caller's uid and role claim from the auth context.

### 8.1 Callable functions

**Visitor**

| Function | Does |
|---|---|
| `join` | Writes the visitor document, sets the `visitor` claim, assigns a passport number, stores `ethnicGroup` only if `ethnicConsent` was true |
| `requestRestore` | Sends an email sign-in link to an existing contact |
| `scan` | Verifies the HMAC token and counter, creates `scans/{visitorId}_{boothId}` in a transaction, returns the stamp result |
| `redemptionCode` | Returns the rotating 8-character redemption token for the caller |
| `requestErasure` | Files a PDPA erasure request |

**Organizer**

| Function | Does |
|---|---|
| `boothSession` | Returns the caller's booth, its secret, the period, and a server-time offset — the only path to a booth secret |

**Admin**

| Function | Does |
|---|---|
| `createUser`, `updateUser`, `deleteUser` | User CRUD, including anonymize-on-soft-delete |
| `setUserRole` | Sets the custom claim and the mirrored document field together |
| `inviteOrganizer` | Creates the invite, sends the email (single, or bulk from a CSV) |
| `resendInvite`, `revokeInvite` | Re-sends or kills an outstanding invite token |
| `acceptInvite` | Public-with-token: validates, signs in, sets the organizer claim and booth |
| `createBooth`, `updateBooth`, `deleteBooth` | Booth CRUD, including badge points, artwork URLs and `activeDays` |
| `rotateBoothSecret` | New 32 random bytes; every photographed code dies immediately |
| `savePrizePolicy` | Writes point thresholds, rejects any above the points available, returns the "this unlocks tier X for N visitors" preview |
| `adjustStock` | Load-in, restock or correction, with a reason; writes `stockAdjustments` |
| `confirmRedemption` | Prize desk: marks a tier redeemed and decrements stock in one transaction |
| `voidRedemption` | Returns an item to stock and reopens the tier, with a mandatory reason |
| `runDraw` | Picks and logs stage-draw winners |
| `exportPanel` | Generates a CSV to Cloud Storage, returns a signed URL |

### 8.2 Background functions

| Trigger | Does |
|---|---|
| `onScanCreate` (Firestore `scans/{id}`) | Updates all counters and creates tier unlocks (see 7.2) |
| `onUserWrite` (Firestore `users/{uid}`) | Keeps `stats/event.visitors` and the visitor-type split current |
| `rankBooths` (scheduled, 30 s) | Recomputes booth ranks |
| `sweepActive` (scheduled, 60 s) | Recomputes `activeLast15m` |
| `purgePersonalData` (scheduled, daily) | Enforces the 90-day retention rule |

### 8.3 Live reads

| Screen | Listens to |
|---|---|
| Visitor passport | `users/{uid}`, `prizeTiers` (active), `tierUnlocks` where `visitorId == uid` |
| Booth screen | `stats/booths/{boothId}`, `stats/event/shards/*` |
| Admin dashboard | `stats/event/shards/*`, `stats/booths/*` (12 docs), the last 96 `stats/buckets` |

The dashboard therefore holds roughly 120 live documents — well inside Firestore's
listener limits, and it updates within a second of a scan without any polling. The
`/admin/users` table is **not** a live listener; it is a paginated query (50 per page,
cursor-based) refreshed on demand, because a live listener over every user would be
expensive and would make the table jump under the reader's cursor.

**Offline:** the Firestore SDK's local cache serves the last known values when the
network drops, and the connection dot reflects `snapshot.metadata.fromCache`. Writes
queued offline are not used for scans — a scan must be confirmed by the server, so an
offline scan is queued in the app for up to 5 minutes and then reported as failed rather
than silently accepted.

---

## 9. Technical stack

Firebase throughout, project region `asia-southeast1`.

| Layer | Choice | Why |
|---|---|---|
| Database | **Cloud Firestore** (Native mode) | Realtime listeners give the live dashboard and booth counts for free — no SSE, no polling, no socket server to operate |
| Hosting | **Firebase Hosting** | Global CDN, automatic TLS, preview channels per pull request, one `firebase deploy` |
| Server logic | **Cloud Functions for Firebase (v2, Node 20, TypeScript)** | Callables get the verified uid and role claim; Firestore triggers keep counters current |
| Auth | **Firebase Authentication** — anonymous for visitors, email link for organizers/admins and device restore | No passwords anywhere; a passport exists before the visitor types anything |
| Authorization | Custom claims (`role`, `boothId`) plus Firestore security rules | The claim is checked in rules and in every callable |
| App framework | **Vite + React + TypeScript**, deployed as a static SPA to Firebase Hosting | Firestore's realtime SDK is client-side anyway, so server rendering buys little here and a plain SPA deploys in seconds |
| Routing | React Router | Route inventory in section 11 |
| Styling | Tailwind CSS plus CSS custom properties for the palette | The tokens in section 2.2 map directly |
| QR generation | `qrcode` on the booth client | Rotates locally from the booth secret, works offline |
| QR scanning | `BarcodeDetector` with a `zxing-wasm` fallback | Native where available |
| Charts | Recharts | Small, themeable to the palette |
| Files | Cloud Storage for Firebase | CSV and PDF exports, served by signed URL |
| Email | **Resend, called server-side** from Cloud Functions with the API key in Secret Manager (organizer invites); Firebase Auth's own templates for verification, password reset and address change | No SMTP credentials to procure, and the invitation's wording lives in the repository rather than a dashboard. See 6.4 for why it is never called from the browser, and its amendment for why not EmailJS |
| Images | Cloud Storage for Firebase plus the Resize Images extension | Booth badges and photos, with generated thumbnails |
| Analytics / errors | Firebase Analytics and Crashlytics for web | Already in the SDK |
| Local dev and CI | Firebase Emulator Suite (Auth, Firestore, Functions, Hosting) | Security rules and the scan transaction are unit-tested against the emulator |

**Why not SSR:** the visitor app is behind an auth wall and reads live data, so there is
nothing meaningful to render on the server. A static SPA on Firebase Hosting is simpler,
cheaper, and faster to ship inside the one-week runway. If SEO for a public landing page
matters later, that one route can be pre-rendered at build time.

**Cost sanity check.** At 1,500 visitors, 12 booths and roughly 12,000 scans, the whole
event lands in the low tens of thousands of document reads and writes — comfortably
inside or barely above the Spark free tier. Enable **Blaze** with a budget alert anyway,
so nothing hard-stops mid-event, and set a billing alert at a small threshold.

Build target: **one week**, per the concept deck. The stack is chosen so a student team
ships features instead of operating infrastructure.

---

## 10. Security, privacy, resilience

**Security**

- Booth secrets live in `boothSecrets/{boothId}`, which security rules deny to every
  client. Only Cloud Functions (Admin SDK) read them, and only `boothSession` hands one
  to an authenticated organizer for their own booth.
- Token verification is constant-time (`crypto.timingSafeEqual`); tokens are
  single-period with a one-period grace.
- Every consequential write is a callable function that re-checks the role claim
  server-side. Security rules deny direct client writes to `users`, `scans`,
  `tierUnlocks`, `stats`, and `auditLog`, so a forged client cannot mint a stamp.
- All admin mutations are audit-logged with the actor's uid.
- Rate limits: scan 10/min per visitor and join 5/hour per IP, enforced in the callables
  against a `rateLimits/{key}` document; Cloud Functions concurrency and max-instance
  caps are set so a runaway loop cannot run up the bill.
- App Check (reCAPTCHA Enterprise) is enforced on Firestore and on all callables, which
  is what stops a script from calling `scan` directly outside a real browser.
- HTTPS only, via Firebase Hosting. Auth tokens are held by the Firebase SDK in
  IndexedDB, not in a cookie, so there is no CSRF surface on the callables.

**Privacy (PDPA)**

- Explicit consent at registration, with a linked notice naming what is collected, why,
  who sees it, and how long it is kept.
- Collected: name, optional ID, institution and school, country of origin, visitor type,
  one contact, scan times. Not collected: precise location, photos, contacts, browsing
  outside the app.
- **Sensitive data (PDPA s.26).** Ethnic group is the only sensitive field. It is
  optional, gated behind its own separate consent tick, stored on the user document
  only, never copied onto scan records, never shown in any per-person view, aggregated
  with counts under 5 suppressed, and purged with the other personal fields at 90 days.
  Withdrawing that consent from the passport page erases the value while leaving the
  passport and its stamps intact. Country of origin is *not* sensitive data and is
  handled normally.
- `ethnicGroup` is stored on the visitor's own user document. Firestore rules cannot hide a
  single field, so an admin (who may read user documents) could technically see it; the
  enforcement is in the UI: no admin screen renders it per person, and the dashboard reads
  only the folded aggregate on `stats/event`. Moving it to an owner-only sub-document would
  make the rule literal and is on the backlog.
- Data residency: the Firestore database and all Cloud Functions are pinned to
  `asia-southeast1` (Singapore), the nearest Google region — worth stating explicitly in
  the PDPA notice.
- Retention: the `purgePersonalData` scheduled function clears personal fields 90 days
  after the event; aggregate statistics are retained indefinitely in anonymized form.
- A PDPA erasure request deletes the `users/{uid}` document, the Firebase Auth account,
  and that visitor's `scans` documents, leaving the already-incremented counters intact
  (they hold no personal data).
- Self-service erasure request from the visitor's own passport page.
- Exports for reporting contain no contact details by default; a separate,
  explicitly-confirmed export includes them for prize fulfilment only.

**Resilience**

- Booth screens keep generating valid codes through a network outage — the HMAC is
  computed locally from the cached secret and a server-time offset captured at start.
- The Firestore SDK's offline cache keeps the passport and the stamp grid readable with
  no network. A scan made while offline is queued in the app for up to 5 minutes and
  then reported as failed, never silently accepted — a stamp is only real once the
  `scan` callable has confirmed it.
- Cloud Functions cold starts are the one latency risk on the 2-second scan budget, so
  `scan` and `boothSession` run with `minInstances: 1` for the duration of the event and
  are scaled back to 0 the next day.
- Paper fallback: 100 printed passports and rubber stamps at the welcome desk. Paper
  stamps are keyed in at the prize desk against the visitor's record.
- The admin dashboard shows Firestore listener state and the age of `stats/event`, so a
  stalled counter is visible rather than silently stale.
- Deploys use Firebase Hosting preview channels; the production channel is only released
  after a smoke test on the preview URL. Hosting keeps prior releases, so a rollback is
  one command.

---

## 11. Screen inventory

| Route | Role | Screen |
|---|---|---|
| `/` | public | Landing, event info, "start your passport" |
| `/join` | public | Registration form |
| `/restore` | public | Restore a passport on a new device |
| `/invite/:token` | public | Booth organizer accepts an emailed invitation |
| `/passport` | visitor | Cover / home |
| `/passport/stamps` | visitor | Stamp grid |
| `/passport/prize` | visitor | Tier status and redemption code |
| `/scan` | visitor | Camera scanner and manual entry |
| `/s/:token` | visitor | Scan landing (from the native camera app) |
| `/r/:token` | organizer / admin | Redemption landing (visitor's code opened from the native camera app) |
| `/booth` | organizer | Rotating QR and live counts |
| `/booth/stats` | organizer | Own booth statistics |
| `/redeem` | organizer / admin | Prize desk scanner and confirm |
| `/admin` | admin | Dashboard |
| `/admin/event` | admin | Event details, go live, archive &amp; start the next event |
| `/admin/wall` | admin | Hall-screen presentation mode |
| `/admin/users` | admin | User CRUD and roles |
| `/admin/booths` | admin | Booth CRUD and secret rotation |
| `/admin/prizes` | admin | Prize policy editor |
| `/admin/draw` | admin | Stage draw |
| `/admin/audit` | admin | Audit log |

All routes are client-side. `firebase.json` rewrites every path to `/index.html`, which
is what makes `/s/<token>` work when a visitor scans the booth QR with their phone's
native camera app rather than opening our scanner first.

---

## 12. Acceptance criteria

1. A visitor registers in under 60 seconds on a mid-range Android phone over 4G.
2. A visitor scans a booth QR and sees the stamp animation within 2 seconds.
3. A QR photographed and sent to another person fails when scanned more than 40 seconds
   after capture.
4. A second scan of the same booth by the same visitor shows "already stamped" and does
   not create a duplicate row.
5. The booth screen keeps showing valid, accepted codes after 60 seconds with the
   network disabled.
6. The admin dashboard and the booth screen reflect a new scan within 2 seconds, with no
   refresh and no polling request.
7. The top booth and the three lowest booths are visibly distinguished on the
   leaderboard without reading the numbers.
8. An admin changes a user's role and the change takes effect within 15 minutes without
   the user re-registering.
9. Raising a prize threshold mid-event does not revoke any unlocked or redeemed tier, and
   re-pricing a booth's badge does not change any visitor's existing points total.
10. Every admin mutation appears in the audit log with actor and timestamp.
11. All visitor-facing screens pass WCAG 2.1 AA contrast and work at 320 px width.
12. The system sustains 1,500 visitors and 12 booths, with p95 `scan` callable latency
    under 800 ms including cold-start mitigation, and the dashboard reading no more than
    ~120 live documents regardless of scan volume.
13. Security rules unit tests pass against the emulator, including: a visitor cannot read
    another visitor's document, cannot read any `boothSecrets` document, cannot write
    a `scans` document directly, and cannot read another visitor's `ethnicGroup`.
14. A visitor who registers on 16 September and returns on 17 September sees their
    existing stamps, and re-scanning a day-1 booth reports "already stamped".
15. Two prize-desk devices confirming the last remaining item simultaneously result in
    exactly one redemption and one out-of-stock message — never a negative stock count.
16. Registration completes in under 90 seconds including the country and institution
    comboboxes, and a visitor who declines the ethnicity field is never asked twice.
17. An organizer invited by email reaches their own booth screen from the emailed link
    without ever seeing a password field, and the same link fails on a second use.

---

## 13. Open questions

**Settled**

- ~~Event duration~~ — **16–18 September 2026, 09:00–16:00 daily.** One passport spans
  all three days; see 1.1.
- ~~Prize inventory~~ — **tracked in the app only, no paper tally.** See 6.5.
- ~~Organizer accounts~~ — **admin invites by email**, single-use token, see 6.4.
- ~~Domain~~ — **`mfupassport.web.app`**, the default Firebase Hosting domain. No custom
  domain, so no DNS request to university IT and nothing to arrange before the event.
  Two consequences worth noting: the welcome-sign QR encodes
  `https://mfupassport.web.app/join`, and organizer invitation emails will link to a
  `web.app` address rather than an `mfu.ac.th` one — say so in the invitation text, or
  booth staff may reasonably read it as phishing. A custom domain can be added later
  without breaking anything, since Hosting serves both.

**Open**

1. **Booth count** — the stamp grid and the "every booth" tier both depend on the final
   number. Assumed 12 for layout; the grid is written to handle 6–20. Also needed: which
   booths are present on which of the three days.
2. **Prize quantities** — how many souvenirs for each of the three tiers? `stockTotal` is
   required, so these numbers are needed before the doors open, ideally split by day.
   The prototype assumes 600 / 250 / 120.
3. **Restore code delivery** — SMS costs money, email is free. Assumed email.
4. **Firebase project ownership and billing** — the project must be on the Blaze plan
   (Cloud Functions require it) under a university-owned Google account with a budget
   alert, not a student's personal account. Who owns it? (The domain is settled: see
   below.)
5. **Badge point values** — the entrance/middle/far pricing in 6.6 is a starting point drawn
   from the hall layout, not from data. It should be sanity-checked against the actual floor
   plan once booth positions are fixed, and the booth hosts should be told the pricing is
   about walking distance, not about the unit's importance, before they see the numbers.
6. **Ethnic group lists** — the seeded suggestions in 4.1 are a starting point written
   from general knowledge, not an authoritative list, and naming here is genuinely
   contested (Karen/Kayin, Ta'ang/Palaung, and the Rohingya entry in particular). These
   should be reviewed by the Office of International Affairs, and ideally by students
   from the communities named, before the event. The list is Firestore data precisely so
   it can be corrected without a deploy.
7. **Institution list** — how wide? MFU plus the Chiang Rai institutions, or every Thai
   university? Free-text `Other` covers the tail either way.
8. **Resend account** — who owns it, and can the sending domain be an `mfu.ac.th`
   domain? If IT can supply SMTP credentials instead, the Trigger Email extension is the
   better long-run choice for deliverability (6.4).

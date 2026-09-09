# User acceptance test — MFU InterFest Passport

A hand-run walk-through of the deployed app at **https://mfu-passport.web.app**, one row per
page and per control that is not obvious. Each row is something a tester does on a real device,
with what they should see. The emulator run (`npm run e2e`, 150 checks) already proves the
server side — callables, rules, triggers, the archive — so this list concentrates on screens,
devices, mail and the things that need a human eye.

Fill the **Result** column with `pass`, `fail` or `n/a`, and a note. Spec section numbers refer
to `spec/spec.md`. Anything listed in §6 *Known gaps* at the end is already known: skip it.

---

## 1. Before you start

### Environment

| What | State |
| --- | --- |
| Project | `mfu-passport`, live at https://mfu-passport.web.app (HANDOVER.md §1) |
| Invitations | `EMAILJS_PRIVATE_KEY` is the placeholder `none`, so **invites are not emailed**: the admin gets a copyable link instead (HANDOVER.md §2) |
| Account emails | Sent by Firebase Auth itself (verification, password reset, address change). The action URL should point at `/auth/action` (SETUP.md §1a); if it does not, the links still work on Firebase's own page |
| Data reset | There is none on production. Walk the loop once per fresh event, or finish with the Danger zone on `/admin/event` |

### Accounts and devices

| Role | How to get it | Device |
| --- | --- | --- |
| Admin | The existing admin signs in at `/signin`. A further admin: `/admin/users` → invite with role *Admin* → open the link. (`/setup` only works while no admin exists.) | Laptop Chrome |
| Organizer A, booth-01 (the prize desk) | `/admin/users` → invite → **Copy** the link → open it on the desk device → sign in as that address → **Accept and open my booth** | Tablet or second laptop |
| Organizer B, booth-02 | Same, for booth-02 | Any browser |
| Visitor A | Sign up with **email + password** on an Android phone (Chrome) | Android — tests the verification mail, `BarcodeDetector`, vibration |
| Visitor B | Sign up with **Google** on an iPhone (Safari) | iPhone — tests the `zxing-wasm` fallback, safe-area, no verification step |
| Visitor C | Any device, visitor type *guest*, declines the ethnic-group question | Any |
| Hall wall | `/admin/wall` on the projector, signed in as admin | Laptop + projector |

Have two visitors with a **Voyager** unlock (100 points) before §4, and one at **150 points** for the draw.

---

## 2. Visitor

| ID | Step | Expected | § | Result |
| --- | --- | --- | --- | --- |
| V-01 | Open the site signed out | Landing page with the event name and dates, **Start your passport** and **I already have a passport** | 4.1 | |
| V-02 | Start your passport → fill in name, email, password (under 8 chars) | Form refuses the short password with a message | 4.1 | |
| V-03 | Sign up with a valid password | Lands on **Confirm your email**; a mail arrives within a minute (check spam) | 4.1 | |
| V-04 | Leave that tab open; open the mail on the phone and tap the link | The mail-app tab says the address is confirmed; the original tab moves on to `/join` by itself within 5 s | 4.1 | |
| V-05 | On **Confirm your email**, press *Send the link again* immediately | Button shows a 45 s countdown before it can be pressed; after that a second mail arrives | 4.1 | |
| V-06 | Sign up with Google (Visitor B) | No verification step; goes straight to `/join` with the Google name pre-filled | 4.1 | |
| V-07 | `/join`: submit without ticking the PDPA consent | Blocked; consent is required | 4.1 | |
| V-08 | Pick country **Myanmar**, type "Shan" in Ethnic group | A separate consent checkbox appears beneath. Leave it unticked and submit: the passport is still created | 4.1, 10 | |
| V-09 | Visitor C: leave Ethnic group empty | Never asked again on later visits | 12.16 | |
| V-10 | Submit the form | Cover page: name, passport number `MFU-GG-0000`, 0 points, progress ring, three tier pips, live prize stock line | 4.2 | |
| V-11 | Time the whole sign-up on Phone A over mobile data | Under 90 s including the comboboxes | 12.1, 12.16 | |
| V-12 | Cover → **See what's worth most** | Stamps grid: uncollected booths show their point value and sort by it; the two day-limited booths say which days | 4.2, 1.1 | |
| V-13 | Tap a booth tile | Sheet with full name, host, location, zone, description; **Close** works | 4.2 | |
| V-14 | Cover → **Scan a booth** (or the floating button) | Camera opens after the permission prompt; a frame guide is shown | 4.3 | |
| V-15 | Deny the camera permission | Message explaining it, and the 6-character manual code field still works | 4.3 | |
| V-16 | Scan the booth screen's QR with the in-app scanner (Phone A, Android) | Stamp animation within 2 s, "+N points", a short vibration, **Scan another** / **My stamps** | 4.3, 12.2 | |
| V-17 | Same on Phone B (iPhone Safari) | Works via the WASM decoder; first use may take a second longer while it downloads | 4.3 | |
| V-18 | Scan the same booth again | "Already stamped" with a pulse, no error tone, no second stamp | 4.3, 12.4 | |
| V-19 | Type the 6-character manual code instead | Same success result | 4.3 | |
| V-20 | Photograph a QR, wait 45 s, scan the photo | "This code has expired — look at the live screen" | 5.2, 12.3 | |
| V-21 | Scan any other QR (a URL, a product code) | "Not a booth code" | 4.3 | |
| V-22 | Scan 11 booths within a minute | The 11th says "Slow down" (rate limit), no stamp lost | 5.2 | |
| V-23 | Signed out, open a booth QR with the **phone's own camera app** | Browser opens `/s/…` → sign-up → (verify) → `/join` → lands back on the check-in already stamped | 4.3 | |
| V-24 | On that check-in page press **Scan another** | The scanner opens without a page reload; Back does not return to the check-in | 4.3 | |
| V-25 | Prize page | Every active tier with threshold and **live remaining stock**; locked tiers grey; a rotating 8-character code and QR that changes every 30 s | 4.4 | |
| V-26 | Reach 50 points | Explorer tier turns to *unlocked* on Prize and the cover pip fills, without a reload | 4.4, 12.6 | |
| V-27 | Admin lowers a threshold below your points (A-52) | The tier unlocks on your phone within seconds | 6.7 | |
| V-28 | Admin raises it back above | Your unlock stays | 6.7, 12.9 | |
| V-29 | Tier stock reaches 0 (A-55) | Prize page shows the admin's out-of-stock note; the tier still unlocks | 6.7 | |
| V-30 | Cover → **Your account** | Email shown as confirmed, sign-in methods listed, Sign out, *Ask for my data to be deleted* | 10 | |
| V-31 | Change email address | Asks for the password (or Google), then a mail goes to the **new** address; the account moves only after that link is tapped; the old address gets an undo notice | 4.1 | |
| V-32 | Change password, then sign out and in with the new one | Works | 4.1 | |
| V-33 | Visitor B (Google only): **Add a password** | After that, email + password also signs in | 4.1 | |
| V-34 | `/forgot-password` with your address | Mail arrives; the link opens `/auth/action`, asks for a new password, then **Open my passport** | 4.1 | |
| V-35 | On the "sent" page press *Send it again* after the countdown | A second reset mail arrives | 4.1 | |
| V-36 | `/forgot-password` with an address that has no account | Same "on its way" message (no account enumeration) | 10 | |
| V-37 | **Ask for my data to be deleted** → read the notice → confirm | Amber "Erasure requested on <today>" replaces the button; still there after a reload and on another device | 10 | |
| V-38 | Turn the phone's data off and press *Request erasure* on another account | A red error, not a green success | 10 | |
| V-39 | Sign out, sign back in on a **different phone** | Same passport, same stamps — signing in is the restore | 4.1 | |
| V-40 | Come back on day 2 | Stamps from day 1 present; rescanning a day-1 booth says "already stamped" | 12.14 | |
| V-41 | Open the site inside the **LINE** app (in-app browser), sign in with Google | Either the popup works or the page falls back to a redirect and returns signed in; never a dead end | 4.1 | |
| V-42 | Chrome DevTools, 320 px wide, every visitor page | No horizontal scroll, nothing clipped, contrast readable | 12.11 | |
| V-43 | iPhone with a notch | Bottom tab bar and scan button clear the home indicator | 2 | |
| V-44 | Temporarily break a read (staging only: set `booths` read to false in the rules) | A red notice "not allowed to read the booth list" instead of an empty grid | — | |

## 3. Organizer and booth screen

| ID | Step | Expected | § | Result |
| --- | --- | --- | --- | --- |
| O-01 | Open the invite link signed out | Invitation card with event, booth, name; **Continue with Google**, *Use an email and password*, *Create one* | 6.4 | |
| O-02 | Open it while signed in as a **different** address | Amber notice naming both addresses and *Sign out of this device*; no Accept button | 6.4 | |
| O-03 | Sign in as the invited address → **Accept and open my booth** | Lands on `/booth` with the booth's name, QR, manual code | 6.4, 12.17 | |
| O-04 | Open the same link again | "This invitation has already been used" | 12.17 | |
| O-05 | Admin **Revoke**s an unopened invite, then open its link | "Revoked" | 6.4 | |
| O-06 | Admin **Resend**s: open the old link, then the new one | Old: invalid. New: works | 6.4 | |
| O-07 | Booth screen at 3 m | Booth name, QR at least 320 px on the accent ring, manual code below, countdown border | 5.1 | |
| O-08 | Watch for 60 s | QR and code change every 20 s; the border traces the period; the swap animates | 5.2 | |
| O-09 | Press ⛶ | Full screen and the screen stays awake (no dimming for 5 min) | 5.1 | |
| O-10 | Turn the device's Wi-Fi off, wait 60 s, have a visitor type the manual code | Dot turns red "Offline — codes still valid"; QR keeps rotating; the code is accepted | 5.2, 12.5 | |
| O-11 | Wi-Fi back on | Dot green "Live" within a few seconds | 5.1 | |
| O-12 | A visitor scans this booth | **Visitors here** and **Event total** rise within 2 s, no refresh | 12.6 | |
| O-13 | Press **Print card** | Print preview: one white page with booth name, a static QR that opens `/scan`, the two-step instructions; no countdown or rotating code | 5.1 | |
| O-14 | **Stats** in the bar | Own booth only: header says Live and the last stamp time; visitors stamped, rank of 12, event total; per-hour bars for the event's opening hours with a Day selector; CSV button | 5.3 | |
| O-15 | Stats → switch Day | Bars change; a stamp made before opening time still appears as an extra bar | 5.3 | |
| O-16 | Organizer B opens `/redeem` | Red "This booth is not a prize desk" | 3 | |
| O-17 | Organizer opens `/admin` or `/booth?boothId=booth-05` | Redirected to their own booth; no admin pages | 3 | |
| O-18 | Admin changes Organizer B's booth on `/admin/users` (A-44) | Within 15 min (or after a reload) the booth screen shows the new booth | 12.8 | |
| O-19 | Booth screen header, stats page and prize desk | The same small bar on all three: **Booth screen · Stats · Prize desk (only on a prize-desk booth) · Account · Sign out**; on the booth screen it disappears in full screen | 5.1 | |
| O-20 | Sign in as an organizer whose booth was removed (or whose account has no booth) and open `/booth` | A dark page saying the screen could not start, the reason, the signed-in address, **Try again** and **Sign out** — no redirect loop | 5.1 | |
| O-21 | Booth screen running; turn Wi-Fi off; **reload** the page | The screen comes back from its cached session, keeps rotating, dot amber "Reconnecting — codes still valid"; a visitor's typed code is still accepted once they are online | 12.5 | |
| O-22 | Admin presses **Rotate secret** (A-23); switch to the booth tab | The codes change on refocus (or within 15 min) with no reload; the old photographed code is refused | 5.2 | |
| O-23 | Admin unticks the booth's **Active** and saves | Red banner "switched off by the admin — visitor scans are refused" appears on the booth screen within seconds; re-ticking removes it | 6.3 | |
| O-24 | Organizer scans a booth QR with their own phone (native camera) | Lands on their booth screen with the line "Staff accounts do not collect stamps" | 4.3 | |
| O-25 | Hide the booth tab for a minute, then show it | Screen still awake (wake lock re-acquired), codes current, no error | 5.1 | |

## 4. Prize desk (Organizer A at booth-01, then repeat P-03 to P-05 as admin)

| ID | Step | Expected | § | Result |
| --- | --- | --- | --- | --- |
| P-01 | From the booth screen bar press **Prize desk** | `/redeem`: live stock strip with a Live/Reconnecting dot; camera; the two typed fields **Passport number** and **8-character code** | 4.4 | |
| P-02 | Scan a visitor's Prize QR | Card: name, passport number, points, stamps; unlocked tiers say **Hand over**, others "N pts short" | 4.4 | |
| P-03 | Press **Hand over** on Explorer once | Button turns gold **Confirm Explorer**; nothing is recorded yet; after 6 s it reverts | 4.4 | |
| P-03b | Press it a second time | Full green panel "Handed over · Explorer · name · passport no · time", a short vibration, **Next visitor**; the stock strip drops by one; the visitor's Prize page shows *collected*; the row appears under **Handed over on this device** | 4.4 | |
| P-04 | Scan the same visitor again and press Explorer twice | "Already handed over at <time> by <organizer's name>" | 4.4 | |
| P-05 | Ask the visitor to leave Prize open 70 s, then scan a screenshot of the old code | Amber "Code expired or not recognised — ask the visitor to show a fresh code" | 4.4 | |
| P-06 | Type the visitor's **passport number** and **8-character code** (both on their Prize page) | Same card; typing only the digits of the passport number ("42") also works | 4.4 | |
| P-06b | Passport number right, code wrong | Amber "Code expired or not recognised…" | 4.4 | |
| P-06c | Look a visitor up, wait 70 s, then Hand over → Confirm | Amber "That code has expired…" with a field for the new code under the card; enter it and press Hand over → Confirm again — succeeds without re-scanning | 4.4 | |
| P-07 | Visitor with no unlock | Card shows all tiers as "N pts short" | 4.4 | |
| P-08 | Admin sets **Voyager stock to 1** (A-54). Two desk devices confirm Voyager for two different visitors within the same second | One "Prize handed over", one "Out of stock" with the note; strip reads 0, never negative | 6.7, 12.15 | |
| P-09 | Admin **voids** that redemption on `/admin/prizes` (A-56) | Scanning the visitor again offers **Hand over** for Voyager once more; stock strip back to 1 | 6.7 | |
| P-10 | **Next visitor** | Card clears, camera resumes | 4.4 | |
| P-11 | A visitor's `/r/<code>` link opened by the desk's own camera app while signed in as Organizer A | Lands on `/redeem` with the lookup already done | 4.4 | |
| P-12 | Organizer B (booth-02, not a prize desk) presses **Prize desk** in the bar or opens `/redeem` | Amber card naming their booth and the real prize desk, **Open my booth screen**; the camera never starts | 3 | |
| P-13 | Desk device offline | Stock strip dot amber "Offline — figures may be old"; the camera and fields stay usable | 4.4 | |

## 5. Admin

| ID | Step | Expected | § | Result |
| --- | --- | --- | --- | --- |
| A-01 | `/admin` on a phone (375 px) | Nav scrolls sideways; **Sign out**, *Hall screen mode*, *Prize desk*, *My passport*, *My account* reachable | 6 | |
| A-02 | Sign out from the admin sidebar | Lands on `/` without a full page reload | 3 | |
| A-03 | Dashboard header | "Live · connected" and the counters' age; Day tabs default to today during the event, All otherwise | 6.1 | |
| A-04 | Switch Day tabs | Every panel re-scopes; the timeline shows only that day | 6.1 | |
| A-05 | Headline figures after a visitor scans | Stamps and Active-last-15-min update within 2 s without refresh; DevTools Network shows only the WebChannel, no polling | 12.6 | |
| A-06 | Booth leaderboard | Top booth gold with ★, three lowest amber "needs traffic", distinguishable without reading numbers | 6.1, 12.7 | |
| A-07 | On a **fresh event**, hover each **CSV** button | Disabled with the tooltip "Nothing to export yet" | 6.1 | |
| A-08 | After some scans, press **CSV** on every panel (leaderboard, timeline, participation, countries, institutions, cross-school, prize stock) | A `.csv` downloads each time; opens in Excel with Thai names intact | 6.1 | |
| A-09 | Rename a booth to `Design, "Art" & Media`, export the leaderboard | Excel shows the name in **one** cell, quotes intact | 6.1 | |
| A-10 | Ethnic-groups panel with fewer than 20 consenting visitors | Panel hidden, shows the count so far, no CSV button | 4.1 | |
| A-11 | With 20+ consenting | Groups under 5 folded into Other; CSV asks for confirmation before downloading | 4.1 | |
| A-12 | **Print / PDF** | New tab `/admin/print?day=…`; Chrome *Save as PDF* produces an A4 page with figures, leaderboard, a rendered timeline chart, countries, funnel, stock; no sidebar or buttons on the paper | 6.1 | |
| A-13 | `/admin/event`: edit the live event's Thai name, Save | Saved; landing page unaffected except the name | 7.1 | |
| A-14 | Create a draft event, then **Delete draft** | Gone from the list; *Delete draft* is absent on the live and archived cards | 7.1 | |
| A-15 | Try **Go live** on a draft with no booths | Refused with "Add at least one active booth" | 7.1 | |
| A-16 | `/admin/booths` → **New booth**, zone Far | Points default to the far value; Order field says "next free" | 6.3, 6.6 | |
| A-17 | Set **Order** 1 on the last booth | It moves to the top of the visitor Stamps grid | 6.3 | |
| A-18 | Upload a **Badge** (under 512 KB) | Stamp preview updates; the amber "still use the generated stamp" count drops by one | 2.5 | |
| A-19 | Upload a badge over 512 KB, or a photo over 2 MB | Refused with the size message | 2.5 | |
| A-20 | Upload a **Photo** | A thumbnail appears on the card; *Replace photo* and *Remove photo* offered | 6.3 | |
| A-21 | **Remove badge** | Card falls back to the generated stamp; `badgeUrl` cleared | 6.3 | |
| A-22 | Untick a booth's **Day 2** | Visitor Stamps grid labels it "appears on day 1, 3" | 1.1 | |
| A-23 | **Rotate secret** on a booth whose screen is open | Confirm dialog; the booth screen shows new codes when its tab is refocused (or within 15 min), no reload; a photo of the old code is refused | 5.2 | |
| A-24 | **Delete** a booth with stamps | "Booth has stamps — deactivated instead"; it greys out; scanning it says invalid | 6.3 | |
| A-25 | **Delete** a booth with no stamps | Removed outright | 6.3 | |
| A-26 | `/admin/users` → invite one organizer | Amber "Email is not configured" and a link row with **Copy** | 6.4 | |
| A-27 | Press **Copy** | Button reads **Copied** for two seconds; pasted text is the link | 6.4 | |
| A-28 | Same on an `http://` address (insecure) | Button reads *Select and copy* and the link text is selected | 6.4 | |
| A-29 | Bulk paste three `name, email, boothId` lines | Three rows appear in the invitations table as *sent* | 6.4 | |
| A-30 | **Revoke** one | Green "Invitation to … revoked"; status pill turns *revoked* | 6.4 | |
| A-31 | **Resend** one | New link in the copy row; old link invalid (O-06) | 6.4 | |
| A-32 | Open **Create a user at the desk**, role Visitor, email + password (10+ chars) | Green "… created — passport MFU-GG-…"; the drawer opens on them | 6.2 | |
| A-33 | Sign in as that visitor on another device | Straight to `/passport` with the passport number; no verify-email detour | 6.2 | |
| A-34 | Create a user with a contact that already exists | Refused: "already has an account" | 6.2 | |
| A-35 | Create an organizer without a booth | Button stays disabled | 6.2 | |
| A-36 | Create an organizer with booth and password; sign in as them | `/booth` opens on that booth | 6.2 | |
| A-37 | Users search: type two letters of a name beyond the first 50 | "Searching all N users"; the row is found | 6.2 | |
| A-38 | Role filter → Organizers | Only organizers, with their booth | 6.2 | |
| A-39 | Click a visitor → drawer | Name, passport, contact, type, institution, country, points, days, last seen; **Route walked** with times and points; "Ethnic group is never shown per person" | 6.2, 4.1 | |
| A-40 | **Edit details** → change institution and country → Save | Green toast "… updated" bottom-right, visible over the drawer; row and drawer show the new values live; Audit shows `updateUser` with only the changed keys | 6.2 | |
| A-41 | Edit a visitor's contact to a new email | They can sign in with the new address (sign-in address moved) | 6.2 | |
| A-42 | Edit to an email another account uses | Refused | 6.2 | |
| A-43 | Drawer → role **admin** → Apply | Confirmation dialog first; green notice mentioning 15 minutes | 6.2 | |
| A-44 | Drawer → role organizer, pick a booth → Apply | Their booth screen follows (O-18) | 6.2, 12.8 | |
| A-45 | **Delete (soft)** | Confirm; row greys, name "Deleted visitor"; they cannot sign in; stamps still count | 6.2 | |
| A-46 | **Erase permanently (PDPA)** | Button disabled until the passport number is typed exactly; then the user vanishes from the list and Firestore has no user, scans or unlocks for them | 10 | |
| A-47 | After V-37, open `/admin/users` | Red-bordered **Erasure requests** box at the top with name, passport, contact, time | 10 | |
| A-48 | **Erase now** (typed confirmation) | Row disappears; the visitor is gone; Audit shows `hardDeleteUser` | 10 | |
| A-49 | **Dismiss** without a reason | Button disabled; with a reason it closes the request and Audit shows `dismissErasureRequest` | 10 | |
| A-50 | `/admin/prizes`: open in two tabs, save in tab 1 | Tab 2 (untouched) re-loads the rows; if tab 2 had an edit it shows the amber "changed while you were editing" with *Discard my edits* | 6.5 | |
| A-51 | Set a threshold above the points on the floor | Refused with the available total; within 10 of it the field turns amber | 6.6 | |
| A-52 | **Preview effect** after lowering Globetrotter to 140 | "unlocks for N visitors" under the tier; nothing changes until Save | 6.7 | |
| A-53 | Save → V-27 / V-28 | Lowering unlocks now; raising back revokes nothing | 6.7, 12.9 | |
| A-54 | **Apply adjustment**: Voyager, correction, −N to leave 1, with a reason | Stock shows 1; the ledger lists the row with reason | 6.7 | |
| A-55 | Adjust below zero | Refused | 6.7 | |
| A-56 | **Void redemption** with visitor UID, tier, reason | Stock +1; P-09 | 6.7 | |
| A-57 | `/admin/draw`, Winners 1, **Draw** | 2 s suspense, then the winner's name and passport number; listed under Previous draws; a second draw excludes them | 6.7 | |
| A-58 | `/admin/refdata`: add an institution, Save | The `/join` combobox offers it without a deploy | 4.1 | |
| A-59 | Ethnic groups tab: add a country by ISO code, paste a list, Save | `/join` suggests them for that country | 4.1 | |
| A-60 | `/admin/audit` | Actor column shows names, not uids; filter by action narrows; search matches target ids; **Load 200 more** appears past 200 rows; CSV asks for confirmation | 12.10 | |
| A-61 | After the walk-through, search Audit for every action you performed | One row each, with actor and time | 12.10 | |
| A-62 | `/admin/event` → Danger zone (staging only) | Type the name exactly; log lists each step as cleared; a stuck step reads "incomplete, N still to clear" and no green success | 7.1 | |
| A-63 | `/admin` before the event starts | **Ready for the event?** panel with five lines: active booths, prize policy, every booth has an organizer, your account can sign in elsewhere, invitation email; each links to its page; *Hide* appears once the hard items pass | 6 | |
| A-64 | `/admin/event` | One card for the current event; drafts, Go live and the archive are folded under **After the event**; *New draft event* switches the card and offers *back to the current event* | 7.1 | |
| A-65 | `/admin/booths` header and cards | Header names the event; every card ends with its organizer (green), a pending invite with *Resend* (amber) or *Invite organizer*; sending shows the copyable link on the card | 6.3, 6.4 | |
| A-66 | `/admin/booths` after going live with a second event (staging only) | Booths from the earlier event sit under **From a previous event** with *Keep for this event* and *Delete*; Keep moves the booth up | 6.3 | |
| A-67 | `/admin/booths` → **Print all cards** | New tab with one table card per active booth; the print preview puts each on its own A4 page with the static QR and instructions | 5.1 | |
| A-68 | Admin sidebar on a laptop | Three titled groups: Run (Dashboard, Hall screen, Prize desk, Stage draw), Set up (Event, Booths, Prizes & stock, Users & invites), Records (Audit log, Reference lists); on a phone the same items scroll in one row | 6 | |
| A-69 | `/admin/booths` → **Bulk: paste a list of booths** with three lines, one with zone `back` | The bad line is named and the button stays disabled; fix it, press Create 3 booths, watch the progress text; three new cards appear with zone default points | 6.3 | |
| A-70 | Any admin action (save, rotate, invite, role change) | The result appears as a toast at the bottom-right and fades after a few seconds; red ones stay until closed; on the Users page it shows over the open drawer | 6 | |
| A-71 | `/admin/booths` → **Edit** on the last card | The page scrolls to the editor, headed "Edit · <booth name>"; a stamp preview beside the accent swatches follows the short name and colour as you type | 6.3 | |
| A-72 | Booth card → **More ▾** | Menu with Upload/Replace badge, Upload/Replace photo, Remove …, then Rotate secret… and Delete booth… in colour below a divider; uploading on one card leaves the other cards' buttons enabled | 6.3 | |
| A-73 | `/admin/booths` with 9+ booths | A filter box and "Without an organizer only" appear above the grid | 6.3 | |
| A-74 | `/admin/users` → press Tab to a row, then Enter | The drawer opens; **Escape** closes it and focus returns to the row; the drawer shows the user's **ID** with a Copy button | 6.2 | |
| A-75 | Drawer of a visitor who collected a prize → **Void** → reason | Toast "… voided … back in stock"; the Prizes page stock rises by one | 6.7 | |
| A-76 | `/admin/prizes` → clear a threshold field | Red hint under the row, **Save** disabled — it can no longer save a threshold of 0; the same for QR period and zone points on `/admin/event` and the winners count on `/admin/draw` | 6.5 | |
| A-77 | `/admin/prizes` → change anything, then close the tab | The browser asks before closing; **Discard changes** restores the saved policy | 6.5 | |
| A-78 | `/admin/refdata` → edit a list, click another tab | Asked to confirm before the draft is discarded | 4.1 | |
| A-79 | Users → role and type columns; Booths → zone on cards | Labels read Visitor / Booth organizer / Admin, Student / Staff …, Entrance row / Middle hall / Far corner — no raw values, no spec section numbers anywhere in the admin | 6 | |
| A-80 | Any page: hover every clickable thing, then press Tab through a card | Every button and action link has a visible shape that changes on hover and presses in; a blue (on paper) or gold (on navy) focus ring appears when tabbed to; disabled buttons are dimmed with a not-allowed cursor; links inside sentences stay underlined but brighten on hover | 2.6 | |

## 6. Hall wall

| ID | Step | Expected | § | Result |
| --- | --- | --- | --- | --- |
| W-01 | `/admin/wall` on the projector | Dark navy, oversized figures, leaderboard | 6.1 | |
| W-02 | Leave it 30 s | Alternates leaderboard ↔ 5-minute timeline every 15 s | 6.1 | |
| W-03 | Press **Full screen** (or F) | Goes full screen; the button disappears; the footer reads "Esc leaves full screen" | 6.1 | |
| W-04 | Block full screen in the browser and press F | Footer hint tells you to press F11; nothing crashes | 6.1 | |
| W-05 | A visitor scans a booth | Stamps figure and that booth's bar move within 2 s | 12.6 | |
| W-06 | Footer **admin** link | Back to `/admin` without typing a URL | 6.1 | |

---

## 7. Spec §12 acceptance criteria → rows

| § | Criterion | Rows | How judged |
| --- | --- | --- | --- |
| 12.1 | Register in under 60 s on a mid-range Android over 4G | V-11 | manual, timed |
| 12.2 | Stamp animation within 2 s | V-16 | manual |
| 12.3 | A photographed QR fails after 40 s | V-20 | manual |
| 12.4 | Second scan of the same booth → already, no duplicate | V-18; e2e | both |
| 12.5 | Booth screen valid 60 s offline | O-10 | manual |
| 12.6 | Dashboard and booth screen reflect a scan within 2 s, no polling | A-05, O-12, W-05 | manual |
| 12.7 | Top booth and three lowest visibly distinct | A-06 | manual |
| 12.8 | Role change effective within 15 min | A-44, O-18; e2e | both |
| 12.9 | Raising a threshold revokes nothing | A-53, V-28; e2e | both |
| 12.10 | Every admin mutation audited | A-60, A-61; e2e | both |
| 12.11 | WCAG 2.1 AA and 320 px | V-42 | manual |
| 12.12 | 1,500 visitors, p95 scan under 800 ms | not in this UAT | load test later |
| 12.13 | Rules: no cross-visitor reads, no secrets, no direct writes | e2e | automated |
| 12.14 | Day-2 return sees day-1 stamps | V-40 | manual |
| 12.15 | Two desks, last item → one success | P-08; e2e | both |
| 12.16 | Registration under 90 s; declined ethnicity never re-asked | V-11, V-09 | manual |
| 12.17 | Invited organizer reaches the booth; second use fails | O-03, O-04; e2e | both |

---

## 8. Known gaps — do not re-report

Fixed on 8 Sep 2026 (verify the fix, then move on): no organizer navigation or sign-out; booth
screen dying on an offline reload and never noticing a rotated secret; prize desk reachable only
by URL, open to non-prize-desk booths, one-tap hand-over, and a manual code the visitor could not
read out; stats spinning forever without a booth. Also: CSV buttons doing nothing on empty panels;
missing CSV on four dashboard panels; no PDF; Revoke and Copy giving no feedback; no Create /
Edit user; no hard delete or erasure inbox; erasure requests always "succeeding"; Forgot-password
resend only reopening the form; full-page reload on "Scan another"; wall click-to-fullscreen;
admin sign-out hidden on phones; prize editor ignoring another admin's save; no photo / image
removal / order on booths; booth stats hardcoded to 09–16; audit log with no filter or names;
drafts that could not be deleted; a voided prize showing as locked at the desk; `refreshRanks`
not audited; admin-created accounts stuck at verify-email; listener failures rendering as empty
lists.

Still open by design or deferred:

| # | Where | Behaviour | Status |
| --- | --- | --- | --- |
| G-1 | Firestore rules | An admin reading a user document can technically see `ethnicGroup`; the UI never renders it per person. Rules cannot restrict single fields; a sub-document would be needed (spec §10 wording is stronger than what is built) | documented deviation |
| G-2 | Hard delete | Removing a visitor decrements the visitor counters via `onUserWrite`; spec §10 says counters stay intact | accepted |
| G-3 | Ranks | Recomputed every 1 min (Cloud Scheduler floor), spec says 30 s | accepted |
| G-4 | App Check | Not enforced yet; turn on reCAPTCHA Enterprise before the real event | before event |
| G-5 | Email | Invites are copyable links until the EmailJS private key is set; account mails come from `noreply@mfu-passport.firebaseapp.com` and may be filtered by university mail | before event |
| G-6 | Invite via email + password | Shows a password field, unlike spec §12.17's "no password field" (accounts replaced anonymous sign-in) | accepted |
| G-7 | PWA / share | No manifest, service worker, or share sheet; "Add to Home Screen" is browser default only | not planned for v1 |
| G-8 | Images | No Resize Images extension; the uploaded badge is used at its uploaded size (client cap 512 KB) | accepted |
| G-9 | Cloud Functions runtime | Node 20 is decommissioned on 30 Oct 2026; bump to 22 after the event | after event |

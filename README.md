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
| `demo/index.html` | Clickable prototype — open it in a browser, no build step |

## The prototype

`demo/index.html` is a single self-contained file with mock data and no backend. Open it directly,
or serve the folder:

```bash
cd demo && python -m http.server 8000   # then open http://localhost:8000
```

Use the role switcher in the top bar:

- **Visitor** — passport cover, stamp grid, prize page, registration form, and a scanner with three
  simulated outcomes (new stamp, already stamped, expired code).
- **Organizer** — the booth screen, with a QR that genuinely rotates every 20 seconds.
- **Admin** — live dashboard, user and invitation tables, booth artwork, prize policy and stock.

## The three roles

- **Visitor** — registers in under a minute, scans booths, redeems prizes.
- **Organizer** — runs one booth's screen; it operates itself all day.
- **Admin** — live statistics, user CRUD and roles, booth CRUD, prize policy.

## Planned stack

Firebase throughout: Cloud Firestore, Firebase Hosting (`mfupassport.web.app`), Cloud Functions v2,
Firebase Auth with custom claims, Cloud Storage for booth artwork. Client is a Vite + React SPA.
See `spec/spec.md` §9 for the reasoning.

## Two things to know before building

- **Booth QR codes rotate** on a TOTP-shaped HMAC with a 20-second period, computed client-side from
  a booth secret, so a photographed code sent to a friend is dead on arrival. Booth secrets live in a
  collection that security rules deny to every client.
- **Ethnic group is sensitive data** under Thailand's PDPA (s.26). It is optional, gated behind its
  own separate consent, never shown in any per-person view, and suppressed in aggregate below 5
  people. See `spec/spec.md` §4.1 and §10.

Open questions are listed at the end of `spec/spec.md`.

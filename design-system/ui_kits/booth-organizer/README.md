# UI kit — Organizer

The booth organizer's three screens, on the festival theme. Structure from
`MFU-Event-Planning/src/pages/organizer/*`.

| Screen | Structure from |
|---|---|
| Booth code screen | `organizer/Booth.tsx` + `components/QR.tsx` |
| Booth statistics | `organizer/BoothStats.tsx` |
| Prize desk | `organizer/Redeem.tsx`, `RedeemLanding.tsx` |

The code screen is a kiosk: it runs all day with nothing to press. The code rotates on a
20-second period and the countdown traces the frame's border. Its ground is
`--app-chrome` (green-900) with the paper-cut campus behind it, so a hall full of booth
screens reads as part of the festival set. Body text never goes below 24px — the screen must be
legible at three metres.

The QR image is a placeholder block; this is a visual recreation, not a working scanner.

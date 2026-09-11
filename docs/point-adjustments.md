# Booth point adjustments

Open **Admin → Booths → Balance booth visits**. Exclude closed or special booths, select **Suggest point adjustments**, review the table, then **Apply reviewed points**. Nothing is applied when generating a preview.

The comparison uses unique successful booth scans from a 30-minute window ending on the latest completed five-minute boundary. Only active activity booths in the current event and scheduled for today (Bangkok time) participate. Excluded booths do not affect the average.

At least three eligible booths and five scans per eligible booth on average are required. Below 75% of average scans earns 125% of base points; above 125% earns 75%; the middle band earns base points. Results round to whole points within 1–100. The calculation always starts from base points, so adjustments never compound.

Previews expire after five minutes and become invalid when relevant settings change. Applied rewards expire after 30 minutes; another application is allowed after 15 minutes. **Reset to base points** is immediate, invalidates pending previews, and preserves the application cooldown. Manual changes to base points, exclusion, deactivation, day changes, and conversion to a prize desk clear a booth's temporary reward.

Visitors earn the server-calculated reward when their scan is recorded. Their existing scan awards, totals, and prize unlocks are not recalculated. Temporary rewards and their expiry are shown on the live booth and passport screens. Printed booth cards display base points and direct visitors to the live screen.

## Implementation

- `BoothDoc.points` remains the base value. Optional `temporaryPoints`, `pointsExpireAt` (epoch milliseconds), and `adjustmentExcluded` fields require no migration. Expiry is evaluated when reading/awarding points, without a scheduled cleanup.
- Admin-only callables: `previewPointAdjustments({})`, `applyPointAdjustments({ previewId })`, and `resetPointAdjustments({})`. Reviewed proposals live in `pointAdjustmentPreviews`; event cooldown and revision live in `pointAdjustmentState`. Both collections are server-only under the existing deny-by-default rules. Changes are recorded atomically in `auditLog`.
- Preview counts use the existing `eventId` + descending `scannedAt` index. No new index or scheduler is required. An application supports up to 400 event booths so the changes and audit record fit one transaction.
- Prize warnings compare thresholds with the proposed total across today's active activity booths. This is not a prediction of individual eligibility. Prize-policy validation continues to use base points.

## Verification and release

Run `npm run test:points`, `npm run test:points:emulator`, and `npm run build`. The emulator tests require Java and Firebase CLI and start a disposable `demo-point-adjustments` Firestore project; they do not use production data. They exercise real callable handlers, scan transactions, and scan-trigger award propagation, with synthetic authentication contexts.

Deploy the backend functions and frontend together through the existing Firebase workflow after review. No data backfill is required. Start by reviewing suggestions during the event; use the audit log and booth scan counts to assess whether the 25% adjustment and sample minimum need tuning. Scans measure participation, not current queue length or booth capacity.

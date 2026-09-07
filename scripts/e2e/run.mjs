/**
 * End-to-end run against the local emulators (`npm run e2e` resets and reseeds first).
 *
 * The steps share one context and must run in this order: the visitor's scans depend on the
 * seeded booths, the organizer steps on the invitation sent during setup, the lifecycle step on
 * the running tally of stamps, visitors and redemptions that the earlier steps keep.
 */
import { report } from './lib.mjs'

const ctx = {
  secrets: {},                                  // boothId -> secret (read as owner)
  tokens: {},                                   // actor -> emulator ID token, for rawCall
  tally: { visitors: 0, stamps: 0, redeemed: 0 }, // what the archive must report at the end
}

const STEPS = ['./10-admin-setup.mjs', './20-visitor.mjs', './30-organizer.mjs', './40-lifecycle.mjs']

try {
  for (const s of STEPS) {
    const step = await import(s)
    await step.default(ctx)
  }
  report()
} catch (e) {
  console.error('\nFATAL', e)
  process.exit(1)
}

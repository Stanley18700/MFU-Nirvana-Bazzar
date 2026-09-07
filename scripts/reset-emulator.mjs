/**
 * Wipe the emulator and reseed, so `npm run e2e` starts from a known state.
 *
 * The wipe is done twice on purpose: deleting the user documents fires `onUserWrite`, whose
 * decrements land a moment later and recreate `stats/event/shards` at negative values.
 */
const HOST_FS = '127.0.0.1:8080'
const HOST_AUTH = '127.0.0.1:9099'
const PROJECT = process.env.GCLOUD_PROJECT ?? 'mfu-passport'

const wipeFirestore = () => fetch(
  `http://${HOST_FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  { method: 'DELETE' },
)
const wipeAuth = () => fetch(
  `http://${HOST_AUTH}/emulator/v1/projects/${PROJECT}/accounts`,
  { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await wipeFirestore()
await wipeAuth()
await sleep(8000)
await wipeFirestore()
await sleep(2000)
console.log('Emulator reset. Run `npm run seed:emulator` next.')

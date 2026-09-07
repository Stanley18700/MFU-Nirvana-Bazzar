import { setGlobalOptions } from 'firebase-functions/v2'
import { REGION } from './lib'

// §9 — everything pinned to Singapore; caps so a runaway loop cannot run up the bill.
setGlobalOptions({ region: REGION, maxInstances: 20, concurrency: 40, cpu: 1, memory: '512MiB', timeoutSeconds: 30 })

export { join, scan, redemptionCode, requestRestore, requestErasure } from './visitor'
export { boothSession, lookupRedemption, confirmRedemption, voidRedemption } from './organizer'
export {
  setUserRole, createUser, updateUser, deleteUser,
  createBooth, updateBooth, deleteBooth, rotateBoothSecret,
  savePrizePolicy, adjustStock, runDraw,
  inviteOrganizer, resendInvite, revokeInvite, inviteInfo, acceptInvite,
  refreshRanks, bootstrapAdmin,
} from './admin'
export { onScanCreate, onUserWrite, rankBooths, sweepActive, purgePersonalData } from './triggers'

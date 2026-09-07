import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, browserLocalPersistence, setPersistence, GoogleAuthProvider } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

/**
 * Config comes from Vite env (.env.local — see SETUP.md). Paste the firebaseConfig
 * object from the Firebase console into VITE_FIREBASE_* variables.
 */
const env = import.meta.env
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string) || 'mfu-passport',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: env.VITE_FIREBASE_APP_ID as string,
}

export const USE_EMULATOR = env.VITE_USE_EMULATOR === 'true' || (!env.VITE_FIREBASE_API_KEY && env.DEV)
export const REGION = 'asia-southeast1'
export const APP_ORIGIN = (env.VITE_APP_ORIGIN as string | undefined) || window.location.origin

export const app = initializeApp(USE_EMULATOR && !firebaseConfig.apiKey ? { ...firebaseConfig, apiKey: 'demo-key', authDomain: 'localhost' } : firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  // §8.3 — the SDK cache keeps the passport readable through a network blip.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const functions = getFunctions(app, REGION)
export const storage = getStorage(app)

/**
 * Google is the one social provider (Anonymous is off — see SETUP.md). `select_account`
 * matters at a shared booth laptop: without it the browser silently reuses the last account.
 */
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

if (USE_EMULATOR) {
  const host = window.location.hostname || '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(functions, host, 5001)
  connectStorageEmulator(storage, host, 9199)
}

void setPersistence(auth, browserLocalPersistence)

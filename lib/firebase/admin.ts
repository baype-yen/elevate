import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

let _app: App | null = null
let _auth: Auth | null = null
let _db: Firestore | null = null

function getAdminApp(): App {
  if (_app) return _app
  if (getApps().length) {
    _app = getApps()[0]
    return _app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin SDK non configuré. Définissez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.",
    )
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
  return _app
}

export const adminApp = new Proxy({} as App, {
  get(_, prop) {
    return (getAdminApp() as any)[prop]
  },
})

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_auth) _auth = getAuth(getAdminApp())
    return (_auth as any)[prop]
  },
})

export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!_db) _db = getFirestore(getAdminApp())
    return (_db as any)[prop]
  },
})

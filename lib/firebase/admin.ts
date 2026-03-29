import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { existsSync, readFileSync } from "node:fs"

let _app: App | null = null
let _auth: Auth | null = null
let _db: Firestore | null = null

type AdminServiceAccount = {
  projectId: string
  clientEmail: string
  privateKey: string
}

function normalizeServiceAccount(input: {
  projectId: unknown
  clientEmail: unknown
  privateKey: unknown
}): AdminServiceAccount | null {
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : ""
  const clientEmail = typeof input.clientEmail === "string" ? input.clientEmail.trim() : ""
  const privateKey = typeof input.privateKey === "string" ? input.privateKey.replace(/\\n/g, "\n") : ""

  if (!projectId || !clientEmail || !privateKey) return null

  return {
    projectId,
    clientEmail,
    privateKey,
  }
}

function parseServiceAccountJson(raw: string): AdminServiceAccount | null {
  if (!raw.trim()) return null

  try {
    const parsed = JSON.parse(raw) as {
      project_id?: unknown
      client_email?: unknown
      private_key?: unknown
      projectId?: unknown
      clientEmail?: unknown
      privateKey?: unknown
    }

    return normalizeServiceAccount({
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: parsed.private_key ?? parsed.privateKey,
    })
  } catch {
    return null
  }
}

function parseServiceAccountFromEnvValue(raw: string): AdminServiceAccount | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("{")) {
    return parseServiceAccountJson(trimmed)
  }

  if (!existsSync(trimmed)) return null

  try {
    const fromFile = readFileSync(trimmed, "utf8")
    return parseServiceAccountJson(fromFile)
  } catch {
    return null
  }
}

function resolveServiceAccountFromEnv(): AdminServiceAccount | null {
  const direct = normalizeServiceAccount({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  })

  if (direct) return direct

  const jsonCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    process.env.GCP_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ]

  for (const candidate of jsonCandidates) {
    if (!candidate) continue
    const parsed = parseServiceAccountFromEnvValue(candidate)
    if (parsed) return parsed
  }

  return null
}

function getAdminApp(): App {
  if (_app) return _app
  if (getApps().length) {
    _app = getApps()[0]
    return _app
  }

  const serviceAccount = resolveServiceAccountFromEnv()

  if (serviceAccount) {
    _app = initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      }),
    })
    return _app
  }

  const fallbackProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

  _app = initializeApp({
    credential: applicationDefault(),
    ...(fallbackProjectId ? { projectId: fallbackProjectId } : {}),
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

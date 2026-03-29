import { adminAuth } from "@/lib/firebase/admin"

type RequestAuthFailureReason = "missing_token" | "invalid_token" | "server"

export type RequestAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 500; error: string; reason: RequestAuthFailureReason }

const INVALID_TOKEN_CODES = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/invalid-session-cookie",
  "auth/session-cookie-expired",
  "auth/user-disabled",
  "auth/user-not-found",
])

function normalizeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return ""
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : ""
}

function normalizeErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return ""
  const message = (error as { message?: unknown }).message
  return typeof message === "string" ? message : ""
}

export function normalizeServerErrorMessage(error: unknown, fallback: string) {
  const message = normalizeErrorMessage(error)
  const lower = message.toLowerCase()

  if (
    lower.includes("could not load the default credentials")
    || lower.includes("default credentials")
    || lower.includes("firebase admin sdk non configur")
    || lower.includes("credential implementation provided")
  ) {
    return "Configuration Firebase Admin manquante côté serveur. Ajoutez FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY ou FIREBASE_SERVICE_ACCOUNT_JSON (ou GOOGLE_APPLICATION_CREDENTIALS), puis redéployez."
  }

  return message || fallback
}

function parseVerificationFailure(error: unknown): Extract<RequestAuthResult, { ok: false }> {
  const code = normalizeErrorCode(error)
  const message = normalizeErrorMessage(error).toLowerCase()

  if (INVALID_TOKEN_CODES.has(code)) {
    return {
      ok: false,
      status: 401,
      error: "Session invalide. Reconnectez-vous.",
      reason: "invalid_token",
    }
  }

  if (
    message.includes("id token")
    || message.includes("token expired")
    || message.includes("token has been revoked")
    || message.includes("jwt")
  ) {
    return {
      ok: false,
      status: 401,
      error: "Session invalide. Reconnectez-vous.",
      reason: "invalid_token",
    }
  }

  return {
    ok: false,
    status: 500,
    error: "Service d'authentification indisponible. Réessayez dans quelques instants.",
    reason: "server",
  }
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return ""
  return authorization.slice(7).trim()
}

export async function verifyRequestBearerToken(request: Request): Promise<RequestAuthResult> {
  const idToken = extractBearerToken(request)
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: "Session invalide. Reconnectez-vous.",
      reason: "missing_token",
    }
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    if (!decoded.uid) {
      return {
        ok: false,
        status: 401,
        error: "Session invalide. Reconnectez-vous.",
        reason: "invalid_token",
      }
    }

    return { ok: true, uid: decoded.uid }
  } catch (error: unknown) {
    return parseVerificationFailure(error)
  }
}

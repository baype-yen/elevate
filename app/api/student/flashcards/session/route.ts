import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase/admin"
import {
  ensureAdaptiveDeck,
  getOrCreateAdaptiveProgress,
  listAdaptiveLearningCards,
  toPublicLevels,
} from "@/lib/flashcards/adaptive-service"

async function getCallerUid(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null

  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7))
    return decoded.uid
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 })
  }

  try {
    const progress = await getOrCreateAdaptiveProgress(callerUid)
    const existingCards = await listAdaptiveLearningCards(callerUid, 60)

    const deck = await ensureAdaptiveDeck({
      studentId: callerUid,
      schoolId: progress.schoolId,
      progress,
      existingCards,
    })

    return NextResponse.json({
      cards: deck.slice(0, 24),
      progress: {
        levels: toPublicLevels(progress.levels),
        streaks: progress.streaks,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Impossible de charger le deck adaptatif." },
      { status: 500 },
    )
  }
}

import { NextResponse } from "next/server"
import { normalizeServerErrorMessage, verifyRequestBearerToken } from "@/lib/firebase/request-auth"
import {
  ensureAdaptiveDeck,
  getOrCreateAdaptiveProgress,
  listAdaptiveLearningCards,
  toPublicLevels,
} from "@/lib/flashcards/adaptive-service"

export async function POST(request: Request) {
  const authResult = await verifyRequestBearerToken(request)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const callerUid = authResult.uid

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
      { error: normalizeServerErrorMessage(error, "Impossible de charger le deck adaptatif.") },
      { status: 500 },
    )
  }
}

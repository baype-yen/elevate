import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase/admin"
import {
  createAdaptiveCards,
  ensureAdaptiveDeck,
  getAdaptiveCardById,
  getOrCreateAdaptiveProgress,
  listAdaptiveLearningCards,
  markAdaptiveCardResult,
  normalizeOptionForCheck,
  saveAdaptiveProgress,
  toPublicLevels,
} from "@/lib/flashcards/adaptive-service"
import { levelUp } from "@/lib/flashcards/adaptive-schema"

type AnswerPayload = {
  card_id?: string
  selected_option?: string
}

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

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 })
  }

  let payload: AnswerPayload
  try {
    payload = (await request.json()) as AnswerPayload
  } catch {
    return badRequest("Charge utile invalide.")
  }

  const cardId = (payload.card_id || "").trim()
  const selectedOption = (payload.selected_option || "").trim()

  if (!cardId || !selectedOption) {
    return badRequest("card_id et selected_option sont obligatoires.")
  }

  try {
    const progress = await getOrCreateAdaptiveProgress(callerUid)
    const card = await getAdaptiveCardById(callerUid, cardId)

    if (!card) {
      return NextResponse.json({ error: "Flashcard introuvable." }, { status: 404 })
    }

    const selectedKey = normalizeOptionForCheck(selectedOption)
    const availableOptions = card.options.map((option) => normalizeOptionForCheck(option))
    if (!availableOptions.includes(selectedKey)) {
      return badRequest("Option invalide pour cette question.")
    }

    const correct = selectedKey === normalizeOptionForCheck(card.correctAnswer)

    await markAdaptiveCardResult({
      cardId,
      selectedOption,
      correct,
    })

    const previousLevel = progress.levels[card.category]
    const nextLevel = correct ? levelUp(previousLevel) : previousLevel

    if (correct) {
      progress.levels[card.category] = nextLevel
      progress.streaks[card.category] = (progress.streaks[card.category] || 0) + 1

      await createAdaptiveCards({
        studentId: callerUid,
        schoolId: progress.schoolId,
        category: card.category,
        level: nextLevel,
        count: 1,
        generationReason: "correct_upgrade",
        weakTopic: card.question,
      })
    } else {
      progress.streaks[card.category] = 0

      await createAdaptiveCards({
        studentId: callerUid,
        schoolId: progress.schoolId,
        category: card.category,
        level: previousLevel,
        count: 2,
        generationReason: "incorrect_remedial",
        weakTopic: card.question,
        wrongOption: selectedOption,
      })
    }

    await saveAdaptiveProgress(progress)

    const cards = await listAdaptiveLearningCards(callerUid, 60)
    const deck = await ensureAdaptiveDeck({
      studentId: callerUid,
      schoolId: progress.schoolId,
      progress,
      existingCards: cards,
    })

    return NextResponse.json({
      result: {
        correct,
        category: card.category,
        selectedOption,
        correctAnswer: card.correctAnswer,
        explanation: card.explanation,
        previousLevel: previousLevel.toUpperCase(),
        nextLevel: nextLevel.toUpperCase(),
      },
      cards: deck.slice(0, 24),
      progress: {
        levels: toPublicLevels(progress.levels),
        streaks: progress.streaks,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Impossible de corriger la reponse." },
      { status: 500 },
    )
  }
}

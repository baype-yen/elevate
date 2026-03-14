"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import type { Flashcard } from "@/lib/flashcards/schema"

type FlashcardRow = Flashcard & { assignmentTitle?: string }

export default function FlashcardsPage() {
  const { context, loading } = useAppContext()
  const [cards, setCards] = useState<FlashcardRow[]>([])
  const [filter, setFilter] = useState<"learning" | "known">("learning")
  const [loadingCards, setLoadingCards] = useState(true)

  // Review mode state
  const [reviewing, setReviewing] = useState(false)
  const [reviewCards, setReviewCards] = useState<FlashcardRow[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [studentAnswer, setStudentAnswer] = useState("")
  const [reviewResults, setReviewResults] = useState<{ known: number; learning: number }>({ known: 0, learning: 0 })
  const [reviewDone, setReviewDone] = useState(false)

  useEffect(() => {
    if (!context) return
    loadCards()
  }, [context, filter])

  const loadCards = async () => {
    if (!context) return
    setLoadingCards(true)
    try {
      const q = query(
        collection(db, "flashcards"),
        where("student_id", "==", context.userId),
        where("status", "==", filter),
        orderBy("created_at", "desc"),
      )
      const snap = await getDocs(q)
      const rows: FlashcardRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FlashcardRow))

      // Fetch assignment titles for context
      const assignmentIds = [...new Set(rows.map((r) => r.assignment_id).filter(Boolean))]
      const titleMap: Record<string, string> = {}
      for (const aid of assignmentIds) {
        try {
          const aSnap = await getDoc(doc(db, "assignments", aid))
          if (aSnap.exists()) titleMap[aid] = aSnap.data().title || "Devoir"
        } catch { /* ignore */ }
      }
      for (const row of rows) {
        row.assignmentTitle = titleMap[row.assignment_id] || "Devoir"
      }

      setCards(rows)
    } finally {
      setLoadingCards(false)
    }
  }

  const startReview = () => {
    if (!cards.length) return
    setReviewCards(cards)
    setReviewIndex(0)
    setRevealed(false)
    setStudentAnswer("")
    setReviewResults({ known: 0, learning: 0 })
    setReviewDone(false)
    setReviewing(true)
  }

  const handleAssessment = async (status: "learning" | "known") => {
    const card = reviewCards[reviewIndex]
    const now = new Date().toISOString()

    // Update Firestore
    await updateDoc(doc(db, "flashcards", card.id), {
      status,
      reviewed_at: now,
    })

    // Update local state
    setReviewResults((prev) => ({
      known: prev.known + (status === "known" ? 1 : 0),
      learning: prev.learning + (status === "learning" ? 1 : 0),
    }))

    // Advance or finish
    if (reviewIndex + 1 < reviewCards.length) {
      setReviewIndex(reviewIndex + 1)
      setRevealed(false)
      setStudentAnswer("")
    } else {
      setReviewDone(true)
    }
  }

  const exitReview = () => {
    setReviewing(false)
    setFilter("learning")
    loadCards()
  }

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      grammar: "Grammaire",
      vocabulary: "Vocabulaire",
      syntax: "Syntaxe",
      structure: "Structure",
    }
    return labels[cat] || cat
  }

  if (loading || !context) {
    return <div className="font-sans text-sm text-text-mid">Chargement...</div>
  }

  // Review mode — full-screen card review
  if (reviewing) {
    if (reviewDone) {
      return (
        <div className="max-w-lg mx-auto py-12 text-center">
          <div className="text-4xl mb-4">&#127881;</div>
          <h2 className="font-serif text-2xl font-bold text-navy mb-4">Révision terminée !</h2>
          <div className="flex justify-center gap-6 mb-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{reviewResults.known}</div>
              <div className="font-sans text-sm text-text-mid">Maîtrisées</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{reviewResults.learning}</div>
              <div className="font-sans text-sm text-text-mid">À revoir</div>
            </div>
          </div>
          <ElevateButton variant="primary" onClick={exitReview}>
            Retour aux flashcards
          </ElevateButton>
        </div>
      )
    }

    const currentCard = reviewCards[reviewIndex]
    return (
      <div className="max-w-lg mx-auto py-6">
        {/* Progress */}
        <div className="flex justify-between items-center mb-3">
          <span className="font-sans text-sm text-text-mid">{reviewIndex + 1} / {reviewCards.length}</span>
          <span className="font-sans text-sm text-text-mid">{categoryLabel(currentCard.category)}</span>
        </div>
        <div className="h-1 bg-gray-200 rounded-full mb-6">
          <div
            className="h-1 bg-navy rounded-full transition-all"
            style={{ width: `${((reviewIndex + 1) / reviewCards.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Front */}
          <div className={cn("p-8 text-center", revealed && "border-b border-dashed border-gray-200")}>
            <div className="uppercase text-xs tracking-widest text-text-light mb-3">
              {currentCard.card_type === "fill_in_blank" ? "Complétez" : currentCard.card_type === "explanation" ? "Question" : "Corrigez"}
            </div>
            <div className="font-sans text-lg font-medium text-navy">{currentCard.front}</div>
            {currentCard.hint && (
              <div className="font-sans text-sm text-text-mid mt-2">Indice : {currentCard.hint}</div>
            )}
          </div>

          {/* Student answer input */}
          {!revealed && (
            <div className="px-8 pb-6 pt-4">
              <textarea
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                placeholder="Écris ta correction ici..."
                className="w-full min-h-[80px] rounded-lg border-2 border-gray-200 px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setRevealed(true)}
                  className="flex-1 bg-navy text-white border-none py-2.5 rounded-lg font-sans text-sm font-medium cursor-pointer hover:bg-navy-mid transition-colors"
                >
                  Vérifier
                </button>
                <button
                  onClick={() => setRevealed(true)}
                  className="px-4 bg-gray-100 text-text-mid border-none py-2.5 rounded-lg font-sans text-sm cursor-pointer hover:bg-gray-200 transition-colors"
                >
                  Passer
                </button>
              </div>
            </div>
          )}

          {/* Back — revealed */}
          {revealed && (
            <div className="p-8 bg-gray-50">
              {studentAnswer.trim() && (
                <div className="mb-4">
                  <div className="uppercase text-xs tracking-widest text-text-light mb-2">Ta réponse</div>
                  <div className="font-sans text-sm text-text-dark bg-white rounded-lg p-3 border border-gray-200">{studentAnswer}</div>
                </div>
              )}
              <div className="text-center">
                <div className="uppercase text-xs tracking-widest text-text-light mb-3">Correction</div>
                <div className="font-sans text-lg font-medium text-green-700">{currentCard.back}</div>
              </div>
            </div>
          )}
        </div>

        {/* Assessment buttons */}
        {revealed && (
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => handleAssessment("learning")}
              className="flex-1 bg-amber-50 text-amber-800 border-none py-3 rounded-lg font-sans text-sm font-medium cursor-pointer hover:bg-amber-100 transition-colors"
            >
              Encore à réviser
            </button>
            <button
              onClick={() => handleAssessment("known")}
              className="flex-1 bg-green-50 text-green-800 border-none py-3 rounded-lg font-sans text-sm font-medium cursor-pointer hover:bg-green-100 transition-colors"
            >
              Je sais
            </button>
          </div>
        )}

        {/* Exit */}
        <button
          onClick={exitReview}
          className="mt-4 w-full font-sans text-sm text-text-mid hover:text-navy cursor-pointer bg-transparent border-none py-2"
        >
          Quitter la révision
        </button>
      </div>
    )
  }

  // List mode — main flashcard page
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-navy">Mes Flashcards</h1>
        {cards.length > 0 && filter === "learning" && (
          <div className="flex gap-2">
            <span className="bg-amber-50 text-amber-800 px-3 py-1 rounded-full font-sans text-sm">
              {cards.length} à réviser
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setFilter("learning")}
          className={cn(
            "px-4 py-2 rounded-lg font-sans text-sm font-medium cursor-pointer border-none transition-colors",
            filter === "learning" ? "bg-navy text-white" : "bg-gray-100 text-text-mid hover:bg-gray-200",
          )}
        >
          À réviser
        </button>
        <button
          onClick={() => setFilter("known")}
          className={cn(
            "px-4 py-2 rounded-lg font-sans text-sm font-medium cursor-pointer border-none transition-colors",
            filter === "known" ? "bg-navy text-white" : "bg-gray-100 text-text-mid hover:bg-gray-200",
          )}
        >
          Maîtrisées
        </button>
      </div>

      {/* Start review button */}
      {filter === "learning" && cards.length > 0 && (
        <button
          onClick={startReview}
          className="w-full bg-navy text-white rounded-xl p-5 mb-6 cursor-pointer border-none hover:bg-navy-mid transition-colors"
        >
          <div className="font-sans text-base font-semibold">Commencer la révision</div>
          <div className="font-sans text-sm opacity-80 mt-1">{cards.length} carte(s) à réviser</div>
        </button>
      )}

      {/* Empty state */}
      {!loadingCards && cards.length === 0 && (
        <div className="text-center py-16">
          <Icons.Layers className="mx-auto mb-4 text-text-light" />
          <p className="font-sans text-sm text-text-mid">
            {filter === "learning"
              ? "Pas encore de flashcards. Tes enseignants peuvent en générer après avoir corrigé tes devoirs."
              : "Aucune carte maîtrisée pour le moment."}
          </p>
        </div>
      )}

      {/* Loading */}
      {loadingCards && (
        <div className="font-sans text-sm text-text-mid py-8 text-center">Chargement des flashcards...</div>
      )}

      {/* Card list */}
      {!loadingCards && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="font-sans text-sm font-medium text-navy truncate">{card.front}</div>
                <div className="font-sans text-xs text-text-mid mt-1">
                  {categoryLabel(card.category)} · {card.assignmentTitle || "Devoir"}
                </div>
              </div>
              <span
                className={cn(
                  "ml-3 px-2 py-0.5 rounded-full font-sans text-xs whitespace-nowrap",
                  card.status === "learning" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800",
                )}
              >
                {card.status === "learning" ? "À réviser" : "Maîtrisée"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

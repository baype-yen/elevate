"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { auth } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { cn } from "@/lib/utils"

type AdaptiveCategory = "vocabulary" | "grammar" | "tense"

type AdaptiveCard = {
  id: string
  question: string
  options: string[]
  category: AdaptiveCategory
  difficultyLevel: string
  createdAt: string
}

type AdaptiveProgress = {
  levels: Record<AdaptiveCategory, string>
  streaks: Record<AdaptiveCategory, number>
}

type AnswerResult = {
  correct: boolean
  category: AdaptiveCategory
  selectedOption: string
  correctAnswer: string
  explanation: string
  previousLevel: string
  nextLevel: string
}

type SessionResponse = {
  cards: AdaptiveCard[]
  progress: AdaptiveProgress
}

type AnswerResponse = {
  result: AnswerResult
  cards: AdaptiveCard[]
  progress: AdaptiveProgress
}

function emptyProgress(): AdaptiveProgress {
  return {
    levels: {
      vocabulary: "B1",
      grammar: "B1",
      tense: "B1",
    },
    streaks: {
      vocabulary: 0,
      grammar: 0,
      tense: 0,
    },
  }
}

function categoryLabel(category: AdaptiveCategory) {
  if (category === "vocabulary") return "Vocabulaire"
  if (category === "grammar") return "Grammaire"
  return "Temps verbaux"
}

function categoryAccent(category: AdaptiveCategory) {
  if (category === "vocabulary") return "bg-abricot/15 text-abricot-dark border-abricot/30"
  if (category === "grammar") return "bg-violet/10 text-violet border-violet/30"
  return "bg-navy-light/10 text-navy border-navy-light/35"
}

function normalizeAdaptiveCard(row: any): AdaptiveCard | null {
  if (!row || typeof row !== "object") return null

  const id = typeof row.id === "string" ? row.id : ""
  const question = typeof row.question === "string" ? row.question.trim() : ""
  const options = Array.isArray(row.options)
    ? row.options
      .filter((option: unknown) => typeof option === "string")
      .map((option: string) => option.trim())
      .filter(Boolean)
    : []

  const category = row.category === "vocabulary" || row.category === "grammar" || row.category === "tense"
    ? row.category
    : null

  if (!id || !question || !category || options.length < 2) return null

  const difficultyLevel = typeof row.difficultyLevel === "string"
    ? row.difficultyLevel.toUpperCase()
    : "B1"

  const createdAt = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString()

  return {
    id,
    question,
    options,
    category,
    difficultyLevel,
    createdAt,
  }
}

function normalizeProgress(raw: any): AdaptiveProgress {
  const levels = raw?.levels && typeof raw.levels === "object" ? raw.levels : {}
  const streaks = raw?.streaks && typeof raw.streaks === "object" ? raw.streaks : {}

  return {
    levels: {
      vocabulary: typeof levels.vocabulary === "string" ? levels.vocabulary.toUpperCase() : "B1",
      grammar: typeof levels.grammar === "string" ? levels.grammar.toUpperCase() : "B1",
      tense: typeof levels.tense === "string" ? levels.tense.toUpperCase() : "B1",
    },
    streaks: {
      vocabulary: typeof streaks.vocabulary === "number" ? streaks.vocabulary : 0,
      grammar: typeof streaks.grammar === "number" ? streaks.grammar : 0,
      tense: typeof streaks.tense === "number" ? streaks.tense : 0,
    },
  }
}

async function authHeadersWithRefresh(forceRefresh = false) {
  const idToken = await auth.currentUser?.getIdToken(forceRefresh)
  if (!idToken) throw new Error("Session invalide. Reconnectez-vous.")

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  }
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function fetchWithStudentAuth(input: string, init?: RequestInit) {
  const run = async (forceRefresh: boolean) => {
    const headers = new Headers(init?.headers || {})
    const authHeaderValues = await authHeadersWithRefresh(forceRefresh)

    for (const [key, value] of Object.entries(authHeaderValues)) {
      headers.set(key, value)
    }

    return fetch(input, {
      ...init,
      headers,
    })
  }

  let response = await run(false)
  if (response.status === 401) {
    response = await run(true)
  }

  return response
}

export default function FlashcardsPage() {
  const { context, loading } = useAppContext()
  const [cards, setCards] = useState<AdaptiveCard[]>([])
  const [progress, setProgress] = useState<AdaptiveProgress>(emptyProgress())
  const [selectedOption, setSelectedOption] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadingDeck, setLoadingDeck] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)

  const currentCard = cards[0] || null

  const orderedProgress = useMemo(
    () => [
      { key: "vocabulary" as const, label: "Vocabulaire" },
      { key: "grammar" as const, label: "Grammaire" },
      { key: "tense" as const, label: "Temps verbaux" },
    ],
    [],
  )

  const loadSession = async () => {
    if (!context) return

    try {
      setLoadingDeck(true)
      setError(null)

      const response = await fetchWithStudentAuth("/api/student/flashcards/session", {
        method: "POST",
      })

      const payload = await parseJsonSafe<SessionResponse & { error?: string }>(response)
      if (!response.ok) {
        throw new Error(
          payload?.error
          || (response.status === 401
            ? "Session expirée. Reconnectez-vous puis réessayez."
            : "Impossible de charger le deck adaptatif."),
        )
      }

      if (!payload) {
        throw new Error("Réponse invalide du serveur.")
      }

      const data = payload as SessionResponse
      const nextCards = (data.cards || [])
        .map(normalizeAdaptiveCard)
        .filter((row): row is AdaptiveCard => !!row)

      setCards(nextCards)
      setProgress(normalizeProgress(data.progress))
      setSelectedOption("")
      setResult(null)
    } catch (e: any) {
      setCards([])
      setError(e?.message || "Impossible de charger les flashcards adaptatives.")
    } finally {
      setLoadingDeck(false)
    }
  }

  useEffect(() => {
    loadSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId])

  const submitCurrentAnswer = async () => {
    if (!currentCard || !selectedOption) {
      setError("Choisissez une réponse avant de valider.")
      return
    }

    try {
      setBusy(true)
      setError(null)

      const response = await fetchWithStudentAuth("/api/student/flashcards/answer", {
        method: "POST",
        body: JSON.stringify({
          card_id: currentCard.id,
          selected_option: selectedOption,
        }),
      })

      const payload = await parseJsonSafe<AnswerResponse & { error?: string }>(response)
      if (!response.ok) {
        throw new Error(
          payload?.error
          || (response.status === 401
            ? "Session expirée. Reconnectez-vous puis réessayez."
            : "Impossible de corriger la réponse."),
        )
      }

      if (!payload) {
        throw new Error("Réponse invalide du serveur.")
      }

      const data = payload as AnswerResponse
      const nextCards = (data.cards || [])
        .map(normalizeAdaptiveCard)
        .filter((row): row is AdaptiveCard => !!row)

      setCards(nextCards)
      setProgress(normalizeProgress(data.progress))
      setResult(data.result)
      setSelectedOption("")
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la validation.")
    } finally {
      setBusy(false)
    }
  }

  if (loading || !context) {
    return <div className="font-sans text-sm text-text-mid">Chargement...</div>
  }

  return (
    <div className="flex flex-col gap-5 max-w-[920px]">
      <div className="bg-card rounded-[20px] border border-gray-mid p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Flashcards adaptatives</h3>
            <p className="font-sans text-[13px] text-text-mid">
              QCM automatiques par niveau CECRL (A1-C2) sur vocabulaire, grammaire et temps verbaux.
            </p>
          </div>
          <ElevateButton variant="outline" size="sm" onClick={loadSession} disabled={loadingDeck || busy}>
            Régénérer le deck
          </ElevateButton>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {orderedProgress.map((item) => (
            <div key={item.key} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[12px] text-text-light">{item.label}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-sans text-sm font-bold text-navy">{progress.levels[item.key]}</span>
                <span className="font-sans text-xs text-text-mid">Série: {progress.streaks[item.key]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}

      {loadingDeck ? (
        <div className="font-sans text-sm text-text-mid">Generation du deck adaptatif...</div>
      ) : !currentCard && !error ? (
        <div className="bg-card rounded-[20px] border border-gray-mid p-7 text-center">
          <Icons.Layers className="mx-auto mb-3 text-text-light" />
          <div className="font-sans text-sm text-text-mid mb-3">
            Le deck est vide pour le moment. Clique sur "Régénérer le deck" pour créer de nouvelles questions.
          </div>
          <ElevateButton variant="primary" onClick={loadSession} disabled={busy}>Créer mon deck</ElevateButton>
        </div>
      ) : !currentCard ? (
        <div className="bg-card rounded-[20px] border border-gray-mid p-7 text-center">
          <Icons.Bell className="mx-auto mb-3 text-watermelon" />
          <div className="font-sans text-sm text-text-mid mb-3">
            Impossible de charger les flashcards pour le moment.
          </div>
          <ElevateButton variant="outline" onClick={loadSession} disabled={busy || loadingDeck}>Réessayer</ElevateButton>
        </div>
      ) : (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-sans text-sm text-text-mid">{cards.length} question(s) active(s) dans ton deck</div>
            <div className={cn("px-2.5 py-1 rounded-md border font-sans text-xs font-semibold", categoryAccent(currentCard.category))}>
              {categoryLabel(currentCard.category)} - {currentCard.difficultyLevel}
            </div>
          </div>

          <div className="rounded-xl border border-gray-light bg-off-white p-4">
            <div className="font-sans text-[16px] font-semibold text-navy leading-relaxed">{currentCard.question}</div>

            <div className="mt-3 flex flex-col gap-2">
              {currentCard.options.map((option) => (
                <label key={`${currentCard.id}:${option}`} className="rounded-lg border border-gray-mid bg-card px-3 py-2 flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`adaptive-${currentCard.id}`}
                    checked={selectedOption === option}
                    onChange={() => setSelectedOption(option)}
                    className="mt-0.5 h-4 w-4 accent-navy"
                    disabled={busy}
                  />
                  <span className="font-sans text-sm text-text-dark leading-relaxed">{option}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <ElevateButton variant="primary" onClick={submitCurrentAnswer} disabled={busy || !selectedOption}>
                {busy ? "Validation..." : "Valider ma réponse"}
              </ElevateButton>
              <ElevateButton variant="ghost" onClick={() => setSelectedOption("")} disabled={busy || !selectedOption}>
                Réinitialiser
              </ElevateButton>
            </div>
          </div>

          {result && (
            <div className={cn(
              "rounded-xl border px-4 py-3",
              result.correct
                ? "border-violet/30 bg-violet/10"
                : "border-abricot/30 bg-abricot/10",
            )}>
              <div className={cn("font-sans text-sm font-semibold mb-1", result.correct ? "text-violet" : "text-abricot-dark")}>
                {result.correct ? "Bonne réponse ! Niveau augmenté." : "Pas encore. On renforce ce point avec de nouvelles cartes."}
              </div>
              <div className="font-sans text-sm text-text-dark mb-1">
                Réponse correcte: <span className="font-semibold">{result.correctAnswer}</span>
              </div>
              <div className="font-sans text-sm text-text-mid leading-relaxed">{result.explanation}</div>
              <div className="font-sans text-xs text-text-light mt-2">
                {categoryLabel(result.category)}: {result.previousLevel} to {result.nextLevel}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

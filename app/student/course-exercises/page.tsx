"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { ElevateButton, LevelBadge } from "@/components/elevate/shared"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentExercisesData } from "@/lib/firebase/client-data"
import { cn } from "@/lib/utils"
import {
  COURSE_TOPIC_OPTIONS,
  courseMaterialTheme,
  type CourseMaterialTypeKey,
  type CourseTopicKey,
} from "@/lib/course-content/config"

type CourseExerciseQuestionType = "single_choice" | "short_answer"

type CourseExerciseQuestion = {
  id: string
  prompt: string
  questionType: CourseExerciseQuestionType
  options: string[]
}

type CourseExerciseRow = {
  id: string
  title: string
  instructions: string
  type: string
  level: string
  isCompleted: boolean
  responseText: string
  responseSubmittedAt: string | null
  responseAnswers: Record<string, string>
  schoolId: string | null
  classId: string | null
  sourceKind: string | null
  sourceDocumentId: string | null
  sourceDocumentName: string | null
  topicKey: CourseTopicKey | null
  topicLabel: string | null
  materialType: CourseMaterialTypeKey | null
  materialLabel: string | null
  questions: CourseExerciseQuestion[]
}

function levelColorClass(level: string) {
  if (level === "C1" || level === "C2") return "watermelon"
  if (level === "B1" || level === "B2") return "abricot"
  return "violet"
}

function typeLabel(type: string) {
  const key = (type || "").toLowerCase()
  if (key === "reading") return "Lecture"
  if (key === "vocabulary") return "Vocabulaire"
  if (key === "grammar") return "Grammaire"
  if (key === "mixed") return "Mixte"
  return "Exercice"
}

function hasExplicitQuestions(instructions: string) {
  const normalized = (instructions || "").replace(/\r/g, "").trim()
  if (!normalized) return false

  const numberedOrBulletItems =
    normalized.match(/(?:^|\n)\s*(?:\d+[).:-]|[-*])\s+[^\n]+/g)?.length || 0
  if (numberedOrBulletItems >= 2) return true

  const questionMarks = normalized.match(/\?/g)?.length || 0
  if (questionMarks >= 2) return true

  return false
}

function referencesMissingQuestions(instructions: string) {
  const normalized = (instructions || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  if (!normalized) return false

  return /(reponds?|repondez)[^\n]{0,60}questions?/.test(normalized)
    || /questions?\s+(suivantes?|ci-dessous|dessous)/.test(normalized)
}

function fallbackStructuredQuestions(type: string): CourseExerciseQuestion[] {
  const key = (type || "").toLowerCase()

  if (key === "reading") {
    return [
      {
        id: "q1",
        prompt: "Quelle proposition resume le mieux l'idee principale du document ?",
        questionType: "single_choice",
        options: [
          "Le document presente le theme principal du cours.",
          "Le document parle d'un sujet hors cours.",
          "Le document ne contient aucune idee centrale.",
        ],
      },
      {
        id: "q2",
        prompt: "Explique en 2 ou 3 phrases ce que tu as compris du document.",
        questionType: "short_answer",
        options: [],
      },
      {
        id: "q3",
        prompt: "Quelle information est bien presente dans le document ?",
        questionType: "single_choice",
        options: [
          "Un detail explicitement mentionne dans le texte.",
          "Une information qui contredit le texte.",
          "Une idee jamais evoquee dans le texte.",
        ],
      },
      {
        id: "q4",
        prompt: "Cite un exemple precis du document et explique son importance.",
        questionType: "short_answer",
        options: [],
      },
    ]
  }

  if (key === "vocabulary") {
    return [
      {
        id: "q1",
        prompt: "Quel choix correspond a un mot-cle du document ?",
        questionType: "single_choice",
        options: [
          "Un mot important qui revient dans le document.",
          "Un mot sans lien avec le theme etudie.",
          "Un mot absent du document.",
        ],
      },
      {
        id: "q2",
        prompt: "Choisis un mot du document et donne sa signification en francais.",
        questionType: "short_answer",
        options: [],
      },
      {
        id: "q3",
        prompt: "Quelle phrase reutilise correctement le vocabulaire du document ?",
        questionType: "single_choice",
        options: [
          "Une phrase qui respecte le sens du mot choisi.",
          "Une phrase qui change totalement le sens du mot.",
          "Une phrase qui n'utilise pas le mot cible.",
        ],
      },
      {
        id: "q4",
        prompt: "Ecris une phrase simple en anglais avec un mot du document.",
        questionType: "short_answer",
        options: [],
      },
    ]
  }

  if (key === "grammar") {
    return [
      {
        id: "q1",
        prompt: "Quel choix respecte la regle de grammaire vue en cours ?",
        questionType: "single_choice",
        options: [
          "La phrase applique correctement la regle.",
          "La phrase melange des structures sans logique.",
          "La phrase ignore la regle etudiee.",
        ],
      },
      {
        id: "q2",
        prompt: "Reecris une phrase du document avec la structure grammaticale ciblee.",
        questionType: "short_answer",
        options: [],
      },
      {
        id: "q3",
        prompt: "Quel exemple est le plus proche du point de grammaire travaille ?",
        questionType: "single_choice",
        options: [
          "Un exemple conforme a la regle du cours.",
          "Un exemple hors sujet grammatical.",
          "Un exemple qui introduit une autre regle.",
        ],
      },
      {
        id: "q4",
        prompt: "Explique en francais la regle appliquee dans ta transformation.",
        questionType: "short_answer",
        options: [],
      },
    ]
  }

  return [
    {
      id: "q1",
      prompt: "Quelle proposition est la plus fidele au document de cours ?",
      questionType: "single_choice",
      options: [
        "Une proposition en lien direct avec le document.",
        "Une proposition hors sujet.",
        "Une proposition qui contredit le document.",
      ],
    },
    {
      id: "q2",
      prompt: "Resume en 2 a 3 phrases ce que tu retiens du document.",
      questionType: "short_answer",
      options: [],
    },
    {
      id: "q3",
      prompt: "Quel choix reutilise correctement un element du cours ?",
      questionType: "single_choice",
      options: [
        "Le choix respecte le sens du document.",
        "Le choix deforme le sens du document.",
        "Le choix n'utilise aucun element du document.",
      ],
    },
    {
      id: "q4",
      prompt: "Donne un exemple personnel en anglais a partir du document.",
      questionType: "short_answer",
      options: [],
    },
  ]
}

function normalizeQuestionId(value: unknown, index: number) {
  if (typeof value !== "string") return `q${index + 1}`
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || `q${index + 1}`
}

function normalizeQuestions(rawQuestions: unknown): CourseExerciseQuestion[] {
  if (!Array.isArray(rawQuestions)) return []

  const normalized: CourseExerciseQuestion[] = []
  for (const [index, raw] of rawQuestions.entries()) {
    if (!raw || typeof raw !== "object") continue

    const prompt = typeof (raw as any).prompt === "string" ? (raw as any).prompt.trim() : ""
    if (prompt.length < 6) continue

    const questionType = (raw as any).questionType === "single_choice" || (raw as any).question_type === "single_choice"
      ? "single_choice"
      : (raw as any).questionType === "short_answer" || (raw as any).question_type === "short_answer"
      ? "short_answer"
      : null
    if (!questionType) continue

    const options = questionType === "single_choice" && Array.isArray((raw as any).options)
      ? Array.from(
        new Set(
          ((raw as any).options as unknown[])
            .filter((option): option is string => typeof option === "string")
            .map((option) => option.trim())
            .filter((option) => option.length > 0),
        ),
      )
      : []

    if (questionType === "single_choice" && options.length < 2) continue

    normalized.push({
      id: normalizeQuestionId((raw as any).id, index),
      prompt,
      questionType,
      options: options.slice(0, 5),
    })
  }

  return normalized
}

function normalizeResponseAnswers(rawAnswers: unknown): Record<string, string> {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) return {}

  const answers: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawAnswers)) {
    if (typeof value !== "string") continue
    const normalizedKey = key.trim()
    const normalizedValue = value.trim()
    if (!normalizedKey || !normalizedValue) continue
    answers[normalizedKey] = normalizedValue
  }

  return answers
}

function resolvedQuestions(exercise: CourseExerciseRow) {
  const parsed = normalizeQuestions(exercise.questions)
  if (parsed.length) return parsed
  return fallbackStructuredQuestions(exercise.type)
}

function resolvedInstructions(exercise: CourseExerciseRow) {
  const instructions = (exercise.instructions || "").trim()
  if (!instructions) {
    return "Lisez le document de cours puis repondez a toutes les questions ci-dessous."
  }

  if (hasExplicitQuestions(instructions) || !referencesMissingQuestions(instructions)) {
    return instructions
  }

  return `${instructions}\n\nRepondez directement aux questions ci-dessous.`
}

function isCourseExerciseCandidate(exercise: any) {
  const sourceKind = typeof exercise?.sourceKind === "string" ? exercise.sourceKind.trim().toLowerCase() : ""
  if (sourceKind === "course_document") return true

  const sourceDocumentId = typeof exercise?.sourceDocumentId === "string" ? exercise.sourceDocumentId.trim() : ""
  if (sourceDocumentId) return true

  const sourceDocumentName = typeof exercise?.sourceDocumentName === "string" ? exercise.sourceDocumentName.trim() : ""
  if (sourceDocumentName) return true

  const topicKey = typeof exercise?.topicKey === "string" ? exercise.topicKey.trim() : ""
  return !!topicKey
}

function normalizeCourseExerciseRow(exercise: any): CourseExerciseRow {
  const topicKey = typeof exercise.topicKey === "string"
    && COURSE_TOPIC_OPTIONS.some((topic) => topic.value === exercise.topicKey)
    ? (exercise.topicKey as CourseTopicKey)
    : null

  const materialType = typeof exercise.materialType === "string"
    && ["text", "vocabulary", "grammar"].includes(exercise.materialType)
    ? (exercise.materialType as CourseMaterialTypeKey)
    : null

  return {
    id: typeof exercise.id === "string" ? exercise.id : "",
    title: typeof exercise.title === "string" ? exercise.title : "Exercice",
    instructions: typeof exercise.instructions === "string" ? exercise.instructions : "",
    type: typeof exercise.type === "string" ? exercise.type : "mixed",
    level: typeof exercise.level === "string" ? exercise.level.toUpperCase() : "B1",
    isCompleted: !!exercise.isCompleted,
    responseText: typeof exercise.responseText === "string" ? exercise.responseText : "",
    responseSubmittedAt: typeof exercise.responseSubmittedAt === "string" ? exercise.responseSubmittedAt : null,
    responseAnswers: normalizeResponseAnswers(exercise.responseAnswers),
    schoolId: typeof exercise.schoolId === "string" ? exercise.schoolId : null,
    classId: typeof exercise.classId === "string" ? exercise.classId : null,
    sourceKind: typeof exercise.sourceKind === "string" ? exercise.sourceKind : null,
    sourceDocumentId: typeof exercise.sourceDocumentId === "string" ? exercise.sourceDocumentId : null,
    sourceDocumentName: typeof exercise.sourceDocumentName === "string" ? exercise.sourceDocumentName : null,
    topicKey,
    topicLabel: typeof exercise.topicLabel === "string" ? exercise.topicLabel : null,
    materialType,
    materialLabel: typeof exercise.materialLabel === "string" ? exercise.materialLabel : null,
    questions: normalizeQuestions(exercise.questions),
  }
}

export default function StudentCourseExercisesPage() {
  const { context, loading } = useAppContext()
  const [exercises, setExercises] = useState<CourseExerciseRow[]>([])
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, Record<string, string>>>({})
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null)
  const [busyExerciseId, setBusyExerciseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadExercises = async () => {
    if (!context) return

    try {
      setError(null)
      const payload = await fetchStudentExercisesData(db, context.userId, context.activeSchoolId)
      const courseRows = (payload.personalizedExercises || [])
        .filter((exercise: any) => isCourseExerciseCandidate(exercise))
        .map((exercise: any) => normalizeCourseExerciseRow(exercise))
        .filter((exercise: CourseExerciseRow) => !!exercise.id)

      setExercises(courseRows)
    } catch (e: any) {
      setExercises([])
      setError(e.message || "Impossible de charger les exercices bases sur les cours.")
    }
  }

  useEffect(() => {
    loadExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId])

  useEffect(() => {
    setExerciseAnswers((previous) => {
      const next: Record<string, Record<string, string>> = {}

      for (const exercise of exercises) {
        const questions = resolvedQuestions(exercise)
        const currentAnswers = previous[exercise.id] || {}
        const persistedAnswers = exercise.responseAnswers || {}

        const row: Record<string, string> = {}
        for (const question of questions) {
          if (typeof currentAnswers[question.id] === "string") {
            row[question.id] = currentAnswers[question.id]
          } else if (typeof persistedAnswers[question.id] === "string") {
            row[question.id] = persistedAnswers[question.id]
          } else {
            row[question.id] = ""
          }
        }

        next[exercise.id] = row
      }

      return next
    })

    setOpenExerciseId((current) => {
      if (!current) return current
      return exercises.some((exercise) => exercise.id === current) ? current : null
    })
  }, [exercises])

  const groupedExercises = useMemo(() => {
    const map = new Map<string, CourseExerciseRow[]>()
    for (const topic of COURSE_TOPIC_OPTIONS) {
      map.set(topic.value, [])
    }
    map.set("other", [])

    for (const exercise of exercises) {
      const topicExists = COURSE_TOPIC_OPTIONS.some((topic) => topic.value === exercise.topicKey)
      const key = topicExists && exercise.topicKey ? exercise.topicKey : "other"
      const rows = map.get(key) || []
      rows.push(exercise)
      map.set(key, rows)
    }

    return map
  }, [exercises])

  const completedCount = useMemo(
    () => exercises.filter((exercise) => exercise.isCompleted).length,
    [exercises],
  )

  const setExerciseAnswer = (exerciseId: string, questionId: string, value: string) => {
    setExerciseAnswers((previous) => ({
      ...previous,
      [exerciseId]: {
        ...(previous[exerciseId] || {}),
        [questionId]: value,
      },
    }))
  }

  const submitCourseExercise = async (exercise: CourseExerciseRow) => {
    if (!context) return

    const questions = resolvedQuestions(exercise)
    const draftAnswers = exerciseAnswers[exercise.id] || {}

    const unansweredQuestions = questions.filter((question) => !(draftAnswers[question.id] || "").trim())
    if (unansweredQuestions.length) {
      setError(`Repondez a toutes les questions (${unansweredQuestions.length} reponse(s) manquante(s)).`)
      return
    }

    const submittedAnswers = questions.reduce((acc, question) => {
      acc[question.id] = (draftAnswers[question.id] || "").trim()
      return acc
    }, {} as Record<string, string>)

    const response = questions
      .map((question, index) => `${index + 1}. ${question.prompt}\nReponse: ${submittedAnswers[question.id]}`)
      .join("\n\n")

    try {
      setBusyExerciseId(exercise.id)
      setError(null)
      setSuccess(null)

      const now = new Date().toISOString()

      await updateDoc(doc(db, "personalized_exercises", exercise.id), {
        is_completed: true,
        completed_at: now,
        updated_at: serverTimestamp(),
      })

      await addDoc(collection(db, "activity_events"), {
        school_id: exercise.schoolId || context.activeSchoolId,
        class_id: exercise.classId || null,
        actor_id: context.userId,
        target_user_id: context.userId,
        event_type: "completion",
        payload: {
          kind: "course_exercise_completion",
          exercise_id: exercise.id,
          title: exercise.title,
          response,
          answers: submittedAnswers,
          submitted_at: now,
        },
        created_at: serverTimestamp(),
      })

      setOpenExerciseId(null)
      setSuccess("Reponses enregistrees. Exercice termine.")
      await loadExercises()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer vos reponses.")
    } finally {
      setBusyExerciseId(null)
    }
  }

  const renderSavedResponse = (exercise: CourseExerciseRow) => {
    const questions = resolvedQuestions(exercise)
    const answeredRows = questions
      .map((question, index) => ({
        key: question.id,
        label: `${index + 1}. ${question.prompt}`,
        answer: (exercise.responseAnswers[question.id] || "").trim(),
      }))
      .filter((row) => !!row.answer)

    if (answeredRows.length) {
      return (
        <div className="mt-3 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2.5">
          <div className="font-sans text-[12px] font-semibold text-violet mb-1">Mes reponses</div>
          <div className="flex flex-col gap-2">
            {answeredRows.map((row) => (
              <div key={row.key}>
                <div className="font-sans text-[12px] font-semibold text-text-dark">{row.label}</div>
                <div className="font-sans text-sm text-text-mid whitespace-pre-wrap leading-relaxed">{row.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (!exercise.responseText) return null

    return (
      <div className="mt-3 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2.5">
        <div className="font-sans text-[12px] font-semibold text-violet mb-1">Ma reponse</div>
        <p className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed">{exercise.responseText}</p>
      </div>
    )
  }

  const renderExerciseCard = (exercise: CourseExerciseRow) => {
    const materialTheme = exercise.materialType ? courseMaterialTheme(exercise.materialType) : null
    const questions = resolvedQuestions(exercise)
    const answers = exerciseAnswers[exercise.id] || {}
    const missingAnswerCount = questions.filter((question) => !(answers[question.id] || "").trim()).length
    const isGrammarExercise = exercise.materialType === "grammar" || exercise.type.toLowerCase() === "grammar"
    const grammarLessonHref = exercise.sourceDocumentId
      ? `/student/grammar-lessons?document=${encodeURIComponent(exercise.sourceDocumentId)}`
      : "/student/grammar-lessons"

    return (
      <div
        key={exercise.id}
        className={cn(
          "rounded-xl border border-l-4 bg-off-white p-4",
          materialTheme ? materialTheme.panelBorder : "border-gray-light",
          materialTheme ? materialTheme.panelBg : "",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-sans text-sm font-semibold text-text-dark">{exercise.title}</div>
            <div className="font-sans text-xs text-text-light mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>{typeLabel(exercise.type)}</span>
              <span>{questions.length} question(s)</span>
              {exercise.materialLabel && materialTheme && (
                <span className={cn("inline-flex px-2 py-0.5 rounded-md font-semibold", materialTheme.badgeBg, materialTheme.badgeText)}>
                  {exercise.materialLabel}
                </span>
              )}
              {exercise.sourceDocumentName && <span>Source: {exercise.sourceDocumentName}</span>}
              {exercise.responseSubmittedAt && <span>Repondu le {new Date(exercise.responseSubmittedAt).toLocaleDateString("fr-FR")}</span>}
            </div>
            <div className="font-sans text-sm text-text-mid mt-2 whitespace-pre-wrap leading-relaxed">
              {resolvedInstructions(exercise)}
            </div>

            {isGrammarExercise && (
              <div className="mt-2">
                <Link
                  href={grammarLessonHref}
                  className="inline-flex items-center rounded-md border border-watermelon/35 bg-watermelon/10 px-2.5 py-1.5 font-sans text-[12px] font-semibold text-watermelon hover:bg-watermelon/15 transition-colors"
                >
                  Voir la leçon de grammaire
                </Link>
              </div>
            )}

            {!!exercise.isCompleted && openExerciseId !== exercise.id && renderSavedResponse(exercise)}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <LevelBadge level={exercise.level} colorClass={levelColorClass(exercise.level)} />
            {exercise.isCompleted ? (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-violet/10 text-violet">Termine</span>
            ) : (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-abricot/15 text-abricot-dark">A faire</span>
            )}
            <ElevateButton
              size="sm"
              variant="secondary"
              onClick={() => setOpenExerciseId((current) => (current === exercise.id ? null : exercise.id))}
              disabled={busyExerciseId === exercise.id}
            >
              {openExerciseId === exercise.id
                ? "Fermer"
                : exercise.isCompleted
                ? "Revoir mes reponses"
                : "Faire l'exercice"}
            </ElevateButton>
          </div>
        </div>

        {openExerciseId === exercise.id && (
          <div
            className={cn(
              "mt-4 rounded-lg border bg-card px-3.5 py-3",
              materialTheme ? materialTheme.panelBorder : "border-gray-mid",
            )}
          >
            <div className="font-sans text-[12px] text-text-mid mb-2">
              Repondez a toutes les questions puis validez vos reponses.
            </div>

            <div className="flex flex-col gap-3">
              {questions.map((question, index) => (
                <div key={`${exercise.id}:${question.id}`} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                  <div className="font-sans text-sm font-semibold text-navy">
                    {index + 1}. {question.prompt}
                  </div>

                  {question.questionType === "single_choice" ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {question.options.map((option) => (
                        <label
                          key={`${exercise.id}:${question.id}:${option}`}
                          className="flex items-start gap-2 rounded-md border border-gray-mid bg-card px-2.5 py-2 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`course-${exercise.id}-${question.id}`}
                            checked={answers[question.id] === option}
                            onChange={() => setExerciseAnswer(exercise.id, question.id, option)}
                            className="mt-0.5 h-4 w-4 accent-navy"
                          />
                          <span className="font-sans text-sm text-text-dark leading-relaxed">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answers[question.id] || ""}
                      onChange={(event) => setExerciseAnswer(exercise.id, question.id, event.target.value)}
                      placeholder="Ecrivez votre reponse ici..."
                      className="mt-2 w-full min-h-[88px] rounded-[10px] border-2 border-gray-mid bg-card px-3 py-2 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <ElevateButton
                size="sm"
                variant="primary"
                onClick={() => submitCourseExercise(exercise)}
                disabled={busyExerciseId === exercise.id || missingAnswerCount > 0}
              >
                {busyExerciseId === exercise.id
                  ? "Enregistrement..."
                  : exercise.isCompleted
                  ? "Mettre a jour mes reponses"
                  : "Valider mes reponses"}
              </ElevateButton>
              <ElevateButton
                size="sm"
                variant="ghost"
                onClick={() => setOpenExerciseId(null)}
                disabled={busyExerciseId === exercise.id}
              >
                Annuler
              </ElevateButton>
              {missingAnswerCount > 0 && (
                <span className="font-sans text-xs text-text-light">
                  {missingAnswerCount} reponse(s) manquante(s)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des exercices...</div>
  }

  return (
    <div className="flex flex-col gap-5 max-w-[950px]">
      <div className="bg-card rounded-[20px] border border-gray-mid p-6">
        <h3 className="font-serif text-xl font-bold text-navy mb-1">Exercices basés sur les cours</h3>
        <p className="font-sans text-[13px] text-text-mid">
          Exercices generes automatiquement depuis les documents vus en classe.
        </p>

        <div className="mt-3 flex flex-wrap gap-2.5">
          {[
            { key: "text" as const, label: "Bleu = Textes" },
            { key: "vocabulary" as const, label: "Orange = Vocabulaire" },
            { key: "grammar" as const, label: "Rouge = Règles" },
          ].map((legend) => {
            const theme = courseMaterialTheme(legend.key)
            return (
              <div
                key={legend.key}
                className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2", theme.panelBg, theme.panelBorder)}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full", theme.dotBg)} />
                <span className="font-sans text-[12px] font-semibold text-navy">{legend.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}
      {success && <div className="font-sans text-sm text-violet">{success}</div>}

      {completedCount > 0 && (
        <div className="rounded-xl border border-violet/30 bg-violet/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-sans text-sm font-semibold text-violet">{completedCount} exercice(s) termine(s)</div>
            <div className="font-sans text-xs text-text-mid mt-0.5">
              Continue la progression avec des QCM adaptatifs sur vocabulaire, grammaire et temps verbaux.
            </div>
          </div>
          <Link
            href="/student/flashcards"
            className="inline-flex items-center justify-center rounded-[10px] bg-navy px-3.5 py-2 font-sans text-[13px] font-semibold text-white hover:bg-navy-mid transition-colors"
          >
            Ouvrir mes flashcards
          </Link>
        </div>
      )}

      {COURSE_TOPIC_OPTIONS.map((topic) => {
        const rows = groupedExercises.get(topic.value) || []
        return (
          <section key={topic.value} className="bg-card rounded-[20px] border border-gray-mid p-6">
            <h4 className="font-serif text-lg font-bold text-navy mb-3">{topic.label}</h4>

            <div className="flex flex-col gap-3">
              {rows.map(renderExerciseCard)}

              {!rows.length && (
                <div className="font-sans text-sm text-text-mid">Aucun exercice disponible pour ce topic.</div>
              )}
            </div>
          </section>
        )
      })}

      {!!(groupedExercises.get("other") || []).length && (
        <section className="bg-card rounded-[20px] border border-gray-mid p-6">
          <h4 className="font-serif text-lg font-bold text-navy mb-3">Autres exercices</h4>
          <div className="flex flex-col gap-3">
            {(groupedExercises.get("other") || []).map(renderExerciseCard)}
          </div>
        </section>
      )}

      {!exercises.length && (
        <div className="font-sans text-sm text-text-mid">
          Aucun exercice base sur les cours pour le moment. Demandez a votre enseignant de lancer la generation depuis un document partage.
        </div>
      )}
    </div>
  )
}

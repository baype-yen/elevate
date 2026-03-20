import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { generateAdaptiveFlashcards } from "@/lib/flashcards/adaptive-gemini"
import {
  ADAPTIVE_CATEGORIES,
  type AdaptiveCategory,
  type CefrLevel,
  isAdaptiveCategory,
  normalizeCefrLevel,
} from "@/lib/flashcards/adaptive-schema"

export type AdaptiveProgressRow = {
  studentId: string
  schoolId: string | null
  levels: Record<AdaptiveCategory, CefrLevel>
  streaks: Record<AdaptiveCategory, number>
}

export type AdaptiveCardRow = {
  id: string
  question: string
  options: string[]
  correctAnswer: string
  explanation: string
  category: AdaptiveCategory
  difficultyLevel: CefrLevel
  createdAt: string
}

type CreateAdaptiveCardsInput = {
  studentId: string
  schoolId: string | null
  category: AdaptiveCategory
  level: CefrLevel
  count: number
  generationReason: "bootstrap" | "correct_upgrade" | "incorrect_remedial"
  weakTopic?: string | null
  wrongOption?: string | null
}

const MIN_PER_CATEGORY = 2
const TARGET_LEARNING_CARDS = 9
const MAX_LEARNING_CARDS = 24

function levelMap(level: CefrLevel): Record<AdaptiveCategory, CefrLevel> {
  return {
    vocabulary: level,
    grammar: level,
    tense: level,
  }
}

function streakMap(): Record<AdaptiveCategory, number> {
  return {
    vocabulary: 0,
    grammar: 0,
    tense: 0,
  }
}

function toIsoString(value: any): string {
  if (typeof value === "string" && value.trim()) return value
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return new Date().toISOString()
}

function toDateMs(value: any): number {
  if (!value) return 0
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime()
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

async function resolveEnrollmentBaselineLevel(params: {
  studentId: string
  activeSchoolId: string | null
  profileLevel: unknown
}): Promise<CefrLevel> {
  const fallback = normalizeCefrLevel(params.profileLevel || "b1")

  const enrollmentSnap = await adminDb
    .collection("class_enrollments")
    .where("student_id", "==", params.studentId)
    .where("status", "==", "active")
    .get()

  if (enrollmentSnap.empty) return fallback

  const rawEnrollments = enrollmentSnap.docs
    .map((row) => row.data() || {})
    .map((row: any) => ({
      classId: typeof row.class_id === "string" ? row.class_id : "",
      cefrLevel: typeof row.cefr_level === "string" ? row.cefr_level : null,
      updatedAtMs: Math.max(toDateMs(row.updated_at), toDateMs(row.created_at)),
    }))
    .filter((row) => !!row.classId)

  if (!rawEnrollments.length) return fallback

  const classMap = new Map<string, any>()
  for (const enrollment of rawEnrollments) {
    if (classMap.has(enrollment.classId)) continue
    const classSnap = await adminDb.collection("classes").doc(enrollment.classId).get()
    if (classSnap.exists) {
      classMap.set(enrollment.classId, classSnap.data() || null)
    }
  }

  const activeRows = rawEnrollments.filter((enrollment) => {
    const classRow = classMap.get(enrollment.classId)
    if (!classRow) return false
    if (classRow.archived_at) return false
    return true
  })

  const sameSchoolRows = params.activeSchoolId
    ? activeRows.filter((enrollment) => classMap.get(enrollment.classId)?.school_id === params.activeSchoolId)
    : activeRows

  const candidateRows = (sameSchoolRows.length ? sameSchoolRows : activeRows)
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)

  if (!candidateRows.length) return fallback

  const selected = candidateRows[0]
  const classRow = classMap.get(selected.classId)

  return normalizeCefrLevel(selected.cefrLevel || classRow?.cefr_level || fallback)
}

async function clearAdaptiveLearningCards(studentId: string) {
  const learningSnap = await adminDb
    .collection("flashcards")
    .where("student_id", "==", studentId)
    .where("status", "==", "learning")
    .get()

  const adaptiveLearningIds = learningSnap.docs
    .filter((row) => (row.data() || {}).source_kind === "adaptive_level")
    .map((row) => row.id)

  if (!adaptiveLearningIds.length) return 0

  let deleted = 0
  for (let index = 0; index < adaptiveLearningIds.length; index += 400) {
    const batch = adminDb.batch()
    const chunk = adaptiveLearningIds.slice(index, index + 400)

    for (const cardId of chunk) {
      batch.delete(adminDb.collection("flashcards").doc(cardId))
      deleted += 1
    }

    await batch.commit()
  }

  return deleted
}

function uniqueOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  const rows: string[] = []
  const seen = new Set<string>()

  for (const option of options) {
    if (typeof option !== "string") continue
    const value = option.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(value)
  }

  return rows
}

function toAdaptiveCardRow(id: string, raw: any): AdaptiveCardRow | null {
  const sourceKind = typeof raw?.source_kind === "string" ? raw.source_kind : ""
  if (sourceKind !== "adaptive_level") return null

  const questionType = typeof raw?.question_type === "string" ? raw.question_type : ""
  if (questionType !== "single_choice") return null

  const question = typeof raw?.front === "string" ? raw.front.trim() : ""
  const explanation = typeof raw?.back === "string" ? raw.back.trim() : ""
  if (!question) return null

  const options = uniqueOptions(raw?.options)
  if (options.length < 2) return null

  const correctAnswer = typeof raw?.correct_answer === "string" ? raw.correct_answer.trim() : ""
  if (!correctAnswer) return null

  const safeCategory = isAdaptiveCategory(raw?.skill_category)
    ? raw.skill_category
    : isAdaptiveCategory(raw?.category)
    ? raw.category
    : "vocabulary"

  const safeLevel = normalizeCefrLevel(raw?.difficulty_level || raw?.cefr_level)

  return {
    id,
    question,
    options,
    correctAnswer,
    explanation,
    category: safeCategory,
    difficultyLevel: safeLevel,
    createdAt: toIsoString(raw?.created_at),
  }
}

function normalizeProgressLevels(rawLevels: any, fallback: CefrLevel): Record<AdaptiveCategory, CefrLevel> {
  return {
    vocabulary: normalizeCefrLevel(rawLevels?.vocabulary || fallback),
    grammar: normalizeCefrLevel(rawLevels?.grammar || fallback),
    tense: normalizeCefrLevel(rawLevels?.tense || fallback),
  }
}

function normalizeProgressStreaks(rawStreaks: any): Record<AdaptiveCategory, number> {
  const readValue = (value: unknown) => {
    if (typeof value !== "number") return 0
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value))
  }

  return {
    vocabulary: readValue(rawStreaks?.vocabulary),
    grammar: readValue(rawStreaks?.grammar),
    tense: readValue(rawStreaks?.tense),
  }
}

export function toPublicLevels(levels: Record<AdaptiveCategory, CefrLevel>) {
  return {
    vocabulary: levels.vocabulary.toUpperCase(),
    grammar: levels.grammar.toUpperCase(),
    tense: levels.tense.toUpperCase(),
  }
}

export function normalizeOptionForCheck(value: string) {
  return value.trim().toLowerCase()
}

export async function getOrCreateAdaptiveProgress(studentId: string): Promise<AdaptiveProgressRow> {
  const profileSnap = await adminDb.collection("profiles").doc(studentId).get()
  const profile = profileSnap.exists ? profileSnap.data() : null

  const fallbackLevel = await resolveEnrollmentBaselineLevel({
    studentId,
    activeSchoolId: typeof profile?.active_school_id === "string" ? profile.active_school_id : null,
    profileLevel: profile?.cefr_level,
  })
  const schoolId = typeof profile?.active_school_id === "string" ? profile.active_school_id : null

  const progressRef = adminDb.collection("flashcard_progress").doc(studentId)
  const progressSnap = await progressRef.get()

  if (!progressSnap.exists) {
    const initialLevels = levelMap(fallbackLevel)
    const initialStreaks = streakMap()

    await progressRef.set({
      student_id: studentId,
      school_id: schoolId,
      levels: initialLevels,
      streaks: initialStreaks,
      enrollment_level: fallbackLevel,
      created_at: new Date().toISOString(),
      updated_at: FieldValue.serverTimestamp(),
    })

    return {
      studentId,
      schoolId,
      levels: initialLevels,
      streaks: initialStreaks,
    }
  }

  const existing = progressSnap.data() || {}
  const existingLevels = normalizeProgressLevels(existing.levels, fallbackLevel)
  const storedEnrollmentLevel = normalizeCefrLevel(existing.enrollment_level || fallbackLevel)
  const requiresInitialBaselineSync = !existing.enrollment_level
    && ADAPTIVE_CATEGORIES.some((category) => existingLevels[category] !== fallbackLevel)

  if (storedEnrollmentLevel !== fallbackLevel || requiresInitialBaselineSync) {
    const levels = levelMap(fallbackLevel)
    const streaks = streakMap()

    await clearAdaptiveLearningCards(studentId)

    await progressRef.set(
      {
        student_id: studentId,
        school_id: schoolId,
        levels,
        streaks,
        enrollment_level: fallbackLevel,
        synced_from_enrollment_at: new Date().toISOString(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return {
      studentId,
      schoolId,
      levels,
      streaks,
    }
  }

  const levels = existingLevels
  const streaks = normalizeProgressStreaks(existing.streaks)

  if (!existing.enrollment_level) {
    await progressRef.set(
      {
        enrollment_level: fallbackLevel,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  return {
    studentId,
    schoolId,
    levels,
    streaks,
  }
}

export async function saveAdaptiveProgress(progress: AdaptiveProgressRow) {
  await adminDb.collection("flashcard_progress").doc(progress.studentId).set(
    {
      student_id: progress.studentId,
      school_id: progress.schoolId,
      levels: progress.levels,
      streaks: progress.streaks,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

export async function listAdaptiveLearningCards(studentId: string, max = 40): Promise<AdaptiveCardRow[]> {
  const snapshot = await adminDb
    .collection("flashcards")
    .where("student_id", "==", studentId)
    .where("status", "==", "learning")
    .orderBy("created_at", "desc")
    .limit(max)
    .get()

  const rows = snapshot.docs
    .map((row) => toAdaptiveCardRow(row.id, row.data()))
    .filter((row): row is AdaptiveCardRow => !!row)

  return rows
}

export async function getAdaptiveCardById(studentId: string, cardId: string): Promise<AdaptiveCardRow | null> {
  const cardSnap = await adminDb.collection("flashcards").doc(cardId).get()
  if (!cardSnap.exists) return null

  const row = toAdaptiveCardRow(cardSnap.id, cardSnap.data())
  if (!row) return null

  const raw = cardSnap.data() || {}
  if (raw.student_id !== studentId) return null

  return row
}

export async function markAdaptiveCardResult(params: {
  cardId: string
  selectedOption: string
  correct: boolean
}) {
  await adminDb.collection("flashcards").doc(params.cardId).set(
    {
      status: params.correct ? "known" : "learning",
      reviewed_at: new Date().toISOString(),
      last_result: params.correct ? "correct" : "incorrect",
      last_selected_option: params.selectedOption,
      attempt_count: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

export async function createAdaptiveCards(input: CreateAdaptiveCardsInput): Promise<AdaptiveCardRow[]> {
  const safeCount = Math.max(0, Math.min(6, Math.round(input.count)))
  if (!safeCount) return []

  const generated = await generateAdaptiveFlashcards({
    category: input.category,
    level: input.level,
    count: safeCount,
    weakTopic: input.weakTopic,
    wrongOption: input.wrongOption,
  })

  if (!generated.length) return []

  const now = new Date().toISOString()
  const batch = adminDb.batch()
  const createdRows: AdaptiveCardRow[] = []

  for (const card of generated) {
    const docRef = adminDb.collection("flashcards").doc()
    const row = {
      student_id: input.studentId,
      submission_id: null,
      assignment_id: null,
      class_id: null,
      school_id: input.schoolId,
      generated_by: "system_adaptive",
      cefr_level: input.level,
      card_type: "explanation",
      front: card.question,
      back: card.explanation,
      hint: null,
      category: card.category,
      status: "learning",
      created_at: now,
      reviewed_at: null,
      source_kind: "adaptive_level",
      skill_category: card.category,
      difficulty_level: card.difficultyLevel,
      question_type: "single_choice",
      options: card.options,
      correct_answer: card.correctOption,
      attempt_count: 0,
      last_result: null,
      last_selected_option: null,
      generation_reason: input.generationReason,
      weak_topic: input.weakTopic || null,
      wrong_option: input.wrongOption || null,
      updated_at: FieldValue.serverTimestamp(),
    }

    batch.set(docRef, row)
    createdRows.push({
      id: docRef.id,
      question: card.question,
      options: card.options,
      correctAnswer: card.correctOption,
      explanation: card.explanation,
      category: card.category,
      difficultyLevel: card.difficultyLevel,
      createdAt: now,
    })
  }

  await batch.commit()
  return createdRows
}

function countByCategory(cards: AdaptiveCardRow[]) {
  return cards.reduce(
    (acc, card) => {
      acc[card.category] += 1
      return acc
    },
    {
      vocabulary: 0,
      grammar: 0,
      tense: 0,
    } as Record<AdaptiveCategory, number>,
  )
}

function withNewestFirst(existing: AdaptiveCardRow[], created: AdaptiveCardRow[]) {
  return [...created, ...existing]
}

export async function ensureAdaptiveDeck(params: {
  studentId: string
  schoolId: string | null
  progress: AdaptiveProgressRow
  existingCards?: AdaptiveCardRow[]
}) {
  let cards = params.existingCards || (await listAdaptiveLearningCards(params.studentId, 60))
  if (cards.length >= MAX_LEARNING_CARDS) return cards

  const counts = countByCategory(cards)

  for (const category of ADAPTIVE_CATEGORIES) {
    if (cards.length >= MAX_LEARNING_CARDS) break
    const deficit = Math.max(0, MIN_PER_CATEGORY - counts[category])
    if (!deficit) continue

    const created = await createAdaptiveCards({
      studentId: params.studentId,
      schoolId: params.schoolId,
      category,
      level: params.progress.levels[category],
      count: Math.min(deficit, MAX_LEARNING_CARDS - cards.length),
      generationReason: "bootstrap",
    })

    cards = withNewestFirst(cards, created)
    counts[category] += created.length
  }

  while (cards.length < TARGET_LEARNING_CARDS && cards.length < MAX_LEARNING_CARDS) {
    const category = ADAPTIVE_CATEGORIES.reduce((best, current) => {
      return counts[current] < counts[best] ? current : best
    }, ADAPTIVE_CATEGORIES[0])

    const created = await createAdaptiveCards({
      studentId: params.studentId,
      schoolId: params.schoolId,
      category,
      level: params.progress.levels[category],
      count: 1,
      generationReason: "bootstrap",
    })

    if (!created.length) break
    cards = withNewestFirst(cards, created)
    counts[category] += created.length
  }

  return cards
}

"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentGrammarLessonsData } from "@/lib/firebase/client-data"
import {
  COURSE_TOPIC_OPTIONS,
  type CourseTopicKey,
} from "@/lib/course-content/config"
import {
  parseLessonContent,
  type LessonBlock,
  type LessonSection,
} from "@/lib/course-content/lesson-parser"

type StudentGrammarLessonRow = {
  id: string
  name: string
  type: string
  size: string
  date: string
  sourceText: string
  visibilityMode: "student_visible" | "internal_teacher"
  topicKey: CourseTopicKey | null
  topicLabel: string
  targetClassNames: string[]
  sharedClassNames: string[]
}

type TopicBucketKey = CourseTopicKey | "other"

function topicLabel(topicKey: TopicBucketKey) {
  if (topicKey === "other") return "Autres leçons"
  const configuredLabel = COURSE_TOPIC_OPTIONS.find((topic) => topic.value === topicKey)?.label || "Thème"
  return configuredLabel.replace(/^topic\b/i, "Thème")
}

function sectionStorageKey(lessonId: string, sectionId: string) {
  return `${lessonId}:${sectionId}`
}

function normalizedPreview(text: string, max = 140) {
  const clean = (text || "").replace(/\s+/g, " ").trim()
  if (!clean.length) return ""
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}

function sectionLead(section: LessonSection) {
  for (const block of section.blocks) {
    if (block.type === "paragraph") return normalizedPreview(block.text, 180)
    if (block.type === "callout") return normalizedPreview(block.text, 180)
    if (block.type === "list" && block.items.length) return normalizedPreview(block.items[0], 180)
  }
  return ""
}

function frenchCalloutLabel(label: string) {
  const normalized = (label || "").trim().toLowerCase()
  if (normalized === "example" || normalized === "exemple") return "Exemple"
  if (normalized === "tip" || normalized === "astuce") return "Astuce"
  if (normalized === "warning" || normalized === "attention") return "Attention"
  if (normalized === "fyi") return "Info"
  if (normalized === "important") return "Important"
  return label
}

function renderInlineBoldText(text: string, keyPrefix: string): ReactNode {
  const clean = (text || "").trim()
  if (!clean.length) return null

  const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  if (parts.length === 1) {
    const onlyMatch = parts[0].match(/^\*\*([^*]+)\*\*$/)
    if (onlyMatch) {
      return <strong className="font-bold text-[#2f3529]">{onlyMatch[1]}</strong>
    }
    return parts[0]
  }

  return parts.map((part, index) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/)
    if (!match) {
      return <span key={`${keyPrefix}-text-${index}`}>{part}</span>
    }

    return (
      <strong key={`${keyPrefix}-strong-${index}`} className="font-bold text-[#2f3529]">
        {match[1]}
      </strong>
    )
  })
}

function stripInlineBoldMarkers(text: string) {
  return (text || "").replace(/\*\*([^*]+)\*\*/g, "$1").trim()
}

const STANDALONE_HEADING_TRANSLATIONS: Record<string, string> = {
  "relative clauses": "Propositions relatives",
  "relative clause": "Proposition relative",
  "passive voice": "Voix passive",
  "reported speech": "Discours indirect",
  "direct speech": "Discours direct",
  conditionals: "Conditionnels",
  conditional: "Conditionnel",
}

function normalizeLessonLine(rawLine: string) {
  let line = (rawLine || "").trim()
  if (!line.length) return ""

  const arrowParts = line
    .split(/\s*(?:->|=>|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (arrowParts.length > 1) {
    line = arrowParts[arrowParts.length - 1]
  }

  line = line
    .replace(/^rules?\s*:/i, "Règle :")
    .replace(/^definitions?\s*:/i, (match) => (/^definitions/i.test(match) ? "Définitions :" : "Définition :"))
    .replace(/^examples?\s*:/i, (match) => (/^examples/i.test(match) ? "Exemples :" : "Exemple :"))
    .replace(/^tip\s*:/i, "Astuce :")
    .replace(/^note\s*:/i, "Remarque :")

  if (/^examples?$/i.test(line)) {
    line = /^examples$/i.test(line) ? "Exemples :" : "Exemple :"
  }

  const translatedHeading = STANDALONE_HEADING_TRANSLATIONS[line.toLowerCase()]
  if (translatedHeading) {
    line = translatedHeading
  }

  const hasFrenchAccent = /[àâäçéèêëîïôöùûüÿœ]/i.test(line)
  const englishMarker = /\b(the|and|or|of|to|for|with|without|about|add|extra|information|noun|verb|adjective|adverb|subject|object|clause|clauses|rule|example|examples|use|used|using|which|that|when|where|who|what|how)\b/i
  const frenchMarker = /\b(le|la|les|des|du|de|un|une|pour|avec|sans|dans|sur|règle|définition|exemple|phrase|verbe|nom|proposition|section|chapitre|thème)\b/i
  if (!hasFrenchAccent && englishMarker.test(line) && !frenchMarker.test(line)) {
    return ""
  }

  return line.replace(/\s+/g, " ").trim()
}

function normalizeLessonLines(text: string) {
  return (text || "")
    .split("\n")
    .map((line) => normalizeLessonLine(line))
    .filter(Boolean)
}

function normalizedExampleLabel(rawLabel: string) {
  return /^exemples$/i.test((rawLabel || "").trim()) ? "Exemples :" : "Exemple :"
}

function getExampleLineParts(line: string) {
  const match = (line || "").trim().match(/^(exemples?)\s*:?\s*(.*)$/i)
  if (!match) return null
  return {
    label: normalizedExampleLabel(match[1]),
    text: (match[2] || "").trim(),
  }
}

function isExampleLabelLine(line: string) {
  const parts = getExampleLineParts(line)
  return !!parts && !parts.text.length
}

function isPartHeadingLine(line: string) {
  if (isExampleLabelLine(line)) return false

  if (/^(important|à retenir|a retenir|attention|règle|regle|définition|definition|astuce|partie|section|chapitre|thème|theme|proposition(?:s)? relative(?:s)?|conditionnels?|voix passive|discours indirect|discours direct)\b/i.test(line)) {
    return true
  }

  return line.length <= 54 && line.split(/\s+/).length <= 7 && !/[.!?]$/.test(line)
}

function frenchLeadLabel(rawLabel: string) {
  const normalized = (rawLabel || "").trim().toLowerCase()
  if (normalized === "a retenir" || normalized === "à retenir") return "À retenir"
  if (normalized === "regle" || normalized === "règle") return "Règle"
  if (normalized === "definition" || normalized === "définition") return "Définition"
  if (normalized === "important") return "Important"
  if (normalized === "attention") return "Attention"
  if (normalized === "astuce") return "Astuce"
  return rawLabel
}

type SectionMethodology = {
  goal: string
  structure: string[]
  steps: string[]
}

function normalizedForMethodology(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sectionMethodologySearchText(section: LessonSection) {
  const chunks: string[] = [section.title]

  for (const block of section.blocks) {
    if (block.type === "paragraph" || block.type === "callout") {
      chunks.push(block.text)
      continue
    }

    if (block.type === "list") {
      chunks.push(...block.items)
      continue
    }

    chunks.push(...block.headers)
    for (const row of block.rows) {
      chunks.push(...row)
    }
  }

  return normalizedForMethodology(chunks.join(" "))
}

function resolveSectionMethodology(section: LessonSection): SectionMethodology {
  const text = sectionMethodologySearchText(section)

  if (/\b(forme passive|voix passive|passive)\b/.test(text)) {
    return {
      goal: "Construire la forme passive",
      structure: ["Sujet", "Verbe", "Préposition"],
      steps: [
        "Repère l'élément principal de la phrase pour poser le sujet.",
        "Choisis le verbe adapté au temps de la phrase.",
        "Ajoute la préposition correcte pour introduire le complément.",
      ],
    }
  }

  if (/\b(proposition relative|propositions relatives|relative)\b/.test(text)) {
    return {
      goal: "Construire une proposition relative",
      structure: ["Nom", "Pronom relatif", "Verbe", "Complément"],
      steps: [
        "Identifie le nom à préciser.",
        "Choisis le bon pronom relatif selon la fonction.",
        "Complète avec un verbe correct et un complément clair.",
      ],
    }
  }

  if (/\b(conditionnel|conditionnelle|if)\b/.test(text)) {
    return {
      goal: "Construire une phrase conditionnelle",
      structure: ["Condition", "Virgule", "Résultat"],
      steps: [
        "Écris la condition avec la bonne forme verbale.",
        "Sépare les deux parties de la phrase correctement.",
        "Formule le résultat avec le temps attendu.",
      ],
    }
  }

  return {
    goal: "Construire la phrase de la leçon",
    structure: ["Sujet", "Verbe", "Complément"],
    steps: [
      "Repère l'idée grammaticale de la section.",
      "Applique la structure pas à pas.",
      "Vérifie la cohérence finale de la phrase.",
    ],
  }
}

function renderPlainFrenchText(text: string, keyPrefix: string): ReactNode {
  const lines = normalizeLessonLines(text)
  if (!lines.length) return null

  return lines.map((line, index) => (
    <span key={`${keyPrefix}-line-${index}`} className={index > 0 ? "block mt-1" : undefined}>
      {stripInlineBoldMarkers(line)}
    </span>
  ))
}

function renderImportantText(text: string, keyPrefix: string): ReactNode {
  const lines = normalizeLessonLines(text)
  if (!lines.length) return null

  let continueExampleOnNextLine = false

  return lines.map((line, index) => {
    const lineKey = `${keyPrefix}-line-${index}`
    const exampleParts = getExampleLineParts(line)
    const leadMatch = line.match(/^(important|a retenir|à retenir|attention|regle|règle|definition|définition|astuce)\s*[:\-]\s*(.+)$/i)

    let content: ReactNode
    if (exampleParts) {
      continueExampleOnNextLine = !exampleParts.text.length
      content = (
        <span className="italic text-[#2f3529]">
          {exampleParts.text
            ? `${exampleParts.label} ${stripInlineBoldMarkers(exampleParts.text)}`
            : exampleParts.label}
        </span>
      )
    } else if (continueExampleOnNextLine && !leadMatch && !isPartHeadingLine(line)) {
      continueExampleOnNextLine = false
      content = <span className="italic text-[#2f3529]">{stripInlineBoldMarkers(line)}</span>
    } else if (leadMatch) {
      continueExampleOnNextLine = false
      content = (
        <>
          <strong className="font-bold text-[#2f3529]">{`${frenchLeadLabel(leadMatch[1])} :`}</strong>{" "}
          {renderInlineBoldText(leadMatch[2], `${lineKey}-detail`)}
        </>
      )
    } else if (isPartHeadingLine(line)) {
      continueExampleOnNextLine = false
      content = <strong className="font-bold text-[#2f3529]">{stripInlineBoldMarkers(line)}</strong>
    } else {
      continueExampleOnNextLine = false
      content = renderInlineBoldText(line, `${lineKey}-text`)
    }

    return (
      <span key={lineKey} className={index > 0 ? "block mt-1" : undefined}>
        {content}
      </span>
    )
  })
}

type AutoExercise = {
  id: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

function normalizeExerciseText(value: string, max = 160) {
  const cleaned = stripInlineBoldMarkers(value || "").replace(/\s+/g, " ").trim()
  if (!cleaned.length) return ""
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 3)}...`
}

function firstSentence(value: string) {
  const cleaned = normalizeExerciseText(value, 220)
  if (!cleaned) return ""

  const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s|$)/)
  if (sentenceMatch) return sentenceMatch[1].trim()
  return cleaned
}

function stableHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function buildChoiceSet(correct: string, wrongCandidates: string[], seedSource: string) {
  const normalizedCorrect = normalizeExerciseText(correct)
  const wrongs = Array.from(
    new Set(
      wrongCandidates
        .map((candidate) => normalizeExerciseText(candidate))
        .filter((candidate) => !!candidate && candidate !== normalizedCorrect),
    ),
  ).slice(0, 3)

  const fallbackWrongs = [
    "Traduire mot à mot sans analyser la structure.",
    "Ignorer le contexte de la phrase.",
    "Mélanger les temps sans repère clair.",
  ]

  for (const fallback of fallbackWrongs) {
    if (wrongs.length >= 3) break
    const candidate = normalizeExerciseText(fallback)
    if (candidate && candidate !== normalizedCorrect && !wrongs.includes(candidate)) {
      wrongs.push(candidate)
    }
  }

  const options = [normalizedCorrect, ...wrongs].slice(0, 4)
  const shift = options.length ? stableHash(seedSource) % options.length : 0
  const choices = options.map((_, index) => options[(index + shift) % options.length])

  return {
    choices,
    correctIndex: choices.indexOf(normalizedCorrect),
  }
}

function extractKeyPoints(section: LessonSection, methodology: SectionMethodology | null) {
  const points: string[] = []

  if (methodology?.goal) {
    points.push(firstSentence(methodology.goal))
  }

  if (methodology?.structure?.length) {
    points.push(`Structure clé : ${methodology.structure.join(" + ")}.`)
  }

  for (const block of section.blocks) {
    if (block.type === "callout") {
      points.push(firstSentence(block.text))
      continue
    }

    if (block.type === "list") {
      for (const item of block.items.slice(0, 3)) {
        points.push(firstSentence(item))
      }
      continue
    }

    if (block.type === "paragraph") {
      points.push(firstSentence(block.text))
      continue
    }

    if (block.type === "table") {
      const preview = block.headers.slice(0, 3).map((value) => normalizeExerciseText(value, 50)).join(" - ")
      if (preview) points.push(`Repère le tableau : ${preview}.`)
    }
  }

  return Array.from(
    new Set(
      points
        .map((point) => normalizeExerciseText(point, 140))
        .filter(Boolean),
    ),
  ).slice(0, 5)
}

function buildAutoExercises(params: {
  section: LessonSection
  methodology: SectionMethodology | null
  keyPoints: string[]
  examples: string[]
}): AutoExercise[] {
  const { section, methodology, keyPoints, examples } = params

  const goal = normalizeExerciseText(
    methodology?.goal || "Appliquer correctement la règle de la section dans une phrase claire.",
    150,
  )

  const structure = methodology?.structure?.length
    ? methodology.structure.join(" + ")
    : "Sujet + Verbe + Complément"

  const sectionMainPoint = keyPoints[0] || "Identifier la structure avant de répondre."
  const sectionExample = normalizeExerciseText(examples[0] || "I choose the right structure before writing.", 150)

  const structureParts = structure.split("+").map((part) => part.trim()).filter(Boolean)
  const reversedStructure = structureParts.length > 1
    ? [...structureParts].reverse().join(" + ")
    : "Verbe + Sujet + Complément"

  const exerciseAChoices = buildChoiceSet(goal, [
    "Mémoriser du vocabulaire sans appliquer la règle.",
    "Écrire rapidement sans vérifier la structure.",
    "Traduire mot à mot sans tenir compte du contexte.",
  ], `${section.id}-goal`)

  const exerciseBChoices = buildChoiceSet(structure, [
    reversedStructure,
    "Verbe + Sujet + Complément",
    "Sujet + Complément (sans verbe)",
  ], `${section.id}-structure`)

  const exerciseCChoices = buildChoiceSet(sectionMainPoint, [
    "Il faut ignorer la ponctuation pour aller plus vite.",
    "Toutes les réponses sont valides si la phrase est longue.",
    "Le contexte n'a pas d'importance pour choisir la forme.",
  ], `${section.id}-point`)

  const exerciseDChoices = buildChoiceSet(sectionExample, [
    "Yesterday I will go to school and maybe gone.",
    "The cat in office because words without link.",
    "Je mélange les temps sans vérifier la règle de la section.",
  ], `${section.id}-example`)

  return [
    {
      id: "goal",
      prompt: "Quel est l'objectif principal de cette section ?",
      choices: exerciseAChoices.choices,
      correctIndex: exerciseAChoices.correctIndex,
      explanation: "Commence toujours par l'objectif de la règle avant de produire ta phrase.",
    },
    {
      id: "structure",
      prompt: "Quelle structure faut-il garder en tête ?",
      choices: exerciseBChoices.choices,
      correctIndex: exerciseBChoices.correctIndex,
      explanation: "Retenir la structure réduit les erreurs de forme et d'ordre des mots.",
    },
    {
      id: "point",
      prompt: "Quel point fait partie de la fiche 'À retenir' ?",
      choices: exerciseCChoices.choices,
      correctIndex: exerciseCChoices.correctIndex,
      explanation: "Les points à retenir résument ce qu'il faut appliquer dans tous les exercices.",
    },
    {
      id: "example",
      prompt: "Quel exemple est cohérent avec la section ?",
      choices: exerciseDChoices.choices,
      correctIndex: exerciseDChoices.correctIndex,
      explanation: "Repérer un bon exemple aide à reproduire la même logique dans tes propres phrases.",
    },
  ]
}

export default function StudentGrammarLessonsPage() {
  const { context, loading } = useAppContext()
  const searchParams = useSearchParams()
  const highlightedDocumentId = (searchParams.get("document") || "").trim()

  const [lessons, setLessons] = useState<StudentGrammarLessonRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTopicKey, setActiveTopicKey] = useState<TopicBucketKey | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [summaryQuery, setSummaryQuery] = useState("")
  const [exerciseAnswersBySection, setExerciseAnswersBySection] = useState<Record<string, Record<string, number>>>({})
  const [exerciseCheckedBySection, setExerciseCheckedBySection] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!context) return

    fetchStudentGrammarLessonsData(db, context.userId, context.activeSchoolId)
      .then((rows) => {
        setLessons(rows as StudentGrammarLessonRow[])
      })
      .catch((loadError: any) => {
        setError(loadError?.message || "Impossible de charger les leçons de grammaire.")
      })
  }, [context?.userId, context?.activeSchoolId])

  const lessonsByTopic = useMemo(() => {
    const map = new Map<TopicBucketKey, StudentGrammarLessonRow[]>()
    for (const topic of COURSE_TOPIC_OPTIONS) {
      map.set(topic.value, [])
    }
    map.set("other", [])

    for (const lesson of lessons) {
      const key = (lesson.topicKey || "other") as TopicBucketKey
      const rows = map.get(key) || []
      rows.push(lesson)
      map.set(key, rows)
    }

    return map
  }, [lessons])

  const availableTopicKeys = useMemo(() => {
    return [...COURSE_TOPIC_OPTIONS.map((topic) => topic.value), "other" as const]
      .filter((topicKey) => (lessonsByTopic.get(topicKey) || []).length > 0)
  }, [lessonsByTopic])

  useEffect(() => {
    if (!lessons.length) {
      setSelectedLessonId(null)
      setActiveTopicKey(null)
      return
    }

    const highlightedLesson = highlightedDocumentId
      ? lessons.find((lesson) => lesson.id === highlightedDocumentId) || null
      : null

    const keepCurrent = selectedLessonId
      ? lessons.find((lesson) => lesson.id === selectedLessonId) || null
      : null

    const preferredTopic = activeTopicKey && (lessonsByTopic.get(activeTopicKey) || []).length
      ? activeTopicKey
      : availableTopicKeys[0] || "other"

    const fallbackLesson = (lessonsByTopic.get(preferredTopic) || [])[0] || lessons[0]
    const nextLesson = highlightedLesson || keepCurrent || fallbackLesson

    if (!nextLesson) return

    setSelectedLessonId(nextLesson.id)
    setActiveTopicKey((nextLesson.topicKey || "other") as TopicBucketKey)
  }, [
    lessons,
    highlightedDocumentId,
    selectedLessonId,
    activeTopicKey,
    lessonsByTopic,
    availableTopicKeys,
  ])

  const parsedByLessonId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseLessonContent>>()
    for (const lesson of lessons) {
      map.set(lesson.id, parseLessonContent(lesson.sourceText, lesson.name))
    }
    return map
  }, [lessons])

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) || null,
    [lessons, selectedLessonId],
  )

  const selectedLessonParsed = selectedLesson
    ? parsedByLessonId.get(selectedLesson.id) || null
    : null

  const selectedSections = selectedLessonParsed?.sections || []
  const normalizedSummaryQuery = normalizedForMethodology(summaryQuery)

  const visibleLessons = useMemo(() => {
    const topicRows = activeTopicKey ? lessonsByTopic.get(activeTopicKey) || [] : []
    if (!normalizedSummaryQuery) return topicRows

    return topicRows.filter((lesson) => {
      if (normalizedForMethodology(lesson.name).includes(normalizedSummaryQuery)) return true

      const parsed = parsedByLessonId.get(lesson.id)
      if (!parsed) return false

      return parsed.sections.some((section) => {
        const titleMatch = normalizedForMethodology(section.title).includes(normalizedSummaryQuery)
        const leadMatch = normalizedForMethodology(sectionLead(section)).includes(normalizedSummaryQuery)
        return titleMatch || leadMatch
      })
    })
  }, [activeTopicKey, lessonsByTopic, normalizedSummaryQuery, parsedByLessonId])

  useEffect(() => {
    if (!visibleLessons.length) return
    if (!selectedLessonId || !visibleLessons.some((lesson) => lesson.id === selectedLessonId)) {
      setSelectedLessonId(visibleLessons[0].id)
    }
  }, [visibleLessons, selectedLessonId])

  useEffect(() => {
    if (!selectedLesson || !selectedSections.length) {
      setSelectedSectionId(null)
      return
    }

    const stillValid = selectedSectionId && selectedSections.some((section) => section.id === selectedSectionId)
    if (stillValid) return

    setSelectedSectionId(selectedSections[0].id)
  }, [selectedLesson?.id, selectedSections, selectedSectionId])

  const activeSection = selectedSections.find((section) => section.id === selectedSectionId) || null

  const activeSectionStorageKey = selectedLesson && activeSection
    ? sectionStorageKey(selectedLesson.id, activeSection.id)
    : null

  const activeQuizStateKey = activeSectionStorageKey ? `${activeSectionStorageKey}:quiz` : null

  const activeExamples = activeSection?.examples.length
    ? activeSection.examples
    : selectedSections.flatMap((section) => section.examples).slice(0, 6)

  const activeMethodology = activeSection ? resolveSectionMethodology(activeSection) : null
  const activeKeyPoints = activeSection ? extractKeyPoints(activeSection, activeMethodology) : []
  const autoExercises = activeSection
    ? buildAutoExercises({
        section: activeSection,
        methodology: activeMethodology,
        keyPoints: activeKeyPoints,
        examples: activeExamples,
      })
    : []

  const activeQuizAnswers = activeQuizStateKey ? exerciseAnswersBySection[activeQuizStateKey] || {} : {}
  const activeQuizChecked = activeQuizStateKey ? !!exerciseCheckedBySection[activeQuizStateKey] : false

  const answeredExerciseCount = autoExercises.reduce((sum, exercise) => (
    typeof activeQuizAnswers[exercise.id] === "number" ? sum + 1 : sum
  ), 0)

  const allExercisesAnswered = autoExercises.length > 0 && answeredExerciseCount === autoExercises.length

  const exerciseScore = autoExercises.reduce((sum, exercise) => {
    const answer = activeQuizAnswers[exercise.id]
    return answer === exercise.correctIndex ? sum + 1 : sum
  }, 0)

  const activeSectionIndex = activeSection
    ? selectedSections.findIndex((section) => section.id === activeSection.id)
    : -1

  const quickSummarySections = normalizedSummaryQuery
    ? selectedSections.filter((section) => {
      const titleMatch = normalizedForMethodology(section.title).includes(normalizedSummaryQuery)
      const leadMatch = normalizedForMethodology(sectionLead(section)).includes(normalizedSummaryQuery)
      return titleMatch || leadMatch
    })
    : selectedSections

  const goToSectionAt = (index: number) => {
    const nextSection = selectedSections[index]
    if (!nextSection) return
    setSelectedSectionId(nextSection.id)
  }

  const setExerciseAnswer = (exerciseId: string, answerIndex: number) => {
    if (!activeQuizStateKey) return

    setExerciseAnswersBySection((previous) => ({
      ...previous,
      [activeQuizStateKey]: {
        ...(previous[activeQuizStateKey] || {}),
        [exerciseId]: answerIndex,
      },
    }))

    setExerciseCheckedBySection((previous) => ({
      ...previous,
      [activeQuizStateKey]: false,
    }))
  }

  const validateActiveExercises = () => {
    if (!activeQuizStateKey) return
    setExerciseCheckedBySection((previous) => ({
      ...previous,
      [activeQuizStateKey]: true,
    }))
  }

  const resetActiveExercises = () => {
    if (!activeQuizStateKey) return

    setExerciseAnswersBySection((previous) => ({
      ...previous,
      [activeQuizStateKey]: {},
    }))

    setExerciseCheckedBySection((previous) => ({
      ...previous,
      [activeQuizStateKey]: false,
    }))
  }

  const renderLessonBlock = (block: LessonBlock, key: string) => {
    if (block.type === "paragraph") {
      return (
        <p key={key} className="font-sans text-[14px] text-text-dark leading-relaxed whitespace-pre-wrap">
          {renderImportantText(block.text, `${key}-paragraph`)}
        </p>
      )
    }

    if (block.type === "list") {
      return (
        <ul key={key} className="list-disc pl-5 space-y-1.5 font-sans text-[14px] text-text-dark leading-relaxed">
          {block.items.map((item, index) => (
            <li key={`${key}-item-${index}`}>
              <span className={cn(
                "inline",
                !!getExampleLineParts(item) && "rounded-md border border-abricot/30 bg-abricot/12 px-1.5 py-0.5 italic",
              )}>
                {renderImportantText(item, `${key}-item-${index}`)}
              </span>
            </li>
          ))}
        </ul>
      )
    }

    if (block.type === "table") {
      return (
        <div key={key} className="rounded-lg border border-gray-light bg-card overflow-x-auto">
          <table className="min-w-full border-collapse font-sans text-[13px]">
            <thead>
              <tr className="bg-navy/6 border-b border-gray-light">
                {block.headers.map((header, index) => (
                  <th
                    key={`${key}-head-${index}`}
                    className="px-2.5 py-2 text-left font-semibold text-navy whitespace-nowrap"
                  >
                    {renderInlineBoldText(header, `${key}-head-${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`} className="border-b border-gray-light last:border-b-0">
                  {block.headers.map((_, colIndex) => (
                    <td
                      key={`${key}-cell-${rowIndex}-${colIndex}`}
                      className="px-2.5 py-1.5 text-text-dark whitespace-nowrap"
                    >
                      {renderInlineBoldText(row[colIndex] || "-", `${key}-cell-${rowIndex}-${colIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    const calloutToneClass = block.tone === "example"
      ? "border-abricot/45 bg-abricot/12 text-text-dark"
      : block.tone === "tip"
        ? "border-navy-light/45 bg-navy-light/12 text-text-dark"
        : block.tone === "warning"
          ? "border-watermelon/35 bg-watermelon/10 text-text-dark"
          : "border-violet/40 bg-violet/10 text-text-dark"

    return (
      <div key={key} className={cn("rounded-lg border px-3 py-2.5", calloutToneClass)}>
        <div className="font-sans text-[11px] uppercase tracking-[0.04em] font-bold text-text-mid mb-1">
          {frenchCalloutLabel(block.label)}
        </div>
        <div className={cn("font-sans text-[13px] leading-relaxed", block.tone === "example" && "italic")}>
          {renderImportantText(block.text, `${key}-callout`)}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des leçons...</div>
  }

  const lessonCompletion = selectedSections.length
    ? Math.round(((Math.max(activeSectionIndex, 0) + 1) / selectedSections.length) * 100)
    : 0

  const readTimeMinutes = selectedSections.length
    ? Math.max(
      4,
      Math.ceil(
        selectedSections.reduce((sum, section) => sum + Math.max(1, section.blocks.length), 0) * 0.7,
      ),
    )
    : 4

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-[#d7cfbe] bg-[radial-gradient(circle_at_top_right,_#f5eddc_0%,_#efe4ce_46%,_#e9dcc4_100%)] p-4 md:p-6">
      <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-abricot/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-8 h-48 w-48 rounded-full bg-navy/8 blur-3xl" />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ccbda3] bg-[#f6eedf] px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
              <Icons.Book className="h-4 w-4" />
              Mode manuel interactif
            </div>
            <h3 className="font-serif text-[24px] leading-tight font-bold text-[#2d3228] mt-2">
              Bases grammaticales et conjugaison
            </h3>
            <p className="font-sans text-[13px] text-[#5f5a51] mt-1">
              Ouvre la leçon comme un livre: page cours à gauche, page compréhension à droite.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-lg border border-[#ccbda3] bg-[#f7f0e3] px-3 py-2 font-sans text-[12px] text-[#5f5a51]">
              {selectedSections.length} section(s) - {readTimeMinutes} min
            </div>
            <div className="rounded-lg border border-[#ccbda3] bg-[#f7f0e3] px-3 py-2 font-sans text-[12px] text-[#5f5a51]">
              Avancement leçon: {lessonCompletion}%
            </div>
            <Link
              href="/student/course-exercises"
              className="inline-flex items-center justify-center rounded-[10px] bg-navy px-3.5 py-2 font-sans text-[13px] font-semibold text-white hover:bg-navy-mid transition-colors"
            >
              Retour aux exercices
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-watermelon/35 bg-watermelon/10 px-3 py-2 font-sans text-sm text-watermelon">
            {error}
          </div>
        )}

        {!lessons.length && (
          <div className="rounded-xl border border-[#d8cfbf] bg-[#fffaf0] p-4 font-sans text-sm text-[#5f5a51]">
            Aucune leçon de grammaire n'est disponible pour le moment.
          </div>
        )}

        {!!lessons.length && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[18px] border border-[#d7cfbe] bg-[#f7efde] p-4 shadow-[0_8px_22px_rgba(67,58,43,0.07)]">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-sans text-[12px] uppercase tracking-[0.06em] font-bold text-[#6f6558]">Sommaire de la catégorie</div>
                  <p className="font-sans text-[12px] text-[#6b6459] mt-1">
                    Clique sur un thème, puis sur la leçon ou la section recherchée.
                  </p>
                </div>

                <div className="relative w-full md:w-[320px]">
                  <Icons.Search className="w-4 h-4 text-[#8b8172] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={summaryQuery}
                    onChange={(event) => setSummaryQuery(event.target.value)}
                    placeholder="Rechercher un thème, une leçon, une section..."
                    className="w-full h-10 rounded-lg border border-[#cfbea3] bg-[#fff9ef] pl-9 pr-3 font-sans text-[13px] text-[#4f4b43] placeholder:text-[#958d81] outline-none focus:border-navy"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {availableTopicKeys.map((topicKey) => {
                  const rows = lessonsByTopic.get(topicKey as TopicBucketKey) || []
                  const active = activeTopicKey === topicKey

                  return (
                    <button
                      key={`topic-${topicKey}`}
                      type="button"
                      onClick={() => {
                        const typedTopic = topicKey as TopicBucketKey
                        setActiveTopicKey(typedTopic)
                        if (!rows.length) return
                        setSelectedLessonId(rows[0].id)
                        const nextSections = parsedByLessonId.get(rows[0].id)?.sections || []
                        setSelectedSectionId(nextSections[0]?.id || null)
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-sans text-[12px] font-semibold transition-colors",
                        active
                          ? "border-[#5d6f95] bg-[#dfe6f6] text-navy"
                          : "border-[#ccbda3] bg-[#fff8ed] text-[#655d52] hover:border-navy/35 hover:text-navy",
                      )}
                    >
                      <span>{topicLabel(topicKey as TopicBucketKey)}</span>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-[#7b756c] border border-[#d8cfbf]">
                        {rows.length}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
                <div className="rounded-lg border border-[#d8cfbf] bg-[#fffaf0] p-3">
                  <div className="font-sans text-[12px] uppercase tracking-[0.06em] font-bold text-[#6f6558] mb-2">Leçons disponibles</div>
                  <div className="flex flex-col gap-2 max-h-[240px] overflow-auto pr-1">
                    {visibleLessons.map((lesson, lessonIndex) => {
                      const active = selectedLessonId === lesson.id
                      const highlighted = !!highlightedDocumentId && lesson.id === highlightedDocumentId
                      const parsed = parsedByLessonId.get(lesson.id)
                      const sectionCount = parsed?.sections.length || 0

                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => {
                            setSelectedLessonId(lesson.id)
                            setSelectedSectionId((parsed?.sections || [])[0]?.id || null)
                          }}
                          className={cn(
                            "text-left rounded-lg border px-3 py-2 transition-colors",
                            active
                              ? "border-[#556487] bg-[#e8edf8]"
                              : highlighted
                                ? "border-[#8f7ea8] bg-[#ece4f5]"
                                : "border-[#d8cfbf] bg-[#fffaf0] hover:border-navy/35",
                          )}
                        >
                          <div className="font-sans text-[11px] uppercase tracking-[0.06em] text-[#8a8175]">Leçon {lessonIndex + 1}</div>
                          <div className="font-serif text-[15px] font-semibold text-[#2f3529] leading-snug mt-0.5">{lesson.name}</div>
                          <div className="font-sans text-[11px] text-[#7f786f] mt-1">{sectionCount} section(s)</div>
                        </button>
                      )
                    })}

                    {!visibleLessons.length && (
                      <div className="font-sans text-xs text-[#7f786f]">
                        Aucune leçon ne correspond à la recherche pour ce thème.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-[#d8cfbf] bg-[#fffaf0] p-3">
                  <div className="font-sans text-[12px] uppercase tracking-[0.06em] font-bold text-[#6f6558] mb-2">Sections à ouvrir</div>
                  <div className="flex flex-wrap gap-2">
                    {quickSummarySections.map((section, index) => {
                      const isActive = activeSection?.id === section.id
                      return (
                        <button
                          key={`summary-section-${section.id}`}
                          type="button"
                          onClick={() => setSelectedSectionId(section.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-sans text-[12px] font-semibold transition-colors",
                            isActive
                              ? "border-[#6f83ad] bg-[#e5ecfb] text-navy"
                              : "border-[#cfbea3] bg-white text-[#655d52] hover:border-navy/35 hover:text-navy",
                          )}
                        >
                          <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-white border border-[#d5c7b0] text-[10px]">
                            {index + 1}
                          </span>
                          {normalizeLessonLine(section.title) || "Section"}
                        </button>
                      )
                    })}

                    {!quickSummarySections.length && (
                      <div className="font-sans text-xs text-[#7f786f]">
                        Aucune section ne correspond à la recherche actuelle.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] gap-4">
              <section className="rounded-[22px] border border-[#d0c4ad] bg-[linear-gradient(135deg,_#fffaf1_0%,_#f8efde_100%)] p-4 md:p-5 flex flex-col gap-4 shadow-[0_14px_28px_rgba(45,39,28,0.18)]">
                <div className="flex items-center justify-between gap-3 border-b border-[#d8ccb8] pb-3">
                  <div>
                    <div className="font-sans text-[11px] uppercase tracking-[0.08em] font-bold text-[#7b7265]">Page cours complète</div>
                    <h4 className="font-serif text-[24px] leading-tight font-bold text-[#2f3529] mt-0.5">
                      {selectedLessonParsed?.title || selectedLesson?.name || "Leçon"}
                    </h4>
                  </div>
                  <span className="inline-flex rounded-md border border-[#cfbea3] bg-[#fff8eb] px-2.5 py-1 font-sans text-[11px] font-semibold text-[#726a5e]">
                    {selectedSections.length} section(s)
                  </span>
                </div>

                {selectedLesson && !selectedLesson.sourceText.trim() && (
                  <div className="rounded-lg border border-watermelon/30 bg-watermelon/10 px-3 py-2.5 font-sans text-[13px] text-text-dark">
                    Le contenu texte de cette leçon n'est pas encore disponible. Demande à ton professeur d'ajouter le texte IA dans le document.
                  </div>
                )}

                {!!selectedSections.length && (
                  <div className="rounded-xl border border-[#d8cfbf] bg-[#fffdf6] p-3">
                    <div className="font-sans text-[11px] uppercase tracking-[0.06em] font-bold text-[#7f776b] mb-2">Repères de section</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSections.map((section, index) => {
                        const isActive = activeSection?.id === section.id
                        return (
                          <button
                            key={`section-nav-${section.id}`}
                            type="button"
                            onClick={() => setSelectedSectionId(section.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-sans text-[12px] font-semibold transition-colors",
                              isActive
                                ? "border-[#6f83ad] bg-[#e5ecfb] text-navy"
                                : "border-[#cfbea3] bg-white text-[#665e53] hover:border-navy/35 hover:text-navy",
                            )}
                          >
                            <span className="inline-flex w-5 h-5 items-center justify-center rounded-full border border-[#d5c7b0] bg-white text-[10px]">
                              {index + 1}
                            </span>
                            {normalizeLessonLine(section.title) || "Section"}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 max-h-[860px] overflow-auto pr-1">
                  {selectedSections.map((section, index) => {
                    const isActive = activeSection?.id === section.id
                    const lead = sectionLead(section)
                    const displaySectionTitle = normalizeLessonLine(section.title) || "Section"

                    return (
                      <article
                        key={section.id}
                        className={cn(
                          "rounded-xl border",
                          isActive
                            ? "border-[#7f8db0] bg-[#edf2fb]"
                            : "border-[#d8cfbf] bg-[#fffaf0]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSectionId(section.id)}
                          className="w-full px-3.5 py-3 text-left"
                        >
                          <div className="inline-flex items-center gap-2 rounded-full border border-[#d6c6ad] bg-[#fff4e2] px-2.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.07em] text-[#7b7265]">
                            Section {index + 1}
                          </div>
                          <h5 className="font-serif text-[21px] font-bold text-[#313528] leading-snug mt-1">{displaySectionTitle}</h5>
                          {!!lead && <div className="font-sans text-[12px] text-[#676157] mt-1">{lead}</div>}
                        </button>

                        <div className="px-3.5 pb-3.5 border-t border-[#ddcfbd] flex flex-col gap-3 pt-3">
                          {section.blocks.map((block, blockIndex) => renderLessonBlock(block, `${section.id}-${blockIndex}`))}

                          {!!section.examples.length && (
                            <div className="rounded-lg border border-abricot/35 bg-abricot/12 px-3 py-2.5">
                              <div className="font-sans text-[11px] uppercase tracking-[0.04em] font-bold text-[#8a6f41] mb-1">Exemples rapides</div>
                              <ul className="list-disc pl-5 space-y-1.5 font-sans text-[13px] text-text-dark italic">
                                {section.examples.slice(0, 3).map((example, exampleIndex) => (
                                  <li key={`${section.id}-example-${exampleIndex}`}>{renderPlainFrenchText(example, `${section.id}-example-${exampleIndex}`)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}

                  {!selectedSections.length && (
                    <div className="rounded-lg border border-[#d8cfbf] bg-[#fffaf0] px-3.5 py-3 font-sans text-sm text-[#665e53]">
                      Sélectionne une leçon pour afficher la version complète.
                    </div>
                  )}
                </div>

                {!!selectedSections.length && (
                  <div className="mt-auto border-t border-[#d8ccb8] pt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => goToSectionAt(activeSectionIndex - 1)}
                      disabled={activeSectionIndex <= 0}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#cfbea3] bg-[#fff8eb] px-2.5 py-1.5 font-sans text-[12px] font-semibold text-[#625a50] disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Icons.ChevronLeft className="h-3.5 w-3.5" />
                      Section précédente
                    </button>

                    <button
                      type="button"
                      onClick={() => goToSectionAt(activeSectionIndex + 1)}
                      disabled={activeSectionIndex < 0 || activeSectionIndex >= selectedSections.length - 1}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#7a8cb3] bg-[#dde6f8] px-2.5 py-1.5 font-sans text-[12px] font-semibold text-navy disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      Section suivante
                      <Icons.ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-[22px] border border-[#d0c4ad] bg-[linear-gradient(215deg,_#fff9ee_0%,_#f7ecd8_100%)] p-4 md:p-5 flex flex-col gap-4 shadow-[0_12px_24px_rgba(45,39,28,0.12)]">
                <div className="flex items-center justify-between gap-3 border-b border-[#d8ccb8] pb-3">
                  <div>
                    <div className="font-sans text-[11px] uppercase tracking-[0.08em] font-bold text-[#7b7265]">Page compréhension</div>
                    <h4 className="font-serif text-[22px] leading-tight font-bold text-[#2f3529] mt-0.5">Fiche cible et mini-exercices</h4>
                  </div>
                  <span className="inline-flex rounded-md border border-[#cfbea3] bg-[#fff8eb] px-2.5 py-1 font-sans text-[11px] font-semibold text-[#726a5e]">
                    Auto-corrigé
                  </span>
                </div>

                {!activeSection && (
                  <div className="rounded-lg border border-[#d8cfbf] bg-[#fffaf0] px-3.5 py-3 font-sans text-sm text-[#665e53]">
                    Choisis une section sur la page cours pour afficher la fiche "À retenir" et les exercices auto-corrigés.
                  </div>
                )}

                {activeSection && (
                  <>
                    <div className="rounded-xl border border-[#aab8d9] bg-[#edf3ff] p-3.5">
                      <div className="font-sans text-[11px] uppercase tracking-[0.06em] font-bold text-[#5f6d8d] mb-1">Fiche cible - points majeurs</div>
                      <div className="font-serif text-[19px] font-bold text-[#33405a] mb-2">{normalizeLessonLine(activeSection.title) || "Section"}</div>

                      {!!activeMethodology?.structure.length && (
                        <div className="rounded-lg border border-[#cad6ee] bg-white/70 px-2.5 py-2 mb-2.5">
                          <div className="font-sans text-[10px] uppercase tracking-[0.05em] font-bold text-[#697596] mb-1">Structure à garder</div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {activeMethodology.structure.map((part, index) => (
                              <span key={`method-structure-${index}`} className="inline-flex items-center gap-1.5">
                                <span className="inline-flex rounded-md border border-[#b7c5e4] bg-white px-2 py-0.5 font-sans text-[11px] font-semibold text-[#36425e]">
                                  {part}
                                </span>
                                {index < activeMethodology.structure.length - 1 && (
                                  <span className="font-sans text-[11px] font-semibold text-[#7f7c76]">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <ul className="list-disc pl-5 space-y-1.5 font-sans text-[13px] text-text-dark leading-relaxed">
                        {activeKeyPoints.map((point, index) => (
                          <li key={`key-point-${index}`}>{point}</li>
                        ))}
                      </ul>

                      {!!activeExamples.length && (
                        <div className="mt-2.5 rounded-lg border border-abricot/35 bg-abricot/12 px-2.5 py-2">
                          <div className="font-sans text-[11px] font-semibold text-[#8a6f41] mb-1">Exemple modèle</div>
                          <div className="font-sans text-[12px] italic text-[#3d3a34]">
                            {renderPlainFrenchText(activeExamples[0], "active-example-focus")}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#97a6c7] bg-[#ebf1ff] p-3.5">
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div>
                          <div className="font-sans text-[12px] font-semibold text-navy">Exercices de vérification</div>
                          <div className="font-sans text-[11px] text-[#66615a]">Réponds puis lance la correction automatique.</div>
                        </div>
                        <span className="font-sans text-[11px] font-semibold text-[#5d5a54]">
                          {answeredExerciseCount}/{autoExercises.length} répondu(s)
                        </span>
                      </div>

                      <div className="flex flex-col gap-3">
                        {autoExercises.map((exercise, exerciseIndex) => {
                          const selectedAnswer = activeQuizAnswers[exercise.id]

                          return (
                            <div key={`exercise-${exercise.id}`} className="rounded-lg border border-[#bdc8df] bg-white/80 px-3 py-2.5">
                              <div className="font-sans text-[12px] font-semibold text-[#33405a] mb-2">
                                {exerciseIndex + 1}. {exercise.prompt}
                              </div>

                              <div className="flex flex-col gap-1.5">
                                {exercise.choices.map((choice, choiceIndex) => {
                                  const isSelected = selectedAnswer === choiceIndex
                                  const isCorrectChoice = choiceIndex === exercise.correctIndex

                                  return (
                                    <button
                                      key={`exercise-${exercise.id}-choice-${choiceIndex}`}
                                      type="button"
                                      onClick={() => setExerciseAnswer(exercise.id, choiceIndex)}
                                      className={cn(
                                        "rounded-md border px-2.5 py-1.5 text-left font-sans text-[12px] transition-colors",
                                        !activeQuizChecked && isSelected && "border-[#6f83ad] bg-[#e8eefb] text-navy",
                                        !activeQuizChecked && !isSelected && "border-[#cfdae8] bg-white hover:border-[#98aacb]",
                                        activeQuizChecked && isCorrectChoice && "border-[#5c7c4c] bg-[#e7f4dc] text-[#2f4a24]",
                                        activeQuizChecked && isSelected && !isCorrectChoice && "border-watermelon/45 bg-watermelon/10 text-watermelon-dark",
                                        activeQuizChecked && !isSelected && !isCorrectChoice && "border-[#cfdae8] bg-white/70 text-[#5d5952]",
                                      )}
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        {activeQuizChecked && isCorrectChoice && <Icons.Check className="w-3.5 h-3.5" />}
                                        {choice}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>

                              {activeQuizChecked && (
                                <div className="mt-2 rounded-md border border-[#cad6ee] bg-[#f7f9ff] px-2.5 py-1.5 font-sans text-[11px] text-[#535e77]">
                                  {exercise.explanation}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={validateActiveExercises}
                          disabled={!allExercisesAnswered}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#7a8cb3] bg-[#dde6f8] px-3 py-1.5 font-sans text-[12px] font-semibold text-navy disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          Corriger mes réponses
                        </button>

                        <button
                          type="button"
                          onClick={resetActiveExercises}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#cfbea3] bg-[#fff8eb] px-3 py-1.5 font-sans text-[12px] font-semibold text-[#625a50]"
                        >
                          Recommencer
                        </button>

                        {activeQuizChecked && (
                          <span className="font-sans text-[12px] font-semibold text-[#5d5a54]">
                            Score: {exerciseScore}/{autoExercises.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-navy/30 bg-navy/8 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="font-sans text-[13px] text-text-dark">
                        Quand la fiche est maîtrisée, passe aux exercices basés sur le cours.
                      </div>
                      <Link
                        href="/student/course-exercises"
                        className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 font-sans text-[12px] font-semibold text-white hover:bg-navy-mid transition-colors"
                      >
                        Pratiquer maintenant
                        <Icons.ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

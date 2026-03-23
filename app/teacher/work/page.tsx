"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherCourseExercisesData, fetchTeacherWorkData, generatePersonalizedExercises } from "@/lib/firebase/client-data"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { collection, addDoc, updateDoc, doc, getDocs, query, where, limit as firestoreLimit, deleteDoc, serverTimestamp } from "firebase/firestore"

type WorkItem = {
  id: string
  assignmentId: string
  classId: string | null
  schoolId: string | null
  studentId: string
  title: string
  student: string
  className: string
  submitted: string
  submittedAtRaw: string | null
  status: string
  statusRaw: "draft" | "submitted" | "graded"
  score: number | null
  feedback: string
  gradedAt: string | null
  contentText: string
  contentPreview: string
  document: {
    id: string
    name: string
    filePath: string
    mimeType?: string | null
    sizeBytes?: number | null
  } | null
  type: string
  level: string
}

type CourseExerciseQuestion = {
  id: string
  prompt: string
  hint?: string
  questionType: "single_choice" | "short_answer"
  options: string[]
}

type CourseQuestionFeedback = {
  isCorrect: boolean | null
  comment: string
}

type CourseWorkItem = {
  id: string
  classId: string | null
  schoolId: string | null
  studentId: string
  student: string
  className: string
  title: string
  submitted: string
  submittedAtRaw: string | null
  status: "Pending" | "Graded"
  statusRaw: "submitted" | "graded"
  level: string
  type: string
  instructions: string
  responseText: string
  responseAnswers: Record<string, string>
  questions: CourseExerciseQuestion[]
  sourceDocumentId: string | null
  sourceDocumentName: string | null
  topicLabel: string | null
  materialLabel: string | null
  teacherFeedback: string
  teacherFeedbackAt: string | null
  teacherQuestionFeedback: Record<string, CourseQuestionFeedback>
  isCompleted: boolean
}

type CourseAnswerRow = {
  key: string
  label: string
  answer: string
}

type FeedbackSections = {
  strengths: string
  improvements: string
  advice: string
}

const FEEDBACK_SECTION_FIELDS: Array<{
  key: keyof FeedbackSections
  label: string
  placeholder: string
  headings: string[]
}> = [
  {
    key: "strengths",
    label: "Points forts",
    placeholder: "Ce que l'élève a bien réussi...",
    headings: ["Points forts"],
  },
  {
    key: "improvements",
    label: "À améliorer",
    placeholder: "Les points à retravailler...",
    headings: ["À améliorer"],
  },
  {
    key: "advice",
    label: "Conseil concret",
    placeholder: "Une action simple pour progresser...",
    headings: ["Conseil concret"],
  },
]

function emptyFeedbackSections(): FeedbackSections {
  return {
    strengths: "",
    improvements: "",
    advice: "",
  }
}

function parseFeedbackSections(feedback: string): FeedbackSections {
  const normalized = feedback.replace(/\r\n/g, "\n").trim()
  if (!normalized) return emptyFeedbackSections()

  const buckets: Record<keyof FeedbackSections, string[]> = {
    strengths: [],
    improvements: [],
    advice: [],
  }

  let activeSection: keyof FeedbackSections | null = null
  let hasSectionHeadings = false

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim()
    let matchedSection: keyof FeedbackSections | null = null

    for (const section of FEEDBACK_SECTION_FIELDS) {
      for (const heading of section.headings) {
        const variants = [
          heading,
          heading.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        ]

        let headingMatch: RegExpMatchArray | null = null
        for (const variant of variants) {
          const escapedLabel = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const matched = line.match(new RegExp(`^${escapedLabel}\\s*:?\\s*(.*)$`, "i"))
          if (matched) {
            headingMatch = matched
            break
          }
        }

        if (!headingMatch) continue

        matchedSection = section.key
        hasSectionHeadings = true
        activeSection = section.key

        const inlineValue = headingMatch[1]?.trim()
        if (inlineValue) buckets[section.key].push(inlineValue)
        break
      }

      if (matchedSection) break
    }

    if (matchedSection) continue

    if (activeSection) {
      buckets[activeSection].push(rawLine)
      continue
    }

    buckets.advice.push(rawLine)
  }

  if (!hasSectionHeadings) {
    return {
      strengths: "",
      improvements: "",
      advice: normalized,
    }
  }

  return {
    strengths: buckets.strengths.join("\n").trim(),
    improvements: buckets.improvements.join("\n").trim(),
    advice: buckets.advice.join("\n").trim(),
  }
}

function formatFeedbackSections(sections: FeedbackSections): string {
  const hasContent = FEEDBACK_SECTION_FIELDS.some((section) => sections[section.key].trim())
  if (!hasContent) return ""

  return FEEDBACK_SECTION_FIELDS.map((section) => `${section.label} :\n${sections[section.key].trim()}`).join("\n\n")
}

function levelColorClass(level: string) {
  if (level === "B2" || level === "C1" || level === "C2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

function statusLabel(status: string) {
  if (status === "Pending") return "En attente"
  if (status === "Graded") return "Corrigé"
  return status
}

function typeLabel(type: string) {
  const key = (type || "").toLowerCase()
  if (key === "quiz") return "Quiz"
  if (key === "reading") return "Lecture"
  if (key === "writing") return "Écriture"
  if (key === "conjugation") return "Conjugaison"
  if (key === "grammar") return "Grammaire"
  if (key === "vocabulary") return "Vocabulaire"
  if (key === "exercise") return "Exercice"
  if (key === "mixed") return "Mixte"
  return type
}

function normalizeFileName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  return cleaned || "document"
}

function parseAnswersFromResponseText(responseText: string): string[] {
  const normalized = (responseText || "").replace(/\r\n/g, "\n").trim()
  if (!normalized) return []

  const parsed = normalized
    .split(/\n{2,}/)
    .map((block) => {
      const match = block.match(/(?:^|\n)\s*(?:R(?:e|é)ponse|Answer)\s*:\s*([\s\S]*)$/i)
      return (match?.[1] || "").trim()
    })

  return parsed.some((answer) => !!answer) ? parsed : []
}

function buildCourseAnswerRows(item: CourseWorkItem): CourseAnswerRow[] {
  const orderedRows = item.questions.map((question, index) => ({
    key: question.id,
    label: `${index + 1}. ${question.prompt}`,
    answer: (item.responseAnswers[question.id] || "").trim(),
  }))

  if (orderedRows.length) {
    if (orderedRows.some((row) => !!row.answer)) return orderedRows

    const fallbackAnswers = parseAnswersFromResponseText(item.responseText)
    if (fallbackAnswers.length) {
      const fallbackRows = orderedRows.map((row, index) => ({
        ...row,
        answer: (fallbackAnswers[index] || "").trim(),
      }))

      if (fallbackRows.some((row) => !!row.answer)) return fallbackRows
    }

    return []
  }

  const rowsFromAnswerMap = Object.entries(item.responseAnswers || {})
    .map(([questionId, answer], index) => ({
      key: questionId,
      label: `Question ${index + 1}`,
      answer: (answer || "").trim(),
    }))
    .filter((row) => !!row.answer)

  if (rowsFromAnswerMap.length) return rowsFromAnswerMap

  return []
}

function previewCourseResponse(item: CourseWorkItem): string {
  const answerRows = buildCourseAnswerRows(item)
  const firstNonEmptyAnswer = answerRows.find((row) => !!row.answer)?.answer || ""
  if (firstNonEmptyAnswer) {
    return firstNonEmptyAnswer.slice(0, 220)
  }

  return (item.responseText || "").trim().slice(0, 220)
}

function previewCourseTeacherFeedback(item: CourseWorkItem): string {
  const globalFeedback = (item.teacherFeedback || "").trim()
  if (globalFeedback) return globalFeedback.slice(0, 220)

  const firstQuestionComment = Object.values(item.teacherQuestionFeedback || {})
    .map((review) => (review.comment || "").trim())
    .find((comment) => !!comment)

  if (firstQuestionComment) return firstQuestionComment.slice(0, 220)

  const hasQuestionMarking = Object.values(item.teacherQuestionFeedback || {})
    .some((review) => typeof review.isCorrect === "boolean")

  if (hasQuestionMarking) return "Retour question par question enregistré."

  return ""
}

export default function WorkPage() {
  const [workView, setWorkView] = useState<"submissions" | "course_exercises">("submissions")
  const [filter, setFilter] = useState<string | string[]>("all")
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [work, setWork] = useState<WorkItem[]>([])
  const [courseWork, setCourseWork] = useState<CourseWorkItem[]>([])
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])

  const [newAssignmentTitle, setNewAssignmentTitle] = useState("E-mail professionnel - production du jour")
  const [newAssignmentClassId, setNewAssignmentClassId] = useState("")
  const [newAssignmentLevel, setNewAssignmentLevel] = useState("B1")
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState("")
  const [newAssignmentFile, setNewAssignmentFile] = useState<File | null>(null)

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [selectedCourseExerciseId, setSelectedCourseExerciseId] = useState<string | null>(null)
  const [gradeScore, setGradeScore] = useState("")
  const [gradeFeedbackSections, setGradeFeedbackSections] = useState<FeedbackSections>(emptyFeedbackSections())
  const [courseFeedbackDraft, setCourseFeedbackDraft] = useState("")
  const [courseQuestionFeedbackDraft, setCourseQuestionFeedbackDraft] = useState<Record<string, CourseQuestionFeedback>>({})
  const [createPersonalized, setCreatePersonalized] = useState(true)
  const [createFlashcards, setCreateFlashcards] = useState(true)

  const [busy, setBusy] = useState(false)
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const assignmentFileInputRef = useRef<HTMLInputElement | null>(null)

  const { context, loading } = useAppContext()

  const loadWork = async () => {
    if (!context) return

    const classFilter = selectedClass === "all" ? null : String(selectedClass)

    const [workResult, courseResult] = await Promise.all([
      fetchTeacherWorkData(
        db,
        context.userId,
        context.activeSchoolId,
        classFilter,
      ),
      fetchTeacherCourseExercisesData(
        db,
        context.userId,
        context.activeSchoolId,
        classFilter,
      ),
    ])

    setWork(workResult.items as WorkItem[])
    setCourseWork(courseResult.items as CourseWorkItem[])

    const classesList = workResult.classes.length >= courseResult.classes.length
      ? workResult.classes
      : courseResult.classes

    setClasses(classesList)

    if (!newAssignmentClassId && classesList.length) {
      setNewAssignmentClassId(classesList[0].id)
    }

    if (selectedSubmissionId && !workResult.items.some((item: WorkItem) => item.id === selectedSubmissionId)) {
      setSelectedSubmissionId(null)
    }

    if (selectedCourseExerciseId && !courseResult.items.some((item: CourseWorkItem) => item.id === selectedCourseExerciseId)) {
      setSelectedCourseExerciseId(null)
    }
  }

  useEffect(() => {
    loadWork()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId, selectedClass])

  const filteredWork = useMemo(() => {
    if (filter === "all") return work
    if (filter === "pending") return work.filter((item) => item.status === "Pending")
    return work.filter((item) => item.status === "Graded")
  }, [filter, work])

  const filteredCourseWork = useMemo(() => {
    if (filter === "all") return courseWork
    if (filter === "pending") return courseWork.filter((item) => item.status === "Pending")
    return courseWork.filter((item) => item.status === "Graded")
  }, [filter, courseWork])

  const selectedWork = useMemo(
    () => work.find((item) => item.id === selectedSubmissionId) || null,
    [selectedSubmissionId, work],
  )

  const selectedCourseWork = useMemo(
    () => courseWork.find((item) => item.id === selectedCourseExerciseId) || null,
    [selectedCourseExerciseId, courseWork],
  )

  const selectedCourseAnswerRows = useMemo(
    () => (selectedCourseWork ? buildCourseAnswerRows(selectedCourseWork) : []),
    [selectedCourseWork],
  )

  const pendingSubmissionCount = useMemo(
    () => work.filter((item) => item.status === "Pending").length,
    [work],
  )

  const pendingCourseCount = useMemo(
    () => courseWork.filter((item) => item.status === "Pending").length,
    [courseWork],
  )

  useEffect(() => {
    if (!selectedWork) {
      setGradeScore("")
      setGradeFeedbackSections(emptyFeedbackSections())
      setCreatePersonalized(true)
      setCreateFlashcards(true)
      return
    }

    setGradeScore(selectedWork.score !== null && selectedWork.score !== undefined ? String(Math.round(selectedWork.score)) : "")
    setGradeFeedbackSections(parseFeedbackSections(selectedWork.feedback || ""))
    setCreatePersonalized(selectedWork.score === null || selectedWork.score === undefined)
  }, [selectedWork?.id, selectedWork?.score, selectedWork?.feedback])

  useEffect(() => {
    if (!selectedCourseWork) {
      setCourseFeedbackDraft("")
      setCourseQuestionFeedbackDraft({})
      return
    }

    setCourseFeedbackDraft(selectedCourseWork.teacherFeedback || "")

    const nextQuestionFeedbackDraft: Record<string, CourseQuestionFeedback> = {}

    for (const [questionId, review] of Object.entries(selectedCourseWork.teacherQuestionFeedback || {})) {
      nextQuestionFeedbackDraft[questionId] = {
        isCorrect: typeof review?.isCorrect === "boolean" ? review.isCorrect : null,
        comment: typeof review?.comment === "string" ? review.comment : "",
      }
    }

    for (const row of selectedCourseAnswerRows) {
      if (nextQuestionFeedbackDraft[row.key]) continue
      nextQuestionFeedbackDraft[row.key] = {
        isCorrect: null,
        comment: "",
      }
    }

    setCourseQuestionFeedbackDraft(nextQuestionFeedbackDraft)
  }, [selectedCourseWork?.id, selectedCourseWork?.teacherFeedback, selectedCourseWork?.teacherQuestionFeedback, selectedCourseAnswerRows])

  const setCourseQuestionFeedback = (questionId: string, update: Partial<CourseQuestionFeedback>) => {
    if (!questionId) return

    setCourseQuestionFeedbackDraft((previous) => ({
      ...previous,
      [questionId]: {
        isCorrect: previous[questionId]?.isCorrect ?? null,
        comment: previous[questionId]?.comment || "",
        ...update,
      },
    }))
  }

  useEffect(() => {
    if (workView !== "submissions") return
    if (selectedSubmissionId || selectedCourseExerciseId) return
    if (work.length > 0) return
    if (courseWork.length === 0) return
    setWorkView("course_exercises")
  }, [
    workView,
    work.length,
    courseWork.length,
    selectedSubmissionId,
    selectedCourseExerciseId,
  ])

  const openDocument = async (
    document: { id: string; name: string; filePath: string },
    download = false,
  ) => {
    try {
      setError(null)
      setBusyDocumentId(document.id)

      const url = await getDownloadURL(ref(storage, document.filePath))

      if (download) {
        const a = window.document.createElement("a")
        a.href = url
        a.download = document.name
        a.target = "_blank"
        a.rel = "noopener noreferrer"
        window.document.body.appendChild(a)
        a.click()
        window.document.body.removeChild(a)
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch (e: any) {
      setError(e.message || "Impossible d'ouvrir le document.")
    } finally {
      setBusyDocumentId(null)
    }
  }

  const createWritingAssignment = async () => {
    if (!context) return
    if (!newAssignmentClassId) {
      setError("Sélectionnez une classe avant de créer le devoir.")
      return
    }
    if (!newAssignmentTitle.trim()) {
      setError("Le titre du devoir est obligatoire.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const dueAt = newAssignmentDueDate ? new Date(`${newAssignmentDueDate}T23:59:59`).toISOString() : null

      const assignmentDocRef = await addDoc(collection(db, "assignments"), {
        school_id: context.activeSchoolId,
        class_id: newAssignmentClassId,
        created_by: context.userId,
        title: newAssignmentTitle.trim(),
        description: "Rédigez un e-mail professionnel en appliquant la structure vue en classe.",
        type: "writing",
        cefr_level: newAssignmentLevel.toLowerCase(),
        due_at: dueAt,
        is_published: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      const createdAssignmentId = assignmentDocRef.id
      const createdAssignmentTitle = newAssignmentTitle.trim()

      let fileAttached = false

      if (newAssignmentFile) {
        const schoolId = context.activeSchoolId
        if (!schoolId) {
          throw new Error("Aucun établissement actif. Impossible d'attacher un document au devoir.")
        }

        const file = newAssignmentFile
        const lastDot = file.name.lastIndexOf(".")
        const extension = lastDot >= 0 ? file.name.slice(lastDot + 1).toLowerCase() : ""
        const baseName = lastDot >= 0 ? file.name.slice(0, lastDot) : file.name
        const normalizedBase = normalizeFileName(baseName)
        const token = Math.random().toString(36).slice(2, 8)
        const filePath = `documents/${context.userId}/assignment-${createdAssignmentId}-${Date.now()}-${token}-${normalizedBase}${extension ? `.${extension}` : ""}`

        const documentDocRef = await addDoc(collection(db, "documents"), {
          school_id: schoolId,
          owner_id: context.userId,
          name: file.name,
          file_path: filePath,
          mime_type: file.type || null,
          size_bytes: file.size,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })

        const createdDocumentId = documentDocRef.id

        try {
          await uploadBytes(ref(storage, filePath), file, {
            contentType: file.type || undefined,
          })
        } catch {
          await deleteDoc(doc(db, "documents", createdDocumentId))
          throw new Error("Le devoir a été créé, mais le téléversement du document a échoué.")
        }

        try {
          await addDoc(collection(db, "document_shares"), {
            document_id: createdDocumentId,
            school_id: schoolId,
            assignment_id: createdAssignmentId,
            shared_by: context.userId,
            created_at: serverTimestamp(),
          })
        } catch {
          await deleteObject(ref(storage, filePath))
          await deleteDoc(doc(db, "documents", createdDocumentId))
          throw new Error("Le devoir a été créé, mais le document n'a pas pu être partagé avec les élèves.")
        }

        fileAttached = true
      }

      await addDoc(collection(db, "activity_events"), {
        school_id: context.activeSchoolId,
        class_id: newAssignmentClassId,
        actor_id: context.userId,
        event_type: "assignment_created",
        payload: {
          text: fileAttached
            ? `Nouveau devoir créé avec document : ${createdAssignmentTitle}`
            : `Nouveau devoir créé : ${createdAssignmentTitle}`,
        },
        created_at: serverTimestamp(),
      })

      setNewAssignmentFile(null)
      setSuccess(fileAttached ? "Devoir créé et document de consigne ajouté." : "Devoir de production écrite créé.")
      await loadWork()
    } catch (e: any) {
      setError(e.message || "Impossible de créer le devoir.")
    } finally {
      setBusy(false)
    }
  }

  const onPickAssignmentFile = () => {
    setError(null)
    setSuccess(null)
    assignmentFileInputRef.current?.click()
  }

  const onAssignmentFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ""
    setNewAssignmentFile(file)
  }

  const saveGrade = async () => {
    if (!context || !selectedWork) return

    const formattedFeedback = formatFeedbackSections(gradeFeedbackSections)
    const improvementsFocus = gradeFeedbackSections.improvements.trim()

    const numericScore = Number(gradeScore)
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setError("La note doit être comprise entre 0 et 100.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const now = new Date().toISOString()

      await updateDoc(doc(db, "submissions", selectedWork.id), {
        status: "graded",
        score: numericScore,
        feedback: formattedFeedback || null,
        graded_at: now,
        graded_by: context.userId,
        submitted_at: selectedWork.submittedAtRaw || now,
        updated_at: serverTimestamp(),
      })

      if (formattedFeedback) {
        await addDoc(collection(db, "teacher_feedback"), {
          school_id: selectedWork.schoolId || context.activeSchoolId,
          class_id: selectedWork.classId,
          teacher_id: context.userId,
          student_id: selectedWork.studentId,
          feedback: formattedFeedback,
          created_at: serverTimestamp(),
        })
      }

      if (createPersonalized) {
        const existingSnapshot = await getDocs(
          query(
            collection(db, "personalized_exercises"),
            where("source_submission_id", "==", selectedWork.id),
            where("student_id", "==", selectedWork.studentId),
            firestoreLimit(1),
          ),
        )

        if (existingSnapshot.empty) {
          const generated = generatePersonalizedExercises({
            assignmentTitle: selectedWork.title,
            improvementsFocus,
            cefrLevel: selectedWork.level,
          })

          if (generated.length) {
            const rows = generated.map((item) => ({
              school_id: selectedWork.schoolId || context.activeSchoolId,
              class_id: selectedWork.classId,
              student_id: selectedWork.studentId,
              source_submission_id: selectedWork.id,
              created_by: context.userId,
              title: item.title,
              instructions: item.instructions,
              exercise_type: item.exerciseType,
              cefr_level: item.cefrLevel,
            }))

            for (const row of rows) {
              await addDoc(collection(db, "personalized_exercises"), {
                ...row,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
              })
            }

            await addDoc(collection(db, "activity_events"), {
              school_id: selectedWork.schoolId || context.activeSchoolId,
              class_id: selectedWork.classId,
              actor_id: context.userId,
              target_user_id: selectedWork.studentId,
              event_type: "assignment_created",
              payload: {
                text: "Un exercice personnalisé a été ajouté après correction.",
              },
              created_at: serverTimestamp(),
            })
          }
        }
      }

      if (createFlashcards) {
        try {
          const idToken = await (await import("@/lib/firebase/client")).auth.currentUser?.getIdToken()
          const flashcardResponse = await fetch("/api/teacher/flashcards/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({ submission_id: selectedWork.id }),
          })
          const flashcardData = await flashcardResponse.json()
          if (flashcardResponse.ok) {
            setSuccess(
              flashcardData.existing
                ? "Correction enregistrée. Flashcards déjà générées."
                : `Correction enregistrée. ${flashcardData.count} flashcard(s) créée(s).`,
            )
          } else {
            setSuccess("Correction enregistrée. Erreur lors de la génération des flashcards.")
          }
        } catch {
          setSuccess("Correction enregistrée. Erreur lors de la génération des flashcards.")
        }
      }

      if (!createFlashcards) {
        setSuccess("Correction enregistrée.")
      }
      await loadWork()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer la correction.")
    } finally {
      setBusy(false)
    }
  }

  const saveCourseExerciseFeedback = async () => {
    if (!context || !selectedCourseWork) return
    if (!selectedCourseWork.studentId) {
      setError("Impossible d'identifier l'élève pour cet exercice.")
      return
    }

    const formattedFeedback = courseFeedbackDraft.trim()
    const formattedQuestionFeedback = Object.entries(courseQuestionFeedbackDraft).reduce((acc, [questionId, review]) => {
      const normalizedQuestionId = questionId.trim()
      if (!normalizedQuestionId) return acc

      const comment = (review.comment || "").trim()
      const hasBooleanReview = typeof review.isCorrect === "boolean"
      if (!hasBooleanReview && !comment) return acc

      const row: { is_correct?: boolean; comment?: string } = {}
      if (hasBooleanReview) row.is_correct = review.isCorrect as boolean
      if (comment) row.comment = comment
      acc[normalizedQuestionId] = row
      return acc
    }, {} as Record<string, { is_correct?: boolean; comment?: string }>)

    const hasQuestionFeedback = Object.keys(formattedQuestionFeedback).length > 0
    if (!formattedFeedback && !hasQuestionFeedback) {
      setError("Ajoutez un commentaire global ou un retour question par question.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const now = new Date().toISOString()

      await updateDoc(doc(db, "personalized_exercises", selectedCourseWork.id), {
        teacher_feedback: formattedFeedback || null,
        teacher_question_feedback: hasQuestionFeedback ? formattedQuestionFeedback : null,
        teacher_feedback_at: now,
        teacher_feedback_by: context.userId,
        updated_at: serverTimestamp(),
      })

      if (formattedFeedback) {
        await addDoc(collection(db, "teacher_feedback"), {
          school_id: selectedCourseWork.schoolId || context.activeSchoolId,
          class_id: selectedCourseWork.classId,
          teacher_id: context.userId,
          student_id: selectedCourseWork.studentId,
          feedback: formattedFeedback,
          source_kind: "course_exercise",
          source_exercise_id: selectedCourseWork.id,
          created_at: serverTimestamp(),
        })
      }

      if (formattedFeedback && hasQuestionFeedback) {
        setSuccess("Correction enregistrée avec commentaires globaux et par question.")
      } else if (formattedFeedback) {
        setSuccess("Commentaire global enregistré pour cet exercice.")
      } else {
        setSuccess("Retour question par question enregistré.")
      }
      await loadWork()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer le commentaire.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des travaux élèves...</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-card rounded-[20px] border border-gray-mid p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <h3 className="font-serif text-lg font-bold text-navy mb-2">Créer un devoir de production écrite</h3>
            <InputField
              label="Titre du devoir"
              placeholder="E-mail professionnel - production du jour"
              icon={<Icons.Clipboard />}
              value={newAssignmentTitle}
              onChange={setNewAssignmentTitle}
            />
          </div>

          <div className="min-w-[220px]">
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Classe</div>
            <BadgeChooser
              selected={newAssignmentClassId}
              onSelect={(value) => setNewAssignmentClassId(String(value))}
              options={classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
            />
          </div>

          <div className="min-w-[140px]">
            <InputField
              label="Date limite"
              type="date"
              value={newAssignmentDueDate}
              onChange={setNewAssignmentDueDate}
            />
          </div>

          <div className="min-w-[190px]">
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Niveau CECRL</div>
            <BadgeChooser
              selected={newAssignmentLevel}
              onSelect={(value) => setNewAssignmentLevel(String(value))}
              options={["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => ({ value: level, label: level }))}
            />
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-gray-light bg-off-white">
          <div className="font-sans text-[13px] font-semibold text-navy mb-2">Document de consigne (optionnel)</div>
          {newAssignmentFile ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-sans text-sm font-semibold text-text-dark truncate">{newAssignmentFile.name}</div>
                <div className="font-sans text-xs text-text-light">
                  {(newAssignmentFile.type || "Fichier").toUpperCase()} &middot; {Math.max(1, Math.round(newAssignmentFile.size / 1024))} KB
                </div>
              </div>
              <ElevateButton variant="ghost" size="sm" onClick={() => setNewAssignmentFile(null)}>
                Retirer
              </ElevateButton>
            </div>
          ) : (
            <div className="font-sans text-sm text-text-mid">Aucun document sélectionné.</div>
          )}

          <input
            ref={assignmentFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.csv,.xlsx,image/*"
            className="hidden"
            onChange={onAssignmentFileChange}
          />

          <div className="mt-3">
            <ElevateButton variant="outline" size="sm" icon={<Icons.Plus />} onClick={onPickAssignmentFile} disabled={busy}>
              Ajouter un document
            </ElevateButton>
          </div>
        </div>

        <div className="mt-4">
          <ElevateButton variant="primary" icon={<Icons.Plus />} onClick={createWritingAssignment} disabled={busy}>
            {busy ? "Création..." : "Créer le devoir"}
          </ElevateButton>
        </div>

        {error && <div className="font-sans text-sm text-watermelon mt-3">{error}</div>}
        {success && <div className="font-sans text-sm text-violet mt-3">{success}</div>}
      </div>

      <div className="bg-card rounded-[20px] border border-gray-mid p-7">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Travaux élèves</h3>
            <p className="text-[13px] text-text-mid">
              {workView === "submissions"
                ? "Soumissions récentes et statut de correction"
                : "Réponses des exercices basés sur les cours et commentaires enseignant"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <BadgeChooser
              selected={workView}
              onSelect={(value) => {
                const nextValue = String(value) === "course_exercises" ? "course_exercises" : "submissions"
                setWorkView(nextValue)
                setSelectedSubmissionId(null)
                setSelectedCourseExerciseId(null)
              }}
              options={[
                { value: "submissions", label: `Travaux écrits${pendingSubmissionCount ? ` (${pendingSubmissionCount})` : ""}` },
                { value: "course_exercises", label: `Exercices cours${pendingCourseCount ? ` (${pendingCourseCount})` : ""}` },
              ]}
            />
            <BadgeChooser
              selected={selectedClass}
              onSelect={setSelectedClass}
              options={[
                { value: "all", label: "Toutes les classes" },
                ...classes.map((classItem) => ({ value: classItem.id, label: classItem.name })),
              ]}
            />
            <BadgeChooser
              selected={filter}
              onSelect={setFilter}
              options={[
                { value: "all", label: "Tous" },
                { value: "pending", label: "En attente" },
                { value: "graded", label: "Corrigés" },
              ]}
            />
          </div>
        </div>

        {workView === "submissions" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredWork.map((item) => (
                <div key={item.id} className="bg-off-white rounded-[14px] border border-gray-light p-[18px] flex flex-col gap-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-sans text-sm font-semibold text-text-dark">{item.title}</div>
                      <div className="font-sans text-xs text-text-light">
                        {item.student} &middot; {item.className} &middot; {item.submitted}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans",
                        item.status === "Pending" ? "bg-abricot/15 text-abricot-dark" : "bg-violet/10 text-violet",
                      )}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  {!!item.contentPreview && (
                    <p className="font-sans text-sm text-text-mid line-clamp-2">{item.contentPreview}</p>
                  )}

                  <div className="flex justify-between items-center">
                    <div className="flex gap-1.5 items-center">
                      <LevelBadge level={item.level} colorClass={levelColorClass(item.level)} />
                      <span className="px-2.5 py-1.5 rounded-lg bg-gray-light font-sans text-xs font-medium text-text-mid">
                        {typeLabel(item.type)}
                      </span>
                      {item.document && (
                        <span className="px-2.5 py-1.5 rounded-lg bg-navy/10 font-sans text-xs font-medium text-navy">Document joint</span>
                      )}
                    </div>

                    {item.score !== null && item.score !== undefined ? (
                      <div
                        className={cn(
                          "font-serif text-xl font-bold",
                          item.score >= 80 ? "text-violet" : item.score >= 60 ? "text-abricot-dark" : "text-watermelon",
                        )}
                      >
                        {Math.round(item.score)}%
                      </div>
                    ) : (
                      <ElevateButton
                        variant="secondary"
                        size="sm"
                        icon={<Icons.Edit />}
                        onClick={() => {
                          setSelectedCourseExerciseId(null)
                          setSelectedSubmissionId(item.id)
                        }}
                      >
                        Noter
                      </ElevateButton>
                    )}
                  </div>

                  {(item.score !== null || item.feedback || item.document || item.contentText) && (
                    <div className="pt-1">
                      <ElevateButton
                        variant="ghost"
                        size="sm"
                        icon={<Icons.Eye />}
                        onClick={() => {
                          setSelectedCourseExerciseId(null)
                          setSelectedSubmissionId(item.id)
                        }}
                      >
                        {item.score !== null ? "Voir la correction" : "Voir la copie"}
                      </ElevateButton>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!filteredWork.length && (
              <div className="mt-4 font-sans text-sm text-text-mid">
                Aucune soumission pour le moment. Côté élève, il faut cliquer sur "Envoyer à l'enseignant" pour que la copie apparaisse ici.
              </div>
            )}

            {selectedWork && (
              <div className="mt-6 rounded-2xl border border-gray-mid bg-off-white p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-serif text-lg font-bold text-navy">Correction - {selectedWork.student}</h4>
                    <div className="font-sans text-xs text-text-light">{selectedWork.title} &middot; {selectedWork.className}</div>
                  </div>
                  <ElevateButton variant="ghost" size="sm" onClick={() => setSelectedSubmissionId(null)}>
                    Fermer
                  </ElevateButton>
                </div>

                {selectedWork.contentText ? (
                  <div className="rounded-xl border border-gray-light bg-card p-4">
                    <div className="font-sans text-[13px] font-semibold text-navy mb-2">Texte de l'élève</div>
                    <p className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed">
                      {selectedWork.contentText}
                    </p>
                  </div>
                ) : (
                  <div className="font-sans text-sm text-text-mid">Aucun texte saisi. Vérifiez le document joint.</div>
                )}

                {selectedWork.document && (
                  <div className="rounded-xl border border-gray-light bg-card p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-sans text-[13px] font-semibold text-navy">Document joint</div>
                      <div className="font-sans text-sm text-text-mid">{selectedWork.document.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDocument(selectedWork.document!, true)}
                        disabled={busyDocumentId === selectedWork.document.id}
                        className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Télécharger"
                      >
                        <Icons.Download />
                      </button>
                      <button
                        onClick={() => openDocument(selectedWork.document!, false)}
                        disabled={busyDocumentId === selectedWork.document.id}
                        className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Aperçu"
                      >
                        <Icons.Eye />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-4 items-start">
                  <InputField
                    label="Note / 100"
                    type="number"
                    value={gradeScore}
                    onChange={setGradeScore}
                    placeholder="80"
                  />
                  <div>
                    <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
                      Retour personnalisé
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {FEEDBACK_SECTION_FIELDS.map((section) => (
                        <div key={section.key} className="rounded-[10px] border-2 border-gray-mid bg-card p-2.5">
                          <div className="font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
                            {section.label}
                          </div>
                          <textarea
                            value={gradeFeedbackSections[section.key]}
                            onChange={(event) =>
                              setGradeFeedbackSections((previous) => ({
                                ...previous,
                                [section.key]: event.target.value,
                              }))
                            }
                            placeholder={section.placeholder}
                            className="w-full min-h-[92px] rounded-[8px] border border-gray-light bg-off-white px-3 py-2 font-sans text-[15px] text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 font-sans text-sm text-text-dark select-none">
                  <input
                    type="checkbox"
                    checked={createPersonalized}
                    onChange={(event) => setCreatePersonalized(event.target.checked)}
                    className="w-[15px] h-[15px] accent-navy"
                  />
                  Générer automatiquement des exercices personnalisés après correction
                </label>

                <label className="flex items-center gap-2 font-sans text-sm text-text-dark select-none">
                  <input
                    type="checkbox"
                    checked={createFlashcards}
                    onChange={(event) => setCreateFlashcards(event.target.checked)}
                    className="w-[15px] h-[15px] accent-navy"
                  />
                  Générer des flashcards à partir des erreurs
                </label>

                <div className="flex gap-2">
                  <ElevateButton variant="primary" icon={<Icons.Check />} onClick={saveGrade} disabled={busy}>
                    Enregistrer la correction
                  </ElevateButton>
                  <ElevateButton variant="ghost" onClick={() => setSelectedSubmissionId(null)} disabled={busy}>
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredCourseWork.map((item) => {
                const responsePreview = previewCourseResponse(item)
                const teacherFeedbackPreview = previewCourseTeacherFeedback(item)

                return (
                  <div key={item.id} className="bg-off-white rounded-[14px] border border-gray-light p-[18px] flex flex-col gap-2.5">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-sans text-sm font-semibold text-text-dark">{item.title}</div>
                        <div className="font-sans text-xs text-text-light">
                          {item.student} &middot; {item.className} &middot; {item.submitted}
                        </div>
                        {(item.sourceDocumentName || item.topicLabel) && (
                          <div className="font-sans text-[11px] text-text-light mt-1 flex flex-wrap gap-1.5">
                            {item.sourceDocumentName && <span>Source: {item.sourceDocumentName}</span>}
                            {item.topicLabel && <span>Thème: {item.topicLabel}</span>}
                          </div>
                        )}
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans",
                          item.status === "Pending" ? "bg-abricot/15 text-abricot-dark" : "bg-violet/10 text-violet",
                        )}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </div>

                    {!!responsePreview && (
                      <p className="font-sans text-sm text-text-mid line-clamp-3 whitespace-pre-wrap">{responsePreview}</p>
                    )}

                    <div className="flex justify-between items-center">
                      <div className="flex gap-1.5 items-center flex-wrap">
                        <LevelBadge level={item.level} colorClass={levelColorClass(item.level)} />
                        <span className="px-2.5 py-1.5 rounded-lg bg-gray-light font-sans text-xs font-medium text-text-mid">
                          {typeLabel(item.type)}
                        </span>
                        {item.materialLabel && (
                          <span className="px-2.5 py-1.5 rounded-lg bg-navy/10 font-sans text-xs font-medium text-navy">
                            {item.materialLabel}
                          </span>
                        )}
                      </div>

                      <ElevateButton
                        variant="secondary"
                        size="sm"
                        icon={item.status === "Pending" ? <Icons.Edit /> : <Icons.Eye />}
                        onClick={() => {
                          setSelectedSubmissionId(null)
                          setSelectedCourseExerciseId(item.id)
                        }}
                      >
                        {item.status === "Pending" ? "Corriger" : "Voir"}
                      </ElevateButton>
                    </div>

                    {!!teacherFeedbackPreview && (
                      <div className="pt-1">
                        <div className="rounded-md border border-navy/20 bg-navy/5 px-2.5 py-2 font-sans text-xs text-text-dark line-clamp-2 whitespace-pre-wrap">
                          {teacherFeedbackPreview}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!filteredCourseWork.length && (
              <div className="mt-4 font-sans text-sm text-text-mid">
                Aucune réponse d'exercice de cours pour le moment. Les élèves doivent valider leurs réponses depuis "Exercices basés sur les cours".
              </div>
            )}

            {selectedCourseWork && (
              <div className="mt-6 rounded-2xl border border-gray-mid bg-off-white p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-serif text-lg font-bold text-navy">Correction exercice de cours - {selectedCourseWork.student}</h4>
                    <div className="font-sans text-xs text-text-light">
                      {selectedCourseWork.title} &middot; {selectedCourseWork.className}
                      {selectedCourseWork.sourceDocumentName ? ` · ${selectedCourseWork.sourceDocumentName}` : ""}
                    </div>
                  </div>
                  <ElevateButton variant="ghost" size="sm" onClick={() => setSelectedCourseExerciseId(null)}>
                    Fermer
                  </ElevateButton>
                </div>

                {!!selectedCourseWork.instructions.trim() && (
                  <div className="rounded-xl border border-gray-light bg-card p-4">
                    <div className="font-sans text-[13px] font-semibold text-navy mb-2">Consigne</div>
                    <p className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed">
                      {selectedCourseWork.instructions}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={selectedCourseWork.level} colorClass={levelColorClass(selectedCourseWork.level)} />
                  <span className="px-2.5 py-1 rounded-md bg-gray-light font-sans text-xs font-semibold text-text-mid">
                    {typeLabel(selectedCourseWork.type)}
                  </span>
                  {selectedCourseWork.topicLabel && (
                    <span className="px-2.5 py-1 rounded-md bg-violet/10 font-sans text-xs font-semibold text-violet">
                      {selectedCourseWork.topicLabel}
                    </span>
                  )}
                  {selectedCourseWork.materialLabel && (
                    <span className="px-2.5 py-1 rounded-md bg-navy/10 font-sans text-xs font-semibold text-navy">
                      {selectedCourseWork.materialLabel}
                    </span>
                  )}
                </div>

                {selectedCourseAnswerRows.length ? (
                  <div className="rounded-xl border border-gray-light bg-card p-4">
                    <div className="font-sans text-[13px] font-semibold text-navy mb-2">Réponses de l'élève</div>
                    <div className="flex flex-col gap-2.5">
                      {selectedCourseAnswerRows.map((row) => {
                        const reviewDraft = courseQuestionFeedbackDraft[row.key] || {
                          isCorrect: null,
                          comment: "",
                        }

                        return (
                          <div key={row.key} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                            <div className="font-sans text-[12px] font-semibold text-text-dark">{row.label}</div>
                            <div className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed mt-1">
                              {row.answer || "(Sans réponse)"}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2.5">
                              <label className="inline-flex items-center gap-2 font-sans text-[12px] text-text-dark select-none">
                                <input
                                  type="checkbox"
                                  checked={reviewDraft.isCorrect === true}
                                  onChange={(event) => setCourseQuestionFeedback(row.key, { isCorrect: event.target.checked })}
                                  className="w-[14px] h-[14px] accent-navy"
                                />
                                Réponse correcte
                              </label>

                              {reviewDraft.isCorrect === false && (
                                <span className="inline-flex rounded-md bg-watermelon/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-watermelon">
                                  À corriger
                                </span>
                              )}

                              {reviewDraft.isCorrect === true && (
                                <span className="inline-flex rounded-md bg-violet/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-violet">
                                  Correct
                                </span>
                              )}
                            </div>

                            <textarea
                              value={reviewDraft.comment}
                              onChange={(event) => setCourseQuestionFeedback(row.key, { comment: event.target.value })}
                              placeholder="Commentaire sur cette réponse..."
                              className="mt-2 w-full min-h-[78px] rounded-[8px] border border-gray-light bg-card px-3 py-2 font-sans text-[13px] text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : selectedCourseWork.responseText ? (
                  <div className="rounded-xl border border-gray-light bg-card p-4">
                    <div className="font-sans text-[13px] font-semibold text-navy mb-2">Réponse de l'élève</div>
                    <p className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed">
                      {selectedCourseWork.responseText}
                    </p>
                  </div>
                ) : (
                  <div className="font-sans text-sm text-text-mid">
                    Réponse non trouvée dans le détail de l'exercice. Vérifiez l'activité de l'élève si besoin.
                  </div>
                )}

                <div>
                  <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
                    Commentaire global (optionnel)
                  </label>
                  <textarea
                    value={courseFeedbackDraft}
                    onChange={(event) => setCourseFeedbackDraft(event.target.value)}
                    placeholder="Ajoutez un retour global complémentaire pour l'élève..."
                    className="w-full min-h-[120px] rounded-[10px] border-2 border-gray-mid bg-card px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                  />
                  {selectedCourseWork.teacherFeedbackAt && (
                    <div className="mt-1.5 font-sans text-[11px] text-text-light">
                      Dernier commentaire: {new Date(selectedCourseWork.teacherFeedbackAt).toLocaleDateString("fr-FR")}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <ElevateButton variant="primary" icon={<Icons.Check />} onClick={saveCourseExerciseFeedback} disabled={busy}>
                    Enregistrer la correction
                  </ElevateButton>
                  <ElevateButton variant="ghost" onClick={() => setSelectedCourseExerciseId(null)} disabled={busy}>
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

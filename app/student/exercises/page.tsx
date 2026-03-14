"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import {
  fetchStudentExercisesData,
  type SubmissionDocumentPayload,
} from "@/lib/firebase/client-data"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { collection, addDoc, updateDoc, doc, getDocs, query, where, deleteDoc, serverTimestamp } from "firebase/firestore"

type AssignmentRow = {
  id: string
  schoolId: string | null
  classId: string | null
  className: string
  title: string
  description: string
  type: string
  cefrLevel: string
  dueAt: string | null
  createdAt: string
  documents: SubmissionDocumentPayload[]
  submission: {
    id: string
    status: "draft" | "submitted" | "graded"
    score: number | null
    feedback: string
    submittedAt: string | null
    gradedAt: string | null
    content: {
      text: string
      document: SubmissionDocumentPayload | null
    }
  } | null
}

function tabForType(type: string) {
  const key = (type || "").toLowerCase()
  if (key === "reading") return "reading"
  if (key === "writing" || key === "project") return "writing"
  return "quiz"
}

type PersonalizedRow = {
  id: string
  title: string
  instructions: string
  type: string
  level: string
  isCompleted: boolean
  dueAt: string | null
  createdAt: string
  readOnly?: boolean
  responseText?: string
  responseSubmittedAt?: string | null
  schoolId?: string | null
  classId?: string | null
}

type ExercisesPayload = {
  classes: Array<{ id: string; name: string }>
  assignments: AssignmentRow[]
  personalizedExercises: PersonalizedRow[]
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

function levelColorClass(level: string) {
  if (level === "C1" || level === "C2") return "watermelon"
  if (level === "B1" || level === "B2") return "abricot"
  return "violet"
}

function statusLabel(status: string) {
  if (status === "draft") return "Brouillon"
  if (status === "submitted") return "Envoyé"
  if (status === "graded") return "Corrigé"
  return "À faire"
}

function typeLabel(type: string) {
  const key = (type || "").toLowerCase()
  if (key === "quiz") return "Quiz"
  if (key === "reading") return "Lecture"
  if (key === "writing") return "Écriture"
  if (key === "grammar") return "Grammaire"
  if (key === "vocabulary") return "Vocabulaire"
  if (key === "exercise") return "Exercice"
  if (key === "mixed") return "Mixte"
  return type
}

function formatFeedbackParagraphs(feedback: string) {
  const normalized = (feedback || "").replace(/\r\n/g, "\n").trim()
  if (!normalized) return [] as string[]

  const explicitParagraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)

  if (explicitParagraphs.length > 1) return explicitParagraphs

  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9À-ÖØ-Þ])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length <= 2) return [normalized]

  const grouped: string[] = []
  for (let index = 0; index < sentences.length; index += 2) {
    grouped.push(sentences.slice(index, index + 2).join(" "))
  }

  return grouped
}

export default function ExercisesPage() {
  const { context, loading } = useAppContext()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("quiz")
  const [data, setData] = useState<ExercisesPayload>({ classes: [], assignments: [], personalizedExercises: [] })
  const [selectedWritingId, setSelectedWritingId] = useState("")
  const [writingText, setWritingText] = useState("")
  const [writingDocument, setWritingDocument] = useState<SubmissionDocumentPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [busyExerciseId, setBusyExerciseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null)
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const requestedTab = searchParams.get("tab")
  const requestedAssignmentId = searchParams.get("assignment")

  const loadData = async () => {
    if (!context) return
    const payload = await fetchStudentExercisesData(db, context.userId, context.activeSchoolId)
    setData(payload)

    setSelectedWritingId((previous) => {
      const writingAssignments = payload.assignments.filter((assignment) => assignment.type === "writing" || assignment.type === "project")
      if (!writingAssignments.length) return ""
      if (previous && writingAssignments.some((assignment) => assignment.id === previous)) return previous
      return writingAssignments[0].id
    })
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId])

  useEffect(() => {
    if (!requestedTab) return
    if (requestedTab === "quiz" || requestedTab === "reading" || requestedTab === "writing" || requestedTab === "personalized") {
      setActiveTab(requestedTab)
    }
  }, [requestedTab])

  const writingAssignments = useMemo(
    () => data.assignments.filter((assignment) => assignment.type === "writing" || assignment.type === "project"),
    [data.assignments],
  )

  const readingAssignments = useMemo(
    () => data.assignments.filter((assignment) => assignment.type === "reading"),
    [data.assignments],
  )

  const quizAssignments = useMemo(
    () => data.assignments.filter((assignment) => assignment.type !== "reading" && assignment.type !== "writing" && assignment.type !== "project"),
    [data.assignments],
  )

  const currentWriting = useMemo(
    () => writingAssignments.find((assignment) => assignment.id === selectedWritingId) || writingAssignments[0] || null,
    [selectedWritingId, writingAssignments],
  )

  useEffect(() => {
    if (!requestedAssignmentId || !data.assignments.length) return
    const target = data.assignments.find((assignment) => assignment.id === requestedAssignmentId)
    if (!target) return

    const targetTab = tabForType(target.type)
    setActiveTab(targetTab)
    if (targetTab === "writing") {
      setSelectedWritingId(target.id)
    }
  }, [requestedAssignmentId, data.assignments])

  useEffect(() => {
    if (!currentWriting) {
      setWritingText("")
      setWritingDocument(null)
      return
    }

    setWritingText(currentWriting.submission?.content.text || "")
    setWritingDocument(currentWriting.submission?.content.document || null)
  }, [currentWriting?.id, currentWriting?.submission?.id, currentWriting?.submission?.status])

  useEffect(() => {
    setExerciseDrafts((previous) => {
      const next = { ...previous }
      const knownIds = new Set(data.personalizedExercises.map((exercise) => exercise.id))

      for (const exercise of data.personalizedExercises) {
        if (typeof next[exercise.id] !== "string") {
          next[exercise.id] = exercise.responseText || ""
        }
      }

      for (const id of Object.keys(next)) {
        if (!knownIds.has(id)) {
          delete next[id]
        }
      }

      return next
    })

    setOpenExerciseId((previous) => {
      if (!previous) return previous
      return data.personalizedExercises.some((exercise) => exercise.id === previous) ? previous : null
    })
  }, [data.personalizedExercises])

  const openDocument = async (document: SubmissionDocumentPayload, download = false) => {
    try {
      setError(null)
      setBusyDocumentId(document.id)
      const url = await getDownloadURL(ref(storage, document.filePath))

      if (download) {
        const a = window.document.createElement("a")
        a.href = url
        a.download = document.name
        a.target = "_blank"
        a.rel = "noopener,noreferrer"
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

  const onUploadDocumentClick = () => {
    setError(null)
    setSuccess(null)
    fileInputRef.current?.click()
  }

  const onUploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file || !context || !currentWriting) return

    const schoolId = currentWriting.schoolId || context.activeSchoolId
    if (!schoolId) {
      setError("Aucun établissement actif trouvé pour ce devoir.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const lastDot = file.name.lastIndexOf(".")
      const extension = lastDot >= 0 ? file.name.slice(lastDot + 1).toLowerCase() : ""
      const baseName = lastDot >= 0 ? file.name.slice(0, lastDot) : file.name
      const normalizedBase = normalizeFileName(baseName)
      const token = Math.random().toString(36).slice(2, 8)
      const filePath = `documents/${context.userId}/submission-${currentWriting.id}-${Date.now()}-${token}-${normalizedBase}${extension ? `.${extension}` : ""}`

      const createdDocumentRef = await addDoc(collection(db, "documents"), {
        school_id: schoolId,
        owner_id: context.userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      if (!createdDocumentRef.id) {
        throw new Error("Impossible d'enregistrer le document.")
      }

      try {
        await uploadBytes(ref(storage, filePath), file, {
          contentType: file.type || undefined,
        })
      } catch (uploadError) {
        await deleteDoc(doc(db, "documents", createdDocumentRef.id))
        throw uploadError
      }

      try {
        await addDoc(collection(db, "document_shares"), {
          document_id: createdDocumentRef.id,
          school_id: schoolId,
          assignment_id: currentWriting.id,
          shared_by: context.userId,
          created_at: serverTimestamp(),
        })
      } catch (shareError) {
        await deleteObject(ref(storage, filePath))
        await deleteDoc(doc(db, "documents", createdDocumentRef.id))
        throw shareError
      }

      setWritingDocument({
        id: createdDocumentRef.id,
        name: file.name,
        filePath,
        mimeType: file.type || null,
        sizeBytes: file.size,
      })

      setSuccess("Document de travail ajouté. N'oubliez pas d'enregistrer ou d'envoyer votre devoir.")
    } catch (e: any) {
      setError(e.message || "Le téléversement du document a échoué.")
    } finally {
      setBusy(false)
    }
  }

  const saveSubmission = async (status: "draft" | "submitted") => {
    if (!context || !currentWriting) return

    const text = writingText.trim()
    if (status === "submitted" && !text && !writingDocument) {
      setError("Ajoutez un texte ou un document avant d'envoyer votre devoir.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const submissionsQuery = query(
        collection(db, "submissions"),
        where("assignment_id", "==", currentWriting.id),
        where("student_id", "==", context.userId),
      )
      const submissionSnapshot = await getDocs(submissionsQuery)
      const existingSubmission = submissionSnapshot.empty
        ? null
        : { id: submissionSnapshot.docs[0].id, ...submissionSnapshot.docs[0].data() as { status: string } }

      if (existingSubmission?.status === "graded") {
        setError("Ce devoir est déjà corrigé. Vous ne pouvez plus le modifier.")
        return
      }

      const payload = {
        text,
        document: writingDocument
          ? {
              id: writingDocument.id,
              name: writingDocument.name,
              filePath: writingDocument.filePath,
              mimeType: writingDocument.mimeType || null,
              sizeBytes: writingDocument.sizeBytes || null,
            }
          : null,
      }

      const mutation = {
        content: payload,
        status,
        submitted_at: status === "submitted" ? new Date().toISOString() : null,
        graded_at: null,
        graded_by: null,
        score: null,
        feedback: null,
      }

      if (existingSubmission?.id) {
        await updateDoc(doc(db, "submissions", existingSubmission.id), {
          ...mutation,
          updated_at: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, "submissions"), {
          assignment_id: currentWriting.id,
          school_id: currentWriting.schoolId || context.activeSchoolId,
          student_id: context.userId,
          ...mutation,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
      }

      if (status === "submitted") {
        await addDoc(collection(db, "activity_events"), {
          school_id: currentWriting.schoolId || context.activeSchoolId,
          class_id: currentWriting.classId,
          actor_id: context.userId,
          target_user_id: context.userId,
          event_type: "submission",
          payload: {
            text: `Devoir envoyé : ${currentWriting.title}`,
          },
          created_at: serverTimestamp(),
        })
      }

      setSuccess(status === "submitted" ? "Votre devoir a été envoyé à votre enseignant." : "Brouillon enregistré.")
      await loadData()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer votre devoir.")
    } finally {
      setBusy(false)
    }
  }

  const setExerciseDraft = (exerciseId: string, value: string) => {
    setExerciseDrafts((previous) => ({ ...previous, [exerciseId]: value }))
  }

  const submitExerciseResponse = async (exercise: PersonalizedRow) => {
    if (!context) return

    const response = (exerciseDrafts[exercise.id] || "").trim()
    if (!response) {
      setError("Écrivez votre réponse avant de valider l'exercice.")
      return
    }

    try {
      setBusyExerciseId(exercise.id)
      setError(null)
      setSuccess(null)

      const now = new Date().toISOString()

      if (!exercise.readOnly) {
        await updateDoc(doc(db, "personalized_exercises", exercise.id), {
          is_completed: true,
          completed_at: now,
          updated_at: serverTimestamp(),
        })
      }

      await addDoc(collection(db, "activity_events"), {
        school_id: exercise.schoolId || context.activeSchoolId,
        class_id: exercise.classId || null,
        actor_id: context.userId,
        target_user_id: context.userId,
        event_type: "completion",
        payload: {
          kind: "personalized_exercise_completion",
          exercise_id: exercise.id,
          title: exercise.title,
          response,
          submitted_at: now,
        },
        created_at: serverTimestamp(),
      })

      setOpenExerciseId(null)
      setSuccess(
        exercise.readOnly
          ? "Réponse enregistrée. Exercice marqué comme terminé en mode simplifié."
          : "Réponse enregistrée. Exercice terminé.",
      )
      await loadData()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer votre réponse.")
    } finally {
      setBusyExerciseId(null)
    }
  }

  const hasReadOnlyPersonalized = data.personalizedExercises.some((exercise) => !!exercise.readOnly)

  const renderPersonalizedExercises = () => (
    <div className="bg-card rounded-[20px] border border-gray-mid p-6">
      <h4 className="font-serif text-base font-bold text-navy mb-3">Exercices personnalisés</h4>
      {hasReadOnlyPersonalized && (
        <div className="mb-3 rounded-lg border border-abricot/30 bg-abricot/10 px-3 py-2 font-sans text-xs text-abricot-dark">
          Ces exercices sont générés automatiquement depuis la correction. Vous pouvez les faire ici et envoyer vos réponses en mode simplifié.
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {data.personalizedExercises.map((exercise) => (
          <div key={exercise.id} className="rounded-xl border border-gray-light bg-off-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-sans text-sm font-semibold text-text-dark">{exercise.title}</div>
                <div className="font-sans text-xs text-text-light mt-0.5">
                  {typeLabel(exercise.type)} &middot; Niveau {exercise.level}
                  {exercise.dueAt ? ` &middot; Échéance ${new Date(exercise.dueAt).toLocaleDateString("fr-FR")}` : ""}
                  {exercise.responseSubmittedAt ? ` &middot; Répondu le ${new Date(exercise.responseSubmittedAt).toLocaleDateString("fr-FR")}` : ""}
                </div>
                <div className="font-sans text-sm text-text-mid mt-2 whitespace-pre-wrap leading-relaxed">{exercise.instructions}</div>

                {!!exercise.isCompleted && !!exercise.responseText && openExerciseId !== exercise.id && (
                  <div className="mt-3 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2.5">
                    <div className="font-sans text-[12px] font-semibold text-violet mb-1">Ma réponse</div>
                    <p className="font-sans text-sm text-text-dark whitespace-pre-wrap leading-relaxed">{exercise.responseText}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {exercise.isCompleted ? (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-violet/10 text-violet">Terminé</span>
                ) : (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-abricot/15 text-abricot-dark">À faire</span>
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
                    ? "Revoir ma réponse"
                    : "Faire l'exercice"}
                </ElevateButton>
              </div>
            </div>

            {openExerciseId === exercise.id && (
              <div className="mt-4 rounded-lg border border-gray-mid bg-card px-3.5 py-3">
                <label className="block font-sans text-[12px] font-semibold text-navy mb-1.5">Votre réponse</label>
                <textarea
                  value={exerciseDrafts[exercise.id] || ""}
                  onChange={(event) => setExerciseDraft(exercise.id, event.target.value)}
                  placeholder="Rédigez votre réponse ici..."
                  className="w-full min-h-[140px] rounded-[10px] border-2 border-gray-mid bg-off-white px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                />
                <div className="mt-3 flex items-center gap-2">
                  <ElevateButton
                    size="sm"
                    variant="primary"
                    onClick={() => submitExerciseResponse(exercise)}
                    disabled={busyExerciseId === exercise.id}
                  >
                    {busyExerciseId === exercise.id ? "Enregistrement..." : exercise.isCompleted ? "Mettre à jour ma réponse" : "Valider ma réponse"}
                  </ElevateButton>
                  <ElevateButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenExerciseId(null)}
                    disabled={busyExerciseId === exercise.id}
                  >
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}
          </div>
        ))}
        {!data.personalizedExercises.length && (
          <div className="font-sans text-sm text-text-mid">Aucun exercice personnalisé pour le moment.</div>
        )}
      </div>
    </div>
  )

  const currentFeedbackParagraphs = useMemo(
    () => formatFeedbackParagraphs(currentWriting?.submission?.feedback || ""),
    [currentWriting?.submission?.feedback],
  )

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des exercices...</div>
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-2 flex-wrap">
        <BadgeChooser
          selected={activeTab}
          onSelect={(value) => setActiveTab(String(value))}
          options={[
            { value: "quiz", label: "Quiz / Grammaire" },
            { value: "reading", label: "Lecture" },
            { value: "writing", label: "Production écrite" },
            { value: "personalized", label: "Personnalisés" },
          ]}
        />
      </div>

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}
      {success && <div className="font-sans text-sm text-violet">{success}</div>}

      {activeTab === "quiz" && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 max-w-[860px]">
          <h3 className="font-serif text-lg font-bold text-navy mb-4">Exercices quiz et grammaire</h3>
          <div className="flex flex-col gap-2.5">
            {quizAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-gray-light bg-off-white p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-sans text-sm font-semibold text-text-dark">{assignment.title}</div>
                  <div className="font-sans text-xs text-text-light">
                    {assignment.className} &middot; {typeLabel(assignment.type)} &middot; {assignment.dueAt ? `Échéance ${new Date(assignment.dueAt).toLocaleDateString("fr-FR")}` : "Sans date limite"}
                  </div>
                  {!!assignment.documents.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assignment.documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => openDocument(doc, false)}
                          disabled={busyDocumentId === doc.id}
                          className="px-2.5 py-1 rounded-md bg-gray-light font-sans text-[11px] font-medium text-navy hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Consigne: {doc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <LevelBadge level={assignment.cefrLevel} colorClass={levelColorClass(assignment.cefrLevel)} />
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-violet/10 text-violet">
                    {statusLabel(assignment.submission?.status || "pending")}
                  </span>
                </div>
              </div>
            ))}
            {!quizAssignments.length && (
              <div className="font-sans text-sm text-text-mid">Aucun quiz disponible pour le moment.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "reading" && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 max-w-[860px]">
          <h3 className="font-serif text-lg font-bold text-navy mb-4">Travaux de lecture</h3>
          <div className="flex flex-col gap-2.5">
            {readingAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-gray-light bg-off-white p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-sans text-sm font-semibold text-text-dark">{assignment.title}</div>
                  <div className="font-sans text-xs text-text-light">
                    {assignment.className} &middot; {assignment.dueAt ? `Échéance ${new Date(assignment.dueAt).toLocaleDateString("fr-FR")}` : "Sans date limite"}
                  </div>
                  {assignment.description && (
                    <div className="font-sans text-xs text-text-mid mt-1">{assignment.description}</div>
                  )}
                  {!!assignment.documents.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assignment.documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => openDocument(doc, false)}
                          disabled={busyDocumentId === doc.id}
                          className="px-2.5 py-1 rounded-md bg-gray-light font-sans text-[11px] font-medium text-navy hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Consigne: {doc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <LevelBadge level={assignment.cefrLevel} colorClass={levelColorClass(assignment.cefrLevel)} />
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-violet/10 text-violet">
                    {statusLabel(assignment.submission?.status || "pending")}
                  </span>
                </div>
              </div>
            ))}
            {!readingAssignments.length && (
              <div className="font-sans text-sm text-text-mid">Aucun devoir de lecture pour le moment.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "writing" && (
        <div className="flex flex-col gap-5 max-w-[900px]">
          <div className="bg-card rounded-[20px] border border-gray-mid p-6">
            <h3 className="font-serif text-lg font-bold text-navy mb-4">Production écrite</h3>

            {!!writingAssignments.length && (
              <div className="mb-4">
                <BadgeChooser
                  selected={currentWriting?.id || ""}
                  onSelect={(value) => setSelectedWritingId(String(value))}
                  options={writingAssignments.map((assignment) => ({ value: assignment.id, label: assignment.title }))}
                />
              </div>
            )}

            {currentWriting ? (
              <>
                <div className="rounded-xl border border-gray-light bg-off-white p-4 mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-sans text-sm font-semibold text-text-dark">{currentWriting.title}</div>
                      <div className="font-sans text-xs text-text-light mt-0.5">
                        {currentWriting.className} &middot; {currentWriting.dueAt ? `Échéance ${new Date(currentWriting.dueAt).toLocaleDateString("fr-FR")}` : "Sans date limite"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LevelBadge level={currentWriting.cefrLevel} colorClass={levelColorClass(currentWriting.cefrLevel)} />
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans",
                          currentWriting.submission?.status === "graded"
                            ? "bg-violet/10 text-violet"
                            : currentWriting.submission?.status === "submitted"
                            ? "bg-abricot/15 text-abricot-dark"
                            : "bg-gray-light text-text-mid",
                        )}
                      >
                        {statusLabel(currentWriting.submission?.status || "pending")}
                      </span>
                    </div>
                  </div>
                  {currentWriting.description && (
                    <div className="font-sans text-sm text-text-mid mt-2">{currentWriting.description}</div>
                  )}

                  {!!currentWriting.documents.length && (
                    <div className="mt-3 rounded-lg border border-gray-light bg-card p-3">
                      <div className="font-sans text-[12px] font-semibold text-navy mb-2">Document(s) de consigne</div>
                      <div className="flex flex-col gap-2">
                        {currentWriting.documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between gap-2">
                            <div className="font-sans text-xs text-text-dark truncate">{doc.name}</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openDocument(doc, true)}
                                disabled={busyDocumentId === doc.id}
                                className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Télécharger"
                              >
                                <Icons.Download />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDocument(doc, false)}
                                disabled={busyDocumentId === doc.id}
                                className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Aperçu"
                              >
                                <Icons.Eye />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
                  Votre texte
                </label>
                <textarea
                  value={writingText}
                  onChange={(event) => setWritingText(event.target.value)}
                  disabled={currentWriting.submission?.status === "graded" || busy}
                  placeholder="Rédigez votre e-mail professionnel ici..."
                  className="w-full min-h-[220px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-[15px] text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)] disabled:opacity-70 disabled:cursor-not-allowed"
                />

                <div className="mt-4 rounded-xl border border-gray-light bg-off-white p-4">
                  <div className="font-sans text-[13px] font-semibold text-navy mb-2">Document personnel (optionnel)</div>

                  {writingDocument ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-sans text-sm font-semibold text-text-dark truncate">{writingDocument.name}</div>
                        <div className="font-sans text-xs text-text-light">
                          {(writingDocument.mimeType || "Fichier").toUpperCase()} &middot; {writingDocument.sizeBytes ? `${Math.max(1, Math.round(writingDocument.sizeBytes / 1024))} KB` : "-"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDocument(writingDocument, true)}
                          disabled={busyDocumentId === writingDocument.id}
                          className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Télécharger"
                        >
                          <Icons.Download />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDocument(writingDocument, false)}
                          disabled={busyDocumentId === writingDocument.id}
                          className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Aperçu"
                        >
                          <Icons.Eye />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="font-sans text-sm text-text-mid">Aucun document ajouté.</div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={onUploadDocument}
                  />

                  <div className="mt-3">
                    <ElevateButton
                      variant="outline"
                      size="sm"
                      icon={<Icons.Plus />}
                      onClick={onUploadDocumentClick}
                      disabled={currentWriting.submission?.status === "graded" || busy}
                    >
                      Ajouter un document
                    </ElevateButton>
                  </div>
                </div>

                <div className="flex gap-2.5 mt-4 flex-wrap">
                  <ElevateButton
                    variant="ghost"
                    size="md"
                    onClick={() => saveSubmission("draft")}
                    disabled={currentWriting.submission?.status === "graded" || busy}
                  >
                    Enregistrer le brouillon
                  </ElevateButton>
                  <ElevateButton
                    variant="primary"
                    size="md"
                    iconRight
                    icon={<Icons.ArrowRight />}
                    onClick={() => saveSubmission("submitted")}
                    disabled={currentWriting.submission?.status === "graded" || busy}
                  >
                    Envoyer à l'enseignant
                  </ElevateButton>
                </div>

                {currentWriting.submission?.status === "graded" && (
                  <div className="mt-5 rounded-xl border border-violet/30 bg-violet/5 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="font-sans text-sm font-semibold text-navy">Correction reçue</div>
                      <div className="font-serif text-2xl font-bold text-violet">{Math.round(currentWriting.submission.score || 0)}%</div>
                    </div>
                    {currentFeedbackParagraphs.length ? (
                      <div className="space-y-3">
                        {currentFeedbackParagraphs.map((paragraph, index) => (
                          <p key={`${currentWriting.submission?.id || "feedback"}-${index}`} className="font-sans text-sm text-text-dark leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="font-sans text-sm text-text-dark">
                        Votre enseignant n'a pas encore ajouté de commentaire détaillé.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="font-sans text-sm text-text-mid">Aucun devoir de production écrite disponible pour le moment.</div>
            )}
          </div>

          {renderPersonalizedExercises()}
        </div>
      )}

      {activeTab === "personalized" && (
        <div className="max-w-[900px]">
          {renderPersonalizedExercises()}
        </div>
      )}
    </div>
  )
}

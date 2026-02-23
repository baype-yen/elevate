"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import {
  fetchStudentExercisesData,
  type SubmissionDocumentPayload,
} from "@/lib/supabase/client-data"

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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const requestedTab = searchParams.get("tab")
  const requestedAssignmentId = searchParams.get("assignment")

  const loadData = async () => {
    if (!context) return
    const supabase = createClient()
    const payload = await fetchStudentExercisesData(supabase, context.userId, context.activeSchoolId)
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
    if (requestedTab === "quiz" || requestedTab === "reading" || requestedTab === "writing") {
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

  const openDocument = async (document: SubmissionDocumentPayload, download = false) => {
    try {
      setError(null)
      setBusyDocumentId(document.id)
      const supabase = createClient()
      const { data: signed, error: signedError } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.filePath, 60 * 10, download ? { download: document.name } : undefined)

      if (signedError || !signed?.signedUrl) {
        throw signedError || new Error("Impossible d'ouvrir le document.")
      }

      window.open(signed.signedUrl, "_blank", "noopener,noreferrer")
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

      const supabase = createClient()
      const lastDot = file.name.lastIndexOf(".")
      const extension = lastDot >= 0 ? file.name.slice(lastDot + 1).toLowerCase() : ""
      const baseName = lastDot >= 0 ? file.name.slice(0, lastDot) : file.name
      const normalizedBase = normalizeFileName(baseName)
      const token = Math.random().toString(36).slice(2, 8)
      const filePath = `${schoolId}/${context.userId}/submission-${currentWriting.id}-${Date.now()}-${token}-${normalizedBase}${extension ? `.${extension}` : ""}`

      const { data: createdDocument, error: createDocumentError } = await supabase
        .from("documents")
        .insert({
          school_id: schoolId,
          owner_id: context.userId,
          name: file.name,
          file_path: filePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id")
        .single()

      if (createDocumentError || !createdDocument) {
        throw createDocumentError || new Error("Impossible d'enregistrer le document.")
      }

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        })

      if (uploadError) {
        await supabase.from("documents").delete().eq("id", createdDocument.id)
        throw uploadError
      }

      const { error: shareError } = await supabase.from("document_shares").insert({
        document_id: createdDocument.id,
        school_id: schoolId,
        assignment_id: currentWriting.id,
        shared_by: context.userId,
      })

      if (shareError) {
        await supabase.storage.from("documents").remove([filePath])
        await supabase.from("documents").delete().eq("id", createdDocument.id)
        throw shareError
      }

      setWritingDocument({
        id: createdDocument.id,
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

      const supabase = createClient()
      const { data: existingSubmission, error: submissionLookupError } = await supabase
        .from("submissions")
        .select("id, status")
        .eq("assignment_id", currentWriting.id)
        .eq("student_id", context.userId)
        .maybeSingle()

      if (submissionLookupError) throw submissionLookupError

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
        const { error: updateError } = await supabase
          .from("submissions")
          .update(mutation)
          .eq("id", existingSubmission.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from("submissions")
          .insert({
            assignment_id: currentWriting.id,
            school_id: currentWriting.schoolId || context.activeSchoolId,
            student_id: context.userId,
            ...mutation,
          })

        if (insertError) throw insertError
      }

      if (status === "submitted") {
        await supabase.from("activity_events").insert({
          school_id: currentWriting.schoolId || context.activeSchoolId,
          class_id: currentWriting.classId,
          actor_id: context.userId,
          target_user_id: context.userId,
          event_type: "submission",
          payload: {
            text: `Devoir envoyé : ${currentWriting.title}`,
          },
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

  const markExerciseCompleted = async (exerciseId: string) => {
    if (!context) return

    try {
      setBusy(true)
      setError(null)
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from("personalized_exercises")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", exerciseId)

      if (updateError) throw updateError
      await loadData()
    } catch (e: any) {
      setError(e.message || "Impossible de mettre à jour l'exercice.")
    } finally {
      setBusy(false)
    }
  }

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
                    <p className="font-sans text-sm text-text-dark">
                      {currentWriting.submission.feedback || "Votre enseignant n'a pas encore ajouté de commentaire détaillé."}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="font-sans text-sm text-text-mid">Aucun devoir de production écrite disponible pour le moment.</div>
            )}
          </div>

          <div className="bg-card rounded-[20px] border border-gray-mid p-6">
            <h4 className="font-serif text-base font-bold text-navy mb-3">Exercices personnalisés</h4>
            <div className="flex flex-col gap-2.5">
              {data.personalizedExercises.map((exercise) => (
                <div key={exercise.id} className="rounded-xl border border-gray-light bg-off-white p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-sans text-sm font-semibold text-text-dark">{exercise.title}</div>
                    <div className="font-sans text-xs text-text-light mt-0.5">
                      {typeLabel(exercise.type)} &middot; Niveau {exercise.level}
                      {exercise.dueAt ? ` &middot; Échéance ${new Date(exercise.dueAt).toLocaleDateString("fr-FR")}` : ""}
                    </div>
                    <div className="font-sans text-sm text-text-mid mt-2">{exercise.instructions}</div>
                  </div>
                  {exercise.isCompleted ? (
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans bg-violet/10 text-violet">Terminé</span>
                  ) : (
                    <ElevateButton size="sm" variant="secondary" onClick={() => markExerciseCompleted(exercise.id)} disabled={busy}>
                      Marquer terminé
                    </ElevateButton>
                  )}
                </div>
              ))}
              {!data.personalizedExercises.length && (
                <div className="font-sans text-sm text-text-mid">Aucun exercice personnalisé pour le moment.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

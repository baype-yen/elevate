"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherWorkData, generatePersonalizedExercises } from "@/lib/supabase/client-data"

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
  if (key === "grammar") return "Grammaire"
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

export default function WorkPage() {
  const [filter, setFilter] = useState<string | string[]>("all")
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [work, setWork] = useState<WorkItem[]>([])
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])

  const [newAssignmentTitle, setNewAssignmentTitle] = useState("E-mail professionnel - production du jour")
  const [newAssignmentClassId, setNewAssignmentClassId] = useState("")
  const [newAssignmentLevel, setNewAssignmentLevel] = useState("B1")
  const [newAssignmentDueDate, setNewAssignmentDueDate] = useState("")
  const [newAssignmentFile, setNewAssignmentFile] = useState<File | null>(null)

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [gradeScore, setGradeScore] = useState("")
  const [gradeFeedback, setGradeFeedback] = useState("")
  const [createPersonalized, setCreatePersonalized] = useState(true)

  const [busy, setBusy] = useState(false)
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const assignmentFileInputRef = useRef<HTMLInputElement | null>(null)

  const { context, loading } = useAppContext()

  const loadWork = async () => {
    if (!context) return

    const supabase = createClient()
    const result = await fetchTeacherWorkData(
      supabase,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    )

    setWork(result.items as WorkItem[])
    setClasses(result.classes)

    if (!newAssignmentClassId && result.classes.length) {
      setNewAssignmentClassId(result.classes[0].id)
    }

    if (selectedSubmissionId && !result.items.some((item: WorkItem) => item.id === selectedSubmissionId)) {
      setSelectedSubmissionId(null)
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

  const selectedWork = useMemo(
    () => work.find((item) => item.id === selectedSubmissionId) || null,
    [selectedSubmissionId, work],
  )

  useEffect(() => {
    if (!selectedWork) {
      setGradeScore("")
      setGradeFeedback("")
      setCreatePersonalized(true)
      return
    }

    setGradeScore(selectedWork.score !== null && selectedWork.score !== undefined ? String(Math.round(selectedWork.score)) : "")
    setGradeFeedback(selectedWork.feedback || "")
    setCreatePersonalized(selectedWork.score === null || selectedWork.score === undefined)
  }, [selectedWork?.id, selectedWork?.score, selectedWork?.feedback])

  const openDocument = async (
    document: { id: string; name: string; filePath: string },
    download = false,
  ) => {
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

      const supabase = createClient()
      const dueAt = newAssignmentDueDate ? new Date(`${newAssignmentDueDate}T23:59:59`).toISOString() : null

      const { data: createdAssignment, error: insertError } = await supabase
        .from("assignments")
        .insert({
          school_id: context.activeSchoolId,
          class_id: newAssignmentClassId,
          created_by: context.userId,
          title: newAssignmentTitle.trim(),
          description: "Rédigez un e-mail professionnel en appliquant la structure vue en classe.",
          type: "writing",
          cefr_level: newAssignmentLevel.toLowerCase(),
          due_at: dueAt,
          is_published: true,
        })
        .select("id, title")
        .single()

      if (insertError || !createdAssignment) throw insertError || new Error("Impossible de créer le devoir.")

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
        const filePath = `${schoolId}/${context.userId}/assignment-${createdAssignment.id}-${Date.now()}-${token}-${normalizedBase}${extension ? `.${extension}` : ""}`

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
          throw createDocumentError || new Error("Le devoir a été créé, mais le document n'a pas pu être enregistré.")
        }

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          })

        if (uploadError) {
          await supabase.from("documents").delete().eq("id", createdDocument.id)
          throw new Error("Le devoir a été créé, mais le téléversement du document a échoué.")
        }

        const { error: shareError } = await supabase
          .from("document_shares")
          .insert({
            document_id: createdDocument.id,
            school_id: schoolId,
            assignment_id: createdAssignment.id,
            shared_by: context.userId,
          })

        if (shareError) {
          await supabase.storage.from("documents").remove([filePath])
          await supabase.from("documents").delete().eq("id", createdDocument.id)
          throw new Error("Le devoir a été créé, mais le document n'a pas pu être partagé avec les élèves.")
        }

        fileAttached = true
      }

      await supabase.from("activity_events").insert({
        school_id: context.activeSchoolId,
        class_id: newAssignmentClassId,
        actor_id: context.userId,
        event_type: "assignment_created",
        payload: {
          text: fileAttached
            ? `Nouveau devoir créé avec document : ${newAssignmentTitle.trim()}`
            : `Nouveau devoir créé : ${newAssignmentTitle.trim()}`,
        },
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

    const numericScore = Number(gradeScore)
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setError("La note doit être comprise entre 0 et 100.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const supabase = createClient()
      const now = new Date().toISOString()

      const { error: updateError } = await supabase
        .from("submissions")
        .update({
          status: "graded",
          score: numericScore,
          feedback: gradeFeedback.trim() || null,
          graded_at: now,
          graded_by: context.userId,
          submitted_at: selectedWork.submittedAtRaw || now,
        })
        .eq("id", selectedWork.id)

      if (updateError) throw updateError

      if (gradeFeedback.trim()) {
        await supabase.from("teacher_feedback").insert({
          school_id: selectedWork.schoolId || context.activeSchoolId,
          class_id: selectedWork.classId,
          teacher_id: context.userId,
          student_id: selectedWork.studentId,
          feedback: gradeFeedback.trim(),
        })
      }

      if (createPersonalized) {
        const { data: existingExercises } = await supabase
          .from("personalized_exercises")
          .select("id")
          .eq("source_submission_id", selectedWork.id)
          .eq("student_id", selectedWork.studentId)
          .limit(1)

        if (!(existingExercises || []).length) {
          const generated = generatePersonalizedExercises({
            assignmentTitle: selectedWork.title,
            score: numericScore,
            feedback: gradeFeedback,
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

            const { error: insertPersonalizedError } = await supabase
              .from("personalized_exercises")
              .insert(rows)

            if (insertPersonalizedError) throw insertPersonalizedError

            await supabase.from("activity_events").insert({
              school_id: selectedWork.schoolId || context.activeSchoolId,
              class_id: selectedWork.classId,
              actor_id: context.userId,
              target_user_id: selectedWork.studentId,
              event_type: "assignment_created",
              payload: {
                text: "Un exercice personnalisé a été ajouté après correction.",
              },
            })
          }
        }
      }

      setSuccess("Correction enregistrée.")
      await loadWork()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer la correction.")
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
            <p className="text-[13px] text-text-mid">Soumissions récentes et statut de correction</p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
                  <ElevateButton variant="secondary" size="sm" icon={<Icons.Edit />} onClick={() => setSelectedSubmissionId(item.id)}>
                    Noter
                  </ElevateButton>
                )}
              </div>

              {(item.score !== null || item.feedback || item.document || item.contentText) && (
                <div className="pt-1">
                  <ElevateButton variant="ghost" size="sm" icon={<Icons.Eye />} onClick={() => setSelectedSubmissionId(item.id)}>
                    {item.score !== null ? "Voir la correction" : "Voir la copie"}
                  </ElevateButton>
                </div>
              )}
            </div>
          ))}
        </div>

        {!filteredWork.length && (
          <div className="mt-4 font-sans text-sm text-text-mid">Aucune soumission pour le moment.</div>
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
                <textarea
                  value={gradeFeedback}
                  onChange={(event) => setGradeFeedback(event.target.value)}
                  placeholder="Points forts, erreurs à corriger, conseils précis..."
                  className="w-full min-h-[130px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-[15px] text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                />
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
      </div>
    </div>
  )
}

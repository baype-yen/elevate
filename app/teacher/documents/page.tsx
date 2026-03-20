"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { auth, db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherDocumentsData } from "@/lib/firebase/client-data"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore"
import {
  COURSE_MATERIAL_TYPE_OPTIONS,
  COURSE_TOPIC_OPTIONS,
  courseMaterialTheme,
  type CourseMaterialTypeKey,
  type CourseTopicKey,
} from "@/lib/course-content/config"

type DocumentRow = {
  id: string
  name: string
  filePath: string
  isTextOnly: boolean
  type: string
  size: string
  date: string
  topicKey: CourseTopicKey | null
  topicLabel: string
  materialType: CourseMaterialTypeKey | null
  materialLabel: string
  sourceText: string
  hasSourceText: boolean
  visibilityMode: DocumentVisibilityMode
  targetClassIds: string[]
  targetClassNames: string[]
  sharedClassIds: string[]
  sharedClassNames: string[]
}

type ClassRow = {
  id: string
  name: string
}

type DocumentVisibilityMode = "student_visible" | "internal_teacher"

const VISIBILITY_OPTIONS: Array<{ value: DocumentVisibilityMode; label: string }> = [
  { value: "student_visible", label: "Visible eleves" },
  { value: "internal_teacher", label: "Interne (non visible eleves)" },
]

function normalizeVisibilityMode(value: unknown): DocumentVisibilityMode {
  return value === "internal_teacher" ? "internal_teacher" : "student_visible"
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

export default function DocumentsPage() {
  const { context, loading } = useAppContext()
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [shareClassIds, setShareClassIds] = useState<string[]>([])
  const [uploadVisibilityMode, setUploadVisibilityMode] = useState<DocumentVisibilityMode>("student_visible")
  const [busy, setBusy] = useState(false)
  const [generatingDocumentId, setGeneratingDocumentId] = useState<string | null>(null)
  const [regeneratingDocumentId, setRegeneratingDocumentId] = useState<string | null>(null)

  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null)
  const [titleDraftByDocument, setTitleDraftByDocument] = useState<Record<string, string>>({})
  const [topicDraftByDocument, setTopicDraftByDocument] = useState<Record<string, CourseTopicKey>>({})
  const [materialDraftByDocument, setMaterialDraftByDocument] = useState<Record<string, CourseMaterialTypeKey>>({})
  const [visibilityDraftByDocument, setVisibilityDraftByDocument] = useState<Record<string, DocumentVisibilityMode>>({})
  const [targetClassDraftByDocument, setTargetClassDraftByDocument] = useState<Record<string, string[]>>({})
  const [sourceDraftByDocument, setSourceDraftByDocument] = useState<Record<string, string>>({})

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [courseTopic, setCourseTopic] = useState<CourseTopicKey>("malls")
  const [courseMaterialType, setCourseMaterialType] = useState<CourseMaterialTypeKey>("text")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadDocuments = async () => {
    if (!context) return
    const data = await fetchTeacherDocumentsData(db, context.userId, context.activeSchoolId)

    const normalizedDocuments: DocumentRow[] = (data.documents || []).map((documentRow: any) => ({
      id: String(documentRow.id || ""),
      name: String(documentRow.name || "Document"),
      filePath: typeof documentRow.filePath === "string" ? documentRow.filePath : "",
      isTextOnly: !!documentRow.isTextOnly,
      type: String(documentRow.type || "FILE"),
      size: String(documentRow.size || "-"),
      date: String(documentRow.date || "-"),
      topicKey: documentRow.topicKey || null,
      topicLabel: String(documentRow.topicLabel || "Ressource hors topic"),
      materialType: documentRow.materialType || null,
      materialLabel: String(documentRow.materialLabel || "Non classe"),
      sourceText: typeof documentRow.sourceText === "string" ? documentRow.sourceText : "",
      hasSourceText: !!documentRow.hasSourceText,
      visibilityMode: normalizeVisibilityMode(documentRow.visibilityMode),
      targetClassIds: Array.isArray(documentRow.targetClassIds)
        ? documentRow.targetClassIds
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0)
        : [],
      targetClassNames: Array.isArray(documentRow.targetClassNames)
        ? documentRow.targetClassNames
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0)
        : [],
      sharedClassIds: Array.isArray(documentRow.sharedClassIds)
        ? documentRow.sharedClassIds
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0)
        : [],
      sharedClassNames: Array.isArray(documentRow.sharedClassNames)
        ? documentRow.sharedClassNames
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0)
        : [],
    }))

    setDocuments(normalizedDocuments)
    setClasses(data.classes)
    setShareClassIds((previous) => {
      const valid = previous.filter((id) => data.classes.some((c) => c.id === id))
      if (valid.length) return valid
      return data.classes.map((c) => c.id)
    })
  }

  useEffect(() => {
    loadDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId])

  const onUploadClick = () => {
    setError(null)
    setSuccess(null)
    fileInputRef.current?.click()
  }

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file || !context) return

    if (context.activeSchoolId && classes.length && !shareClassIds.length) {
      setError("Selectionnez au moins une classe cible pour la generation IA.")
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
      const filePath = `documents/${context.userId}/${Date.now()}-${token}-${normalizedBase}${extension ? `.${extension}` : ""}`

      const storageRef = ref(storage, filePath)
      await uploadBytes(storageRef, file, { contentType: file.type || undefined })

      const createdDocRef = await addDoc(collection(db, "documents"), {
        school_id: context.activeSchoolId,
        owner_id: context.userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        course_topic: courseTopic,
        course_material_type: courseMaterialType,
        course_source_text: null,
        visibility_mode: uploadVisibilityMode,
        target_class_ids: shareClassIds,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      if (context.activeSchoolId && shareClassIds.length) {
        if (uploadVisibilityMode === "student_visible") {
          for (const classId of shareClassIds) {
            await addDoc(collection(db, "document_shares"), {
              document_id: createdDocRef.id,
              school_id: context.activeSchoolId,
              class_id: classId,
              shared_by: context.userId,
              created_at: serverTimestamp(),
            })
          }
        }

        await addDoc(collection(db, "activity_events"), {
          school_id: context.activeSchoolId,
          class_id: shareClassIds[0] || null,
          actor_id: context.userId,
          event_type: "document_uploaded",
          payload: {
            text: uploadVisibilityMode === "internal_teacher"
              ? `${file.name} a ete ajoute comme document interne pour ${shareClassIds.length} classe(s) cible(s).`
              : `${file.name} a ete partage avec ${shareClassIds.length} classe(s).`,
          },
          created_at: serverTimestamp(),
        })
      }

      setSuccess(`Document « ${file.name} » televerse. Cliquez sur "Modifier" pour ajouter le texte IA, puis "Exercices IA".`)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Le televersement du document a echoue.")
    } finally {
      setBusy(false)
    }
  }

  const onToggleEditor = (documentRow: DocumentRow) => {
    setError(null)
    setSuccess(null)

    setEditingDocumentId((previous) => {
      if (previous === documentRow.id) return null
      return documentRow.id
    })

    setTitleDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.name }
    })

    setTopicDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.topicKey || "malls" }
    })

    setMaterialDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.materialType || "text" }
    })

    setVisibilityDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.visibilityMode || "student_visible" }
    })

    setTargetClassDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.targetClassIds || [] }
    })

    setSourceDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) return previous
      return { ...previous, [documentRow.id]: documentRow.sourceText || "" }
    })
  }

  const onSaveDocument = async (documentRow: DocumentRow) => {
    if (!context) return

    const titleDraft = titleDraftByDocument[documentRow.id] ?? documentRow.name
    const normalizedTitle = titleDraft.trim()
    const nextTopic = topicDraftByDocument[documentRow.id] || documentRow.topicKey || "malls"
    const nextMaterialType = materialDraftByDocument[documentRow.id] || documentRow.materialType || "text"
    const nextVisibilityMode = visibilityDraftByDocument[documentRow.id] || documentRow.visibilityMode || "student_visible"
    const nextTargetClassIds = (targetClassDraftByDocument[documentRow.id] || documentRow.targetClassIds || [])
      .map((classId) => classId.trim())
      .filter((classId, index, source) => !!classId && source.indexOf(classId) === index)
    const sourceDraft = sourceDraftByDocument[documentRow.id] ?? documentRow.sourceText
    const normalizedSourceText = sourceDraft.trim()

    if (normalizedTitle.length < 3) {
      setError("Le titre du document doit contenir au moins 3 caracteres.")
      return
    }

    if (context.activeSchoolId && classes.length && !nextTargetClassIds.length) {
      setError("Selectionnez au moins une classe cible pour la generation IA.")
      return
    }

    if (!normalizedSourceText.length) {
      setError("Le contenu texte pour IA est obligatoire.")
      return
    }

    if (normalizedSourceText.length > 50000) {
      setError("Le contenu texte pour IA est trop long (max 50 000 caracteres).")
      return
    }

    try {
      setSavingDocumentId(documentRow.id)
      setError(null)
      setSuccess(null)

      await updateDoc(doc(db, "documents", documentRow.id), {
        name: normalizedTitle,
        course_topic: nextTopic,
        course_material_type: nextMaterialType,
        course_source_text: normalizedSourceText,
        visibility_mode: nextVisibilityMode,
        target_class_ids: nextTargetClassIds,
        updated_at: serverTimestamp(),
      })

      const existingSharesSnap = await getDocs(
        query(collection(db, "document_shares"), where("document_id", "==", documentRow.id)),
      )

      if (nextVisibilityMode === "internal_teacher") {
        for (const shareRow of existingSharesSnap.docs) {
          await deleteDoc(doc(db, "document_shares", shareRow.id))
        }
      } else {
        const existingByClass = new Map<string, string>()
        for (const shareRow of existingSharesSnap.docs) {
          const share = shareRow.data() as any
          const classId = typeof share.class_id === "string" ? share.class_id : ""
          if (!classId) continue
          existingByClass.set(classId, shareRow.id)
        }

        for (const [classId, shareId] of existingByClass.entries()) {
          if (!nextTargetClassIds.includes(classId)) {
            await deleteDoc(doc(db, "document_shares", shareId))
          }
        }

        for (const classId of nextTargetClassIds) {
          if (existingByClass.has(classId)) continue
          await addDoc(collection(db, "document_shares"), {
            document_id: documentRow.id,
            school_id: context.activeSchoolId,
            class_id: classId,
            shared_by: context.userId,
            created_at: serverTimestamp(),
          })
        }
      }

      setSuccess(
        nextVisibilityMode === "internal_teacher"
          ? `Document « ${normalizedTitle} » mis a jour en mode interne (non visible eleves).`
          : `Document « ${normalizedTitle} » mis a jour et partage avec ${nextTargetClassIds.length} classe(s).`,
      )
      setEditingDocumentId(null)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible de modifier ce document.")
    } finally {
      setSavingDocumentId(null)
    }
  }

  const runCourseExercisesGeneration = async (
    documentId: string,
    forceRegenerate: boolean,
  ) => {
    if (!context) return

    try {
      if (forceRegenerate) {
        setRegeneratingDocumentId(documentId)
      } else {
        setGeneratingDocumentId(documentId)
      }

      setError(null)
      setSuccess(null)

      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch("/api/teacher/course-exercises/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ documentId, forceRegenerate }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        created?: number
        replacedExercises?: number
        regeneratedTargets?: number
        createdFreshTargets?: number
        skippedExisting?: number
        studentsTargeted?: number
      }

      if (!response.ok) {
        throw new Error(payload.error || "La generation IA a echoue.")
      }

      const createdCount = payload.created || 0
      const skippedCount = payload.skippedExisting || 0
      const targeted = payload.studentsTargeted || 0

      if (forceRegenerate) {
        const replacedCount = payload.replacedExercises || 0
        const regeneratedCount = payload.regeneratedTargets || 0
        const freshCount = payload.createdFreshTargets || 0

        setSuccess(
          `Regeneration IA terminee : ${createdCount} exercice(s) cree(s), ${replacedCount} exercice(s) non termine(s) remplace(s), ${regeneratedCount} eleve(s) regeneres, ${freshCount} nouvel(le)(s) eleve(s), ${skippedCount} eleve(s) laisses intacts (deja termines) sur ${targeted}.`,
        )
        return
      }

      setSuccess(
        `Generation IA terminee : ${createdCount} exercice(s) cree(s), ${skippedCount} eleve(s) deja traites sur ${targeted}.`,
      )
    } catch (e: any) {
      setError(e.message || "Impossible de generer des exercices depuis ce document.")
    } finally {
      if (forceRegenerate) {
        setRegeneratingDocumentId(null)
      } else {
        setGeneratingDocumentId(null)
      }
    }
  }

  const onGenerateCourseExercises = async (documentId: string) => {
    await runCourseExercisesGeneration(documentId, false)
  }

  const onRegenerateCourseExercises = async (documentRow: DocumentRow) => {
    const confirmed = window.confirm(
      "Regenerer les exercices IA ? Cette action remplace uniquement les exercices non termines, et conserve les exercices deja termines.",
    )
    if (!confirmed) return

    await runCourseExercisesGeneration(documentRow.id, true)
  }

  const onDeleteDocument = async (documentRow: DocumentRow) => {
    if (!context) return

    const confirmed = window.confirm(`Supprimer definitivement « ${documentRow.name} » ?`)
    if (!confirmed) return

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      if (documentRow.filePath) {
        try {
          await deleteObject(ref(storage, documentRow.filePath))
        } catch {
          // Continue even if storage file is missing.
        }
      }

      const sharesSnap = await getDocs(query(collection(db, "document_shares"), where("document_id", "==", documentRow.id)))
      for (const shareRow of sharesSnap.docs) {
        await deleteDoc(doc(db, "document_shares", shareRow.id))
      }

      await deleteDoc(doc(db, "documents", documentRow.id))

      if (editingDocumentId === documentRow.id) {
        setEditingDocumentId(null)
      }

      setSuccess(`Document « ${documentRow.name} » supprime.`)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible de supprimer ce document.")
    } finally {
      setBusy(false)
    }
  }

  const openDocument = async (documentRow: DocumentRow, download = false) => {
    if (!documentRow.filePath) {
      setError("Ce document n'a pas de fichier televerse.")
      return
    }

    try {
      setError(null)
      const storageRef = ref(storage, documentRow.filePath)
      const url = await getDownloadURL(storageRef)

      if (download) {
        const anchor = window.document.createElement("a")
        anchor.href = url
        anchor.download = documentRow.name
        anchor.target = "_blank"
        anchor.rel = "noopener noreferrer"
        anchor.click()
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch (e: any) {
      setError(e.message || "Impossible d'ouvrir le document.")
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des documents...</div>
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Documents de cours</h3>
          <p className="text-[13px] text-text-mid">Flux simple: Televerser puis Modifier (texte IA) puis Exercices IA</p>
        </div>
        <ElevateButton variant="primary" size="sm" icon={<Icons.Plus />} onClick={onUploadClick} disabled={busy}>
          {busy ? "Televersement..." : "Televerser"}
        </ElevateButton>
      </div>

      {context?.activeSchoolId && (
        <div className="mb-5 p-4 rounded-xl border border-gray-light bg-off-white flex flex-col gap-4">
          <div className="font-sans text-[13px] font-semibold text-navy mb-2">Classes cibles pour generation IA</div>
          {classes.length ? (
            <BadgeChooser
              multi
              selected={shareClassIds}
              onSelect={(value) => setShareClassIds(Array.isArray(value) ? value : value ? [value] : [])}
              options={classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
            />
          ) : (
            <div className="font-sans text-sm text-text-mid">Creez une classe pour cibler la generation des exercices.</div>
          )}

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Visibilite du document</div>
            <BadgeChooser
              selected={uploadVisibilityMode}
              onSelect={(value) => setUploadVisibilityMode(normalizeVisibilityMode(value))}
              options={VISIBILITY_OPTIONS}
            />
            <div className="mt-1.5 font-sans text-[11px] text-text-light">
              {uploadVisibilityMode === "internal_teacher"
                ? "Mode interne: le document reste cache aux eleves, mais sert de base a la generation IA."
                : "Mode visible eleves: le document apparait dans l'espace etudiant des classes ciblees."}
            </div>
          </div>

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Topic par defaut pour le prochain upload</div>
            <BadgeChooser
              selected={courseTopic}
              onSelect={(value) => setCourseTopic(String(value) as CourseTopicKey)}
              options={COURSE_TOPIC_OPTIONS.map((topic) => ({ value: topic.value, label: topic.label }))}
            />
          </div>

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Type par defaut pour le prochain upload</div>
            <BadgeChooser
              selected={courseMaterialType}
              onSelect={(value) => setCourseMaterialType(String(value) as CourseMaterialTypeKey)}
              options={COURSE_MATERIAL_TYPE_OPTIONS.map((materialType) => ({ value: materialType.value, label: materialType.label }))}
            />

            <div className="mt-3 flex flex-wrap gap-2.5">
              {COURSE_MATERIAL_TYPE_OPTIONS.map((materialType) => {
                const materialTheme = courseMaterialTheme(materialType.value)
                return (
                  <div
                    key={`teacher-legend-${materialType.value}`}
                    className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2", materialTheme.panelBg, materialTheme.panelBorder)}
                  >
                    <span className={cn("w-2.5 h-2.5 rounded-full", materialTheme.dotBg)} />
                    <span className="font-sans text-[12px] font-semibold text-navy">{materialTheme.memoryHint}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.csv,.xlsx,image/*"
        className="hidden"
        onChange={onFileSelected}
      />

      {error && <div className="font-sans text-sm text-watermelon mb-3">{error}</div>}
      {success && <div className="font-sans text-sm text-violet mb-3">{success}</div>}

      <div className="flex flex-col gap-2.5">
        {documents.map((documentRow) => (
          <div key={documentRow.id} className="rounded-xl border border-gray-light bg-off-white">
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0", documentRow.type === "PDF" ? "bg-watermelon/10 text-watermelon" : "bg-navy/10 text-navy")}>
                <Icons.FileText />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-sans text-sm font-semibold text-text-dark truncate">{documentRow.name}</div>
                <div className="font-sans text-xs text-text-light">{documentRow.type} &middot; {documentRow.size} &middot; {documentRow.date}</div>
                <div className="font-sans text-[11px] text-text-light mt-1 truncate">{documentRow.topicLabel}</div>
                {documentRow.materialType ? (
                  <div className="mt-1">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-md font-sans text-[11px] font-semibold",
                        courseMaterialTheme(documentRow.materialType).badgeBg,
                        courseMaterialTheme(documentRow.materialType).badgeText,
                      )}
                    >
                      {documentRow.materialLabel}
                    </span>
                  </div>
                ) : (
                  <div className="font-sans text-[11px] text-text-light mt-1 truncate">{documentRow.materialLabel}</div>
                )}
                <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                  {documentRow.hasSourceText
                    ? "Source texte IA presente"
                    : "Texte IA manquant -> cliquez sur Modifier"}
                </div>
                <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                  Mode: {documentRow.visibilityMode === "internal_teacher" ? "Interne (non visible eleves)" : "Visible eleves"}
                </div>
                {!!documentRow.targetClassNames.length && (
                  <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                    Classes cibles IA : {documentRow.targetClassNames.join(", ")}
                  </div>
                )}
              </div>

              <ElevateButton
                size="sm"
                variant="outline"
                onClick={() => onToggleEditor(documentRow)}
                disabled={
                  busy
                  || savingDocumentId === documentRow.id
                  || generatingDocumentId === documentRow.id
                  || regeneratingDocumentId === documentRow.id
                }
              >
                {editingDocumentId === documentRow.id ? "Fermer" : "Modifier"}
              </ElevateButton>

              <ElevateButton
                size="sm"
                variant="secondary"
                onClick={() => onGenerateCourseExercises(documentRow.id)}
                disabled={
                  busy
                  || generatingDocumentId === documentRow.id
                  || regeneratingDocumentId === documentRow.id
                  || !documentRow.targetClassIds.length
                  || !documentRow.topicKey
                  || !documentRow.materialType
                  || !documentRow.hasSourceText
                }
              >
                {generatingDocumentId === documentRow.id ? "Generation..." : "Exercices IA"}
              </ElevateButton>

              <ElevateButton
                size="sm"
                variant="outline"
                onClick={() => onRegenerateCourseExercises(documentRow)}
                disabled={
                  busy
                  || regeneratingDocumentId === documentRow.id
                  || generatingDocumentId === documentRow.id
                  || !documentRow.targetClassIds.length
                  || !documentRow.topicKey
                  || !documentRow.materialType
                  || !documentRow.hasSourceText
                }
              >
                {regeneratingDocumentId === documentRow.id ? "Regeneration..." : "Regenerer"}
              </ElevateButton>

              <button
                onClick={() => openDocument(documentRow, true)}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Telecharger"
                disabled={!documentRow.filePath || documentRow.isTextOnly}
              >
                <Icons.Download />
              </button>

              <button
                onClick={() => openDocument(documentRow, false)}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Apercu"
                disabled={!documentRow.filePath || documentRow.isTextOnly}
              >
                <Icons.Eye />
              </button>

              <button
                onClick={() => onDeleteDocument(documentRow)}
                className="h-[34px] rounded-lg bg-watermelon/10 px-3 font-sans text-[12px] font-semibold text-watermelon cursor-pointer hover:bg-watermelon/20 transition-colors shrink-0"
                title="Supprimer"
                disabled={
                  busy
                  || generatingDocumentId === documentRow.id
                  || regeneratingDocumentId === documentRow.id
                  || savingDocumentId === documentRow.id
                }
              >
                Supprimer
              </button>
            </div>

            {editingDocumentId === documentRow.id && (
              <div className="border-t border-gray-light px-4 pb-4 pt-3">
                <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Modifier ce document (titre, categorie, visibilite, texte IA)</div>

                <div className="flex flex-col gap-3">
                  <input
                    value={titleDraftByDocument[documentRow.id] ?? documentRow.name}
                    onChange={(event) => setTitleDraftByDocument((previous) => ({
                      ...previous,
                      [documentRow.id]: event.target.value,
                    }))}
                    placeholder="Titre du document"
                    className="h-10 rounded-[10px] border-2 border-gray-mid bg-card px-3 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy"
                  />

                  <div>
                    <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Topic du cours</div>
                    <BadgeChooser
                      selected={topicDraftByDocument[documentRow.id] || documentRow.topicKey || "malls"}
                      onSelect={(value) => setTopicDraftByDocument((previous) => ({
                        ...previous,
                        [documentRow.id]: String(value) as CourseTopicKey,
                      }))}
                      options={COURSE_TOPIC_OPTIONS.map((topic) => ({ value: topic.value, label: topic.label }))}
                    />
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Type de contenu</div>
                    <BadgeChooser
                      selected={materialDraftByDocument[documentRow.id] || documentRow.materialType || "text"}
                      onSelect={(value) => setMaterialDraftByDocument((previous) => ({
                        ...previous,
                        [documentRow.id]: String(value) as CourseMaterialTypeKey,
                      }))}
                      options={COURSE_MATERIAL_TYPE_OPTIONS.map((materialType) => ({
                        value: materialType.value,
                        label: materialType.label,
                      }))}
                    />
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Visibilite du document</div>
                    <BadgeChooser
                      selected={visibilityDraftByDocument[documentRow.id] || documentRow.visibilityMode || "student_visible"}
                      onSelect={(value) => setVisibilityDraftByDocument((previous) => ({
                        ...previous,
                        [documentRow.id]: normalizeVisibilityMode(value),
                      }))}
                      options={VISIBILITY_OPTIONS}
                    />
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Classes cibles pour generation IA</div>
                    <BadgeChooser
                      multi
                      selected={targetClassDraftByDocument[documentRow.id] || documentRow.targetClassIds || []}
                      onSelect={(value) => setTargetClassDraftByDocument((previous) => ({
                        ...previous,
                        [documentRow.id]: Array.isArray(value) ? value : value ? [value] : [],
                      }))}
                      options={classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
                    />
                    <div className="mt-1.5 font-sans text-[11px] text-text-light">
                      {(visibilityDraftByDocument[documentRow.id] || documentRow.visibilityMode || "student_visible") === "internal_teacher"
                        ? "Interne: ce document est utilise pour l'IA et reste cache aux eleves."
                        : "Visible eleves: ce document sera aussi visible dans l'espace etudiant."}
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Texte IA (obligatoire)</div>
                    <textarea
                      value={sourceDraftByDocument[documentRow.id] ?? documentRow.sourceText}
                      onChange={(event) => setSourceDraftByDocument((previous) => ({
                        ...previous,
                        [documentRow.id]: event.target.value,
                      }))}
                      placeholder="Collez la lecon ici."
                      className="w-full min-h-[140px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2.5">
                  <ElevateButton
                    size="sm"
                    variant="primary"
                    onClick={() => onSaveDocument(documentRow)}
                    disabled={
                      savingDocumentId === documentRow.id
                      || generatingDocumentId === documentRow.id
                      || regeneratingDocumentId === documentRow.id
                    }
                  >
                    {savingDocumentId === documentRow.id ? "Enregistrement..." : "Enregistrer"}
                  </ElevateButton>

                  <ElevateButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingDocumentId(null)}
                    disabled={
                      savingDocumentId === documentRow.id
                      || generatingDocumentId === documentRow.id
                      || regeneratingDocumentId === documentRow.id
                    }
                  >
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}
          </div>
        ))}

        {!documents.length && (
          <div className="font-sans text-sm text-text-mid px-1 py-2">Aucun document televerse pour le moment.</div>
        )}
      </div>
    </div>
  )
}

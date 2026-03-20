"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { auth, db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherDocumentsData } from "@/lib/firebase/client-data"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { collection, addDoc, deleteDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore"
import {
  COURSE_SOURCE_TEXT_MIN_LENGTH,
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
  sharedClassIds: string[]
  sharedClassNames: string[]
}

type ClassRow = {
  id: string
  name: string
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
  const [busy, setBusy] = useState(false)
  const [generatingDocumentId, setGeneratingDocumentId] = useState<string | null>(null)
  const [editingMetaDocumentId, setEditingMetaDocumentId] = useState<string | null>(null)
  const [savingMetaDocumentId, setSavingMetaDocumentId] = useState<string | null>(null)
  const [titleDraftByDocument, setTitleDraftByDocument] = useState<Record<string, string>>({})
  const [topicDraftByDocument, setTopicDraftByDocument] = useState<Record<string, CourseTopicKey>>({})
  const [materialDraftByDocument, setMaterialDraftByDocument] = useState<Record<string, CourseMaterialTypeKey>>({})
  const [editingSourceDocumentId, setEditingSourceDocumentId] = useState<string | null>(null)
  const [savingSourceDocumentId, setSavingSourceDocumentId] = useState<string | null>(null)
  const [sourceDraftByDocument, setSourceDraftByDocument] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [courseTopic, setCourseTopic] = useState<CourseTopicKey>("malls")
  const [courseMaterialType, setCourseMaterialType] = useState<CourseMaterialTypeKey>("text")
  const [courseTextDocumentName, setCourseTextDocumentName] = useState("Lecon du jour - texte IA")
  const [courseSourceText, setCourseSourceText] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadDocuments = async () => {
    if (!context) return
    const data = await fetchTeacherDocumentsData(db, context.userId, context.activeSchoolId)
    setDocuments(data.documents)
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
      setError("Sélectionnez au moins une classe pour partager le document.")
      return
    }

    const normalizedSourceText = courseSourceText.trim()
    if (normalizedSourceText.length > 0 && normalizedSourceText.length < COURSE_SOURCE_TEXT_MIN_LENGTH) {
      setError(`Le contenu texte pour IA doit contenir au moins ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres.`)
      return
    }

    if (normalizedSourceText.length > 50000) {
      setError("Le contenu texte pour IA est trop long (max 50 000 caractères).")
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
        course_source_text: normalizedSourceText || null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      if (context.activeSchoolId && shareClassIds.length) {
        for (const classId of shareClassIds) {
          await addDoc(collection(db, "document_shares"), {
            document_id: createdDocRef.id,
            school_id: context.activeSchoolId,
            class_id: classId,
            shared_by: context.userId,
            created_at: serverTimestamp(),
          })
        }

        await addDoc(collection(db, "activity_events"), {
          school_id: context.activeSchoolId,
          class_id: shareClassIds[0] || null,
          actor_id: context.userId,
          event_type: "document_uploaded",
          payload: {
            text: `${file.name} a été partagé avec ${shareClassIds.length} classe(s).`,
          },
          created_at: serverTimestamp(),
        })
      }

      setSuccess(`Document « ${file.name} » televerse avec succes. Cliquez sur "Exercices IA" pour generer les activites eleves.`)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Le téléversement du document a échoué.")
    } finally {
      setBusy(false)
    }
  }

  const onGenerateCourseExercises = async (documentId: string) => {
    if (!context) return

    try {
      setGeneratingDocumentId(documentId)
      setError(null)
      setSuccess(null)

      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch("/api/teacher/course-exercises/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ documentId }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        created?: number
        skippedExisting?: number
        studentsTargeted?: number
      }

      if (!response.ok) {
        throw new Error(payload.error || "La génération IA a échoué.")
      }

      const createdCount = payload.created || 0
      const skippedCount = payload.skippedExisting || 0
      const targeted = payload.studentsTargeted || 0

      setSuccess(
        `Génération IA terminée : ${createdCount} exercice(s) créé(s), ${skippedCount} élève(s) déjà traités sur ${targeted}.`,
      )
    } catch (e: any) {
      setError(e.message || "Impossible de générer des exercices depuis ce document.")
    } finally {
      setGeneratingDocumentId(null)
    }
  }

  const onCreateTextDocument = async () => {
    if (!context) return

    const normalizedName = courseTextDocumentName.trim()
    if (normalizedName.length < 3) {
      setError("Donnez un titre au document texte (minimum 3 caractères).")
      return
    }

    if (context.activeSchoolId && classes.length && !shareClassIds.length) {
      setError("Sélectionnez au moins une classe pour partager le document.")
      return
    }

    const normalizedSourceText = courseSourceText.trim()
    if (normalizedSourceText.length < COURSE_SOURCE_TEXT_MIN_LENGTH) {
      setError(`Le contenu texte pour IA doit contenir au moins ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres.`)
      return
    }

    if (normalizedSourceText.length > 50000) {
      setError("Le contenu texte pour IA est trop long (max 50 000 caractères).")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const createdDocRef = await addDoc(collection(db, "documents"), {
        school_id: context.activeSchoolId,
        owner_id: context.userId,
        name: normalizedName,
        file_path: null,
        mime_type: "text/plain",
        size_bytes: normalizedSourceText.length,
        course_topic: courseTopic,
        course_material_type: courseMaterialType,
        course_source_text: normalizedSourceText,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      if (context.activeSchoolId && shareClassIds.length) {
        for (const classId of shareClassIds) {
          await addDoc(collection(db, "document_shares"), {
            document_id: createdDocRef.id,
            school_id: context.activeSchoolId,
            class_id: classId,
            shared_by: context.userId,
            created_at: serverTimestamp(),
          })
        }

        await addDoc(collection(db, "activity_events"), {
          school_id: context.activeSchoolId,
          class_id: shareClassIds[0] || null,
          actor_id: context.userId,
          event_type: "document_uploaded",
          payload: {
            text: `Document texte IA « ${normalizedName} » partagé avec ${shareClassIds.length} classe(s).`,
          },
          created_at: serverTimestamp(),
        })
      }

      setSuccess(`Document texte « ${normalizedName} » enregistré. Vous pouvez cliquer sur "Exercices IA".`)
      setCourseSourceText("")
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer le document texte.")
    } finally {
      setBusy(false)
    }
  }

  const onToggleSourceEditor = (documentRow: DocumentRow) => {
    setError(null)
    setSuccess(null)
    setEditingMetaDocumentId(null)

    setEditingSourceDocumentId((previous) => {
      if (previous === documentRow.id) return null
      return documentRow.id
    })

    setSourceDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) {
        return previous
      }

      return {
        ...previous,
        [documentRow.id]: documentRow.sourceText || "",
      }
    })
  }

  const onToggleMetadataEditor = (documentRow: DocumentRow) => {
    setError(null)
    setSuccess(null)
    setEditingSourceDocumentId(null)

    setEditingMetaDocumentId((previous) => {
      if (previous === documentRow.id) return null
      return documentRow.id
    })

    setTitleDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) {
        return previous
      }

      return {
        ...previous,
        [documentRow.id]: documentRow.name,
      }
    })

    setTopicDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) {
        return previous
      }

      return {
        ...previous,
        [documentRow.id]: documentRow.topicKey || "malls",
      }
    })

    setMaterialDraftByDocument((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, documentRow.id)) {
        return previous
      }

      return {
        ...previous,
        [documentRow.id]: documentRow.materialType || "text",
      }
    })
  }

  const onSaveDocumentMetadata = async (documentRow: DocumentRow) => {
    if (!context) return

    const titleDraft = titleDraftByDocument[documentRow.id] ?? documentRow.name
    const normalizedTitle = titleDraft.trim()
    const nextTopic = topicDraftByDocument[documentRow.id] || documentRow.topicKey || "malls"
    const nextMaterialType = materialDraftByDocument[documentRow.id] || documentRow.materialType || "text"

    if (normalizedTitle.length < 3) {
      setError("Le titre du document doit contenir au moins 3 caracteres.")
      return
    }

    try {
      setSavingMetaDocumentId(documentRow.id)
      setError(null)
      setSuccess(null)

      await updateDoc(doc(db, "documents", documentRow.id), {
        name: normalizedTitle,
        course_topic: nextTopic,
        course_material_type: nextMaterialType,
        updated_at: serverTimestamp(),
      })

      setSuccess(`Document « ${normalizedTitle} » mis a jour.`)
      setEditingMetaDocumentId(null)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible de modifier ce document.")
    } finally {
      setSavingMetaDocumentId(null)
    }
  }

  const onSaveSourceText = async (documentRow: DocumentRow) => {
    if (!context) return

    const draft = sourceDraftByDocument[documentRow.id] ?? ""
    const normalizedSourceText = draft.trim()

    if (normalizedSourceText.length < COURSE_SOURCE_TEXT_MIN_LENGTH) {
      setError(`Le contenu texte pour IA doit contenir au moins ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres.`)
      return
    }

    if (normalizedSourceText.length > 50000) {
      setError("Le contenu texte pour IA est trop long (max 50 000 caractères).")
      return
    }

    try {
      setSavingSourceDocumentId(documentRow.id)
      setError(null)
      setSuccess(null)

      await updateDoc(doc(db, "documents", documentRow.id), {
        course_source_text: normalizedSourceText,
        updated_at: serverTimestamp(),
      })

      setSuccess(`Source texte IA enregistrée pour « ${documentRow.name} ».`)
      setEditingSourceDocumentId(null)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer le texte IA.")
    } finally {
      setSavingSourceDocumentId(null)
    }
  }

  const onDeleteDocument = async (documentRow: DocumentRow) => {
    if (!context) return

    const confirmed = window.confirm(`Supprimer définitivement « ${documentRow.name} » ?`)
    if (!confirmed) return

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      if (documentRow.filePath) {
        try {
          await deleteObject(ref(storage, documentRow.filePath))
        } catch {
          // File may already be missing in storage; continue with Firestore cleanup.
        }
      }

      const sharesSnap = await getDocs(query(collection(db, "document_shares"), where("document_id", "==", documentRow.id)))
      for (const shareRow of sharesSnap.docs) {
        await deleteDoc(doc(db, "document_shares", shareRow.id))
      }

      await deleteDoc(doc(db, "documents", documentRow.id))

      if (editingSourceDocumentId === documentRow.id) {
        setEditingSourceDocumentId(null)
      }

      if (editingMetaDocumentId === documentRow.id) {
        setEditingMetaDocumentId(null)
      }

      setSuccess(`Document « ${documentRow.name} » supprimé.`)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Impossible de supprimer ce document.")
    } finally {
      setBusy(false)
    }
  }

  const openDocument = async (document: DocumentRow, download = false) => {
    if (!document.filePath) {
      setError("Ce document ne contient pas de fichier televerse. Utilisez \"Texte IA\" pour gerer son contenu texte.")
      return
    }

    try {
      setError(null)
      const storageRef = ref(storage, document.filePath)
      const url = await getDownloadURL(storageRef)

      if (download) {
        const a = window.document.createElement("a")
        a.href = url
        a.download = document.name
        a.target = "_blank"
        a.rel = "noopener noreferrer"
        a.click()
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
          <p className="text-[13px] text-text-mid">Ressources partagées et supports</p>
        </div>
        <ElevateButton variant="primary" size="sm" icon={<Icons.Plus />} onClick={onUploadClick} disabled={busy}>
          {busy ? "Téléversement..." : "Téléverser"}
        </ElevateButton>
      </div>

      {context?.activeSchoolId && (
        <div className="mb-5 p-4 rounded-xl border border-gray-light bg-off-white flex flex-col gap-4">
          <div className="font-sans text-[13px] font-semibold text-navy mb-2">Partager avec les classes</div>
          {classes.length ? (
            <BadgeChooser
              multi
              selected={shareClassIds}
              onSelect={(value) => setShareClassIds(Array.isArray(value) ? value : value ? [value] : [])}
              options={classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
            />
          ) : (
            <div className="font-sans text-sm text-text-mid">Créez une classe pour partager les documents avec vos élèves.</div>
          )}

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Topic du cours</div>
            <BadgeChooser
              selected={courseTopic}
              onSelect={(value) => setCourseTopic(String(value) as CourseTopicKey)}
              options={COURSE_TOPIC_OPTIONS.map((topic) => ({ value: topic.value, label: topic.label }))}
            />
          </div>

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Type de contenu</div>
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

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-1.5">Contenu texte pour IA (obligatoire pour Exercices IA)</div>
            <textarea
              value={courseSourceText}
              onChange={(event) => setCourseSourceText(event.target.value)}
              placeholder={`Collez ici le texte, le vocabulaire et les regles vus en cours (minimum ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres).`}
              className="w-full min-h-[120px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={courseTextDocumentName}
                onChange={(event) => setCourseTextDocumentName(event.target.value)}
                placeholder="Titre du document texte"
                className="h-10 min-w-[250px] rounded-[10px] border-2 border-gray-mid bg-card px-3 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy"
              />
              <ElevateButton size="sm" variant="secondary" onClick={onCreateTextDocument} disabled={busy}>
                Enregistrer le texte comme document
              </ElevateButton>
            </div>
            <div className="mt-1.5 font-sans text-[11px] text-text-light">
              Mode strict: collez le texte puis cliquez sur "Enregistrer le texte comme document".
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
                    ? "Source texte IA fournie"
                    : `Source texte IA absente (minimum ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres)`}
                </div>
                {(!documentRow.topicKey || !documentRow.materialType) && (
                  <div className="font-sans text-[11px] text-watermelon mt-1 truncate">
                    Classez ce document avec un topic/type avant generation IA.
                  </div>
                )}
                {!!documentRow.sharedClassNames.length && (
                  <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                    Partagé avec : {documentRow.sharedClassNames.join(", ")}
                  </div>
                )}
              </div>

              <ElevateButton
                size="sm"
                variant="outline"
                onClick={() => onToggleMetadataEditor(documentRow)}
                disabled={
                  busy
                  || savingMetaDocumentId === documentRow.id
                  || savingSourceDocumentId === documentRow.id
                  || generatingDocumentId === documentRow.id
                }
              >
                {editingMetaDocumentId === documentRow.id ? "Fermer" : "Modifier"}
              </ElevateButton>

              <ElevateButton
                size="sm"
                variant="outline"
                onClick={() => onToggleSourceEditor(documentRow)}
                disabled={
                  busy
                  || savingSourceDocumentId === documentRow.id
                  || savingMetaDocumentId === documentRow.id
                  || generatingDocumentId === documentRow.id
                }
              >
                {editingSourceDocumentId === documentRow.id ? "Fermer" : "Texte IA"}
              </ElevateButton>

              <ElevateButton
                size="sm"
                variant="secondary"
                onClick={() => onGenerateCourseExercises(documentRow.id)}
                disabled={
                  busy
                  || generatingDocumentId === documentRow.id
                  || !documentRow.sharedClassIds.length
                  || !documentRow.topicKey
                  || !documentRow.materialType
                  || !documentRow.hasSourceText
                }
              >
                {generatingDocumentId === documentRow.id ? "Generation..." : "Exercices IA"}
              </ElevateButton>

              <button
                onClick={() => openDocument(documentRow, true)}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0"
                title="Télécharger"
                disabled={!documentRow.filePath}
              >
                <Icons.Download />
              </button>
              <button
                onClick={() => openDocument(documentRow, false)}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0"
                title="Aperçu"
                disabled={!documentRow.filePath}
              >
                <Icons.Eye />
              </button>
              <button
                onClick={() => onDeleteDocument(documentRow)}
                className="h-[34px] rounded-lg bg-watermelon/10 px-3 font-sans text-[12px] font-semibold text-watermelon cursor-pointer hover:bg-watermelon/20 transition-colors shrink-0"
                title="Supprimer"
                disabled={busy || generatingDocumentId === documentRow.id || savingSourceDocumentId === documentRow.id}
              >
                Supprimer
              </button>
            </div>

            {editingMetaDocumentId === documentRow.id && (
              <div className="border-t border-gray-light px-4 pb-4 pt-3">
                <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Modifier le titre et la categorie</div>

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
                </div>

                <div className="mt-2 flex items-center gap-2.5">
                  <ElevateButton
                    size="sm"
                    variant="primary"
                    onClick={() => onSaveDocumentMetadata(documentRow)}
                    disabled={savingMetaDocumentId === documentRow.id}
                  >
                    {savingMetaDocumentId === documentRow.id ? "Enregistrement..." : "Enregistrer les modifications"}
                  </ElevateButton>
                  <ElevateButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingMetaDocumentId(null)}
                    disabled={savingMetaDocumentId === documentRow.id}
                  >
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}

            {editingSourceDocumentId === documentRow.id && (
              <div className="border-t border-gray-light px-4 pb-4 pt-3">
                <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">
                  Coller et enregistrer le texte de cours pour l'IA
                </div>
                <textarea
                  value={sourceDraftByDocument[documentRow.id] ?? ""}
                  onChange={(event) => setSourceDraftByDocument((previous) => ({
                    ...previous,
                    [documentRow.id]: event.target.value,
                  }))}
                  placeholder={`Minimum ${COURSE_SOURCE_TEXT_MIN_LENGTH} caracteres.`}
                  className="w-full min-h-[140px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                />
                <div className="mt-2 flex items-center gap-2.5">
                  <ElevateButton
                    size="sm"
                    variant="primary"
                    onClick={() => onSaveSourceText(documentRow)}
                    disabled={savingSourceDocumentId === documentRow.id}
                  >
                    {savingSourceDocumentId === documentRow.id ? "Enregistrement..." : "Enregistrer le texte IA"}
                  </ElevateButton>
                  <ElevateButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingSourceDocumentId(null)}
                    disabled={savingSourceDocumentId === documentRow.id}
                  >
                    Annuler
                  </ElevateButton>
                </div>
              </div>
            )}
          </div>
        ))}
        {!documents.length && (
          <div className="font-sans text-sm text-text-mid px-1 py-2">Aucun document téléversé pour le moment.</div>
        )}
      </div>
    </div>
  )
}

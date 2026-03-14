"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherDocumentsData } from "@/lib/firebase/client-data"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore"

type DocumentRow = {
  id: string
  name: string
  filePath: string
  type: string
  size: string
  date: string
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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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

      setSuccess(`Document « ${file.name} » téléversé avec succès.`)
      await loadDocuments()
    } catch (e: any) {
      setError(e.message || "Le téléversement du document a échoué.")
    } finally {
      setBusy(false)
    }
  }

  const openDocument = async (document: DocumentRow, download = false) => {
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
        <div className="mb-5 p-4 rounded-xl border border-gray-light bg-off-white">
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
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-gray-light bg-off-white">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0", doc.type === "PDF" ? "bg-watermelon/10 text-watermelon" : "bg-navy/10 text-navy")}>
              <Icons.FileText />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-sans text-sm font-semibold text-text-dark truncate">{doc.name}</div>
              <div className="font-sans text-xs text-text-light">{doc.type} &middot; {doc.size} &middot; {doc.date}</div>
              {!!doc.sharedClassNames.length && (
                <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                  Partagé avec : {doc.sharedClassNames.join(", ")}
                </div>
              )}
            </div>
            <button
              onClick={() => openDocument(doc, true)}
              className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0"
              title="Télécharger"
            >
              <Icons.Download />
            </button>
            <button
              onClick={() => openDocument(doc, false)}
              className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0"
              title="Aperçu"
            >
              <Icons.Eye />
            </button>
          </div>
        ))}
        {!documents.length && (
          <div className="font-sans text-sm text-text-mid px-1 py-2">Aucun document téléversé pour le moment.</div>
        )}
      </div>
    </div>
  )
}

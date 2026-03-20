"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentDocumentsData } from "@/lib/firebase/client-data"
import { ref, getDownloadURL } from "firebase/storage"
import {
  COURSE_MATERIAL_TYPE_OPTIONS,
  COURSE_TOPIC_OPTIONS,
  courseMaterialTheme,
  type CourseMaterialTypeKey,
  type CourseTopicKey,
} from "@/lib/course-content/config"

type StudentDocumentRow = {
  id: string
  name: string
  filePath: string
  type: string
  size: string
  date: string
  sharedAt: string
  sharedClassNames: string[]
  sharedAssignmentTitles: string[]
  topicKey: CourseTopicKey | null
  topicLabel: string
  materialType: CourseMaterialTypeKey | null
  materialLabel: string
}

export default function StudentDocumentsPage() {
  const { context, loading } = useAppContext()
  const [documents, setDocuments] = useState<StudentDocumentRow[]>([])
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return
    fetchStudentDocumentsData(db, context.userId, context.activeSchoolId).then(setDocuments)
  }, [context])

  const documentsByTopic = useMemo(() => {
    const map = new Map<string, StudentDocumentRow[]>()
    for (const topic of COURSE_TOPIC_OPTIONS) {
      map.set(topic.value, [])
    }
    map.set("other", [])

    for (const document of documents) {
      const topicKey = document.topicKey || "other"
      const rows = map.get(topicKey) || []
      rows.push(document)
      map.set(topicKey, rows)
    }

    return map
  }, [documents])

  const openDocument = async (document: StudentDocumentRow, download = false) => {
    try {
      setError(null)
      setBusyDocumentId(document.id)

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
    } finally {
      setBusyDocumentId(null)
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des documents...</div>
  }

  const renderDocumentRow = (doc: StudentDocumentRow) => {
    const busy = busyDocumentId === doc.id

    return (
      <div key={doc.id} className="flex items-center gap-2.5 rounded-lg border border-gray-light bg-card px-3 py-2.5">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0", doc.type === "PDF" ? "bg-watermelon/10 text-watermelon" : "bg-navy/10 text-navy")}>
          <Icons.FileText />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-sans text-[13px] font-semibold text-text-dark truncate">{doc.name}</div>
          <div className="font-sans text-[11px] text-text-light">{doc.type} &middot; {doc.size} &middot; Ajouté le {doc.date}</div>
        </div>
        <button
          onClick={() => openDocument(doc, true)}
          disabled={busy}
          className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Télécharger"
        >
          <Icons.Download />
        </button>
        <button
          onClick={() => openDocument(doc, false)}
          disabled={busy}
          className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Aperçu"
        >
          <Icons.Eye />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7 flex flex-col gap-5">
      <div>
        <h3 className="font-serif text-xl font-bold text-navy mb-1">Documents vus en cours</h3>
        <p className="text-[13px] text-text-mid">Retrouvez vos supports par topic: textes, vocabulaire et règles de grammaire.</p>
      </div>

      <div className="rounded-xl border border-gray-mid bg-off-white p-4">
        <div className="font-sans text-[12px] font-semibold text-navy mb-2">Code couleur à mémoriser</div>
        <div className="flex flex-wrap gap-2.5">
          {COURSE_MATERIAL_TYPE_OPTIONS.map((materialType) => {
            const materialTheme = courseMaterialTheme(materialType.value)
            return (
              <div
                key={`legend-${materialType.value}`}
                className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2", materialTheme.panelBg, materialTheme.panelBorder)}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full", materialTheme.dotBg)} />
                <span className="font-sans text-[12px] font-semibold text-navy">{materialTheme.memoryHint}</span>
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="font-sans text-sm text-watermelon mb-3">{error}</div>}

      {COURSE_TOPIC_OPTIONS.map((topic) => {
        const topicDocuments = documentsByTopic.get(topic.value) || []

        return (
          <section key={topic.value} className="rounded-xl border border-gray-light bg-off-white p-4">
            <h4 className="font-serif text-lg font-bold text-navy mb-3">{topic.label}</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {COURSE_MATERIAL_TYPE_OPTIONS.map((materialType) => {
                const rows = topicDocuments.filter((doc) => doc.materialType === materialType.value)
                const materialTheme = courseMaterialTheme(materialType.value)

                return (
                  <div
                    key={`${topic.value}:${materialType.value}`}
                    className={cn("rounded-lg border bg-card p-3", materialTheme.panelBg, materialTheme.panelBorder)}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-full", materialTheme.dotBg)} />
                      <span className={cn("inline-flex px-2.5 py-1 rounded-md font-sans text-[12px] font-bold", materialTheme.badgeBg, materialTheme.badgeText)}>
                        {materialType.label}
                      </span>
                      <span className="font-sans text-[11px] font-semibold text-text-mid">{materialTheme.memoryLabel}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {rows.map(renderDocumentRow)}
                      {!rows.length && (
                        <div className="font-sans text-xs text-text-light">Aucun document pour cette categorie.</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {!!(documentsByTopic.get("other") || []).length && (
        <section className="rounded-xl border border-gray-light bg-off-white p-4">
          <h4 className="font-serif text-lg font-bold text-navy mb-3">Autres ressources</h4>
          <div className="flex flex-col gap-2">
            {(documentsByTopic.get("other") || []).map(renderDocumentRow)}
          </div>
        </section>
      )}

      {!documents.length && (
        <div className="font-sans text-sm text-text-mid px-1 py-2">
          Aucun document n'a encore ete partage pour vos classes.
        </div>
      )}
    </div>
  )
}

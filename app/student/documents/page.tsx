"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentDocumentsData } from "@/lib/supabase/client-data"

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
}

export default function StudentDocumentsPage() {
  const { context, loading } = useAppContext()
  const [documents, setDocuments] = useState<StudentDocumentRow[]>([])
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchStudentDocumentsData(supabase, context.userId, context.activeSchoolId).then(setDocuments)
  }, [context])

  const openDocument = async (document: StudentDocumentRow, download = false) => {
    try {
      setError(null)
      setBusyDocumentId(document.id)

      const supabase = createClient()
      const { data, error: signedUrlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.filePath, 60 * 10, download ? { download: document.name } : undefined)

      if (signedUrlError || !data?.signedUrl) {
        throw signedUrlError || new Error("Impossible d'ouvrir le document.")
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    } catch (e: any) {
      setError(e.message || "Impossible d'ouvrir le document.")
    } finally {
      setBusyDocumentId(null)
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des documents...</div>
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="mb-5">
        <h3 className="font-serif text-xl font-bold text-navy mb-1">Documents de la classe</h3>
        <p className="text-[13px] text-text-mid">Retrouvez ici les textes et ressources partagés en cours.</p>
      </div>

      {error && <div className="font-sans text-sm text-watermelon mb-3">{error}</div>}

      <div className="flex flex-col gap-2.5">
        {documents.map((doc) => {
          const busy = busyDocumentId === doc.id
          return (
            <div key={doc.id} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-gray-light bg-off-white">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0", doc.type === "PDF" ? "bg-watermelon/10 text-watermelon" : "bg-navy/10 text-navy")}>
                <Icons.FileText />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-sans text-sm font-semibold text-text-dark truncate">{doc.name}</div>
                <div className="font-sans text-xs text-text-light">{doc.type} &middot; {doc.size} &middot; Ajouté le {doc.date}</div>
                {!!doc.sharedClassNames.length && (
                  <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                    Classe(s) : {doc.sharedClassNames.join(", ")} &middot; Partagé le {doc.sharedAt}
                  </div>
                )}
                {!!doc.sharedAssignmentTitles.length && (
                  <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                    Devoir(s) : {doc.sharedAssignmentTitles.join(", ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => openDocument(doc, true)}
                disabled={busy}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Télécharger"
              >
                <Icons.Download />
              </button>
              <button
                onClick={() => openDocument(doc, false)}
                disabled={busy}
                className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Aperçu"
              >
                <Icons.Eye />
              </button>
            </div>
          )
        })}

        {!documents.length && (
          <div className="font-sans text-sm text-text-mid px-1 py-2">
            Aucun document n'a encore été partagé pour vos classes ou vos devoirs.
          </div>
        )}
      </div>
    </div>
  )
}

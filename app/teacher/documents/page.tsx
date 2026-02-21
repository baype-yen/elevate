"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherDocumentsData } from "@/lib/supabase/client-data"

export default function DocumentsPage() {
  const { context, loading } = useAppContext()
  const [documents, setDocuments] = useState<any[]>([])

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchTeacherDocumentsData(supabase, context.userId, context.activeSchoolId).then(setDocuments)
  }, [context])

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Loading documents...</div>
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Lesson Documents</h3>
          <p className="text-[13px] text-text-mid">Shared materials & handouts</p>
        </div>
        <ElevateButton variant="primary" size="sm" icon={<Icons.Plus />}>Upload</ElevateButton>
      </div>
      <div className="flex flex-col gap-2.5">
        {documents.map((doc, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-gray-light bg-off-white">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0", doc.type === "PDF" ? "bg-watermelon/10 text-watermelon" : "bg-navy/10 text-navy")}>
              <Icons.FileText />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-sans text-sm font-semibold text-text-dark truncate">{doc.name}</div>
              <div className="font-sans text-xs text-text-light">{doc.type} &middot; {doc.size} &middot; {doc.date}</div>
            </div>
            <button className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0">
              <Icons.Download />
            </button>
            <button className="w-[34px] h-[34px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors shrink-0">
              <Icons.Eye />
            </button>
          </div>
        ))}
        {!documents.length && (
          <div className="font-sans text-sm text-text-mid px-1 py-2">No documents uploaded yet.</div>
        )}
      </div>
    </div>
  )
}

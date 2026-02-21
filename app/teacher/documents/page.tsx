"use client"

import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const documents = [
  { name: "Conditional Sentences — Rules & Exercises.pdf", type: "PDF", size: "2.4 MB", date: "Feb 19, 2026", color: "bg-watermelon/10 text-watermelon" },
  { name: "Vocabulary List — Week 12.docx", type: "DOCX", size: "180 KB", date: "Feb 17, 2026", color: "bg-navy/10 text-navy" },
  { name: "Past Simple vs Present Perfect — Summary.pdf", type: "PDF", size: "1.1 MB", date: "Feb 14, 2026", color: "bg-watermelon/10 text-watermelon" },
  { name: "Audio Transcripts — Dialogue Unit 8.pdf", type: "PDF", size: "890 KB", date: "Feb 12, 2026", color: "bg-violet/10 text-violet" },
  { name: "Formal Letter Template.docx", type: "DOCX", size: "95 KB", date: "Feb 10, 2026", color: "bg-navy/10 text-navy" },
]

export default function DocumentsPage() {
  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Lesson Documents</h3>
          <p className="text-[13px] text-text-mid">Year 10A — English B1 &middot; Shared materials & handouts</p>
        </div>
        <ElevateButton variant="primary" size="sm" icon={<Icons.Plus />}>Upload</ElevateButton>
      </div>
      <div className="flex flex-col gap-2.5">
        {documents.map((doc, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-gray-light bg-off-white">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0", doc.color.split(" ")[0])}>
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
      </div>
    </div>
  )
}

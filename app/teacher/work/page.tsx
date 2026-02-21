"use client"

import { useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { LevelBadge, ElevateButton, BadgeChooser } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const work = [
  { title: "Essay: My Ideal Future", student: "Emma Martin", submitted: "Feb 20", status: "Pending", score: null, type: "Writing", level: "B1" },
  { title: "Grammar Quiz — Conditionals", student: "Lucas Chevalier", submitted: "Feb 19", status: "Graded", score: 85, type: "Grammar", level: "B1" },
  { title: "Listening Comprehension #8", student: "Hugo Bernard", submitted: "Feb 19", status: "Graded", score: 62, type: "Listening", level: "A2" },
  { title: "Oral Presentation Recording", student: "Chloe Petit", submitted: "Feb 18", status: "Pending", score: null, type: "Speaking", level: "B1" },
  { title: "Reading Analysis — Animal Farm", student: "Lea Moreau", submitted: "Feb 18", status: "Graded", score: 96, type: "Reading", level: "B2" },
  { title: "Vocabulary Test — Week 11", student: "Nathan Dubois", submitted: "Feb 17", status: "Graded", score: 41, type: "Vocabulary", level: "A2" },
]

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

export default function WorkPage() {
  const [filter, setFilter] = useState<string | string[]>("all")

  const filteredWork = filter === "all" ? work : work.filter(w =>
    filter === "pending" ? w.status === "Pending" : w.status === "Graded"
  )

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Student Work</h3>
          <p className="text-[13px] text-text-mid">Recent submissions & grading status</p>
        </div>
        <BadgeChooser
          selected={filter}
          onSelect={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "graded", label: "Graded" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredWork.map((w, i) => (
          <div key={i} className="bg-off-white rounded-[14px] border border-gray-light p-[18px] flex flex-col gap-2.5">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div>
                  <div className="font-sans text-sm font-semibold text-text-dark">{w.title}</div>
                  <div className="font-sans text-xs text-text-light">{w.student} &middot; {w.submitted}</div>
                </div>
              </div>
              <span className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans",
                w.status === "Pending" ? "bg-abricot/15 text-abricot-dark" : "bg-violet/10 text-violet"
              )}>
                {w.status}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex gap-1.5">
                <LevelBadge level={w.level} colorClass={levelColorClass(w.level)} />
                <span className="px-2.5 py-1.5 rounded-lg bg-gray-light font-sans text-xs font-medium text-text-mid">
                  {w.type}
                </span>
              </div>
              {w.score !== null ? (
                <div className={cn(
                  "font-serif text-xl font-bold",
                  w.score >= 80 ? "text-violet" : w.score >= 60 ? "text-abricot-dark" : "text-watermelon"
                )}>
                  {w.score}%
                </div>
              ) : (
                <ElevateButton variant="secondary" size="sm" icon={<Icons.Edit />}>Grade</ElevateButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { LevelBadge, ElevateButton, BadgeChooser } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherWorkData } from "@/lib/supabase/client-data"

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

export default function WorkPage() {
  const [filter, setFilter] = useState<string | string[]>("all")
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [work, setWork] = useState<any[]>([])
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])
  const { context, loading } = useAppContext()

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchTeacherWorkData(
      supabase,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    ).then((result) => {
      setWork(result.items)
      setClasses(result.classes)
    })
  }, [context, selectedClass])

  const filteredWork = useMemo(() => {
    if (filter === "all") return work
    if (filter === "pending") return work.filter((w) => w.status === "Pending")
    return work.filter((w) => w.status === "Graded")
  }, [filter, work])

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Loading student work...</div>
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Student Work</h3>
          <p className="text-[13px] text-text-mid">Recent submissions & grading status</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BadgeChooser
            selected={selectedClass}
            onSelect={setSelectedClass}
            options={[
              { value: "all", label: "All classes" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
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
                w.status === "Pending" ? "bg-abricot/15 text-abricot-dark" : "bg-violet/10 text-violet",
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
              {w.score !== null && w.score !== undefined ? (
                <div className={cn(
                  "font-serif text-xl font-bold",
                  w.score >= 80 ? "text-violet" : w.score >= 60 ? "text-abricot-dark" : "text-watermelon",
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

      {!filteredWork.length && (
        <div className="mt-4 font-sans text-sm text-text-mid">No submissions yet.</div>
      )}
    </div>
  )
}

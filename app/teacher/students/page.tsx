"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherStudentsData } from "@/lib/supabase/client-data"

const avatarColors = ["bg-abricot", "bg-violet", "bg-watermelon", "bg-navy"]

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

export default function StudentsPage() {
  const { context, loading } = useAppContext()
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [data, setData] = useState<{ className: string; students: any[]; classes: Array<{ id: string; name: string }> } | null>(null)

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchTeacherStudentsData(
      supabase,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    ).then(setData)
  }, [context, selectedClass])

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Loading students...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <h4 className="font-serif text-lg font-bold text-navy">Student Profiles — {data.className}</h4>
        <BadgeChooser
          selected={selectedClass}
          onSelect={setSelectedClass}
          options={[
            { value: "all", label: "All classes" },
            ...data.classes.map((classItem) => ({ value: classItem.id, label: classItem.name })),
          ]}
        />
      </div>
      <div className="bg-card rounded-2xl border border-gray-mid overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3 bg-gray-light font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
          <span>Student</span>
          <span>Level</span>
          <span>Score</span>
          <span>Last Active</span>
          <span>Actions</span>
        </div>
        {data.students.map((s, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3.5 items-center border-t border-gray-light gap-2 md:gap-0">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center font-sans font-bold text-xs text-white shrink-0",
                avatarColors[i % 4],
              )}>
                {s.initials}
              </div>
              <div className="font-sans text-sm font-semibold text-text-dark">{s.name}</div>
            </div>
            <div>
              <LevelBadge level={s.level} colorClass={levelColorClass(s.level)} />
            </div>
            <div className="font-serif text-base font-bold text-navy">{s.score}%</div>
            <div className="font-sans text-[13px] text-text-light">{s.lastActive}</div>
            <div className="flex gap-1.5">
              <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                <Icons.Eye />
              </button>
              <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                <Icons.BarChart />
              </button>
            </div>
          </div>
        ))}
        {!data.students.length && (
          <div className="px-5 py-6 font-sans text-sm text-text-mid">No enrolled students found.</div>
        )}
      </div>
    </div>
  )
}

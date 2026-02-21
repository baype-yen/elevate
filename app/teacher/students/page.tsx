"use client"

import { Icons } from "@/components/elevate/icons"
import { LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const students = [
  { name: "Lucas Chevalier", initials: "LC", level: "B1", score: 82, lastActive: "Today", status: "on-track" },
  { name: "Emma Martin", initials: "EM", level: "B1", score: 91, lastActive: "Today", status: "ahead" },
  { name: "Hugo Bernard", initials: "HB", level: "A2", score: 58, lastActive: "Yesterday", status: "behind" },
  { name: "Chloe Petit", initials: "CP", level: "B1", score: 74, lastActive: "Today", status: "on-track" },
  { name: "Nathan Dubois", initials: "ND", level: "A2", score: 45, lastActive: "3 days ago", status: "at-risk" },
  { name: "Lea Moreau", initials: "LM", level: "B2", score: 95, lastActive: "Today", status: "ahead" },
]

const avatarColors = ["bg-abricot", "bg-violet", "bg-watermelon", "bg-navy"]

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

export default function StudentsPage() {
  return (
    <div>
      <h4 className="font-serif text-lg font-bold text-navy mb-3.5">Student Profiles — Year 10A</h4>
      <div className="bg-card rounded-2xl border border-gray-mid overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3 bg-gray-light font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
          <span>Student</span>
          <span>Level</span>
          <span>Score</span>
          <span>Last Active</span>
          <span>Actions</span>
        </div>
        {/* Rows */}
        {students.map((s, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3.5 items-center border-t border-gray-light gap-2 md:gap-0">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center font-sans font-bold text-xs text-white shrink-0",
                avatarColors[i % 4]
              )}>
                {s.initials}
              </div>
              <div className="font-sans text-sm font-semibold text-text-dark">{s.name}</div>
            </div>
            <div>
              <LevelBadge level={s.level} colorClass={levelColorClass(s.level)} />
            </div>
            <div className="font-serif text-base font-bold text-navy">{s.score}%</div>
            <div className={cn("font-sans text-[13px]", s.lastActive === "Today" ? "text-violet" : "text-text-light")}>
              {s.lastActive}
            </div>
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
      </div>
    </div>
  )
}

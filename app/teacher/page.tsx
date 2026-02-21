"use client"

import { useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { StatCard, ProgressBar, LevelBadge, ElevateButton, InputField, RadioCardChooser } from "@/components/elevate/shared"

const classes = [
  { name: "Year 10A — English B1", students: 28, level: "B1", color: "abricot", avg: 72, lessons: 18 },
  { name: "Year 11C — English B2", students: 24, level: "B2", color: "watermelon", avg: 68, lessons: 14 },
  { name: "Year 13S — English C1", students: 19, level: "C1", color: "violet", avg: 81, lessons: 22 },
  { name: "Year 12L — English B2", students: 16, level: "B2", color: "watermelon", avg: 77, lessons: 16 },
]

const colorToBg: Record<string, string> = {
  abricot: "bg-abricot",
  watermelon: "bg-watermelon",
  violet: "bg-violet",
  navy: "bg-navy",
}

export default function TeacherDashboard() {
  const [newClassLevel, setNewClassLevel] = useState("b1")

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Icons.Users />} label="Total Students" value="87" accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Book />} label="Active Classes" value="4" accentBg="bg-violet/10" accentText="text-violet" />
        <StatCard icon={<Icons.Clipboard />} label="Pending Reviews" value="12" accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Trophy />} label="Avg. Score" value="74%" accentBg="bg-abricot/10" accentText="text-abricot-dark" />
      </div>

      {/* My Classes */}
      <div>
        <h4 className="font-serif text-lg font-bold text-navy mb-3.5">My Classes</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {classes.map((cls, i) => (
            <div key={i} className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-serif text-[15px] font-bold text-navy">{cls.name}</div>
                  <div className="font-sans text-xs text-text-light">{cls.students} students &middot; {cls.lessons} lessons</div>
                </div>
                <LevelBadge level={cls.level} colorClass={cls.color} active />
              </div>
              <ProgressBar
                value={cls.avg}
                label="Class Average"
                sublabel={`${cls.avg}%`}
                color={colorToBg[cls.color] || "bg-violet"}
              />
              <div className="flex gap-2">
                <ElevateButton variant="primary" size="sm" icon={<Icons.Eye />}>View</ElevateButton>
                <ElevateButton variant="ghost" size="sm" icon={<Icons.Edit />}>Edit</ElevateButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create New Class */}
      <div className="bg-card rounded-2xl border-2 border-dashed border-gray-mid p-7 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-light flex items-center justify-center text-navy">
          <Icons.Plus />
        </div>
        <h4 className="font-serif text-base font-bold text-navy">Create a New Class</h4>
        <p className="text-[13px] text-text-mid text-center max-w-[340px]">
          Set up a class, assign levels, invite students, and start tracking their progress.
        </p>
        <div className="w-full max-w-[400px]">
          <InputField placeholder="e.g. Year 10B — English A2" icon={<Icons.Book />} />
        </div>
        <div className="w-full max-w-[500px]">
          <RadioCardChooser
            columns={6}
            selected={newClassLevel}
            onSelect={setNewClassLevel}
            options={[
              { value: "a1", label: "A1" },
              { value: "a2", label: "A2" },
              { value: "b1", label: "B1" },
              { value: "b2", label: "B2" },
              { value: "c1", label: "C1" },
              { value: "c2", label: "C2" },
            ]}
          />
        </div>
        <div className="w-full max-w-[400px] mt-1">
          <ElevateButton variant="primary" fullWidth icon={<Icons.Plus />}>Create Class</ElevateButton>
        </div>
      </div>
    </div>
  )
}

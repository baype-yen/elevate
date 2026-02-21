"use client"

import { Icons } from "@/components/elevate/icons"
import { StatCard, ProgressBar, LessonCard, ElevateButton } from "@/components/elevate/shared"

const upcomingWork = [
  { title: "Grammar Quiz — Conditionals", due: "Today", type: "Quiz", urgent: true },
  { title: "Essay: My Ideal Future", due: "Tomorrow", type: "Writing", urgent: true },
  { title: "Listening Comp. #9", due: "Feb 24", type: "Listening", urgent: false },
  { title: "Vocabulary Test — Week 12", due: "Feb 26", type: "Vocabulary", urgent: false },
  { title: "Reading Analysis — Animal Farm", due: "Mar 1", type: "Reading", urgent: false },
]

export default function StudentDashboard() {
  return (
    <div className="flex flex-col gap-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Icons.BarChart />} label="Overall Score" value="72%" accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Zap />} label="XP This Week" value="1,240" accentBg="bg-abricot/10" accentText="text-abricot-dark" />
        <StatCard icon={<Icons.Trophy />} label="Badges Earned" value="8" accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Target />} label="Lessons Done" value="34" accentBg="bg-violet/10" accentText="text-violet" />
      </div>

      {/* Two column: Skills + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Skill Progress */}
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Skill Breakdown</h4>
          <div className="flex flex-col gap-3.5">
            <ProgressBar value={85} label="Reading" sublabel="85%" color="bg-violet" />
            <ProgressBar value={72} label="Grammar" sublabel="72%" color="bg-abricot" />
            <ProgressBar value={58} label="Listening" sublabel="58%" color="bg-navy" />
            <ProgressBar value={34} label="Speaking" sublabel="34%" color="bg-watermelon" />
            <ProgressBar value={48} label="Writing" sublabel="48%" color="bg-violet-light" />
          </div>
        </div>

        {/* Upcoming Work */}
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Upcoming Work</h4>
          <div className="flex flex-col gap-2.5">
            {upcomingWork.map((w, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] border ${
                  w.urgent ? "bg-watermelon/5 border-watermelon/15" : "bg-off-white border-gray-light"
                }`}
              >
                <div className="flex-1">
                  <div className="font-sans text-[13px] font-semibold text-text-dark">{w.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`font-sans text-[11px] ${w.urgent ? "text-watermelon font-semibold" : "text-text-light"}`}>
                      Due {w.due}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-light font-sans text-[10px] font-medium text-text-mid">
                      {w.type}
                    </span>
                  </div>
                </div>
                <button className="w-7 h-7 rounded-[7px] bg-navy flex items-center justify-center text-white shrink-0">
                  <Icons.ArrowRight />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Continue Learning */}
      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3">Continue Learning</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <LessonCard
            title="Conditional Sentences"
            desc="Master English conditionals with real-world examples."
            progress={65}
            level="B1"
            levelColor="abricot"
            time="15 min"
            tag="Recommended"
          />
          <LessonCard
            title="Past Tenses Review"
            desc="Distinguish between past simple and present perfect."
            progress={30}
            level="B1"
            levelColor="abricot"
            time="20 min"
          />
          <LessonCard
            title="Formal Writing"
            desc="Structure formal letters and professional emails."
            progress={0}
            level="B2"
            levelColor="watermelon"
            time="25 min"
            tag="New"
          />
        </div>
      </div>
    </div>
  )
}

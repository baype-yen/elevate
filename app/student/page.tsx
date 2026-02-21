"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { StatCard, ProgressBar, LessonCard } from "@/components/elevate/shared"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentDashboardData } from "@/lib/supabase/client-data"

export default function StudentDashboard() {
  const { context, loading } = useAppContext()
  const [data, setData] = useState<{
    overallScore: number
    xpWeek: number
    badgeCount: number
    lessonsDone: number
    upcomingWork: Array<{ title: string; due: string; type: string; urgent: boolean }>
    skills: Array<{ label: string; score: number }>
  } | null>(null)

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchStudentDashboardData(supabase, context.userId, context.activeSchoolId).then(setData)
  }, [context])

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Loading dashboard...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Icons.BarChart />} label="Overall Score" value={`${data.overallScore}%`} accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Zap />} label="XP This Week" value={String(data.xpWeek)} accentBg="bg-abricot/10" accentText="text-abricot-dark" />
        <StatCard icon={<Icons.Trophy />} label="Badges Earned" value={String(data.badgeCount)} accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Target />} label="Lessons Done" value={String(data.lessonsDone)} accentBg="bg-violet/10" accentText="text-violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Skill Breakdown</h4>
          <div className="flex flex-col gap-3.5">
            {(data.skills.length ? data.skills : [{ label: "Reading", score: 0 }, { label: "Grammar", score: 0 }, { label: "Listening", score: 0 }, { label: "Speaking", score: 0 }, { label: "Writing", score: 0 }]).map((s, i) => (
              <ProgressBar
                key={`${s.label}-${i}`}
                value={s.score}
                label={s.label}
                sublabel={`${s.score}%`}
                color={i === 0 ? "bg-violet" : i === 1 ? "bg-abricot" : i === 2 ? "bg-navy" : i === 3 ? "bg-watermelon" : "bg-violet-light"}
              />
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Upcoming Work</h4>
          <div className="flex flex-col gap-2.5">
            {data.upcomingWork.map((w, i) => (
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
            {!data.upcomingWork.length && (
              <div className="font-sans text-sm text-text-mid">No upcoming assignments.</div>
            )}
          </div>
        </div>
      </div>

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

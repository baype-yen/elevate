"use client"

import { Icons } from "@/components/elevate/icons"
import { ElevateButton, BadgeChooser, ProgressBar } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const skills = [
  { skill: "Reading", score: 85, trend: "+5", color: "bg-violet" },
  { skill: "Grammar", score: 72, trend: "+12", color: "bg-abricot" },
  { skill: "Listening", score: 58, trend: "+8", color: "bg-navy" },
  { skill: "Speaking", score: 34, trend: "+3", color: "bg-watermelon" },
  { skill: "Writing", score: 48, trend: "+10", color: "bg-violet-light" },
]

const recentGrades = [
  { title: "Reading Analysis — Animal Farm", type: "Reading", date: "Feb 18", score: 96, max: 100 },
  { title: "Grammar Quiz — Conditionals", type: "Grammar", date: "Feb 19", score: 85, max: 100 },
  { title: "Listening Comprehension #8", type: "Listening", date: "Feb 16", score: 62, max: 100 },
  { title: "Vocabulary Test — Week 11", type: "Vocabulary", date: "Feb 14", score: 78, max: 100 },
  { title: "Oral Presentation", type: "Speaking", date: "Feb 12", score: 15, max: 20 },
]

const scoreEvolution = [
  { month: "Sep", score: 42 },
  { month: "Oct", score: 48 },
  { month: "Nov", score: 55 },
  { month: "Dec", score: 58 },
  { month: "Jan", score: 64 },
  { month: "Feb", score: 72 },
]

export default function ProgressPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Report header */}
      <div className="bg-navy rounded-[20px] px-7 py-6 flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <span className="text-[32px]">{'📊'}</span>
          <div>
            <h3 className="font-serif text-xl font-bold text-white mb-0.5">My Progress Report</h3>
            <p className="font-sans text-xs text-gray-mid">Lucas Chevalier &middot; Year 10A &middot; February 2026</p>
          </div>
        </div>
        <ElevateButton variant="secondary" size="sm" icon={<Icons.Download />}>Export PDF</ElevateButton>
      </div>

      {/* Overall grade + Score evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        {/* Overall */}
        <div className="bg-navy/5 rounded-2xl border border-gray-light p-6 text-center">
          <div className="w-20 h-20 rounded-full border-4 border-abricot flex items-center justify-center mx-auto mb-3">
            <span className="font-serif text-[28px] font-extrabold text-navy">72</span>
          </div>
          <div className="font-serif text-base font-bold text-navy">Overall Score</div>
          <div className="font-sans text-xs text-violet font-semibold mt-1">{'↑ 8 pts from January'}</div>
          <div className="mt-3 inline-block px-3.5 py-1.5 rounded-lg bg-abricot/12 text-abricot-dark font-sans text-xs font-semibold">
            On Track
          </div>
        </div>

        {/* Chart */}
        <div className="bg-off-white rounded-2xl border border-gray-light p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-serif text-[15px] font-bold text-navy">Score Evolution</h4>
            <BadgeChooser
              selected="6m"
              onSelect={() => {}}
              options={[
                { value: "1m", label: "1M" },
                { value: "3m", label: "3M" },
                { value: "6m", label: "6M" },
              ]}
            />
          </div>
          <div className="flex items-end gap-1.5 h-[120px] pt-2.5">
            {scoreEvolution.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className={cn("font-serif text-[11px] font-bold", i === 5 ? "text-navy" : "text-text-light")}>{m.score}%</span>
                <div
                  className={cn("w-full rounded-md min-h-[20px] transition-all", i === 5 ? "bg-navy" : "bg-navy/15")}
                  style={{ height: `${m.score}%` }}
                />
                <span className="font-sans text-[10px] text-text-light">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skills Detail */}
      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3.5">Skills Detail</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {skills.map((s, i) => (
            <div key={i} className="bg-off-white rounded-[14px] border border-gray-light p-4 text-center">
              <div className="font-sans text-xs font-semibold text-text-mid mb-1.5">{s.skill}</div>
              <div className="font-serif text-[22px] font-extrabold text-navy">{s.score}%</div>
              <div className="font-sans text-[11px] font-semibold text-violet mt-1">{'↑'} {s.trend}</div>
              <div className="mt-2">
                <div className="h-1.5 bg-gray-light rounded-sm overflow-hidden">
                  <div className={cn("h-full rounded-sm", s.color)} style={{ width: `${s.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Grades */}
      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3.5">Recent Grades</h4>
        <div className="bg-off-white rounded-[14px] border border-gray-light overflow-hidden">
          {recentGrades.map((g, i) => {
            const ratio = g.score / g.max
            const colorClass = ratio >= 0.8 ? "text-violet" : ratio >= 0.6 ? "text-abricot-dark" : "text-watermelon"
            const bgClass = ratio >= 0.8 ? "bg-violet/10" : ratio >= 0.6 ? "bg-abricot/10" : "bg-watermelon/10"
            return (
              <div key={i} className={cn(
                "flex items-center justify-between px-[18px] py-3.5",
                i < recentGrades.length - 1 && "border-b border-gray-light"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center font-serif text-sm font-extrabold", bgClass, colorClass)}>
                    {g.score}
                  </div>
                  <div>
                    <div className="font-sans text-sm font-semibold text-text-dark">{g.title}</div>
                    <div className="font-sans text-xs text-text-light">{g.type} &middot; {g.date}</div>
                  </div>
                </div>
                <span className={cn("font-serif text-lg font-extrabold", colorClass)}>
                  {g.score}<span className="text-[13px] font-medium text-text-light">/{g.max}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Teacher Feedback */}
      <div className="p-5 rounded-[14px] bg-violet/5 border border-violet-pale">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-violet flex items-center justify-center font-sans font-bold text-xs text-white">MD</div>
          <div>
            <div className="font-sans text-[13px] font-semibold text-navy">Teacher Feedback — Ms. Clarke</div>
            <div className="font-sans text-[11px] text-text-light">Feb 20, 2026</div>
          </div>
        </div>
        <p className="font-sans text-sm text-text-dark leading-relaxed pl-[46px]">
          Excellent progress in grammar this month, Lucas! Your use of conditionals is much stronger. Focus on listening exercises next — try the audio comprehension series. Your reading scores are outstanding. Keep up the momentum!
        </p>
      </div>
    </div>
  )
}

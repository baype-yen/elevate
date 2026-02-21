"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, LevelBadge, BadgeChooser } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentExercisesData } from "@/lib/supabase/client-data"

const quizAnswers = [
  { letter: "A", text: "have", correct: false },
  { letter: "B", text: "had", correct: true },
  { letter: "C", text: "would have", correct: false },
  { letter: "D", text: "having", correct: false },
]

export default function ExercisesPage() {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>("B")
  const [activeTab, setActiveTab] = useState("quiz")
  const [assignments, setAssignments] = useState<any[]>([])
  const { context, loading } = useAppContext()

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchStudentExercisesData(supabase, context.userId).then(setAssignments)
  }, [context])

  const current = useMemo(() => {
    const getByType = (types: string[]) => assignments.find((a) => types.includes((a.type || "").toLowerCase()))
    return {
      quiz: getByType(["quiz", "grammar", "exercise"]),
      reading: getByType(["reading"]),
      writing: getByType(["writing"]),
    }
  }, [assignments])

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Loading exercises...</div>
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-2">
        <BadgeChooser
          selected={activeTab}
          onSelect={(v) => setActiveTab(v as string)}
          options={[
            { value: "quiz", label: "Grammar Quiz" },
            { value: "reading", label: "Reading" },
            { value: "writing", label: "Writing Task" },
          ]}
        />
      </div>

      {activeTab === "quiz" && (
        <div className="bg-card rounded-[20px] border border-gray-mid overflow-hidden max-w-[640px]">
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-light bg-off-white">
            <div className="flex items-center gap-2.5">
              <button className="text-navy flex"><Icons.ChevronLeft /></button>
              <span className="font-sans text-sm font-semibold text-navy">{current.quiz?.title || "Grammar Quiz"}</span>
            </div>
            <div className="flex items-center gap-3">
              <LevelBadge level={(current.quiz?.cefr_level || "b1").toUpperCase()} colorClass="abricot" />
              <span className="flex items-center gap-1 font-sans text-[13px] text-text-light">
                <Icons.Clock /> 8:42
              </span>
            </div>
          </div>

          <div className="px-6 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-sans text-xs font-semibold text-text-light">Question 1 of 10</span>
              <span className="font-sans text-xs text-text-light">{"Score: 0/0"}</span>
            </div>
            <div className="flex gap-1">
              {[...Array(10)].map((_, i) => (
                <div key={i} className={cn("flex-1 h-1.5 rounded-sm", i === 0 ? "bg-abricot" : "bg-gray-light")} />
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="bg-navy/5 rounded-[14px] p-5 border border-gray-light mb-5">
              <div className="font-sans text-[11px] font-semibold tracking-widest uppercase text-violet mb-2">Fill in the blank</div>
              <p className="font-serif text-lg font-semibold text-navy leading-relaxed">
                If I <span className="inline-block min-w-[120px] border-b-[3px] border-abricot px-1 text-center text-abricot font-sans font-bold">______</span> more time, I would travel the world.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 mb-5">
              {quizAnswers.map((ans) => {
                const selected = selectedAnswer === ans.letter
                return (
                  <button
                    key={ans.letter}
                    onClick={() => setSelectedAnswer(ans.letter)}
                    className={cn(
                      "flex items-center gap-3.5 px-[18px] py-3.5 rounded-xl border-2 cursor-pointer transition-all text-left",
                      selected ? "border-navy bg-navy/5" : "border-gray-mid bg-card hover:border-navy/30",
                    )}
                  >
                    <div className={cn(
                      "w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center font-sans text-sm font-bold",
                      selected ? "bg-navy text-white" : "bg-gray-light text-text-mid",
                    )}>
                      {selected ? <Icons.Check /> : ans.letter}
                    </div>
                    <span className={cn("font-sans text-base", selected ? "font-bold text-navy" : "font-medium text-text-dark")}>{ans.text}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2.5">
              <ElevateButton variant="ghost" size="md">Skip</ElevateButton>
              <div className="flex-1">
                <ElevateButton variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />}>Validate & Next</ElevateButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reading" && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 max-w-[760px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-bold text-navy">{current.reading?.title || "Reading Exercise"}</h3>
            <LevelBadge level={(current.reading?.cefr_level || "b2").toUpperCase()} colorClass="watermelon" />
          </div>
          <p className="font-sans text-sm text-text-mid">This reading task is loaded from your current assignments. Continue to answer comprehension questions.</p>
        </div>
      )}

      {activeTab === "writing" && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 max-w-[760px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-bold text-navy">{current.writing?.title || "Writing Task"}</h3>
            <LevelBadge level={(current.writing?.cefr_level || "b1").toUpperCase()} colorClass="abricot" />
          </div>
          <p className="font-sans text-sm text-text-mid mb-4">Write your response and submit when ready.</p>
          <div className="flex gap-2">
            <ElevateButton variant="ghost" size="sm">Save Draft</ElevateButton>
            <ElevateButton variant="primary" size="sm" iconRight icon={<Icons.ArrowRight />}>Submit</ElevateButton>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, LevelBadge, ProgressBar, BadgeChooser } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const quizAnswers = [
  { letter: "A", text: "have", correct: false },
  { letter: "B", text: "had", correct: true },
  { letter: "C", text: "would have", correct: false },
  { letter: "D", text: "having", correct: false },
]

export default function ExercisesPage() {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>("B")
  const [activeTab, setActiveTab] = useState("quiz")

  return (
    <div className="flex flex-col gap-8">
      {/* Tab Switcher */}
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

      {/* Grammar Quiz */}
      {activeTab === "quiz" && (
        <div className="bg-card rounded-[20px] border border-gray-mid overflow-hidden max-w-[640px]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-light bg-off-white">
            <div className="flex items-center gap-2.5">
              <button className="text-navy flex"><Icons.ChevronLeft /></button>
              <span className="font-sans text-sm font-semibold text-navy">Conditional Sentences — Quiz</span>
            </div>
            <div className="flex items-center gap-3">
              <LevelBadge level="B1" colorClass="abricot" />
              <span className="flex items-center gap-1 font-sans text-[13px] text-text-light">
                <Icons.Clock /> 8:42
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="px-6 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-sans text-xs font-semibold text-text-light">Question 4 of 10</span>
              <span className="font-sans text-xs text-text-light">{'Score: 3/3 \u2713'}</span>
            </div>
            <div className="flex gap-1">
              {[...Array(10)].map((_, i) => (
                <div key={i} className={cn(
                  "flex-1 h-1.5 rounded-sm",
                  i < 3 ? "bg-violet" : i === 3 ? "bg-abricot" : "bg-gray-light"
                )} />
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="p-6">
            <div className="bg-navy/5 rounded-[14px] p-5 border border-gray-light mb-5">
              <div className="font-sans text-[11px] font-semibold tracking-widest uppercase text-violet mb-2">Fill in the blank</div>
              <p className="font-serif text-lg font-semibold text-navy leading-relaxed">
                If I <span className="inline-block min-w-[120px] border-b-[3px] border-abricot px-1 text-center text-abricot font-sans font-bold">______</span> more time, I would travel the world.
              </p>
              <p className="font-sans text-[13px] text-text-light mt-2.5 italic">
                Second conditional — unreal present situation
              </p>
            </div>

            {/* Answer choices */}
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
                      selected ? "bg-navy text-white" : "bg-gray-light text-text-mid"
                    )}>
                      {selected ? <Icons.Check /> : ans.letter}
                    </div>
                    <span className={cn(
                      "font-sans text-base",
                      selected ? "font-bold text-navy" : "font-medium text-text-dark"
                    )}>{ans.text}</span>
                    {ans.correct && selected && (
                      <span className="ml-auto font-sans text-xs font-semibold text-violet">{'Past simple \u2713'}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5">
              <ElevateButton variant="ghost" size="md">Skip</ElevateButton>
              <div className="flex-1">
                <ElevateButton variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />}>Validate & Next</ElevateButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reading Comprehension */}
      {activeTab === "reading" && (
        <div className="bg-card rounded-[20px] border border-gray-mid overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-light bg-off-white">
            <div className="flex items-center gap-2.5">
              <button className="text-navy flex"><Icons.ChevronLeft /></button>
              <span className="font-sans text-sm font-semibold text-navy">Reading Analysis — Animal Farm</span>
            </div>
            <div className="flex items-center gap-3">
              <LevelBadge level="B2" colorClass="watermelon" />
              <span className="flex items-center gap-1 font-sans text-[13px] text-text-light">
                <Icons.Clock /> 15 min
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px]">
            {/* Left — Text */}
            <div className="p-6 lg:border-r border-gray-light overflow-y-auto">
              <div className="font-sans text-[11px] font-semibold tracking-widest uppercase text-violet mb-3">Passage</div>
              <h4 className="font-serif text-[17px] font-bold text-navy mb-3.5">Animal Farm — Chapter X</h4>
              <div className="font-sans text-sm text-text-dark leading-relaxed">
                <p className="mb-3.5">
                  The creatures outside looked from pig to man, and from man to pig, and from pig to man again;
                  but already it was impossible to say which was which.
                </p>
                <p className="mb-3.5">
                  Twelve voices were shouting in anger, and they were <span className="bg-abricot/20 px-1 rounded">all alike</span>. No question, now, what had happened to the faces of the pigs.
                </p>
                <p className="mb-3.5">
                  The commandment on the wall had been changed. It now read: <span className="bg-violet/15 px-1 rounded">{'"All animals are equal, but some animals are more equal than others."'}</span>
                </p>
                <p>
                  After that it did not seem strange when the pigs took to walking on two legs.
                </p>
              </div>
              <div className="mt-4 px-3.5 py-2.5 rounded-[10px] bg-navy/5 border border-gray-light">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icons.Book />
                  <span className="font-sans text-xs font-semibold text-navy">Vocabulary Help</span>
                </div>
                <div className="font-sans text-xs text-text-mid leading-relaxed">
                  <strong>commandment</strong> — a rule or principle &middot; <strong>alike</strong> — similar, identical
                </div>
              </div>
            </div>

            {/* Right — Questions */}
            <div className="p-6">
              <div className="font-sans text-[11px] font-semibold tracking-widest uppercase text-watermelon mb-4">Questions (3)</div>

              {/* Question 1 — answered */}
              <div className="mb-5">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-[7px] shrink-0 bg-violet text-white inline-flex items-center justify-center font-sans text-xs font-bold">1</span>
                  <span className="font-sans text-sm font-semibold text-navy">What literary device does Orwell use in the final scene?</span>
                </div>
                <div className="flex flex-col gap-1.5 pl-8">
                  {["Foreshadowing", "Irony and allegory", "Personification only"].map((opt, j) => (
                    <div key={j} className={cn(
                      "px-3.5 py-2.5 rounded-[9px] border-2 font-sans text-[13px] flex items-center justify-between",
                      j === 1 ? "border-violet bg-violet/10 font-semibold text-violet" : "border-gray-mid bg-card text-text-dark"
                    )}>
                      {opt}
                      {j === 1 && <Icons.Check />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Question 2 — active */}
              <div className="mb-5">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-[7px] shrink-0 bg-abricot text-navy inline-flex items-center justify-center font-sans text-xs font-bold">2</span>
                  <span className="font-sans text-sm font-semibold text-navy">{'What does "more equal than others" reveal about the pigs\' rule?'}</span>
                </div>
                <div className="pl-8">
                  <div className="px-3.5 py-3 rounded-[10px] border-2 border-navy bg-card font-sans text-[13px] text-text-light min-h-[60px]">
                    <span className="text-text-dark">{'It shows that the pigs have corrupted the original ideals by '}</span>
                    <span className="border-r-2 border-abricot">|</span>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <span className="font-sans text-[11px] text-text-light">42 / 200 characters</span>
                  </div>
                </div>
              </div>

              {/* Question 3 — locked */}
              <div className="opacity-40">
                <div className="flex items-baseline gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-[7px] shrink-0 bg-gray-mid text-text-light inline-flex items-center justify-center font-sans text-xs font-bold">3</span>
                  <span className="font-sans text-sm font-semibold text-text-mid">Why is the ending significant in the context of the whole novel?</span>
                </div>
                <div className="pl-8 font-sans text-xs text-text-light">Answer question 2 to unlock</div>
              </div>

              <div className="mt-5 flex gap-2.5">
                <ElevateButton variant="ghost" size="md" icon={<Icons.Book />}>Re-read</ElevateButton>
                <div className="flex-1">
                  <ElevateButton variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />}>Submit Answer</ElevateButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Writing Task */}
      {activeTab === "writing" && (
        <div className="bg-card rounded-[20px] border border-gray-mid overflow-hidden max-w-[640px]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-light bg-off-white">
            <div className="flex items-center gap-2.5">
              <button className="text-navy flex"><Icons.ChevronLeft /></button>
              <span className="font-sans text-sm font-semibold text-navy">Essay — My Ideal Future</span>
            </div>
            <div className="flex items-center gap-3">
              <LevelBadge level="B1" colorClass="abricot" />
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-watermelon/10 text-watermelon font-sans">Due tomorrow</span>
            </div>
          </div>

          <div className="p-6">
            {/* Prompt box */}
            <div className="p-[18px] rounded-xl bg-violet/5 border border-violet-pale mb-5">
              <div className="font-sans text-[11px] font-semibold tracking-widest uppercase text-violet mb-1.5">Writing Prompt</div>
              <p className="font-serif text-[15px] font-semibold text-navy leading-relaxed">
                Describe your ideal future. Where will you live? What career will you pursue? Use a mix of future tenses and conditional structures.
              </p>
              <div className="flex gap-3 mt-2.5">
                <span className="font-sans text-[11px] text-text-light">150-250 words</span>
                <span className="font-sans text-[11px] text-text-light">~30 min</span>
                <span className="font-sans text-[11px] text-text-light">Future tenses + Conditionals</span>
              </div>
            </div>

            {/* Writing area */}
            <div className="border-2 border-navy rounded-xl overflow-hidden mb-4">
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 px-3 py-2 bg-gray-light border-b border-gray-mid">
                {["B", "I", "U", "—", "Aa", '""'].map((t, i) => (
                  <button key={i} className={cn(
                    "w-[30px] h-7 rounded-md flex items-center justify-center font-sans text-[13px] cursor-pointer border-none",
                    i === 0 ? "bg-navy text-white font-bold" : "bg-transparent text-text-mid",
                    i < 3 && "font-bold"
                  )}>{t}</button>
                ))}
                <div className="flex-1" />
                <span className="font-sans text-[11px] text-text-light">EN</span>
              </div>
              {/* Text */}
              <div className="p-4 min-h-[160px] font-sans text-[15px] text-text-dark leading-relaxed">
                <p className="mb-3">
                  In my ideal future, I <span className="bg-violet/10 px-0.5 rounded">would live</span> in a big city like London or Edinburgh.
                  I <span className="bg-violet/10 px-0.5 rounded">would work</span> as an architect, because I love drawing and creating spaces.
                </p>
                <p className="text-text-light">
                  Every morning, I...<span className="border-r-2 border-abricot">|</span>
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center">
              <div className="flex gap-4">
                <span className="font-sans text-xs text-text-light">47 / 150-250 words</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-violet" />
                  <span className="font-sans text-xs text-violet font-medium">2 target tenses detected</span>
                </div>
              </div>
              <div className="flex gap-2">
                <ElevateButton variant="ghost" size="sm">Save Draft</ElevateButton>
                <ElevateButton variant="primary" size="sm" iconRight icon={<Icons.ArrowRight />}>Submit</ElevateButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

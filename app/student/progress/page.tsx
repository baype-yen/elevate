"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, BadgeChooser } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentProgressData } from "@/lib/supabase/client-data"

export default function ProgressPage() {
  const { context, loading } = useAppContext()
  const [data, setData] = useState<any | null>(null)

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchStudentProgressData(supabase, context.userId).then(setData)
  }, [context])

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Chargement du rapport de progression...</div>
  }

  const latestScore = data.scoreEvolution.length ? data.scoreEvolution[data.scoreEvolution.length - 1].score : 0

  const gradeTypeLabel = (type: string) => {
    const key = (type || "").toLowerCase()
    if (key === "quiz") return "Quiz"
    if (key === "reading") return "Lecture"
    if (key === "writing") return "Écriture"
    if (key === "grammar") return "Grammaire"
    if (key === "exercise" || key === "exercice") return "Exercice"
    if (key === "mixed") return "Mixte"
    return type
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-navy rounded-[20px] px-7 py-6 flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <span className="text-[32px]">{"📊"}</span>
          <div>
            <h3 className="font-serif text-xl font-bold text-white mb-0.5">Mon rapport de progression</h3>
            <p className="font-sans text-xs text-gray-mid">Mis à jour depuis vos dernières données Supabase</p>
          </div>
        </div>
        <ElevateButton variant="secondary" size="sm" icon={<Icons.Download />}>Exporter en PDF</ElevateButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <div className="bg-navy/5 rounded-2xl border border-gray-light p-6 text-center">
          <div className="w-20 h-20 rounded-full border-4 border-abricot flex items-center justify-center mx-auto mb-3">
            <span className="font-serif text-[28px] font-extrabold text-navy">{latestScore}</span>
          </div>
          <div className="font-serif text-base font-bold text-navy">Score global</div>
          <div className="mt-3 inline-block px-3.5 py-1.5 rounded-lg bg-abricot/12 text-abricot-dark font-sans text-xs font-semibold">
            Données en direct
          </div>
        </div>

        <div className="bg-off-white rounded-2xl border border-gray-light p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-serif text-[15px] font-bold text-navy">Evolution du score</h4>
            <BadgeChooser selected="6m" onSelect={() => {}} options={[{ value: "1m", label: "1M" }, { value: "3m", label: "3M" }, { value: "6m", label: "6M" }]} />
          </div>
          <div className="flex items-end gap-1.5 h-[120px] pt-2.5">
            {(data.scoreEvolution.length ? data.scoreEvolution : [{ month: "Maint.", score: 0 }]).map((m: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className={cn("font-serif text-[11px] font-bold", i === data.scoreEvolution.length - 1 ? "text-navy" : "text-text-light")}>{m.score}%</span>
                <div className={cn("w-full rounded-md min-h-[20px] transition-all", i === data.scoreEvolution.length - 1 ? "bg-navy" : "bg-navy/15")} style={{ height: `${m.score}%` }} />
                <span className="font-sans text-[10px] text-text-light">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3.5">Détail des compétences</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {data.skills.map((s: any, i: number) => (
            <div key={i} className="bg-off-white rounded-[14px] border border-gray-light p-4 text-center">
              <div className="font-sans text-xs font-semibold text-text-mid mb-1.5">{s.skill}</div>
              <div className="font-serif text-[22px] font-extrabold text-navy">{s.score}%</div>
              <div className="font-sans text-[11px] font-semibold text-violet mt-1">↑ {s.trend}</div>
              <div className="mt-2">
                <div className="h-1.5 bg-gray-light rounded-sm overflow-hidden">
                  <div className={cn("h-full rounded-sm", i % 2 ? "bg-abricot" : "bg-violet")} style={{ width: `${s.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3.5">Notes recentes</h4>
        <div className="bg-off-white rounded-[14px] border border-gray-light overflow-hidden">
          {data.recentGrades.map((g: any, i: number) => {
            const ratio = g.score / g.max
            const colorClass = ratio >= 0.8 ? "text-violet" : ratio >= 0.6 ? "text-abricot-dark" : "text-watermelon"
            const bgClass = ratio >= 0.8 ? "bg-violet/10" : ratio >= 0.6 ? "bg-abricot/10" : "bg-watermelon/10"
            return (
              <div key={i} className={cn("flex items-center justify-between px-[18px] py-3.5", i < data.recentGrades.length - 1 && "border-b border-gray-light")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center font-serif text-sm font-extrabold", bgClass, colorClass)}>{g.score}</div>
                  <div>
                    <div className="font-sans text-sm font-semibold text-text-dark">{g.title}</div>
                    <div className="font-sans text-xs text-text-light">{gradeTypeLabel(g.type)} &middot; {g.date}</div>
                  </div>
                </div>
                <span className={cn("font-serif text-lg font-extrabold", colorClass)}>
                  {g.score}<span className="text-[13px] font-medium text-text-light">/{g.max}</span>
                </span>
              </div>
            )
          })}
          {!data.recentGrades.length && <div className="px-4 py-3 font-sans text-sm text-text-mid">Aucun travail noté pour le moment.</div>}
        </div>
      </div>

      <div className="p-5 rounded-[14px] bg-violet/5 border border-violet-pale">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-violet flex items-center justify-center font-sans font-bold text-xs text-white">
            {data.feedback?.teacher?.split(" ").map((p: string) => p[0]).join("").slice(0, 2) || "TE"}
          </div>
          <div>
            <div className="font-sans text-[13px] font-semibold text-navy">Retour enseignant - {data.feedback?.teacher || "Pas encore de retour"}</div>
            <div className="font-sans text-[11px] text-text-light">{data.feedback?.date || "-"}</div>
          </div>
        </div>
        <p className="font-sans text-sm text-text-dark leading-relaxed pl-[46px]">
          {data.feedback?.text || "Le retour de votre enseignant apparaîtra ici une fois publié."}
        </p>
      </div>
    </div>
  )
}

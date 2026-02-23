"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { StatCard, ProgressBar, LessonCard } from "@/components/elevate/shared"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentDashboardData } from "@/lib/supabase/client-data"

export default function StudentDashboard() {
  const { context, loading } = useAppContext()
  const router = useRouter()
  const [data, setData] = useState<{
    overallScore: number
    xpWeek: number
    badgeCount: number
    lessonsDone: number
    upcomingWork: Array<{ id: string; title: string; due: string; type: string; urgent: boolean; hasDocuments: boolean }>
    skills: Array<{ label: string; score: number }>
  } | null>(null)

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchStudentDashboardData(supabase, context.userId, context.activeSchoolId).then(setData)
  }, [context])

  const workTypeLabel = (type: string) => {
    const key = (type || "").toLowerCase()
    if (key === "quiz") return "Quiz"
    if (key === "reading") return "Lecture"
    if (key === "writing") return "Écriture"
    if (key === "grammar") return "Grammaire"
    if (key === "exercise" || key === "exercice") return "Exercice"
    if (key === "mixed") return "Mixte"
    return type
  }

  const openUpcomingWork = (work: { id: string; type: string }) => {
    const key = (work.type || "").toLowerCase()
    const tab = key === "reading" ? "reading" : key === "writing" || key === "project" ? "writing" : "quiz"
    router.push(`/student/exercises?tab=${tab}&assignment=${work.id}`)
  }

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Chargement du tableau de bord...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Icons.BarChart />} label="Score global" value={`${data.overallScore}%`} accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Zap />} label="XP cette semaine" value={String(data.xpWeek)} accentBg="bg-abricot/10" accentText="text-abricot-dark" />
        <StatCard icon={<Icons.Trophy />} label="Badges obtenus" value={String(data.badgeCount)} accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Target />} label="Leçons terminées" value={String(data.lessonsDone)} accentBg="bg-violet/10" accentText="text-violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Détail des compétences</h4>
          <div className="flex flex-col gap-3.5">
            {(data.skills.length ? data.skills : [{ label: "Lecture", score: 0 }, { label: "Grammaire", score: 0 }, { label: "Écoute", score: 0 }, { label: "Oral", score: 0 }, { label: "Écrit", score: 0 }]).map((s, i) => (
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
          <h4 className="font-serif text-base font-bold text-navy mb-4">Travail à venir</h4>
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
                      Échéance {w.due}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-light font-sans text-[10px] font-medium text-text-mid">
                      {workTypeLabel(w.type)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {w.hasDocuments && (
                    <button
                      onClick={() => openUpcomingWork(w)}
                      className="px-2.5 h-7 rounded-[7px] bg-gray-light text-navy font-sans text-[11px] font-semibold cursor-pointer hover:bg-gray-mid transition-colors"
                      title="Voir la consigne"
                    >
                      Consigne
                    </button>
                  )}
                  <button
                    onClick={() => openUpcomingWork(w)}
                    className="w-7 h-7 rounded-[7px] bg-navy flex items-center justify-center text-white shrink-0 cursor-pointer hover:bg-navy-mid transition-colors"
                    title="Ouvrir le devoir"
                  >
                    <Icons.ArrowRight />
                  </button>
                </div>
              </div>
            ))}
            {!data.upcomingWork.length && (
              <div className="font-sans text-sm text-text-mid">Aucun devoir à venir.</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-serif text-base font-bold text-navy mb-3">Continuer l'apprentissage</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <LessonCard
            title="Phrases conditionnelles"
            desc="Maîtrisez les conditionnels anglais avec des exemples concrets."
            progress={65}
            level="B1"
            levelColor="abricot"
            time="15 min"
            tag="Recommandé"
          />
          <LessonCard
            title="Révision des temps du passé"
            desc="Distinguez le prétérit du présent perfect."
            progress={30}
            level="B1"
            levelColor="abricot"
            time="20 min"
          />
          <LessonCard
            title="Écriture formelle"
            desc="Structurez des lettres formelles et des e-mails professionnels."
            progress={0}
            level="B2"
            levelColor="watermelon"
            time="25 min"
            tag="Nouveau"
          />
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, ProgressBar, StatCard } from "@/components/elevate/shared"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentDashboardData } from "@/lib/firebase/client-data"
import { cn } from "@/lib/utils"

type MissionKind = "course" | "assignment" | "flashcards" | "remediation"

type StudentDashboardData = {
  overallScore: number
  overallTrend: number
  xpWeek: number
  badgeCount: number
  lessonsDone: number
  missionQueue: Array<{
    id: string
    title: string
    subtitle: string
    href: string
    urgent: boolean
    kind: MissionKind
  }>
  moduleProgress: Array<{
    topicKey: string
    topicLabel: string
    completed: number
    total: number
    pending: number
  }>
  adaptiveMastery: {
    levels: {
      vocabulary: string
      grammar: string
      tense: string
    }
    streaks: {
      vocabulary: number
      grammar: number
      tense: number
    }
    deckCount: number
  }
  feedbackLoop: {
    latestGrade: {
      title: string
      score: number
      date: string
      feedback: string
    } | null
    latestTeacherFeedback: {
      teacher: string
      date: string
      text: string
    } | null
    pendingRemediation: number
  }
  momentum: {
    activeDays14: number
    currentStreak: number
  }
  skills: Array<{ label: string; score: number }>
}

function missionKindLabel(kind: MissionKind) {
  if (kind === "course") return "Parcours cours"
  if (kind === "assignment") return "Examen blanc"
  if (kind === "flashcards") return "Flashcards"
  return "Remédiation"
}

function missionKindClass(kind: MissionKind) {
  if (kind === "course") return "bg-navy/10 text-navy"
  if (kind === "assignment") return "bg-abricot/15 text-abricot-dark"
  if (kind === "flashcards") return "bg-violet/10 text-violet"
  return "bg-watermelon/10 text-watermelon"
}

function previewText(text: string, max = 180) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 3)}...`
}

function trendLabel(value: number) {
  if (value > 0) return `+${value} pts`
  if (value < 0) return `${value} pts`
  return "Stable"
}

export default function StudentDashboard() {
  const { context, loading } = useAppContext()
  const router = useRouter()
  const [data, setData] = useState<StudentDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return

    let active = true
    setError(null)
    setData(null)

    fetchStudentDashboardData(db, context.userId, context.activeSchoolId)
      .then((payload) => {
        if (!active) return
        setData(payload)
      })
      .catch(() => {
        if (!active) return
        setError("Impossible de charger le tableau de bord pour le moment.")
        setData(null)
      })

    return () => {
      active = false
    }
  }, [context?.userId, context?.activeSchoolId])

  const retryLoad = async () => {
    if (!context) return

    setError(null)
    setData(null)

    try {
      const payload = await fetchStudentDashboardData(db, context.userId, context.activeSchoolId)
      setData(payload)
    } catch {
      setError("Impossible de charger le tableau de bord pour le moment.")
      setData(null)
    }
  }

  const adaptiveRows = useMemo(
    () => [
      { key: "vocabulary" as const, label: "Vocabulaire", color: "bg-abricot" },
      { key: "grammar" as const, label: "Grammaire", color: "bg-violet" },
      { key: "tense" as const, label: "Temps verbaux", color: "bg-navy-light" },
    ],
    [],
  )

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement du tableau de bord...</div>
  }

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3 max-w-[560px]">
        <div className="font-serif text-lg font-bold text-navy">Tableau de bord indisponible</div>
        <div className="font-sans text-sm text-text-mid">{error}</div>
        <div>
          <ElevateButton size="sm" variant="outline" icon={<Icons.ArrowRight />} onClick={retryLoad}>
            Réessayer
          </ElevateButton>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="font-sans text-sm text-text-mid">Chargement du tableau de bord...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard icon={<Icons.Target />} label="Missions actives" value={String(data.missionQueue.length)} accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.BarChart />} label="Score global" value={`${data.overallScore}%`} accentBg="bg-violet/10" accentText="text-violet" />
        <StatCard icon={<Icons.Zap />} label="XP 7 jours" value={String(data.xpWeek)} accentBg="bg-abricot/10" accentText="text-abricot-dark" />
        <StatCard icon={<Icons.Flame />} label="Série active" value={`${data.momentum.currentStreak} j`} accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Check />} label="Modules terminés" value={String(data.lessonsDone)} accentBg="bg-navy-light/10" accentText="text-navy" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="font-serif text-lg font-bold text-navy">Mission du jour</h4>
              <p className="font-sans text-[13px] text-text-mid">Ton parcours actif: apprendre, pratiquer, renforcer.</p>
            </div>
            <span className="rounded-md border border-gray-mid bg-off-white px-2.5 py-1 font-sans text-[11px] font-semibold text-text-mid">
              Tendance score: {trendLabel(data.overallTrend)}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {data.missionQueue.map((mission) => (
              <div
                key={mission.id}
                className={cn(
                  "rounded-xl border px-3.5 py-3",
                  mission.urgent ? "border-watermelon/35 bg-watermelon/5" : "border-gray-light bg-off-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-sans text-[13px] font-semibold text-text-dark leading-snug">{mission.title}</div>
                    <div className="font-sans text-[12px] text-text-mid mt-1">{mission.subtitle}</div>
                    <div className="mt-2">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 font-sans text-[10px] font-semibold", missionKindClass(mission.kind))}>
                        {missionKindLabel(mission.kind)}
                      </span>
                    </div>
                  </div>
                  <ElevateButton size="sm" variant="primary" icon={<Icons.ArrowRight />} onClick={() => router.push(mission.href)}>
                    Ouvrir
                  </ElevateButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h4 className="font-serif text-lg font-bold text-navy">Maîtrise adaptative</h4>
              <p className="font-sans text-[13px] text-text-mid">Niveau en temps réel sur les flashcards.</p>
            </div>
            <span className="rounded-md bg-violet/10 px-2.5 py-1 font-sans text-[11px] font-semibold text-violet">
              Deck actif: {data.adaptiveMastery.deckCount}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {adaptiveRows.map((row) => {
              const streak = data.adaptiveMastery.streaks[row.key]

              return (
                <div key={row.key} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-sans text-[13px] font-semibold text-text-dark">{row.label}</span>
                    <span className="font-sans text-[12px] text-text-mid">Niveau {data.adaptiveMastery.levels[row.key]}</span>
                  </div>
                  <ProgressBar value={Math.min(100, streak * 20)} color={row.color} sublabel={`Série ${streak}`} />
                </div>
              )
            })}
          </div>

          <div className="mt-4">
            <ElevateButton variant="outline" fullWidth icon={<Icons.Layers />} onClick={() => router.push("/student/flashcards")}>
              Continuer mes flashcards
            </ElevateButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-1">Progression par thème</h4>
          <p className="font-sans text-[13px] text-text-mid mb-4">Modules mixtes dans "Exercices basés sur les cours".</p>

          <div className="flex flex-col gap-3">
            {data.moduleProgress.map((topic, index) => (
              <div key={`${topic.topicKey}:${topic.topicLabel}`} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                <ProgressBar
                  value={topic.completed}
                  max={Math.max(1, topic.total)}
                  label={topic.topicLabel}
                  sublabel={`${topic.completed}/${topic.total} terminés`}
                  color={index % 3 === 0 ? "bg-navy" : index % 3 === 1 ? "bg-violet" : "bg-abricot"}
                />
                <div className="font-sans text-[11px] text-text-light mt-1.5">{topic.pending} mission(s) en attente sur ce thème</div>
              </div>
            ))}

            {!data.moduleProgress.length && (
              <div className="font-sans text-sm text-text-mid">Aucun module disponible pour le moment.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col">
          <h4 className="font-serif text-base font-bold text-navy mb-1">Boucle de feedback</h4>
          <p className="font-sans text-[13px] text-text-mid mb-4">Dernière correction et points à retravailler.</p>

          {data.feedbackLoop.latestGrade ? (
            <div className="rounded-lg border border-violet/25 bg-violet/8 px-3 py-2.5 mb-3">
              <div className="font-sans text-[13px] font-semibold text-navy">{data.feedbackLoop.latestGrade.title}</div>
              <div className="font-sans text-[12px] text-text-mid mt-0.5">
                Score {data.feedbackLoop.latestGrade.score}% · {data.feedbackLoop.latestGrade.date}
              </div>
              {!!data.feedbackLoop.latestGrade.feedback && (
                <div className="font-sans text-[12px] text-text-dark mt-2 leading-relaxed">
                  {previewText(data.feedbackLoop.latestGrade.feedback)}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5 font-sans text-sm text-text-mid mb-3">
              Aucune note corrigée pour le moment.
            </div>
          )}

          {data.feedbackLoop.latestTeacherFeedback && (
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5 mb-3">
              <div className="font-sans text-[12px] text-text-light">
                Retour de {data.feedbackLoop.latestTeacherFeedback.teacher} · {data.feedbackLoop.latestTeacherFeedback.date}
              </div>
              <div className="font-sans text-[12px] text-text-dark mt-1.5 leading-relaxed">
                {previewText(data.feedbackLoop.latestTeacherFeedback.text)}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-abricot/30 bg-abricot/10 px-3 py-2.5 mb-4">
            <div className="font-sans text-[12px] text-abricot-dark font-semibold">
              Remédiation en attente: {data.feedbackLoop.pendingRemediation}
            </div>
            <div className="font-sans text-[12px] text-text-mid mt-1">
              Continue tes exercices personnalisés pour fermer la boucle correction → progression.
            </div>
          </div>

          <div className="mt-auto flex gap-2">
            <ElevateButton size="sm" variant="primary" icon={<Icons.ArrowRight />} onClick={() => router.push("/student/exercises?tab=personalized")}>
              Ouvrir mes exercices
            </ElevateButton>
            <ElevateButton size="sm" variant="ghost" onClick={() => router.push("/student/progress")}>Voir mes progrès</ElevateButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-4">Compétences observées</h4>
          <div className="flex flex-col gap-3.5">
            {(data.skills.length
              ? data.skills
              : [
                { label: "Lecture", score: 0 },
                { label: "Grammaire", score: 0 },
                { label: "Écrit", score: 0 },
              ]).map((skill, index) => (
              <ProgressBar
                key={`${skill.label}:${index}`}
                value={skill.score}
                label={skill.label}
                sublabel={`${skill.score}%`}
                color={index === 0 ? "bg-violet" : index === 1 ? "bg-abricot" : "bg-navy"}
              />
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-base font-bold text-navy mb-1">Momentum</h4>
          <p className="font-sans text-[13px] text-text-mid mb-4">Rythme des 14 derniers jours.</p>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[12px] text-text-light">Jours actifs</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.momentum.activeDays14}/14</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
               <div className="font-sans text-[12px] text-text-light">Série actuelle</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.momentum.currentStreak} j</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[12px] text-text-light">XP 7 jours</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.xpWeek}</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[12px] text-text-light">Badges</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.badgeCount}</div>
            </div>
          </div>

          <ElevateButton variant="outline" fullWidth icon={<Icons.Calendar />} onClick={() => router.push("/student/calendar")}>
            Ouvrir mon calendrier de pratique
          </ElevateButton>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import {
  ElevateButton,
  InputField,
  LevelBadge,
  ProgressBar,
  RadioCardChooser,
  StatCard,
} from "@/components/elevate/shared"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { createTeacherClass, fetchTeacherDashboardData } from "@/lib/firebase/client-data"
import { cn } from "@/lib/utils"

const colorToBg: Record<string, string> = {
  a1: "bg-violet",
  a2: "bg-violet",
  b1: "bg-abricot",
  b2: "bg-watermelon",
  c1: "bg-violet",
  c2: "bg-navy",
}

const colorLevel: Record<string, string> = {
  A1: "violet",
  A2: "violet",
  B1: "abricot",
  B2: "watermelon",
  C1: "violet",
  C2: "navy",
}

type DashboardPriority = "high" | "medium" | "low"

type TeacherDashboardData = {
  summary: {
    totalStudents: number
    activeClasses: number
    pendingReviews: number
    overallAvg: number
    documentsReady: number
    documentsBlocked: number
  }
  classHealth: Array<{
    id: string
    name: string
    level: string
    students: number
    avg: number
    assignments: number
    pending: number
    submissionRate: number
  }>
  priorityQueue: Array<{
    id: string
    title: string
    detail: string
    href: string
    priority: DashboardPriority
  }>
  aiImpact: {
    courseExercises: number
    courseRegenerations: number
    personalizedExercises: number
    flashcards: number
    ocrSessions: number
  }
  recentActivity: Array<{
    text: string
    time: string
    type: string
  }>
}

function priorityClass(priority: DashboardPriority) {
  if (priority === "high") return "bg-watermelon/12 border-watermelon/35 text-watermelon"
  if (priority === "medium") return "bg-abricot/12 border-abricot/35 text-abricot-dark"
  return "bg-violet/10 border-violet/30 text-violet"
}

function priorityLabel(priority: DashboardPriority) {
  if (priority === "high") return "Haute"
  if (priority === "medium") return "Moyenne"
  return "Basse"
}

export default function TeacherDashboard() {
  const router = useRouter()
  const { context, loading } = useAppContext()

  const [newClassLevel, setNewClassLevel] = useState("b1")
  const [newClassName, setNewClassName] = useState("")
  const [newClassLoading, setNewClassLoading] = useState(false)
  const [newClassError, setNewClassError] = useState<string | null>(null)

  const [data, setData] = useState<TeacherDashboardData | null>(null)

  const load = async () => {
    if (!context) return
    const nextData = await fetchTeacherDashboardData(db, context.userId, context.activeSchoolId)
    setData(nextData)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId])

  const onCreateClass = async () => {
    if (!context) return
    if (!context.activeSchoolId) {
      setNewClassError("Aucun établissement actif sélectionné.")
      return
    }

    try {
      setNewClassLoading(true)
      setNewClassError(null)
      const classId = await createTeacherClass(db, context.userId, context.activeSchoolId, {
        name: newClassName,
        level: newClassLevel,
      })
      setNewClassName("")
      await load()
      router.push(`/teacher/classes/${classId}`)
    } catch (e: any) {
      setNewClassError(e.message || "Impossible de créer la classe.")
    } finally {
      setNewClassLoading(false)
    }
  }

  if (loading || !context || !data) {
    return <div className="font-sans text-sm text-text-mid">Chargement du tableau de bord...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <StatCard icon={<Icons.Users />} label="Élèves actifs" value={String(data.summary.totalStudents)} accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Book />} label="Classes actives" value={String(data.summary.activeClasses)} accentBg="bg-violet/10" accentText="text-violet" />
        <StatCard icon={<Icons.Clipboard />} label="Corrections attente" value={String(data.summary.pendingReviews)} accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.BarChart />} label="Moyenne globale" value={`${data.summary.overallAvg}%`} accentBg="bg-abricot/10" accentText="text-abricot-dark" />
        <StatCard icon={<Icons.Check />} label="Docs IA prêts" value={String(data.summary.documentsReady)} accentBg="bg-navy-light/10" accentText="text-navy" />
        <StatCard icon={<Icons.Bell />} label="Docs à configurer" value={String(data.summary.documentsBlocked)} accentBg="bg-watermelon/10" accentText="text-watermelon" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-lg font-bold text-navy mb-1">Pilotage opérationnel</h4>
          <p className="font-sans text-[13px] text-text-mid mb-4">
            Suivi de la chaîne complète: documents, génération IA, corrections et remédiations.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[11px] text-text-light">Exercices cours</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.aiImpact.courseExercises}</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
               <div className="font-sans text-[11px] text-text-light">Régénérations IA</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.aiImpact.courseRegenerations}</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
               <div className="font-sans text-[11px] text-text-light">Remédiation</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.aiImpact.personalizedExercises}</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[11px] text-text-light">Flashcards</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.aiImpact.flashcards}</div>
            </div>
            <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
              <div className="font-sans text-[11px] text-text-light">Sessions OCR</div>
              <div className="font-serif text-xl font-bold text-navy mt-0.5">{data.aiImpact.ocrSessions}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ElevateButton size="sm" variant="outline" icon={<Icons.FileText />} onClick={() => router.push("/teacher/documents")}>Documents</ElevateButton>
            <ElevateButton size="sm" variant="outline" icon={<Icons.Clipboard />} onClick={() => router.push("/teacher/work")}>Travaux élèves</ElevateButton>
            <ElevateButton size="sm" variant="outline" icon={<Icons.Camera />} onClick={() => router.push("/teacher/photo-exams")}>Copies photo</ElevateButton>
            <ElevateButton size="sm" variant="ghost" icon={<Icons.Zap />} onClick={() => router.push("/teacher/activity")}>Activité</ElevateButton>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="font-serif text-lg font-bold text-navy">File prioritaire</h4>
               <p className="font-sans text-[13px] text-text-mid">Actions à traiter en premier.</p>
             </div>
            {!!data.priorityQueue.length && (
              <span className="rounded-md border border-gray-mid bg-off-white px-2.5 py-1 font-sans text-[11px] font-semibold text-text-mid">
                {data.priorityQueue.length} item(s)
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {data.priorityQueue.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-light bg-off-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-sans text-[13px] font-semibold text-text-dark leading-snug">{item.title}</div>
                    <div className="font-sans text-[12px] text-text-mid mt-1">{item.detail}</div>
                    <span className={cn("inline-flex mt-2 rounded-md border px-2 py-0.5 font-sans text-[10px] font-semibold", priorityClass(item.priority))}>
                      Priorité {priorityLabel(item.priority)}
                    </span>
                  </div>

                  <ElevateButton size="sm" variant="primary" icon={<Icons.ArrowRight />} onClick={() => router.push(item.href)}>
                    Ouvrir
                  </ElevateButton>
                </div>
              </div>
            ))}

            {!data.priorityQueue.length && (
              <div className="font-sans text-sm text-text-mid">Aucune urgence détectée pour le moment.</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-serif text-lg font-bold text-navy mb-3.5">Santé des classes</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {data.classHealth.map((classRow) => (
            <div key={classRow.id} className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-serif text-[16px] font-bold text-navy">{classRow.name}</div>
                  <div className="font-sans text-xs text-text-light">
                    {classRow.students} élèves · {classRow.assignments} devoir(s)
                  </div>
                </div>
                <LevelBadge level={classRow.level} colorClass={colorLevel[classRow.level] || "violet"} active />
              </div>

              <ProgressBar
                value={classRow.avg}
                label="Moyenne de classe"
                sublabel={`${classRow.avg}%`}
                color={colorToBg[classRow.level.toLowerCase()] || "bg-violet"}
              />

              <ProgressBar
                value={classRow.submissionRate}
                label="Taux de remise"
                sublabel={`${classRow.submissionRate}%`}
                color={classRow.submissionRate < 60 ? "bg-watermelon" : "bg-navy"}
              />

              <div className="flex items-center justify-between gap-2">
                <span className="font-sans text-[12px] text-text-mid">Corrections en attente: {classRow.pending}</span>
                <div className="flex gap-2">
                  <ElevateButton size="sm" variant="primary" icon={<Icons.Eye />} onClick={() => router.push(`/teacher/classes/${classRow.id}`)}>Classe</ElevateButton>
                  <ElevateButton size="sm" variant="ghost" onClick={() => router.push("/teacher/work")}>Corriger</ElevateButton>
                </div>
              </div>
            </div>
          ))}

          {!data.classHealth.length && (
            <div className="bg-card rounded-2xl border border-gray-mid p-5 font-sans text-sm text-text-mid">
              Aucune classe active pour le moment.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5">
          <h4 className="font-serif text-lg font-bold text-navy mb-1">Activité récente</h4>
          <p className="font-sans text-[13px] text-text-mid mb-4">Signal utile sur ce qui se passe dans les classes.</p>

          <div className="flex flex-col gap-2.5">
            {data.recentActivity.map((event, index) => (
              <div key={`${event.type}:${index}`} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                <div className="font-sans text-[13px] font-medium text-text-dark leading-snug">{event.text}</div>
                <div className="font-sans text-[11px] text-text-light mt-1">{event.time}</div>
              </div>
            ))}

            {!data.recentActivity.length && (
              <div className="font-sans text-sm text-text-mid">Aucune activité récente.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border-2 border-dashed border-gray-mid p-6 flex flex-col gap-3">
          <div className="w-12 h-12 rounded-xl bg-gray-light flex items-center justify-center text-navy">
            <Icons.Plus />
          </div>
          <h4 className="font-serif text-base font-bold text-navy">Créer une nouvelle classe</h4>
          <p className="font-sans text-[13px] text-text-mid">
            Lance rapidement une classe puis complète le setup depuis l'espace Classes.
          </p>

          <InputField
            placeholder="ex. BTS MCO - Groupe 1"
            icon={<Icons.Book />}
            value={newClassName}
            onChange={setNewClassName}
          />

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

          <ElevateButton variant="primary" fullWidth icon={<Icons.Plus />} onClick={onCreateClass} disabled={newClassLoading}>
            Créer la classe
          </ElevateButton>

          {newClassError && <p className="font-sans text-sm text-watermelon">{newClassError}</p>}
        </div>
      </div>
    </div>
  )
}

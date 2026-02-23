"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { StatCard, ProgressBar, LevelBadge, ElevateButton, InputField, RadioCardChooser } from "@/components/elevate/shared"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { createTeacherClass, fetchTeacherDashboardData } from "@/lib/supabase/client-data"

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

export default function TeacherDashboard() {
  const router = useRouter()
  const [newClassLevel, setNewClassLevel] = useState("b1")
  const [newClassName, setNewClassName] = useState("")
  const [newClassLoading, setNewClassLoading] = useState(false)
  const [newClassError, setNewClassError] = useState<string | null>(null)
  const [data, setData] = useState<{
    classCards: Array<{ id: string; name: string; students: number; level: string; avg: number; lessons: number }>
    totalStudents: number
    activeClasses: number
    pendingReviews: number
    overallAvg: number
  } | null>(null)

  const { context, loading } = useAppContext()

  const load = async () => {
    if (!context) return
    const supabase = createClient()
    const nextData = await fetchTeacherDashboardData(supabase, context.userId, context.activeSchoolId)
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
      const classId = await createTeacherClass(createClient(), context.userId, context.activeSchoolId, {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Icons.Users />} label="Élèves au total" value={String(data.totalStudents)} accentBg="bg-navy/10" accentText="text-navy" />
        <StatCard icon={<Icons.Book />} label="Classes actives" value={String(data.activeClasses)} accentBg="bg-violet/10" accentText="text-violet" />
        <StatCard icon={<Icons.Clipboard />} label="Corrections en attente" value={String(data.pendingReviews)} accentBg="bg-watermelon/10" accentText="text-watermelon" />
        <StatCard icon={<Icons.Trophy />} label="Moyenne" value={`${data.overallAvg}%`} accentBg="bg-abricot/10" accentText="text-abricot-dark" />
      </div>

      <div>
        <h4 className="font-serif text-lg font-bold text-navy mb-3.5">Mes classes</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {data.classCards.map((cls) => (
            <div key={cls.id} className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-serif text-[15px] font-bold text-navy">{cls.name}</div>
                  <div className="font-sans text-xs text-text-light">{cls.students} élèves</div>
                </div>
                <LevelBadge level={cls.level} colorClass={colorLevel[cls.level] || "violet"} active />
              </div>
              <ProgressBar value={cls.avg} label="Moyenne de classe" sublabel={`${cls.avg}%`} color={colorToBg[cls.level.toLowerCase()] || "bg-violet"} />
              <div className="flex gap-2">
                <ElevateButton variant="primary" size="sm" icon={<Icons.Eye />} onClick={() => router.push(`/teacher/classes/${cls.id}`)}>Voir</ElevateButton>
                <ElevateButton variant="ghost" size="sm" icon={<Icons.Edit />} onClick={() => router.push("/teacher/classes")}>Modifier</ElevateButton>
              </div>
            </div>
          ))}
          {!data.classCards.length && (
            <div className="bg-card rounded-2xl border border-gray-mid p-5 font-sans text-sm text-text-mid">
              Aucune classe pour le moment. Créez votre première classe ci-dessous.
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border-2 border-dashed border-gray-mid p-7 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-light flex items-center justify-center text-navy">
          <Icons.Plus />
        </div>
        <h4 className="font-serif text-base font-bold text-navy">Créer une nouvelle classe</h4>
        <p className="text-[13px] text-text-mid text-center max-w-[340px]">
          Configurez une classe, assignez un niveau, invitez des élèves et suivez leur progression.
        </p>
        <div className="w-full max-w-[400px]">
          <InputField placeholder="ex. 10B - Anglais A2" icon={<Icons.Book />} value={newClassName} onChange={setNewClassName} />
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
          <ElevateButton variant="primary" fullWidth icon={<Icons.Plus />} onClick={onCreateClass} disabled={newClassLoading}>Créer la classe</ElevateButton>
        </div>
        {newClassError && <p className="font-sans text-sm text-watermelon">{newClassError}</p>}
      </div>
    </div>
  )
}

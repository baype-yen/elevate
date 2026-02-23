"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentCalendarData } from "@/lib/supabase/client-data"

export default function CalendarPage() {
  const { context, loading } = useAppContext()
  const [exerciseData, setExerciseData] = useState<Record<number, { count: number; type: "full" | "partial" | "missed" }>>({})
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    const start = new Date(month.getFullYear(), month.getMonth(), 1)
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    fetchStudentCalendarData(supabase, context.userId, start, end).then(setExerciseData)
  }, [context, month])

  const daysInMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(), [month])
  const offset = useMemo(() => {
    const day = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    return day === 0 ? 6 : day - 1
  }, [month])

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement du calendrier...</div>
  }

  return (
    <div className="max-w-[600px]">
      <div className="bg-card rounded-[20px] border border-gray-mid p-7">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Calendrier des exercices</h3>
            <p className="text-[13px] text-text-mid">Suivez la pratique quotidienne et la réalisation des exercices</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="text-navy flex cursor-pointer"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            ><Icons.ChevronLeft /></button>
            <span className="font-serif text-base font-bold text-navy">
              {month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </span>
            <button
              className="text-navy flex cursor-pointer"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            ><Icons.ChevronRight /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="text-center font-sans text-[11px] font-semibold text-text-light tracking-wider uppercase py-1.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {[...Array(offset)].map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square rounded-xl" />
          ))}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1
            const now = new Date()
            const today = now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() && day === now.getDate()
            const data = exerciseData[day]

            const bgClass = today
              ? "bg-navy"
              : !data || data.type === "missed"
                ? "bg-watermelon/8"
                : data.type === "partial"
                  ? "bg-abricot/12"
                  : "bg-violet/10"

            return (
              <div
                key={day}
                className={cn("aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer relative", bgClass, !today && "border border-gray-light")}
              >
                <span className={cn("font-sans text-sm", today ? "font-bold text-white" : "text-text-dark font-medium")}>{day}</span>
                {data && (
                  <div className="flex gap-0.5">
                    {[...Array(3)].map((_, di) => {
                      const dotColor = today
                        ? di < (data?.count || 0) ? "bg-abricot" : "bg-white/25"
                        : di < (data?.count || 0)
                          ? data.type === "full" ? "bg-violet" : data.type === "partial" ? "bg-abricot" : "bg-watermelon"
                          : "bg-gray-mid"
                      return <div key={di} className={cn("w-[5px] h-[5px] rounded-full", dotColor)} />
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-5 mt-[18px] justify-center">
          {[
            { color: "bg-violet", label: "Tous les exercices faits" },
            { color: "bg-abricot", label: "Partiel" },
            { color: "bg-watermelon", label: "Manqué" },
          ].map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-sm", l.color)} />
              <span className="font-sans text-xs text-text-mid">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-[18px] p-4 rounded-xl bg-navy flex items-center justify-between">
          <div>
            <div className="font-sans text-xs text-gray-mid">Aujourd'hui</div>
            <div className="font-serif text-base font-bold text-white mt-0.5">
              {(exerciseData[new Date().getDate()]?.count || 0)} sur {(exerciseData[new Date().getDate()]?.count ? 3 : 3)} exercices terminés
            </div>
          </div>
          <ElevateButton variant="secondary" size="sm" icon={<Icons.ArrowRight />}>Terminer</ElevateButton>
        </div>
      </div>
    </div>
  )
}

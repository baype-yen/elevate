"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentCalendarData } from "@/lib/firebase/client-data"
import { getDownloadURL, ref } from "firebase/storage"

type CalendarPayload = Awaited<ReturnType<typeof fetchStudentCalendarData>>
type CalendarTask = CalendarPayload["unscheduledTasks"][number]
type CalendarProgram = CalendarPayload["programsByDate"][string]
type CalendarStatus = "planned" | "full" | "partial" | "missed"

function dateKeyFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseDateKey(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  return new Date(year, month - 1, day)
}

function taskKindLabel(kind: CalendarTask["kind"]) {
  if (kind === "assignment") return "Exercice de classe"
  if (kind === "course_exercise") return "Exercice basé sur le cours"
  if (kind === "personalized_exercise") return "Remédiation personnalisée"
  return "Lien rapide"
}

function taskKindBadgeClass(kind: CalendarTask["kind"]) {
  if (kind === "assignment") return "border-navy/30 bg-navy/10 text-navy"
  if (kind === "course_exercise") return "border-violet/35 bg-violet/10 text-violet"
  if (kind === "personalized_exercise") return "border-abricot/35 bg-abricot/16 text-abricot-dark"
  return "border-gray-mid bg-gray-light/50 text-text-mid"
}

function statusLabel(status: CalendarStatus) {
  if (status === "planned") return "Prévu"
  if (status === "full") return "Terminé"
  if (status === "partial") return "Partiel"
  return "En retard"
}

function statusTone(status: CalendarStatus) {
  if (status === "planned") return "border-navy/25 bg-navy/10 text-navy"
  if (status === "full") return "border-violet/30 bg-violet/10 text-violet"
  if (status === "partial") return "border-abricot/35 bg-abricot/14 text-abricot-dark"
  return "border-watermelon/35 bg-watermelon/10 text-watermelon"
}

function dayCellTone(status?: CalendarStatus) {
  if (!status) return "border-gray-light bg-white/70"
  if (status === "planned") return "border-navy/20 bg-navy/8"
  if (status === "full") return "border-violet/25 bg-violet/10"
  if (status === "partial") return "border-abricot/30 bg-abricot/12"
  return "border-watermelon/25 bg-watermelon/8"
}

function previewText(text: string, max = 120) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim()
  if (!cleaned.length) return ""
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 3)}...`
}

export default function CalendarPage() {
  const { context, loading } = useAppContext()
  const router = useRouter()

  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [calendarData, setCalendarData] = useState<CalendarPayload>({
    days: {},
    programsByDate: {},
    unscheduledTasks: [],
  })
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return

    const start = new Date(month.getFullYear(), month.getMonth(), 1)
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    const today = new Date()
    const todayKey = dateKeyFromParts(today.getFullYear(), today.getMonth(), today.getDate())

    let active = true

    fetchStudentCalendarData(db, context.userId, start, end, context.activeSchoolId)
      .then((payload) => {
        if (!active) return
        setCalendarData(payload)

        const firstProgramKey = Object.keys(payload.programsByDate)
          .sort((left, right) => left.localeCompare(right))[0] || null

        const defaultMonthDayKey = dateKeyFromParts(month.getFullYear(), month.getMonth(), 1)
        const canUseToday = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()

        setSelectedDateKey((previous) => {
          if (previous) {
            const parsed = parseDateKey(previous)
            if (parsed && parsed.getFullYear() === month.getFullYear() && parsed.getMonth() === month.getMonth()) {
              return previous
            }
          }
          if (canUseToday) return todayKey
          return firstProgramKey || defaultMonthDayKey
        })

        setError(null)
      })
      .catch(() => {
        if (!active) return
        setCalendarData({ days: {}, programsByDate: {}, unscheduledTasks: [] })
        setError("Impossible de charger le planning pour le moment.")
      })

    return () => {
      active = false
    }
  }, [context?.userId, context?.activeSchoolId, month])

  const daysInMonth = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    [month],
  )

  const offset = useMemo(() => {
    const day = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    return day === 0 ? 6 : day - 1
  }, [month])

  const selectedDate = selectedDateKey ? parseDateKey(selectedDateKey) : null
  const selectedDateLabel = selectedDate
    ? selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : ""
  const selectedProgram: CalendarProgram | null = selectedDateKey
    ? calendarData.programsByDate[selectedDateKey] || null
    : null

  const openDocument = async (document: CalendarTask["documents"][number]) => {
    if (!document.filePath) return

    try {
      setBusyDocumentId(document.id)
      const url = await getDownloadURL(ref(storage, document.filePath))
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      setError("Impossible d'ouvrir le document sélectionné.")
    } finally {
      setBusyDocumentId(null)
    }
  }

  const today = new Date()
  const todayKey = dateKeyFromParts(today.getFullYear(), today.getMonth(), today.getDate())

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement du calendrier...</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card rounded-[20px] border border-gray-mid p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Calendrier prévisionnel</h3>
            <p className="font-sans text-[13px] text-text-mid">
              Clique sur une date pour voir le programme de classe, les textes associés et les exercices à faire.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              className="w-9 h-9 rounded-lg border border-gray-mid bg-off-white text-navy flex items-center justify-center cursor-pointer hover:bg-gray-light transition-colors"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <Icons.ChevronLeft />
            </button>

            <span className="font-serif text-base font-bold text-navy min-w-[180px] text-center capitalize">
              {month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </span>

            <button
              className="w-9 h-9 rounded-lg border border-gray-mid bg-off-white text-navy flex items-center justify-center cursor-pointer hover:bg-gray-light transition-colors"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <Icons.ChevronRight />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-watermelon/35 bg-watermelon/10 px-3 py-2 font-sans text-sm text-watermelon">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <section className="rounded-xl border border-gray-mid bg-off-white p-3 md:p-4">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((dayLabel) => (
                <div
                  key={dayLabel}
                  className="text-center font-sans text-[11px] font-semibold text-text-light tracking-wider uppercase py-1"
                >
                  {dayLabel}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {[...Array(offset)].map((_, index) => (
                <div key={`empty-${index}`} className="aspect-square rounded-xl" />
              ))}

              {[...Array(daysInMonth)].map((_, index) => {
                const day = index + 1
                const dateKey = dateKeyFromParts(month.getFullYear(), month.getMonth(), day)
                const daySummary = calendarData.days[day]
                const isToday = dateKey === todayKey
                const isSelected = selectedDateKey === dateKey

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    className={cn(
                      "aspect-square rounded-xl border p-1.5 text-left flex flex-col justify-between transition-colors",
                      dayCellTone(daySummary?.status),
                      isSelected && "ring-2 ring-navy/35 border-navy/35",
                      isToday && !isSelected && "border-navy/45",
                    )}
                  >
                    <div className={cn(
                      "font-sans text-[13px] font-semibold",
                      isSelected ? "text-navy" : "text-text-dark",
                    )}>
                      {day}
                    </div>

                    {daySummary ? (
                      <div className="font-sans text-[10px] text-text-mid">
                        {daySummary.completedCount}/{daySummary.totalCount}
                      </div>
                    ) : (
                      <div className="font-sans text-[10px] text-text-light">-</div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2.5 mt-4">
              {([
                { status: "planned", label: "Prévu" },
                { status: "full", label: "Terminé" },
                { status: "partial", label: "Partiel" },
                { status: "missed", label: "En retard" },
              ] as Array<{ status: CalendarStatus; label: string }>).map((legend) => (
                <div key={legend.status} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1", statusTone(legend.status))}>
                  <div className="w-2 h-2 rounded-full bg-current" />
                  <span className="font-sans text-[11px] font-semibold">{legend.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-mid bg-white p-3 md:p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-sans text-[11px] uppercase tracking-[0.06em] font-semibold text-text-light">Programme du jour</div>
                <h4 className="font-serif text-lg font-bold text-navy capitalize mt-0.5">{selectedDateLabel || "Sélectionnez une date"}</h4>
              </div>

              {selectedProgram && (
                <div className={cn("inline-flex rounded-md border px-2.5 py-1 font-sans text-[11px] font-semibold", statusTone(selectedProgram.status))}>
                  {statusLabel(selectedProgram.status)} · {selectedProgram.completedCount}/{selectedProgram.totalCount}
                </div>
              )}
            </div>

            {selectedProgram ? (
              <>
                <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-sans text-[12px] font-semibold text-text-dark">Progression de la journée</span>
                    <span className="font-sans text-[11px] text-text-mid">{selectedProgram.completionRatio}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white border border-gray-mid overflow-hidden">
                    <div className="h-full bg-navy-light transition-all" style={{ width: `${selectedProgram.completionRatio}%` }} />
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 max-h-[520px] overflow-auto pr-1">
                  {(selectedProgram.sessions || []).map((session) => (
                    <article key={session.id} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="font-sans text-[11px] text-text-light uppercase tracking-[0.05em]">{session.className}</div>
                          <div className="font-serif text-[17px] font-bold text-navy leading-snug">{session.title}</div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("inline-flex rounded-md border px-2 py-0.5 font-sans text-[10px] font-semibold", statusTone(session.status))}>
                            {statusLabel(session.status)}
                          </span>
                          <span className="font-sans text-[10px] text-text-light">
                            {session.completedCount}/{session.totalCount} suivi(s)
                          </span>
                        </div>
                      </div>

                      {!!session.majorPoints && (
                        <div className="rounded-md border border-violet/30 bg-violet/10 px-2.5 py-2 mb-2">
                          <div className="font-sans text-[10px] uppercase tracking-[0.05em] font-semibold text-violet mb-1">
                            Points majeurs à retenir
                          </div>
                          <div className="font-sans text-[12px] text-text-dark whitespace-pre-wrap leading-relaxed">
                            {session.majorPoints}
                          </div>
                        </div>
                      )}

                      {!!session.notes && (
                        <div className="rounded-md border border-gray-mid bg-white px-2.5 py-2 mb-2">
                          <div className="font-sans text-[10px] uppercase tracking-[0.05em] font-semibold text-text-light mb-1">
                            Notes de séance
                          </div>
                          <div className="font-sans text-[12px] text-text-mid whitespace-pre-wrap leading-relaxed">
                            {session.notes}
                          </div>
                        </div>
                      )}

                      {!!session.documents.length && (
                        <div className="mb-2">
                          <div className="font-sans text-[11px] font-semibold text-navy mb-1">Textes associés</div>
                          <div className="flex flex-wrap gap-1.5">
                            {session.documents.map((document) => (
                              <button
                                key={`session-doc-${session.id}-${document.id}`}
                                type="button"
                                onClick={() => openDocument(document)}
                                disabled={busyDocumentId === document.id}
                                className="inline-flex items-center gap-1.5 rounded-md border border-gray-mid bg-white px-2 py-1 font-sans text-[11px] text-text-mid hover:border-navy/35 hover:text-navy disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                <Icons.FileText className="w-3.5 h-3.5" />
                                {document.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!!session.tasks.length && (
                        <div className="flex flex-col gap-1.5">
                          {session.tasks.map((task) => (
                            <div key={`${session.id}:${task.id}`} className="rounded-md border border-gray-mid bg-white px-2.5 py-2">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="font-sans text-[12px] font-semibold text-text-dark leading-snug">{task.title}</div>
                                <span className={cn("inline-flex shrink-0 rounded-md border px-1.5 py-0.5 font-sans text-[10px] font-semibold", taskKindBadgeClass(task.kind))}>
                                  {taskKindLabel(task.kind)}
                                </span>
                              </div>

                              {!!task.subtitle && (
                                <div className="font-sans text-[11px] text-text-mid leading-relaxed mb-1.5">
                                  {previewText(task.subtitle, 130)}
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className={cn(
                                  "inline-flex rounded-md border px-2 py-0.5 font-sans text-[10px] font-semibold",
                                  !task.trackCompletion
                                    ? "border-gray-mid bg-gray-light/55 text-text-light"
                                    : task.completed
                                      ? "border-violet/30 bg-violet/10 text-violet"
                                      : "border-watermelon/30 bg-watermelon/10 text-watermelon",
                                )}>
                                  {!task.trackCompletion ? "Accès direct" : task.completed ? "Terminé" : "À faire"}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {!!task.documents.length && (
                                    <button
                                      type="button"
                                      onClick={() => openDocument(task.documents[0])}
                                      disabled={busyDocumentId === task.documents[0].id}
                                      className="inline-flex items-center gap-1 rounded-md border border-gray-mid bg-white px-2 py-1 font-sans text-[10px] font-semibold text-text-mid hover:border-navy/35 hover:text-navy transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                    >
                                      <Icons.FileText className="w-3 h-3" />
                                      Texte
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => router.push(task.href)}
                                    className="inline-flex items-center gap-1 rounded-md border border-navy/25 bg-navy/8 px-2 py-1 font-sans text-[10px] font-semibold text-navy hover:bg-navy/14 transition-colors"
                                  >
                                    Ouvrir
                                    <Icons.ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-gray-light bg-off-white px-3 py-3 font-sans text-sm text-text-mid">
                Aucun programme associé à cette date pour le moment.
              </div>
            )}
          </section>
        </div>
      </div>

      {!!calendarData.unscheduledTasks.length && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h4 className="font-serif text-lg font-bold text-navy">À planifier / sans date</h4>
              <p className="font-sans text-[13px] text-text-mid">
                Travaux sans échéance précise. Lance-les pour garder ton rythme de progression.
              </p>
            </div>
            <span className="rounded-md border border-gray-mid bg-off-white px-2.5 py-1 font-sans text-[11px] font-semibold text-text-mid">
              {calendarData.unscheduledTasks.length} élément(s)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {calendarData.unscheduledTasks.slice(0, 8).map((task) => (
              <div key={`unscheduled-${task.id}`} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-sans text-[13px] font-semibold text-text-dark leading-snug">{task.title}</div>
                  <div className="font-sans text-[11px] text-text-light mt-0.5">{task.className}</div>
                  {!!task.subtitle && (
                    <div className="font-sans text-[11px] text-text-mid mt-1">{previewText(task.subtitle, 100)}</div>
                  )}
                </div>
                <ElevateButton size="sm" variant="outline" icon={<Icons.ArrowRight />} onClick={() => router.push(task.href)}>
                  Ouvrir
                </ElevateButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

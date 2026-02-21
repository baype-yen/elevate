"use client"

import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const exerciseData: Record<number, { count: number; type: "full" | "partial" | "missed" }> = {
  1: { count: 3, type: "full" }, 2: { count: 2, type: "full" }, 3: { count: 1, type: "partial" },
  4: { count: 3, type: "full" }, 5: { count: 2, type: "full" }, 6: { count: 0, type: "missed" },
  7: { count: 1, type: "partial" }, 8: { count: 3, type: "full" }, 9: { count: 3, type: "full" },
  10: { count: 2, type: "full" }, 11: { count: 3, type: "full" }, 12: { count: 1, type: "partial" },
  13: { count: 2, type: "full" }, 14: { count: 0, type: "missed" }, 15: { count: 3, type: "full" },
  16: { count: 3, type: "full" }, 17: { count: 2, type: "full" }, 18: { count: 3, type: "full" },
  19: { count: 1, type: "partial" }, 20: { count: 3, type: "full" }, 21: { count: 2, type: "full" },
}

export default function CalendarPage() {
  return (
    <div className="max-w-[600px]">
      <div className="bg-card rounded-[20px] border border-gray-mid p-7">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Exercise Calendar</h3>
            <p className="text-[13px] text-text-mid">Track daily practice & exercise completion</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-navy flex cursor-pointer"><Icons.ChevronLeft /></button>
            <span className="font-serif text-base font-bold text-navy">February 2026</span>
            <button className="text-navy flex cursor-pointer"><Icons.ChevronRight /></button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="text-center font-sans text-[11px] font-semibold text-text-light tracking-wider uppercase py-1.5">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Empty cells (Feb 2026 starts on Sunday) */}
          {[...Array(6)].map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square rounded-xl" />
          ))}
          {/* Days */}
          {[...Array(28)].map((_, i) => {
            const day = i + 1
            const today = day === 21
            const data = exerciseData[day]
            const isFuture = day > 21

            const bgClass = today ? "bg-navy"
              : isFuture ? "bg-off-white"
              : !data || data.type === "missed" ? "bg-watermelon/8"
              : data.type === "partial" ? "bg-abricot/12"
              : "bg-violet/10"

            return (
              <div
                key={day}
                className={cn(
                  "aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer relative",
                  bgClass,
                  !today && "border border-gray-light",
                )}
              >
                <span className={cn(
                  "font-sans text-sm",
                  today ? "font-bold text-white" : isFuture ? "text-text-light font-medium" : "text-text-dark font-medium"
                )}>{day}</span>
                {!isFuture && data && (
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

        {/* Legend */}
        <div className="flex gap-5 mt-[18px] justify-center">
          {[
            { color: "bg-violet", label: "All exercises done" },
            { color: "bg-abricot", label: "Partial" },
            { color: "bg-watermelon", label: "Missed" },
          ].map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-sm", l.color)} />
              <span className="font-sans text-xs text-text-mid">{l.label}</span>
            </div>
          ))}
        </div>

        {/* Daily summary */}
        <div className="mt-[18px] p-4 rounded-xl bg-navy flex items-center justify-between">
          <div>
            <div className="font-sans text-xs text-gray-mid">Today — Feb 21</div>
            <div className="font-serif text-base font-bold text-white mt-0.5">2 of 3 exercises completed</div>
          </div>
          <ElevateButton variant="secondary" size="sm" icon={<Icons.ArrowRight />}>Finish</ElevateButton>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"

const activities = [
  { text: "Emma Martin submitted Essay: My Ideal Future", time: "12 min ago", accent: "bg-violet/10", type: "submission" },
  { text: "Lucas Chevalier completed Grammar Quiz — 85%", time: "1h ago", accent: "bg-abricot/10", type: "completion" },
  { text: "Hugo Bernard started Listening Comp. #9", time: "2h ago", accent: "bg-navy/10", type: "start" },
  { text: "Nathan Dubois — 3-day inactivity alert", time: "3h ago", accent: "bg-watermelon/10", type: "alert" },
  { text: "Lea Moreau earned 'Bookworm' badge", time: "5h ago", accent: "bg-abricot/10", type: "badge" },
  { text: "Chloe Petit uploaded oral recording", time: "6h ago", accent: "bg-violet/10", type: "submission" },
  { text: "You shared 'Conditional Sentences' document", time: "Yesterday", accent: "bg-navy/10", type: "share" },
  { text: "Year 11C — Class average improved to 68%", time: "Yesterday", accent: "bg-violet/10", type: "milestone" },
]

const activityIcons: Record<string, React.ReactNode> = {
  submission: <Icons.FileText />,
  completion: <Icons.Target />,
  start: <Icons.Play />,
  alert: <Icons.Bell />,
  badge: <Icons.Trophy />,
  share: <Icons.FileText />,
  milestone: <Icons.BarChart />,
}

export default function ActivityPage() {
  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7 max-w-[520px]">
      <h3 className="font-serif text-xl font-bold text-navy mb-1">Recent Activity</h3>
      <p className="text-[13px] text-text-mid mb-5">{"What's been happening across your classes"}</p>

      <div className="flex flex-col">
        {activities.map((act, i) => (
          <div key={i} className={cn(
            "flex items-start gap-3.5 py-3.5",
            i < activities.length - 1 && "border-b border-gray-light"
          )}>
            <div className={cn("w-[38px] h-[38px] rounded-[10px] shrink-0 flex items-center justify-center text-navy", act.accent)}>
              {activityIcons[act.type]}
            </div>
            <div className="flex-1">
              <div className="font-sans text-[13px] font-medium text-text-dark leading-snug">{act.text}</div>
              <div className="font-sans text-[11px] text-text-light mt-0.5">{act.time}</div>
            </div>
            {act.type === "alert" && (
              <ElevateButton variant="watermelon" size="sm">Nudge</ElevateButton>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

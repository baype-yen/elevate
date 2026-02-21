"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherActivityData } from "@/lib/supabase/client-data"

const activityIcons: Record<string, React.ReactNode> = {
  submission: <Icons.FileText />,
  completion: <Icons.Target />,
  start: <Icons.Play />,
  alert: <Icons.Bell />,
  badge: <Icons.Trophy />,
  share: <Icons.FileText />,
  milestone: <Icons.BarChart />,
  assignment_created: <Icons.Clipboard />,
  grade_posted: <Icons.Check />,
  document_uploaded: <Icons.FileText />,
}

export default function ActivityPage() {
  const { context, loading } = useAppContext()
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    if (!context) return
    const supabase = createClient()
    fetchTeacherActivityData(supabase, context.userId, context.activeSchoolId).then(setActivities)
  }, [context])

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Loading activity...</div>
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7 max-w-[620px]">
      <h3 className="font-serif text-xl font-bold text-navy mb-1">Recent Activity</h3>
      <p className="text-[13px] text-text-mid mb-5">{"What's been happening across your classes"}</p>

      <div className="flex flex-col">
        {activities.map((act, i) => (
          <div key={i} className={cn("flex items-start gap-3.5 py-3.5", i < activities.length - 1 && "border-b border-gray-light")}>
            <div className="w-[38px] h-[38px] rounded-[10px] shrink-0 flex items-center justify-center text-navy bg-violet/10">
              {activityIcons[act.type] || <Icons.Zap />}
            </div>
            <div className="flex-1">
              <div className="font-sans text-[13px] font-medium text-text-dark leading-snug">{act.text}</div>
              <div className="font-sans text-[11px] text-text-light mt-0.5">{act.time}</div>
            </div>
            {act.type === "alert" && <ElevateButton variant="watermelon" size="sm">Nudge</ElevateButton>}
          </div>
        ))}
      </div>

      {!activities.length && (
        <div className="font-sans text-sm text-text-mid">No recent activity yet.</div>
      )}
    </div>
  )
}

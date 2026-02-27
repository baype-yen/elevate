"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export type AppContext = {
  userId: string
  fullName: string
  defaultRole: "student" | "teacher" | "self_learner"
  cefrLevel: string | null
  activeSchoolId: string | null
  membershipRole: "owner" | "admin" | "teacher" | "student" | null
  schoolName: string | null
}

export function useAppContext() {
  const [context, setContext] = useState<AppContext | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    async function run() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (mounted) {
          setContext(null)
          setLoading(false)
        }
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, default_role, cefr_level, active_school_id")
        .eq("id", user.id)
        .single()

      const { data: memberships } = await supabase
        .from("school_memberships")
        .select("school_id, role, status, schools(name)")
        .eq("user_id", user.id)
        .eq("status", "active")

      let resolvedMemberships = memberships || []

      if (!resolvedMemberships.length && profile?.default_role === "teacher") {
        await supabase.rpc("bootstrap_demo_workspace")
        const { data: freshMemberships } = await supabase
          .from("school_memberships")
          .select("school_id, role, status, schools(name)")
          .eq("user_id", user.id)
          .eq("status", "active")
        resolvedMemberships = freshMemberships || []
      }

      const firstMembership = resolvedMemberships[0] ?? null
      let activeSchoolId = profile?.active_school_id ?? null

      if (!activeSchoolId && firstMembership?.school_id) {
        activeSchoolId = firstMembership.school_id
        await supabase.from("profiles").update({ active_school_id: activeSchoolId }).eq("id", user.id)
      }

      const activeMembership =
        resolvedMemberships.find((m) => m.school_id === activeSchoolId) ?? firstMembership ?? null

      if (mounted) {
        setContext({
          userId: user.id,
          fullName: profile?.full_name || user.email || "User",
          defaultRole: (profile?.default_role || "student") as AppContext["defaultRole"],
          cefrLevel: profile?.cefr_level ?? null,
          activeSchoolId,
          membershipRole: (activeMembership?.role as AppContext["membershipRole"]) ?? null,
          schoolName:
            ((activeMembership?.schools as { name?: string } | null)?.name ?? null) || null,
        })
        setLoading(false)
      }
    }

    run()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        const loginPath = pathname.startsWith("/student") ? "/student-login" : "/login"
        router.replace(loginPath)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [pathname, router])

  return { context, loading }
}

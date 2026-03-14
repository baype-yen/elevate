"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth"
import { doc, getDoc, getDocs, query, collection, where, updateDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/client"

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

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (mounted) {
          setContext(null)
          setLoading(false)
          const loginPath = pathname.startsWith("/student") ? "/student-login" : "/login"
          router.replace(loginPath)
        }
        return
      }

      const profileSnap = await getDoc(doc(db, "profiles", user.uid))
      const profile = profileSnap.exists() ? profileSnap.data() : null

      const membershipsQuery = query(
        collection(db, "school_memberships"),
        where("user_id", "==", user.uid),
        where("status", "==", "active"),
      )
      const membershipsSnap = await getDocs(membershipsQuery)
      let memberships = membershipsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]

      if (!memberships.length && profile?.default_role === "teacher") {
        try {
          const { httpsCallable, getFunctions } = await import("firebase/functions")
          const functions = getFunctions(auth.app, "europe-west1")
          const bootstrapFn = httpsCallable(functions, "bootstrapDemoWorkspace")
          await bootstrapFn()

          const freshSnap = await getDocs(membershipsQuery)
          memberships = freshSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
        } catch {
          // Cloud Function not deployed yet — continue without demo workspace
        }
      }

      const firstMembership = memberships[0] ?? null
      let activeSchoolId = profile?.active_school_id ?? null

      if (!activeSchoolId && firstMembership?.school_id) {
        activeSchoolId = firstMembership.school_id
        await updateDoc(doc(db, "profiles", user.uid), { active_school_id: activeSchoolId })
      }

      const activeMembership =
        memberships.find((m: any) => m.school_id === activeSchoolId) ?? firstMembership ?? null

      let schoolName: string | null = null
      if (activeMembership?.school_id) {
        const schoolSnap = await getDoc(doc(db, "schools", activeMembership.school_id))
        schoolName = schoolSnap.exists() ? schoolSnap.data()?.name || null : null
      }

      if (mounted) {
        setContext({
          userId: user.uid,
          fullName: profile?.full_name || user.email || "User",
          defaultRole: (profile?.default_role || "student") as AppContext["defaultRole"],
          cefrLevel: profile?.cefr_level ?? null,
          activeSchoolId,
          membershipRole: (activeMembership?.role as AppContext["membershipRole"]) ?? null,
          schoolName,
        })
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [pathname, router])

  return { context, loading }
}

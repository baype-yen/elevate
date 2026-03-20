"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth"
import { doc, getDoc, getDocs, query, collection, where, updateDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/client"

const CEFR_LEVELS = new Set(["a1", "a2", "b1", "b2", "c1", "c2"])

function normalizeLevel(level: unknown): string | null {
  if (typeof level !== "string") return null
  const normalized = level.trim().toLowerCase()
  return CEFR_LEVELS.has(normalized) ? normalized : null
}

function toDateMs(value: any): number {
  if (!value) return 0
  if (typeof value?.toDate === "function") return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

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

      let effectiveCefrLevel = normalizeLevel(profile?.cefr_level)

      if ((profile?.default_role || "student") === "student") {
        try {
          const enrollmentsSnap = await getDocs(
            query(
              collection(db, "class_enrollments"),
              where("student_id", "==", user.uid),
              where("status", "==", "active"),
            ),
          )

          const enrollments = enrollmentsSnap.docs.map((row) => ({
            id: row.id,
            ...row.data(),
          })) as Array<Record<string, any>>

          const classMap = new Map<string, any>()
          for (const enrollment of enrollments) {
            const classId = typeof enrollment.class_id === "string" ? enrollment.class_id : ""
            if (!classId || classMap.has(classId)) continue
            const classSnap = await getDoc(doc(db, "classes", classId))
            if (classSnap.exists()) {
              classMap.set(classId, classSnap.data())
            }
          }

          const activeRows = enrollments.filter((enrollment) => {
            const classId = typeof enrollment.class_id === "string" ? enrollment.class_id : ""
            if (!classId) return false
            const classRow = classMap.get(classId)
            if (!classRow) return false
            if (classRow.archived_at) return false
            return true
          })

          const sameSchoolRows = activeSchoolId
            ? activeRows.filter((enrollment) => {
              const classId = typeof enrollment.class_id === "string" ? enrollment.class_id : ""
              return classMap.get(classId)?.school_id === activeSchoolId
            })
            : activeRows

          const candidates = (sameSchoolRows.length ? sameSchoolRows : activeRows)
            .sort((left, right) => {
              return Math.max(toDateMs(right.updated_at), toDateMs(right.created_at))
                - Math.max(toDateMs(left.updated_at), toDateMs(left.created_at))
            })

          if (candidates.length) {
            const selected = candidates[0]
            const classRow = classMap.get(selected.class_id) || null
            effectiveCefrLevel = normalizeLevel(selected.cefr_level)
              || normalizeLevel(classRow?.cefr_level)
              || effectiveCefrLevel
          }
        } catch {
          // Keep profile fallback level if enrollment lookup fails
        }
      }

      if (mounted) {
        setContext({
          userId: user.uid,
          fullName: profile?.full_name || user.email || "User",
          defaultRole: (profile?.default_role || "student") as AppContext["defaultRole"],
          cefrLevel: effectiveCefrLevel,
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

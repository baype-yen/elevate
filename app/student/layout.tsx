"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/elevate/icons"
import { LevelBadge } from "@/components/elevate/shared"
import { useAppContext } from "@/hooks/use-app-context"
import { signOut } from "firebase/auth"
import { auth } from "@/lib/firebase/client"

const programmeMcoSubmenu = [
  { href: "/student/documents", label: "Documents vus en cours", icon: Icons.FileText },
  { href: "/student/course-exercises", label: "Exercices basés sur les cours", icon: Icons.Target },
  { href: "/student/exercises", label: "Examens blancs", icon: Icons.Clipboard },
]

const topNavItems = [
  { href: "/student", label: "Tableau de bord", icon: Icons.Home, key: "dashboard" },
  { href: "/student/documents", label: "Programme MCO", icon: Icons.Book, key: "programme" },
  {
    href: "/student/grammar-lessons",
    label: "Bases grammaticales et conjugaison",
    icon: Icons.Target,
    key: "grammar-base",
  },
  { href: "/student/flashcards", label: "Exercices personnalisés", icon: Icons.Layers, key: "personalized" },
  { href: "/student/calendar", label: "Calendrier", icon: Icons.Calendar, key: "calendar" },
] as const

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { context, loading } = useAppContext()

  useEffect(() => {
    if (!loading && context && context.defaultRole === "teacher") {
      router.replace("/teacher")
    }
  }, [loading, context, router])

  const onSignOut = async () => {
    document.cookie = "__session=; path=/; max-age=0"
    await signOut(auth)
    router.push("/student-login")
  }

  if (loading || !context) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="font-sans text-sm text-text-mid">Chargement de l'espace...</div>
      </div>
    )
  }

  const initials = context.fullName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const level = (context.cefrLevel || "b1").toUpperCase()
  const inProgrammeMco = pathname === "/student/documents"
    || pathname === "/student/course-exercises"
    || pathname === "/student/exercises"

  return (
    <div className="min-h-screen bg-off-white">
      {/* Header */}
      <header className="bg-navy">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-[14px] bg-abricot flex items-center justify-center font-serif font-extrabold text-lg text-navy">
              {initials}
            </div>
            <div>
              <div className="font-sans text-base font-semibold text-white">Bon retour, {context.fullName} !</div>
              <div className="font-sans text-xs text-gray-mid">{level} &middot; {context.schoolName || "Espace personnel"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LevelBadge level={level} colorClass="abricot" active />
            <button onClick={onSignOut} className="w-9 h-9 rounded-[10px] bg-navy-mid flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer">
              <Icons.LogOut />
            </button>
          </div>
        </div>
        {/* Nav */}
        <nav className="max-w-[1200px] mx-auto px-6 flex gap-1 border-t border-navy-mid flex-wrap">
          {topNavItems.map((item) => {
            const active = item.key === "programme" ? inProgrammeMco : pathname === item.href
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 font-sans text-[13px] font-semibold transition-colors -mb-px",
                  active ? "text-abricot border-b-2 border-abricot" : "text-gray-dark hover:text-white",
                )}
              >
                <item.icon />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {inProgrammeMco && (
          <div className="max-w-[1200px] mx-auto px-6 pb-3 border-t border-navy-mid/80">
            <div className="flex flex-wrap gap-2 pt-2">
              {programmeMcoSubmenu.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-abricot text-navy"
                        : "bg-navy-mid/55 text-gray-mid hover:bg-navy-mid hover:text-white",
                    )}
                  >
                    <item.icon />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}

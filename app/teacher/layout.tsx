"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { useAppContext } from "@/hooks/use-app-context"
import { createClient } from "@/lib/supabase/client"

const navItems = [
  { href: "/teacher", label: "Tableau de bord", icon: Icons.Home },
  { href: "/teacher/classes", label: "Classes", icon: Icons.Book },
  { href: "/teacher/students", label: "Élèves", icon: Icons.Users },
  { href: "/teacher/documents", label: "Documents", icon: Icons.FileText },
  { href: "/teacher/work", label: "Travaux élèves", icon: Icons.Clipboard },
  { href: "/teacher/activity", label: "Activité", icon: Icons.Zap },
]

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { context, loading } = useAppContext()

  useEffect(() => {
    if (!loading && context && context.defaultRole !== "teacher") {
      router.replace("/student")
    }
  }, [loading, context, router])

  const onSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  const onNewClass = () => {
    if (pathname === "/teacher/classes") {
      const section = document.getElementById("create-class")
      section?.scrollIntoView({ behavior: "smooth", block: "start" })
      const firstInput = section?.querySelector("input") as HTMLInputElement | null
      firstInput?.focus()
      return
    }

    router.push("/teacher/classes#create-class")
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

  return (
    <div className="min-h-screen bg-off-white">
      {/* Header */}
      <header className="bg-navy">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-[14px] bg-violet flex items-center justify-center font-serif font-extrabold text-lg text-white">
              {initials}
            </div>
            <div>
              <div className="font-sans text-base font-semibold text-white">{context.fullName}</div>
              <div className="font-sans text-xs text-gray-mid">Enseignant &middot; {context.schoolName || "Aucun établissement actif"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ElevateButton variant="secondary" size="sm" icon={<Icons.Plus />} onClick={onNewClass}>Nouvelle classe</ElevateButton>
            <button onClick={onSignOut} className="w-9 h-9 rounded-[10px] bg-navy-mid flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer">
              <Icons.LogOut />
            </button>
          </div>
        </div>
        {/* Nav */}
        <nav className="max-w-[1200px] mx-auto px-6 flex gap-1 border-t border-navy-mid">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/teacher" && pathname.startsWith(`${item.href}/`))
            return (
              <Link
                key={item.href}
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
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}

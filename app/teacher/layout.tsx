"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"

const navItems = [
  { href: "/teacher", label: "Dashboard", icon: Icons.Home },
  { href: "/teacher/students", label: "Students", icon: Icons.Users },
  { href: "/teacher/documents", label: "Documents", icon: Icons.FileText },
  { href: "/teacher/work", label: "Student Work", icon: Icons.Clipboard },
  { href: "/teacher/activity", label: "Activity", icon: Icons.Zap },
]

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-off-white">
      {/* Header */}
      <header className="bg-navy">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-[14px] bg-violet flex items-center justify-center font-serif font-extrabold text-lg text-white">
              MD
            </div>
            <div>
              <div className="font-sans text-base font-semibold text-white">Ms. Clarke</div>
              <div className="font-sans text-xs text-gray-mid">English Teacher &middot; Greenfield Academy</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ElevateButton variant="secondary" size="sm" icon={<Icons.Plus />}>New Class</ElevateButton>
            <Link href="/login" className="w-9 h-9 rounded-[10px] bg-navy-mid flex items-center justify-center text-white/70 hover:text-white transition-colors">
              <Icons.LogOut />
            </Link>
          </div>
        </div>
        {/* Nav */}
        <nav className="max-w-[1200px] mx-auto px-6 flex gap-1 border-t border-navy-mid">
          {navItems.map((item) => {
            const active = pathname === item.href
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

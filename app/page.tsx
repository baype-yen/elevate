"use client"

import Link from "next/link"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, LevelBadge, ProgressBar } from "@/components/elevate/shared"

const features = [
  {
    icon: <Icons.Target />,
    title: "Adaptive Learning",
    desc: "Lessons that adapt to your CEFR level from A1 to C2, with personalized exercises.",
  },
  {
    icon: <Icons.BarChart />,
    title: "Track Progress",
    desc: "Detailed skill breakdowns, score evolution, and teacher feedback in real time.",
  },
  {
    icon: <Icons.Users />,
    title: "Class Management",
    desc: "Teachers can manage classes, review student work, and monitor activity at a glance.",
  },
  {
    icon: <Icons.Trophy />,
    title: "Earn Achievements",
    desc: "Stay motivated with badges, streaks, and XP as you practice and improve.",
  },
]

const levels = [
  { level: "A1", label: "Beginner", color: "violet" },
  { level: "A2", label: "Elementary", color: "violet" },
  { level: "B1", label: "Intermediate", color: "abricot" },
  { level: "B2", label: "Upper Int.", color: "abricot" },
  { level: "C1", label: "Advanced", color: "watermelon" },
  { level: "C2", label: "Mastery", color: "navy" },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-off-white">
      {/* Hero */}
      <header className="bg-navy relative overflow-hidden">
        <div className="absolute -top-10 -right-5 w-36 h-36 rounded-full bg-abricot/8" />
        <div className="absolute -bottom-8 right-24 w-20 h-20 rounded-full bg-violet/8" />
        <div className="absolute top-20 -left-10 w-24 h-24 rounded-full bg-watermelon/6" />

        <div className="relative z-10 max-w-[1100px] mx-auto px-6 pt-8 pb-16">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-abricot flex items-center justify-center text-navy font-serif font-black text-lg">
                E
              </div>
              <span className="font-serif text-xl font-bold text-white">Elevate</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <ElevateButton variant="ghost" size="sm" className="text-white hover:bg-navy-mid border-transparent">Sign In</ElevateButton>
              </Link>
              <Link href="/signup">
                <ElevateButton variant="secondary" size="sm">Get Started</ElevateButton>
              </Link>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="max-w-[600px]">
            <div className="inline-block px-3 py-1 rounded-md bg-abricot/15 text-abricot font-sans text-[11px] font-semibold tracking-wider uppercase mb-4">
              Personalized Language Learning
            </div>
            <h1 className="font-serif text-[44px] font-black text-white leading-tight mb-4 text-balance">
              Elevate Your Language Skills
            </h1>
            <p className="font-sans text-base text-gray-mid leading-relaxed mb-8 max-w-[480px]">
              From A1 to C2 — personalized lessons, adaptive exercises, and real-time progress tracking for students and teachers.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/signup">
                <ElevateButton variant="secondary" size="lg" iconRight icon={<Icons.ArrowRight />}>Start Learning Free</ElevateButton>
              </Link>
              <Link href="/teacher">
                <ElevateButton variant="outline" size="lg" className="border-white/30 text-white hover:bg-navy-mid">Teacher Dashboard</ElevateButton>
              </Link>
            </div>
          </div>

          {/* Level Badges */}
          <div className="flex gap-2.5 mt-12 flex-wrap">
            {levels.map((l) => (
              <div key={l.level} className="flex flex-col items-center gap-1.5">
                <LevelBadge level={l.level} colorClass={l.color} active />
                <span className="font-sans text-[10px] text-gray-mid">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="max-w-[1100px] mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="font-sans text-[11px] font-medium tracking-wider uppercase text-text-light mb-1.5">Platform</div>
          <h2 className="font-serif text-[28px] font-bold text-navy text-balance">Everything You Need to Succeed</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <div key={i} className="bg-card rounded-2xl border border-gray-mid p-6 flex flex-col gap-3.5">
              <div className="w-12 h-12 rounded-[14px] bg-navy/8 text-navy flex items-center justify-center">
                {f.icon}
              </div>
              <h3 className="font-serif text-base font-bold text-navy">{f.title}</h3>
              <p className="font-sans text-[13px] text-text-mid leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Preview Stats Section */}
      <section className="bg-navy">
        <div className="max-w-[1100px] mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="font-serif text-[28px] font-bold text-white mb-2 text-balance">Track Every Skill</h2>
            <p className="font-sans text-sm text-gray-mid">Detailed breakdowns across reading, grammar, listening, speaking, and writing.</p>
          </div>
          <div className="max-w-[500px] mx-auto bg-card rounded-2xl p-6 flex flex-col gap-4">
            <ProgressBar value={85} label="Reading" sublabel="85%" color="bg-violet" />
            <ProgressBar value={72} label="Grammar" sublabel="72%" color="bg-abricot" />
            <ProgressBar value={58} label="Listening" sublabel="58%" color="bg-navy" />
            <ProgressBar value={34} label="Speaking" sublabel="34%" color="bg-watermelon" />
            <ProgressBar value={48} label="Writing" sublabel="48%" color="bg-violet-light" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1100px] mx-auto px-6 py-16 text-center">
        <h2 className="font-serif text-[28px] font-bold text-navy mb-3 text-balance">Ready to Elevate?</h2>
        <p className="font-sans text-sm text-text-mid mb-6 max-w-[400px] mx-auto">
          Join thousands of students and teachers already using Elevate to master language learning.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/signup">
            <ElevateButton variant="primary" size="lg" iconRight icon={<Icons.ArrowRight />}>Create Free Account</ElevateButton>
          </Link>
          <Link href="/student">
            <ElevateButton variant="outline" size="lg">Explore Student View</ElevateButton>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-mid">
        <div className="max-w-[1100px] mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[7px] bg-abricot flex items-center justify-center text-navy font-serif font-black text-sm">
              E
            </div>
            <span className="font-serif text-[15px] font-bold text-navy">Elevate</span>
          </div>
          <span className="font-sans text-xs text-text-light">
            Personalized Language Learning &middot; A1 to C2
          </span>
        </div>
      </footer>
    </div>
  )
}

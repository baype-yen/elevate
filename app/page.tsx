"use client"

import Link from "next/link"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, LevelBadge, ProgressBar } from "@/components/elevate/shared"

const features = [
  {
    icon: <Icons.Target />,
    title: "Apprentissage adaptatif",
    desc: "Des leçons qui s'adaptent à votre niveau CECRL de A1 à C2, avec des exercices personnalisés.",
  },
  {
    icon: <Icons.BarChart />,
    title: "Suivre la progression",
    desc: "Un détail précis des compétences, l'évolution des scores et les retours des enseignants en temps réel.",
  },
  {
    icon: <Icons.Users />,
    title: "Gestion des classes",
    desc: "Les enseignants peuvent gérer leurs classes, corriger les travaux élèves et suivre l'activité d'un coup d'œil.",
  },
  {
    icon: <Icons.Trophy />,
    title: "Obtenir des récompenses",
    desc: "Restez motivé avec des badges, des séries et des XP au fil de votre pratique.",
  },
]

const levels = [
  { level: "A1", label: "Débutant", color: "violet" },
  { level: "A2", label: "Élémentaire", color: "violet" },
  { level: "B1", label: "Intermédiaire", color: "abricot" },
  { level: "B2", label: "Intermédiaire +", color: "abricot" },
  { level: "C1", label: "Avancé", color: "watermelon" },
  { level: "C2", label: "Maîtrise", color: "navy" },
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
                <ElevateButton variant="ghost" size="sm" className="text-white hover:bg-navy-mid border-transparent">Connexion</ElevateButton>
              </Link>
              <Link href="/student-login">
                <ElevateButton variant="secondary" size="sm">Accès élève</ElevateButton>
              </Link>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="max-w-[600px]">
            <div className="inline-block px-3 py-1 rounded-md bg-abricot/15 text-abricot font-sans text-[11px] font-semibold tracking-wider uppercase mb-4">
              Apprentissage des langues personnalisé
            </div>
            <h1 className="font-serif text-[44px] font-black text-white leading-tight mb-4 text-balance">
              Élevez votre niveau en langues
            </h1>
            <p className="font-sans text-base text-gray-mid leading-relaxed mb-8 max-w-[480px]">
              De A1 à C2 — des leçons personnalisées, des exercices adaptatifs et un suivi en temps réel pour les élèves et les enseignants.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/student-login">
                <ElevateButton variant="secondary" size="lg" iconRight icon={<Icons.ArrowRight />}>Accéder à votre compte</ElevateButton>
              </Link>
              <Link href="/teacher">
                <ElevateButton variant="outline" size="lg" className="border-white/30 text-white hover:bg-navy-mid">Tableau de bord enseignant</ElevateButton>
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
          <div className="font-sans text-[11px] font-medium tracking-wider uppercase text-text-light mb-1.5">Plateforme</div>
          <h2 className="font-serif text-[28px] font-bold text-navy text-balance">Tout ce qu'il vous faut pour réussir</h2>
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
            <h2 className="font-serif text-[28px] font-bold text-white mb-2 text-balance">Suivez chaque compétence</h2>
            <p className="font-sans text-sm text-gray-mid">Détails précis en lecture, grammaire, écoute, oral et écrit.</p>
          </div>
          <div className="max-w-[500px] mx-auto bg-card rounded-2xl p-6 flex flex-col gap-4">
            <ProgressBar value={85} label="Lecture" sublabel="85%" color="bg-violet" />
            <ProgressBar value={72} label="Grammaire" sublabel="72%" color="bg-abricot" />
            <ProgressBar value={58} label="Écoute" sublabel="58%" color="bg-navy" />
            <ProgressBar value={34} label="Oral" sublabel="34%" color="bg-watermelon" />
            <ProgressBar value={48} label="Écrit" sublabel="48%" color="bg-violet-light" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1100px] mx-auto px-6 py-16 text-center">
        <h2 className="font-serif text-[28px] font-bold text-navy mb-3 text-balance">Prêt à progresser avec Elevate ?</h2>
        <p className="font-sans text-sm text-text-mid mb-6 max-w-[400px] mx-auto">
          Rejoignez des milliers d'élèves et d'enseignants qui utilisent déjà Elevate pour progresser en langues.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/student-login">
            <ElevateButton variant="primary" size="lg" iconRight icon={<Icons.ArrowRight />}>Aller à la connexion</ElevateButton>
          </Link>
          <Link href="/student">
            <ElevateButton variant="outline" size="lg">Voir l'espace élève</ElevateButton>
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
            Apprentissage des langues personnalisé &middot; A1 à C2
          </span>
        </div>
      </footer>
    </div>
  )
}

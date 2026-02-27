"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ElevateButton, InputField } from "@/components/elevate/shared"
import { Icons } from "@/components/elevate/icons"
import { createClient } from "@/lib/supabase/client"

function getSafeStudentNextPath() {
  if (typeof window === "undefined") return null

  const nextPath = new URLSearchParams(window.location.search).get("next")
  if (!nextPath) return null
  if (!nextPath.startsWith("/student")) return null
  if (nextPath.startsWith("//")) return null

  return nextPath
}

export default function StudentLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedPassword = password.trim()

    if (!normalizedEmail || !trimmedPassword) {
      setError("Renseignez votre e-mail et votre mot de passe.")
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: trimmedPassword,
    })

    if (signInError) {
      setError("Identifiants invalides. Vérifiez l'e-mail et le mot de passe fournis.")
      setLoading(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError("Impossible de charger votre session de compte.")
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("default_role")
      .eq("id", user.id)
      .single()

    if (profile?.default_role === "teacher") {
      router.push("/teacher")
      return
    }

    router.push(getSafeStudentNextPath() || "/student")
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-card rounded-[20px] border border-gray-mid overflow-hidden shadow-lg">
        <div className="bg-navy px-7 pt-9 pb-7 text-center relative overflow-hidden">
          <div className="absolute -top-[30px] -left-5 w-[100px] h-[100px] rounded-full bg-violet/10" />
          <div className="absolute -bottom-5 -right-2.5 w-20 h-20 rounded-full bg-abricot/8" />
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-[14px] bg-abricot inline-flex items-center justify-center text-navy font-serif font-black text-[22px] mb-3">
              E
            </div>
            <h1 className="font-serif text-[22px] font-bold text-white mb-1">Espace élève</h1>
            <p className="text-[13px] text-gray-mid">
              Connectez-vous avec les identifiants fournis par votre enseignant.
            </p>
          </div>
        </div>

        <form className="px-7 pt-6 pb-7 flex flex-col gap-3.5" onSubmit={onSignIn}>
          <InputField
            label="E-mail"
            placeholder="prenom.nom@ecole.fr"
            icon={<Icons.Mail />}
            type="email"
            value={email}
            onChange={setEmail}
          />
          <InputField
            label="Mot de passe temporaire"
            placeholder="Entrez votre mot de passe"
            icon={<Icons.Lock />}
            type="password"
            value={password}
            onChange={setPassword}
          />

          <div className="mt-1">
            <ElevateButton
              type="submit"
              variant="primary"
              fullWidth
              iconRight
              icon={<Icons.ArrowRight />}
              disabled={loading}
            >
              Se connecter
            </ElevateButton>
          </div>

          {error && <p className="text-[13px] text-watermelon text-center -mt-1">{error}</p>}

          <p className="text-center text-[13px] text-text-light">
            Si vous n'avez pas vos identifiants, contactez votre enseignant.
          </p>
        </form>
      </div>
    </div>
  )
}

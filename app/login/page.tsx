"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { ElevateButton, InputField } from "@/components/elevate/shared"
import { Icons } from "@/components/elevate/icons"
import { auth, db } from "@/lib/firebase/client"

function getSafeTeacherNextPath() {
  if (typeof window === "undefined") return null

  const nextPath = new URLSearchParams(window.location.search).get("next")
  if (!nextPath) return null
  if (!nextPath.startsWith("/teacher")) return null
  if (nextPath.startsWith("//")) return null

  return nextPath
}

export default function LoginPage() {
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

    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, trimmedPassword)
      const user = credential.user

      const profileSnap = await getDoc(doc(db, "profiles", user.uid))
      const role = profileSnap.exists() ? profileSnap.data()?.default_role || "student" : "student"

      if (role !== "teacher") {
        document.cookie = "__session=; path=/; max-age=0; SameSite=Lax"
        try {
          await signOut(auth)
        } catch {
          // Ignore sign-out errors when blocking non-teacher access
        }
        setError("Cet espace est réservé aux enseignants. Utilisez la connexion élève.")
        setLoading(false)
        return
      }

      const idToken = await user.getIdToken()
      document.cookie = `__session=${idToken}; path=/; max-age=${60 * 60 * 24 * 14}; SameSite=Lax`
      router.push(getSafeTeacherNextPath() || "/teacher")
    } catch {
      setError("Identifiants invalides. Vérifiez l'e-mail et le mot de passe saisis.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-card rounded-[20px] border border-gray-mid overflow-hidden shadow-lg">
        <div className="bg-navy px-7 pt-9 pb-7 text-center relative overflow-hidden">
          <div className="absolute -top-[30px] -left-5 w-[100px] h-[100px] rounded-full bg-violet/10" />
          <div className="absolute -bottom-5 -right-2.5 w-20 h-20 rounded-full bg-abricot/8" />
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-[14px] bg-abricot inline-flex items-center justify-center text-navy font-serif font-black text-[22px] mb-3">
              E
            </div>
            <h1 className="font-serif text-[22px] font-bold text-white mb-1">Espace enseignant</h1>
            <p className="text-[13px] text-gray-mid">Connexion enseignants et administrateurs d'établissement</p>
          </div>
        </div>

        <form className="px-7 pt-6 pb-7 flex flex-col gap-3.5" onSubmit={onSignIn}>
          <InputField
            label="E-mail"
            placeholder="nom@ecole.fr"
            icon={<Icons.Mail />}
            type="email"
            value={email}
            onChange={setEmail}
          />
          <InputField
            label="Mot de passe"
            placeholder="Entrez votre mot de passe"
            icon={<Icons.Lock />}
            type="password"
            value={password}
            onChange={setPassword}
          />

          <div className="mt-1">
            <ElevateButton type="submit" variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />} disabled={loading}>
              Se connecter
            </ElevateButton>
          </div>

          {error && <p className="text-[13px] text-watermelon text-center -mt-1">{error}</p>}

          <p className="text-center text-[13px] text-text-light">
            Élève ?
            {" "}
            <Link href="/student-login" className="text-violet font-semibold hover:underline">
              Aller à la connexion élève
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

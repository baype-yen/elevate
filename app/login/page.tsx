"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ElevateButton, InputField } from "@/components/elevate/shared"
import { Icons } from "@/components/elevate/icons"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSignIn = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError("Could not load your account session.")
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("default_role")
      .eq("id", user.id)
      .single()

    const role = profile?.default_role || "student"
    router.push(role === "teacher" ? "/teacher" : "/student")
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-card rounded-[20px] border border-gray-mid overflow-hidden shadow-lg">
        {/* Header */}
        <div className="bg-navy px-7 pt-9 pb-7 text-center relative overflow-hidden">
          <div className="absolute -top-[30px] -left-5 w-[100px] h-[100px] rounded-full bg-violet/10" />
          <div className="absolute -bottom-5 -right-2.5 w-20 h-20 rounded-full bg-abricot/8" />
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-[14px] bg-abricot inline-flex items-center justify-center text-navy font-serif font-black text-[22px] mb-3">
              E
            </div>
            <h1 className="font-serif text-[22px] font-bold text-white mb-1">Welcome back</h1>
            <p className="text-[13px] text-gray-mid">Sign in with your school-provided account</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-7 pt-6 pb-7 flex flex-col gap-3.5">
          <InputField label="Email" placeholder="name@school.edu" icon={<Icons.Mail />} type="email" value={email} onChange={setEmail} />
          <InputField label="Password" placeholder="Enter your password" icon={<Icons.Lock />} type="password" value={password} onChange={setPassword} />

          <div className="flex justify-between items-center -mt-1">
            <label className="flex items-center gap-1.5 font-sans text-[13px] text-text-mid cursor-pointer">
              <div className="w-[18px] h-[18px] rounded border-2 border-gray-mid bg-card" />
              Remember me
            </label>
            <span className="font-sans text-[13px] text-violet font-semibold cursor-pointer hover:underline">Forgot password?</span>
          </div>

          <div className="mt-1">
            <ElevateButton variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />} onClick={onSignIn} disabled={loading}>
              Sign In
            </ElevateButton>
          </div>

          {error && (
            <p className="text-[13px] text-watermelon text-center -mt-1">{error}</p>
          )}

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-gray-mid" />
            <span className="text-xs text-text-light">or</span>
            <div className="flex-1 h-px bg-gray-mid" />
          </div>

          <ElevateButton variant="outline" fullWidth>Continue with School SSO</ElevateButton>

          <p className="text-center text-[13px] text-text-light">
            Account access is provided by your teacher or school administrator.
          </p>
        </div>
      </div>
    </div>
  )
}

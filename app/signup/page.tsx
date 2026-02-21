"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ElevateLogo, ElevateButton, InputField, BadgeChooser } from "@/components/elevate/shared"
import { Icons } from "@/components/elevate/icons"

export default function SignUpPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | string[]>("student")

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] bg-card rounded-[20px] border border-gray-mid overflow-hidden shadow-lg">
        <div className="px-7 pt-7">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-abricot flex items-center justify-center text-navy font-serif font-black text-base">
              E
            </div>
            <span className="font-serif text-[17px] font-bold text-navy">Elevate</span>
          </div>
          <h1 className="font-serif text-2xl font-bold text-navy mb-1">Create your account</h1>
          <p className="text-sm text-text-mid mb-5">Start your personalized learning journey</p>
        </div>

        <div className="px-7 pb-7 flex flex-col gap-3.5">
          <InputField label="Full Name" placeholder="Enter your full name" icon={<Icons.User />} />
          <InputField label="Email" placeholder="name@school.edu" icon={<Icons.Mail />} type="email" />
          <InputField label="Password" placeholder="Create a password" icon={<Icons.Lock />} type="password" helper="At least 8 characters" />

          <div className="mt-1">
            <div className="text-[13px] font-semibold text-navy mb-2">I am a...</div>
            <BadgeChooser
              selected={role}
              onSelect={setRole}
              options={[
                { value: "student", label: "Student" },
                { value: "teacher", label: "Teacher" },
                { value: "self", label: "Self-learner" },
              ]}
            />
          </div>

          <div className="mt-1">
            <ElevateButton variant="primary" fullWidth iconRight icon={<Icons.ArrowRight />} onClick={() => {
              if (role === "teacher") router.push("/teacher")
              else router.push("/student")
            }}>
              Create Account
            </ElevateButton>
          </div>

          <p className="text-center text-[13px] text-text-light">
            Already have an account?{" "}
            <Link href="/login" className="text-navy font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

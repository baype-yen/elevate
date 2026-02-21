"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherStudentsData } from "@/lib/supabase/client-data"

const avatarColors = ["bg-abricot", "bg-violet", "bg-watermelon", "bg-navy"]

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

export default function StudentsPage() {
  const { context, loading } = useAppContext()
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [data, setData] = useState<{ className: string; students: any[]; classes: Array<{ id: string; name: string }> } | null>(null)
  const [enrollClassId, setEnrollClassId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [studentEmail, setStudentEmail] = useState("")
  const [studentPassword, setStudentPassword] = useState("")
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null)

  const loadStudents = async () => {
    if (!context) return
    const supabase = createClient()
    const nextData = await fetchTeacherStudentsData(
      supabase,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    )
    setData(nextData)
  }

  useEffect(() => {
    loadStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId, selectedClass])

  useEffect(() => {
    if (!data?.classes.length) {
      setEnrollClassId("")
      return
    }

    const classStillVisible = data.classes.some((classItem) => classItem.id === enrollClassId)
    if (!classStillVisible) {
      setEnrollClassId(data.classes[0].id)
    }
  }, [data?.classes, enrollClassId])

  const onProvisionStudent = async () => {
    if (!enrollClassId) {
      setEnrollError("Select a class before creating student access.")
      return
    }

    if (!studentName.trim() || !studentEmail.trim() || !studentPassword.trim()) {
      setEnrollError("Full name, email, and password are required.")
      return
    }

    try {
      setEnrollBusy(true)
      setEnrollError(null)
      setEnrollSuccess(null)

      const response = await fetch("/api/teacher/enroll-student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: studentName,
          email: studentEmail,
          password: studentPassword,
          classId: enrollClassId,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string; email?: string }

      if (!response.ok) {
        throw new Error(payload.error || "Could not provision student access.")
      }

      setEnrollSuccess(`Access created for ${payload.email || studentEmail.trim().toLowerCase()}. Share the credentials with the student.`)
      setStudentName("")
      setStudentEmail("")
      setStudentPassword("")
      await loadStudents()
    } catch (e: any) {
      setEnrollError(e.message || "Could not provision student access.")
    } finally {
      setEnrollBusy(false)
    }
  }

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Loading students...</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="font-serif text-lg font-bold text-navy">Student Profiles — {data.className}</h4>
        <BadgeChooser
          selected={selectedClass}
          onSelect={setSelectedClass}
          options={[
            { value: "all", label: "All classes" },
            ...data.classes.map((classItem) => ({ value: classItem.id, label: classItem.name })),
          ]}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_2fr] gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3.5">
          <h5 className="font-serif text-base font-bold text-navy">Provision Student Access</h5>
          <p className="font-sans text-[13px] text-text-mid">
            Create login credentials and enroll the student directly in one class.
          </p>

          <InputField
            label="Full Name"
            placeholder="e.g. Marie Dupont"
            icon={<Icons.User />}
            value={studentName}
            onChange={setStudentName}
          />
          <InputField
            label="Email"
            placeholder="student@school.edu"
            icon={<Icons.Mail />}
            type="email"
            value={studentEmail}
            onChange={setStudentEmail}
          />
          <InputField
            label="Temporary Password"
            placeholder="At least 8 characters"
            icon={<Icons.Lock />}
            type="password"
            helper="Share this password with the student."
            value={studentPassword}
            onChange={setStudentPassword}
          />

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Assign to class</div>
            {data.classes.length ? (
              <BadgeChooser
                selected={enrollClassId}
                onSelect={(value) => setEnrollClassId(Array.isArray(value) ? value[0] || "" : value)}
                options={data.classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
              />
            ) : (
              <div className="font-sans text-sm text-text-mid">Create a class before provisioning student accounts.</div>
            )}
          </div>

          <ElevateButton
            variant="primary"
            icon={<Icons.Plus />}
            onClick={onProvisionStudent}
            disabled={enrollBusy || !data.classes.length}
          >
            Create Access
          </ElevateButton>

          {enrollError && <p className="font-sans text-sm text-watermelon">{enrollError}</p>}
          {enrollSuccess && <p className="font-sans text-sm text-violet">{enrollSuccess}</p>}
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3 bg-gray-light font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
            <span>Student</span>
            <span>Level</span>
            <span>Score</span>
            <span>Last Active</span>
            <span>Actions</span>
          </div>
          {data.students.map((s, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3.5 items-center border-t border-gray-light gap-2 md:gap-0">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center font-sans font-bold text-xs text-white shrink-0",
                  avatarColors[i % 4],
                )}>
                  {s.initials}
                </div>
                <div className="font-sans text-sm font-semibold text-text-dark">{s.name}</div>
              </div>
              <div>
                <LevelBadge level={s.level} colorClass={levelColorClass(s.level)} />
              </div>
              <div className="font-serif text-base font-bold text-navy">{s.score}%</div>
              <div className="font-sans text-[13px] text-text-light">{s.lastActive}</div>
              <div className="flex gap-1.5">
                <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                  <Icons.Eye />
                </button>
                <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                  <Icons.BarChart />
                </button>
              </div>
            </div>
          ))}
          {!data.students.length && (
            <div className="px-5 py-6 font-sans text-sm text-text-mid">No enrolled students found.</div>
          )}
        </div>
      </div>
    </div>
  )
}

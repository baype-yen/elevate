import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"

type EnrollStudentPayload = {
  fullName?: string
  email?: string
  password?: string
  classId?: string
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  let payload: EnrollStudentPayload

  try {
    payload = (await request.json()) as EnrollStudentPayload
  } catch {
    return badRequest("Invalid request payload.")
  }

  const fullName = (payload.fullName || "").trim()
  const email = (payload.email || "").trim().toLowerCase()
  const password = (payload.password || "").trim()
  const classId = (payload.classId || "").trim()

  if (!fullName || !email || !password || !classId) {
    return badRequest("Full name, email, password, and class are required.")
  }

  if (!email.includes("@")) {
    return badRequest("Please enter a valid email address.")
  }

  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters.")
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, school_id, name, archived_at")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .single()

  if (classError || !classRow) {
    return NextResponse.json({ error: "Class not found or access denied." }, { status: 403 })
  }

  if (classRow.archived_at) {
    return badRequest("Cannot enroll students into an archived class.")
  }

  if (!classRow.school_id) {
    return badRequest("Class must belong to an active school.")
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin client is not configured."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const { data: createdUserData, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "student",
    },
  })

  if (createUserError || !createdUserData.user) {
    const lowered = createUserError?.message?.toLowerCase() || ""
    const message =
      lowered.includes("already") || lowered.includes("exists")
        ? "An account with this email already exists."
        : createUserError?.message || "Could not create student account."

    return NextResponse.json({ error: message }, { status: 400 })
  }

  const studentId = createdUserData.user.id
  const nowIso = new Date().toISOString()

  const rollbackUser = async () => {
    await admin.auth.admin.deleteUser(studentId)
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: studentId,
        full_name: fullName,
        default_role: "student",
        active_school_id: classRow.school_id,
      },
      { onConflict: "id" },
    )

  if (profileError) {
    await rollbackUser()
    return NextResponse.json({ error: "Student profile setup failed." }, { status: 500 })
  }

  const { error: membershipError } = await admin
    .from("school_memberships")
    .upsert(
      {
        school_id: classRow.school_id,
        user_id: studentId,
        role: "student",
        status: "active",
        invited_by: user.id,
        invited_at: nowIso,
        joined_at: nowIso,
      },
      { onConflict: "school_id,user_id" },
    )

  if (membershipError) {
    await rollbackUser()
    return NextResponse.json({ error: "Student membership setup failed." }, { status: 500 })
  }

  const { error: enrollmentError } = await supabase
    .from("class_enrollments")
    .upsert(
      {
        class_id: classId,
        student_id: studentId,
        status: "active",
        left_at: null,
      },
      { onConflict: "class_id,student_id" },
    )

  if (enrollmentError) {
    await rollbackUser()
    return NextResponse.json({ error: "Student enrollment failed." }, { status: 500 })
  }

  await supabase.from("activity_events").insert({
    school_id: classRow.school_id,
    class_id: classId,
    actor_id: user.id,
    target_user_id: studentId,
    event_type: "milestone",
    payload: {
      text: `${fullName} was enrolled with direct login access.`,
    },
  })

  return NextResponse.json({
    studentId,
    email,
    className: classRow.name,
  })
}

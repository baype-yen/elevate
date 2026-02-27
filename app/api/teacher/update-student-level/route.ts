import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"

type UpdateStudentLevelPayload = {
  classId?: string
  studentId?: string
  cefrLevel?: string
}

const allowedLevels = new Set(["a1", "a2", "b1", "b2", "c1", "c2"])

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  let payload: UpdateStudentLevelPayload

  try {
    payload = (await request.json()) as UpdateStudentLevelPayload
  } catch {
    return badRequest("Charge utile de requête invalide.")
  }

  const classId = (payload.classId || "").trim()
  const studentId = (payload.studentId || "").trim()
  const cefrLevel = (payload.cefrLevel || "").trim().toLowerCase()

  if (!classId || !studentId || !cefrLevel) {
    return badRequest("La classe, l'élève et le niveau sont obligatoires.")
  }

  if (!allowedLevels.has(cefrLevel)) {
    return badRequest("Niveau CECRL invalide.")
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, school_id, archived_at")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .single()

  if (classError || !classRow) {
    return NextResponse.json({ error: "Classe introuvable ou accès refusé." }, { status: 403 })
  }

  const { data: enrollmentRow, error: enrollmentError } = await supabase
    .from("class_enrollments")
    .select("id")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle()

  if (enrollmentError || !enrollmentRow) {
    return badRequest("Cet élève n'est pas inscrit activement dans cette classe.")
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le client admin Supabase n'est pas configuré."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ cefr_level: cefrLevel as "a1" | "a2" | "b1" | "b2" | "c1" | "c2" })
    .eq("id", studentId)

  if (profileError) {
    return NextResponse.json({ error: "La mise à jour du niveau élève a échoué." }, { status: 500 })
  }

  if (classRow.school_id) {
    await supabase.from("activity_events").insert({
      school_id: classRow.school_id,
      class_id: classId,
      actor_id: user.id,
      target_user_id: studentId,
      event_type: "milestone",
      payload: {
        text: `Niveau CECRL mis à jour vers ${cefrLevel.toUpperCase()}.`,
      },
    })
  }

  return NextResponse.json({
    studentId,
    classId,
    cefrLevel: cefrLevel.toUpperCase(),
  })
}

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

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const target = email.toLowerCase()
  const perPage = 200

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return { user: null, error }
    }

    const match = (data?.users || []).find((candidate) => (candidate.email || "").toLowerCase() === target)
    if (match) {
      return { user: match, error: null }
    }

    if (!data?.users?.length || data.users.length < perPage) {
      break
    }
  }

  return { user: null, error: null }
}

export async function POST(request: Request) {
  let payload: EnrollStudentPayload

  try {
    payload = (await request.json()) as EnrollStudentPayload
  } catch {
    return badRequest("Charge utile de requête invalide.")
  }

  const fullName = (payload.fullName || "").trim()
  const email = (payload.email || "").trim().toLowerCase()
  const password = (payload.password || "").trim()
  const classId = (payload.classId || "").trim()

  if (!fullName || !email || !password || !classId) {
    return badRequest("Le nom complet, l'e-mail, le mot de passe et la classe sont obligatoires.")
  }

  if (!email.includes("@")) {
    return badRequest("Veuillez saisir une adresse e-mail valide.")
  }

  if (password.length < 8) {
    return badRequest("Le mot de passe doit contenir au moins 8 caractères.")
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
    .select("id, school_id, name, archived_at")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .single()

  if (classError || !classRow) {
    return NextResponse.json({ error: "Classe introuvable ou accès refusé." }, { status: 403 })
  }

  if (classRow.archived_at) {
    return badRequest("Impossible d'inscrire des élèves dans une classe archivée.")
  }

  if (!classRow.school_id) {
    return badRequest("La classe doit appartenir à un établissement actif.")
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le client admin Supabase n'est pas configuré."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  let studentId = ""
  let accountMode: "created" | "updated" = "created"

  const { data: createdUserData, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "student",
    },
  })

  if (!createUserError && createdUserData.user) {
    studentId = createdUserData.user.id
    accountMode = "created"
  } else {
    const lowered = createUserError?.message?.toLowerCase() || ""
    const isAlreadyExists = lowered.includes("already") || lowered.includes("exists") || lowered.includes("registered")

    if (!isAlreadyExists) {
      return NextResponse.json({ error: createUserError?.message || "Impossible de créer le compte élève." }, { status: 400 })
    }

    const { user: existingAuthUser, error: existingUserError } = await findAuthUserByEmail(admin, email)

    if (existingUserError || !existingAuthUser) {
      return NextResponse.json(
        { error: "Un compte avec cet e-mail existe déjà, mais nous n'avons pas pu le mettre à jour." },
        { status: 400 },
      )
    }

    studentId = existingAuthUser.id
    accountMode = "updated"

    const { error: updateUserError } = await admin.auth.admin.updateUserById(studentId, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "student",
      },
    })

    if (updateUserError) {
      return NextResponse.json(
        { error: "Compte existant détecté, mais la mise à jour du mot de passe a échoué." },
        { status: 400 },
      )
    }
  }

  const nowIso = new Date().toISOString()

  const rollbackCreatedUser = async () => {
    if (accountMode === "created" && studentId) {
      await admin.auth.admin.deleteUser(studentId)
    }
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("default_role")
    .eq("id", studentId)
    .maybeSingle()

  if (existingProfile?.default_role === "teacher") {
    await rollbackCreatedUser()
    return NextResponse.json({ error: "Cet e-mail est déjà utilisé par un compte enseignant." }, { status: 400 })
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
    await rollbackCreatedUser()
    return NextResponse.json({ error: "La configuration du profil élève a échoué." }, { status: 500 })
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
    await rollbackCreatedUser()
    return NextResponse.json({ error: "La configuration de l'adhésion élève a échoué." }, { status: 500 })
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
    await rollbackCreatedUser()
    return NextResponse.json({ error: "L'inscription de l'élève a échoué." }, { status: 500 })
  }

  await supabase.from("activity_events").insert({
    school_id: classRow.school_id,
    class_id: classId,
    actor_id: user.id,
    target_user_id: studentId,
    event_type: "milestone",
    payload: {
      text: `${fullName} a été inscrit avec un accès direct au compte.`,
    },
  })

  return NextResponse.json({
    studentId,
    email,
    className: classRow.name,
    accountMode,
  })
}

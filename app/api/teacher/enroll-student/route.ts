import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { FieldValue } from "firebase-admin/firestore"

type EnrollStudentPayload = {
  fullName?: string
  email?: string
  password?: string
  classId?: string
}

const allowedLevels = new Set(["a1", "a2", "b1", "b2", "c1", "c2"])

function normalizeLevel(level: string | null | undefined) {
  const normalized = (level || "b1").trim().toLowerCase()
  return allowedLevels.has(normalized) ? normalized : "b1"
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function getCallerUid(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7))
    return decoded.uid
  } catch {
    return null
  }
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

  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  const classSnap = await adminDb.collection("classes").doc(classId).get()
  const classRow = classSnap.exists ? { id: classSnap.id, ...classSnap.data() } as any : null

  if (!classRow || classRow.teacher_id !== callerUid) {
    return NextResponse.json({ error: "Classe introuvable ou accès refusé." }, { status: 403 })
  }

  if (classRow.archived_at) {
    return badRequest("Impossible d'inscrire des élèves dans une classe archivée.")
  }

  if (!classRow.school_id) {
    return badRequest("La classe doit appartenir à un établissement actif.")
  }

  let studentId = ""
  let accountMode: "created" | "updated" = "created"

  try {
    const createdUser = await adminAuth.createUser({
      email,
      password,
      emailVerified: true,
      displayName: fullName,
    })
    studentId = createdUser.uid
    accountMode = "created"

    await adminAuth.setCustomUserClaims(studentId, {
      role: "student",
      activeSchoolId: classRow.school_id,
    })
  } catch (createError: any) {
    const code = createError?.code || ""
    if (code !== "auth/email-already-exists") {
      return NextResponse.json({ error: createError?.message || "Impossible de créer le compte élève." }, { status: 400 })
    }

    try {
      const existingUser = await adminAuth.getUserByEmail(email)
      studentId = existingUser.uid
      accountMode = "updated"

      await adminAuth.updateUser(studentId, {
        password,
        emailVerified: true,
        displayName: fullName,
      })

      await adminAuth.setCustomUserClaims(studentId, {
        role: "student",
        activeSchoolId: classRow.school_id,
      })
    } catch {
      return NextResponse.json(
        { error: "Un compte avec cet e-mail existe déjà, mais nous n'avons pas pu le mettre à jour." },
        { status: 400 },
      )
    }
  }

  const rollbackCreatedUser = async () => {
    if (accountMode === "created" && studentId) {
      await adminAuth.deleteUser(studentId)
    }
  }

  const profileSnap = await adminDb.collection("profiles").doc(studentId).get()
  if (profileSnap.exists && profileSnap.data()?.default_role === "teacher") {
    await rollbackCreatedUser()
    return NextResponse.json({ error: "Cet e-mail est déjà utilisé par un compte enseignant." }, { status: 400 })
  }

  try {
    await adminDb.collection("profiles").doc(studentId).set(
      {
        full_name: fullName,
        default_role: "student",
        active_school_id: classRow.school_id,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  } catch {
    await rollbackCreatedUser()
    return NextResponse.json({ error: "La configuration du profil élève a échoué." }, { status: 500 })
  }

  const membershipId = `${classRow.school_id}_${studentId}`
  try {
    await adminDb.collection("school_memberships").doc(membershipId).set(
      {
        school_id: classRow.school_id,
        user_id: studentId,
        role: "student",
        status: "active",
        invited_by: callerUid,
        invited_at: FieldValue.serverTimestamp(),
        joined_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  } catch {
    await rollbackCreatedUser()
    return NextResponse.json({ error: "La configuration de l'adhésion élève a échoué." }, { status: 500 })
  }

  const existingEnrollment = await adminDb.collection("class_enrollments")
    .where("class_id", "==", classId)
    .where("student_id", "==", studentId)
    .limit(1)
    .get()

  const classLevel = normalizeLevel(classRow.cefr_level)
  const existingEnrollmentData = existingEnrollment.empty ? null : existingEnrollment.docs[0].data()
  const enrollmentLevel = normalizeLevel(existingEnrollmentData?.cefr_level || classLevel)

  try {
    if (!existingEnrollment.empty) {
      await existingEnrollment.docs[0].ref.update({
        status: "active",
        cefr_level: enrollmentLevel,
        left_at: null,
        updated_at: FieldValue.serverTimestamp(),
      })
    } else {
      await adminDb.collection("class_enrollments").add({
        class_id: classId,
        student_id: studentId,
        status: "active",
        cefr_level: enrollmentLevel,
        left_at: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      })
    }
  } catch {
    await rollbackCreatedUser()
    return NextResponse.json({ error: "L'inscription de l'élève a échoué." }, { status: 500 })
  }

  await adminDb.collection("activity_events").add({
    school_id: classRow.school_id,
    class_id: classId,
    actor_id: callerUid,
    target_user_id: studentId,
    event_type: "milestone",
    payload: {
      text: `${fullName} a été inscrit avec un accès direct au compte.`,
    },
    created_at: FieldValue.serverTimestamp(),
  })

  return NextResponse.json({
    studentId,
    email,
    className: classRow.name,
    accountMode,
  })
}

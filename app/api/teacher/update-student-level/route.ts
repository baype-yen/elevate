import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { FieldValue } from "firebase-admin/firestore"

type UpdateStudentLevelPayload = {
  classId?: string
  studentId?: string
  cefrLevel?: string
}

const allowedLevels = new Set(["a1", "a2", "b1", "b2", "c1", "c2"])

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

  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  const classSnap = await adminDb.collection("classes").doc(classId).get()
  const classRow = classSnap.exists ? { id: classSnap.id, ...classSnap.data() } as any : null

  if (!classRow || classRow.teacher_id !== callerUid) {
    return NextResponse.json({ error: "Classe introuvable ou accès refusé." }, { status: 403 })
  }

  const enrollmentSnap = await adminDb.collection("class_enrollments")
    .where("class_id", "==", classId)
    .where("student_id", "==", studentId)
    .where("status", "==", "active")
    .limit(1)
    .get()

  if (enrollmentSnap.empty) {
    return badRequest("Cet élève n'est pas inscrit activement dans cette classe.")
  }

  await adminDb.collection("profiles").doc(studentId).update({
    cefr_level: cefrLevel,
    updated_at: FieldValue.serverTimestamp(),
  })

  if (classRow.school_id) {
    await adminDb.collection("activity_events").add({
      school_id: classRow.school_id,
      class_id: classId,
      actor_id: callerUid,
      target_user_id: studentId,
      event_type: "milestone",
      payload: {
        text: `Niveau CECRL mis à jour vers ${cefrLevel.toUpperCase()}.`,
      },
      created_at: FieldValue.serverTimestamp(),
    })
  }

  return NextResponse.json({
    studentId,
    classId,
    cefrLevel: cefrLevel.toUpperCase(),
  })
}

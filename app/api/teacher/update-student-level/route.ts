import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { FieldValue } from "firebase-admin/firestore"
import { verifyRequestBearerToken } from "@/lib/firebase/request-auth"

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

  const authResult = await verifyRequestBearerToken(request)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const callerUid = authResult.uid

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

  await enrollmentSnap.docs[0].ref.update({
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

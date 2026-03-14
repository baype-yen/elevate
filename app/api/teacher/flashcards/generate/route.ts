import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { generateFlashcards } from "@/lib/flashcards/gemini"

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
  // 1. Auth
  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  // 2. Verify teacher role
  const membershipSnap = await adminDb.collection("school_memberships")
    .where("user_id", "==", callerUid)
    .where("role", "in", ["teacher", "owner", "admin"])
    .limit(1)
    .get()

  if (membershipSnap.empty) {
    return NextResponse.json({ error: "Accès réservé aux enseignants." }, { status: 403 })
  }

  // 3. Parse body
  let body: { submission_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Charge utile invalide." }, { status: 400 })
  }

  const submissionId = (body.submission_id || "").trim()
  if (!submissionId) {
    return NextResponse.json({ error: "submission_id est obligatoire." }, { status: 400 })
  }

  // 4. Fetch submission
  const submissionSnap = await adminDb.collection("submissions").doc(submissionId).get()
  if (!submissionSnap.exists) {
    return NextResponse.json({ error: "Soumission introuvable." }, { status: 404 })
  }
  const submission = submissionSnap.data()!

  if (submission.status !== "graded") {
    return NextResponse.json({ error: "La soumission n'est pas encore corrigée." }, { status: 400 })
  }

  // 5. Verify teacher has access to the class
  if (submission.class_id) {
    const classSnap = await adminDb.collection("classes").doc(submission.class_id).get()
    const classData = classSnap.exists ? classSnap.data() : null
    if (!classData || classData.teacher_id !== callerUid) {
      return NextResponse.json({ error: "Accès refusé à cette classe." }, { status: 403 })
    }
  }

  // 6. Duplicate guard
  const existingSnap = await adminDb.collection("flashcards")
    .where("submission_id", "==", submissionId)
    .get()

  if (!existingSnap.empty) {
    const allCards = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ flashcards: allCards, count: allCards.length, existing: true })
  }

  // 7. Fetch assignment
  const assignmentSnap = await adminDb.collection("assignments").doc(submission.assignment_id).get()
  const assignment = assignmentSnap.exists ? assignmentSnap.data()! : {}

  // 8. Call Gemini
  let flashcardContents
  try {
    flashcardContents = await generateFlashcards({
      assignmentTitle: assignment.title || "",
      assignmentDescription: assignment.description || "",
      cefrLevel: assignment.cefr_level || "b1",
      studentText: submission.content?.text || "",
      teacherFeedback: submission.feedback || "",
      score: submission.score ?? 0,
    })
  } catch {
    return NextResponse.json(
      { error: "La génération a échoué, veuillez réessayer." },
      { status: 502 },
    )
  }

  // 9. Batch write to Firestore
  const batch = adminDb.batch()
  const now = new Date().toISOString()
  const createdCards: any[] = []

  for (const card of flashcardContents) {
    const docRef = adminDb.collection("flashcards").doc()
    const fullCard = {
      student_id: submission.student_id,
      submission_id: submissionId,
      assignment_id: submission.assignment_id,
      class_id: submission.class_id || null,
      school_id: submission.school_id || null,
      generated_by: callerUid,
      cefr_level: assignment.cefr_level || "b1",
      card_type: card.card_type,
      front: card.front,
      back: card.back,
      hint: card.hint,
      category: card.category,
      status: "learning",
      created_at: now,
      reviewed_at: null,
    }
    batch.set(docRef, fullCard)
    createdCards.push({ id: docRef.id, ...fullCard })
  }

  await batch.commit()

  return NextResponse.json({ flashcards: createdCards, count: createdCards.length })
}

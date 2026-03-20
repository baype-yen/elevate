import { NextResponse } from "next/server"
import { getStorage } from "firebase-admin/storage"
import { FieldValue } from "firebase-admin/firestore"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import {
  courseMaterialTypeLabel,
  courseTopicLabel,
  parseCourseMaterialType,
  parseCourseTopic,
} from "@/lib/course-content/config"
import { generateCourseExercisesFromDocument } from "@/lib/course-exercises/gemini"

type GenerateCourseExercisesPayload = {
  documentId?: string
}

const INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
])

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

function resolveBucketName() {
  const direct = (process.env.FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//, "")
  if (direct) return direct

  const publicBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//, "")
  if (publicBucket) return publicBucket

  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim()
  if (projectId) return `${projectId}.firebasestorage.app`

  return ""
}

function isInlineMimeType(mimeType: string) {
  if (INLINE_MIME_TYPES.has(mimeType)) return true
  return mimeType.startsWith("image/")
}

function isTextMimeType(mimeType: string) {
  return mimeType.startsWith("text/") || mimeType === "application/json"
}

function normalizeMimeType(rawMimeType: unknown, fileName: string) {
  const mimeType = typeof rawMimeType === "string" ? rawMimeType.trim().toLowerCase() : ""
  if (mimeType) return mimeType

  const extension = (fileName.split(".").pop() || "").toLowerCase()
  if (extension === "pdf") return "application/pdf"
  if (["txt", "md", "csv"].includes(extension)) return "text/plain"
  if (["png"].includes(extension)) return "image/png"
  if (["jpg", "jpeg"].includes(extension)) return "image/jpeg"
  return "application/octet-stream"
}

async function downloadDocumentBuffer(filePath: string) {
  const bucketName = resolveBucketName()
  if (!bucketName) throw new Error("Le bucket Firebase Storage n'est pas configuré.")

  const bucket = getStorage().bucket(bucketName)
  const [buffer] = await bucket.file(filePath).download()
  return buffer
}

function decodeTextContent(buffer: Buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
  return utf8.replace(/\u0000/g, "").trim()
}

type DocumentContentPayload =
  | { textContent: string; inlineFile?: undefined }
  | { textContent?: undefined; inlineFile: { mimeType: string; dataBase64: string } }

async function resolveDocumentContent(document: any): Promise<DocumentContentPayload> {
  const manualText = typeof document.course_source_text === "string" ? document.course_source_text.trim() : ""
  if (manualText.length >= 40) {
    return { textContent: manualText }
  }

  const filePath = typeof document.file_path === "string" ? document.file_path : ""
  if (!filePath) {
    throw new Error("Document invalide: chemin de fichier absent.")
  }

  const fileName = typeof document.name === "string" ? document.name : "document"
  const mimeType = normalizeMimeType(document.mime_type, fileName)
  const sizeBytes = typeof document.size_bytes === "number" ? document.size_bytes : 0

  if (sizeBytes > 10 * 1024 * 1024) {
    throw new Error("Le document est trop volumineux pour la génération IA (max 10 MB).")
  }

  const buffer = await downloadDocumentBuffer(filePath)

  if (isTextMimeType(mimeType)) {
    const textContent = decodeTextContent(buffer)
    if (textContent.length < 40) {
      throw new Error("Le document contient trop peu de texte exploitable pour générer des exercices.")
    }
    return { textContent }
  }

  if (!isInlineMimeType(mimeType)) {
    throw new Error(
      "Format non pris en charge pour la génération automatique. Utilisez un TXT/CSV/PDF/image ou ajoutez le contenu texte lors du téléversement.",
    )
  }

  return {
    inlineFile: {
      mimeType,
      dataBase64: buffer.toString("base64"),
    },
  }
}

function normalizeLevel(level: unknown) {
  const value = typeof level === "string" ? level.trim().toLowerCase() : ""
  const allowedLevels = new Set(["a1", "a2", "b1", "b2", "c1", "c2"])
  return allowedLevels.has(value) ? value : "b1"
}

export async function POST(request: Request) {
  let payload: GenerateCourseExercisesPayload

  try {
    payload = (await request.json()) as GenerateCourseExercisesPayload
  } catch {
    return badRequest("Charge utile de requête invalide.")
  }

  const documentId = (payload.documentId || "").trim()
  if (!documentId) {
    return badRequest("documentId est obligatoire.")
  }

  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  const documentSnap = await adminDb.collection("documents").doc(documentId).get()
  if (!documentSnap.exists) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 })
  }

  const document = { id: documentSnap.id, ...documentSnap.data() } as any
  if (document.owner_id !== callerUid) {
    return NextResponse.json({ error: "Accès refusé à ce document." }, { status: 403 })
  }

  const topic = parseCourseTopic(document.course_topic)
  const materialType = parseCourseMaterialType(document.course_material_type)
  if (!topic || !materialType) {
    return badRequest("Ce document n'est pas classé dans un topic et un type de contenu valides.")
  }

  const topicLabel = courseTopicLabel(topic)
  const materialTypeLabel = courseMaterialTypeLabel(materialType)

  const sharesSnap = await adminDb.collection("document_shares")
    .where("document_id", "==", documentId)
    .get()

  const sharedClassIds = Array.from(
    new Set(
      sharesSnap.docs
        .map((shareDoc) => shareDoc.data()?.class_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  )

  if (!sharedClassIds.length) {
    return badRequest("Partagez ce document avec au moins une classe avant de générer les exercices.")
  }

  const eligibleClasses: Array<{ id: string; level: string }> = []
  for (const classId of sharedClassIds) {
    const classSnap = await adminDb.collection("classes").doc(classId).get()
    if (!classSnap.exists) continue
    const classData = classSnap.data() as any
    if (classData.teacher_id !== callerUid) continue
    if (classData.archived_at) continue

    eligibleClasses.push({
      id: classId,
      level: normalizeLevel(classData.cefr_level),
    })
  }

  if (!eligibleClasses.length) {
    return badRequest("Aucune classe active éligible pour ce document.")
  }

  const targets: Array<{ classId: string; studentId: string; level: string }> = []
  for (const classRow of eligibleClasses) {
    const enrollmentsSnap = await adminDb.collection("class_enrollments")
      .where("class_id", "==", classRow.id)
      .where("status", "==", "active")
      .get()

    for (const enrollmentDoc of enrollmentsSnap.docs) {
      const enrollment = enrollmentDoc.data() as any
      const studentId = typeof enrollment.student_id === "string" ? enrollment.student_id : ""
      if (!studentId) continue

      targets.push({
        classId: classRow.id,
        studentId,
        level: normalizeLevel(enrollment.cefr_level || classRow.level),
      })
    }
  }

  const dedupedTargets = Array.from(
    new Map(targets.map((target) => [`${target.classId}:${target.studentId}`, target])).values(),
  )

  if (!dedupedTargets.length) {
    return badRequest("Aucun élève actif trouvé dans les classes liées à ce document.")
  }

  const existingSnap = await adminDb.collection("personalized_exercises")
    .where("source_document_id", "==", documentId)
    .get()

  const alreadyGeneratedKeys = new Set(
    existingSnap.docs.map((exerciseDoc) => {
      const row = exerciseDoc.data() as any
      return `${row.class_id || ""}:${row.student_id || ""}`
    }),
  )

  const pendingTargets = dedupedTargets.filter(
    (target) => !alreadyGeneratedKeys.has(`${target.classId}:${target.studentId}`),
  )

  if (!pendingTargets.length) {
    return NextResponse.json({
      created: 0,
      skippedExisting: dedupedTargets.length,
      studentsTargeted: dedupedTargets.length,
      message: "Des exercices avaient déjà été générés pour tous les élèves ciblés.",
    })
  }

  let documentContent: DocumentContentPayload
  try {
    documentContent = await resolveDocumentContent(document)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Impossible de lire le contenu du document." },
      { status: 400 },
    )
  }

  const targetsByLevel = new Map<string, Array<{ classId: string; studentId: string }>>()
  for (const target of pendingTargets) {
    const bucket = targetsByLevel.get(target.level) || []
    bucket.push({ classId: target.classId, studentId: target.studentId })
    targetsByLevel.set(target.level, bucket)
  }

  const generatedByLevel = new Map<string, Awaited<ReturnType<typeof generateCourseExercisesFromDocument>>>()

  try {
    for (const [level] of targetsByLevel.entries()) {
      const generatedExercises = await generateCourseExercisesFromDocument({
        topicLabel,
        materialTypeLabel,
        cefrLevel: level,
        documentName: document.name || "Document de cours",
        textContent: documentContent.textContent,
        inlineFile: documentContent.inlineFile,
      })
      generatedByLevel.set(level, generatedExercises)
    }
  } catch (error) {
    console.error("[course-exercises/generate] Gemini error:", error)
    return NextResponse.json(
      { error: "La génération IA a échoué. Réessayez dans quelques instants." },
      { status: 502 },
    )
  }

  const rowsToCreate: any[] = []
  for (const [level, levelTargets] of targetsByLevel.entries()) {
    const generated = generatedByLevel.get(level) || []

    for (const target of levelTargets) {
      for (const exercise of generated) {
        rowsToCreate.push({
          school_id: document.school_id || null,
          class_id: target.classId,
          student_id: target.studentId,
          created_by: callerUid,
          title: exercise.title,
          instructions: exercise.instructions,
          questions: exercise.questions || [],
          exercise_type: exercise.exercise_type,
          cefr_level: level,
          is_completed: false,
          source_kind: "course_document",
          source_document_id: documentId,
          source_document_name: document.name || "Document",
          source_topic: topic,
          source_material_type: materialType,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        })
      }
    }
  }

  for (let index = 0; index < rowsToCreate.length; index += 400) {
    const batch = adminDb.batch()
    const chunk = rowsToCreate.slice(index, index + 400)

    for (const row of chunk) {
      const docRef = adminDb.collection("personalized_exercises").doc()
      batch.set(docRef, row)
    }

    await batch.commit()
  }

  await adminDb.collection("activity_events").add({
    school_id: document.school_id || null,
    class_id: eligibleClasses[0]?.id || null,
    actor_id: callerUid,
    event_type: "assignment_created",
    payload: {
      text: `Exercices IA créés depuis ${document.name || "un document"} (${topicLabel}).`,
    },
    created_at: FieldValue.serverTimestamp(),
  })

  return NextResponse.json({
    created: rowsToCreate.length,
    skippedExisting: dedupedTargets.length - pendingTargets.length,
    studentsTargeted: dedupedTargets.length,
    levelsGenerated: Array.from(targetsByLevel.keys()).map((level) => level.toUpperCase()),
  })
}

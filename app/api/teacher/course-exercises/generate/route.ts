import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { verifyRequestBearerToken } from "@/lib/firebase/request-auth"
import {
  courseMaterialTypeLabel,
  courseTopicLabel,
  parseCourseMaterialType,
  parseCourseTopic,
} from "@/lib/course-content/config"
import { generateCourseExercisesFromDocument } from "@/lib/course-exercises/gemini"

type GenerateCourseExercisesPayload = {
  documentId?: string
  forceRegenerate?: boolean
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function resolveDocumentContent(document: any): { textContent: string } {
  const manualText = typeof document.course_source_text === "string" ? document.course_source_text.trim() : ""
  if (manualText.length > 0) {
    return { textContent: manualText }
  }

  throw new Error(
    "Mode strict active: ajoutez le contenu texte du cours avant de lancer \"Exercices IA\".",
  )
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
  const forceRegenerate = payload.forceRegenerate === true
  if (!documentId) {
    return badRequest("documentId est obligatoire.")
  }

  const authResult = await verifyRequestBearerToken(request)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const callerUid = authResult.uid

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

  const explicitTargetClassIds: string[] = Array.isArray(document.target_class_ids)
    ? Array.from(
        new Set(
          document.target_class_ids
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0),
        ),
      )
    : []

  const configuredClassIds = explicitTargetClassIds.length ? explicitTargetClassIds : sharedClassIds

  if (!configuredClassIds.length) {
    return badRequest("Configurez au moins une classe cible pour ce document avant de générer les exercices.")
  }

  const eligibleClasses: Array<{ id: string; level: string }> = []
  for (const classId of configuredClassIds) {
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

  const existingByTarget = new Map<string, Array<{ id: string; isCompleted: boolean }>>()
  for (const exerciseDoc of existingSnap.docs) {
    const row = exerciseDoc.data() as any
    const key = `${row.class_id || ""}:${row.student_id || ""}`
    const rows = existingByTarget.get(key) || []
    rows.push({
      id: exerciseDoc.id,
      isCompleted: !!row.is_completed,
    })
    existingByTarget.set(key, rows)
  }

  const exerciseIdsToReplace = new Set<string>()
  let skippedCompletedOnly = 0
  let regeneratedTargets = 0
  let createdFreshTargets = 0

  const pendingTargets = dedupedTargets.filter((target) => {
    const key = `${target.classId}:${target.studentId}`
    const rows = existingByTarget.get(key) || []

    if (!rows.length) {
      createdFreshTargets += 1
      return true
    }

    if (!forceRegenerate) {
      return false
    }

    const incompleteRows = rows.filter((row) => !row.isCompleted)
    if (!incompleteRows.length) {
      skippedCompletedOnly += 1
      return false
    }

    regeneratedTargets += 1
    for (const row of incompleteRows) {
      exerciseIdsToReplace.add(row.id)
    }

    return true
  })

  if (!forceRegenerate) {
    skippedCompletedOnly = dedupedTargets.length - pendingTargets.length
  }

  if (!pendingTargets.length) {
    if (forceRegenerate) {
      return NextResponse.json({
        mode: "regenerate",
        created: 0,
        replacedExercises: 0,
        regeneratedTargets: 0,
        createdFreshTargets: 0,
        skippedExisting: skippedCompletedOnly,
        studentsTargeted: dedupedTargets.length,
        message: "Aucun exercice non terminé à régénérer.",
      })
    }

    return NextResponse.json({
      mode: "generate",
      created: 0,
      skippedExisting: dedupedTargets.length,
      studentsTargeted: dedupedTargets.length,
      message: "Des exercices avaient déjà été générés pour tous les élèves ciblés.",
    })
  }

  let documentContent: { textContent: string }
  try {
    documentContent = resolveDocumentContent(document)
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

  if (forceRegenerate && exerciseIdsToReplace.size) {
    const ids = Array.from(exerciseIdsToReplace)
    for (let index = 0; index < ids.length; index += 400) {
      const batch = adminDb.batch()
      const chunk = ids.slice(index, index + 400)

      for (const exerciseId of chunk) {
        batch.delete(adminDb.collection("personalized_exercises").doc(exerciseId))
      }

      await batch.commit()
    }
  }

  await adminDb.collection("activity_events").add({
    school_id: document.school_id || null,
    class_id: eligibleClasses[0]?.id || null,
    actor_id: callerUid,
    event_type: "assignment_created",
    payload: {
      text: forceRegenerate
        ? `Exercices IA régénérés depuis ${document.name || "un document"} (${topicLabel}).`
        : `Exercices IA créés depuis ${document.name || "un document"} (${topicLabel}).`,
    },
    created_at: FieldValue.serverTimestamp(),
  })

  if (forceRegenerate) {
    return NextResponse.json({
      mode: "regenerate",
      created: rowsToCreate.length,
      replacedExercises: exerciseIdsToReplace.size,
      regeneratedTargets,
      createdFreshTargets,
      skippedExisting: skippedCompletedOnly,
      studentsTargeted: dedupedTargets.length,
      levelsGenerated: Array.from(targetsByLevel.keys()).map((level) => level.toUpperCase()),
    })
  }

  return NextResponse.json({
    mode: "generate",
    created: rowsToCreate.length,
    skippedExisting: skippedCompletedOnly,
    studentsTargeted: dedupedTargets.length,
    levelsGenerated: Array.from(targetsByLevel.keys()).map((level) => level.toUpperCase()),
  })
}

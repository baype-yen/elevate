import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore"
import {
  COURSE_TOPIC_OPTIONS,
  courseMaterialTypeLabel,
  courseTopicLabel,
  parseCourseMaterialType,
  parseCourseTopic,
} from "@/lib/course-content/config"

function upLevel(level: string | null | undefined) {
  return (level || "b1").toUpperCase()
}

function normalizeLevel(level: string) {
  return level.toLowerCase()
}

function parseDocumentVisibilityMode(value: unknown): "student_visible" | "internal_teacher" {
  if (typeof value !== "string") return "student_visible"
  const normalized = value.trim().toLowerCase()
  return normalized === "internal_teacher" ? "internal_teacher" : "student_visible"
}

function normalizePersonKey(name: string) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function toFileType(mimeType: string | null | undefined) {
  return (mimeType || "FILE").split("/").pop()?.toUpperCase() || "FILE"
}

function toFileSize(sizeBytes: number | null | undefined) {
  const value = sizeBytes || 0
  return value > 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`
}

export type SubmissionDocumentPayload = {
  id: string
  name: string
  filePath: string
  mimeType?: string | null
  sizeBytes?: number | null
}

export type SubmissionPayload = {
  text: string
  document: SubmissionDocumentPayload | null
}

type CourseExerciseQuestionPayload = {
  id: string
  prompt: string
  hint: string
  questionType: "single_choice" | "short_answer"
  options: string[]
}

type CourseExerciseAnswersPayload = Record<string, string>

type CourseExerciseQuestionReviewPayload = {
  isCorrect: boolean | null
  comment: string
}

type CourseExerciseQuestionReviewsPayload = Record<string, CourseExerciseQuestionReviewPayload>

function parseSubmissionPayload(content: any): SubmissionPayload {
  const payload = content && typeof content === "object" ? content : {}
  const text = typeof payload.text === "string" ? payload.text : ""
  const rawDocument = payload.document && typeof payload.document === "object" ? payload.document : null

  const document = rawDocument
    ? {
        id: String(rawDocument.id || ""),
        name: String(rawDocument.name || ""),
        filePath: String(rawDocument.filePath || ""),
        mimeType: rawDocument.mimeType ? String(rawDocument.mimeType) : null,
        sizeBytes: typeof rawDocument.sizeBytes === "number" ? rawDocument.sizeBytes : null,
      }
    : null

  if (document && (!document.id || !document.name || !document.filePath)) {
    return { text, document: null }
  }

  return { text, document }
}

function parseCourseExerciseAnswers(payload: any): CourseExerciseAnswersPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}

  const answers: CourseExerciseAnswersPayload = {}
  for (const [key, value] of Object.entries(payload)) {
    if (typeof key !== "string") continue
    if (typeof value !== "string") continue
    const normalizedKey = key.trim()
    const normalizedValue = value.trim()
    if (!normalizedKey || !normalizedValue) continue
    answers[normalizedKey] = normalizedValue
  }

  return answers
}

function parseCourseExerciseQuestionReviews(payload: any): CourseExerciseQuestionReviewsPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}

  const reviews: CourseExerciseQuestionReviewsPayload = {}

  for (const [questionId, rawValue] of Object.entries(payload)) {
    if (typeof questionId !== "string") continue
    const normalizedQuestionId = questionId.trim()
    if (!normalizedQuestionId) continue
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue

    const rawIsCorrect = typeof (rawValue as any).is_correct === "boolean"
      ? (rawValue as any).is_correct
      : typeof (rawValue as any).isCorrect === "boolean"
      ? (rawValue as any).isCorrect
      : null

    const comment = typeof (rawValue as any).comment === "string"
      ? (rawValue as any).comment.trim()
      : ""

    if (rawIsCorrect === null && !comment) continue

    reviews[normalizedQuestionId] = {
      isCorrect: rawIsCorrect,
      comment,
    }
  }

  return reviews
}

function parseCourseExerciseQuestions(rawQuestions: any): CourseExerciseQuestionPayload[] {
  if (!Array.isArray(rawQuestions)) return []

  const questions: CourseExerciseQuestionPayload[] = []

  for (const item of rawQuestions) {
    if (!item || typeof item !== "object") continue

    const prompt = typeof (item as any).prompt === "string"
      ? (item as any).prompt.trim()
      : ""
    if (prompt.length < 6) continue

    const rawQuestionType = typeof (item as any).question_type === "string"
      ? (item as any).question_type
      : typeof (item as any).questionType === "string"
      ? (item as any).questionType
      : ""

    const questionType = rawQuestionType === "single_choice"
      ? "single_choice"
      : rawQuestionType === "short_answer"
      ? "short_answer"
      : null

    if (!questionType) continue

    const id = typeof (item as any).id === "string" && (item as any).id.trim()
      ? (item as any).id.trim()
      : `q${questions.length + 1}`
    const hint = typeof (item as any).hint === "string" ? (item as any).hint.trim() : ""

    const options = questionType === "single_choice" && Array.isArray((item as any).options)
      ? (item as any).options
        .filter((opt: unknown) => typeof opt === "string")
        .map((opt: string) => opt.trim())
        .filter(Boolean)
      : []

    if (questionType === "single_choice" && options.length < 2) continue

    questions.push({
      id,
      prompt,
      hint,
      questionType,
      options,
    })
  }

  return questions
}

function normalizeAssignmentType(type: string | null | undefined) {
  const value = (type || "exercise").toLowerCase()
  const allowed = new Set([
    "quiz",
    "conjugation",
    "grammar",
    "reading",
    "writing",
    "listening",
    "speaking",
    "vocabulary",
    "exercise",
    "project",
    "mixed",
  ])
  return allowed.has(value) ? value : "exercise"
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === "string") return new Date(value)
  return null
}

function toISOString(value: any): string | null {
  const d = toDate(value)
  return d ? d.toISOString() : null
}

function toLocaleDateFR(value: any): string {
  const d = toDate(value)
  return d ? d.toLocaleDateString("fr-FR") : "-"
}

function snap(doc: any) {
  return { id: doc.id, ...doc.data() }
}

async function queryDocs(db: Firestore, col: string, ...constraints: any[]) {
  const q = query(collection(db, col), ...constraints)
  const snapshot = await getDocs(q)
  return snapshot.docs.map(snap)
}

export type TeacherClassSummary = {
  id: string
  name: string
  level: string
  classCode: string | null
  academicYear: string | null
  archivedAt: string | null
  students: number
  avg: number
  pending: number
}

export type TeacherStudentRow = {
  id: string
  classId: string
  className: string
  studentId: string | null
  name: string
  initials: string
  level: string
  score: number
  lastActive: string
  canEditLevel: boolean
}

export type TeacherStudentsData = {
  className: string
  students: TeacherStudentRow[]
  classes: Array<{ id: string; name: string }>
}

export async function fetchTeacherDashboardData(db: Firestore, userId: string, schoolId: string | null) {
  const classConstraints = schoolId
    ? [where("teacher_id", "==", userId), where("school_id", "==", schoolId), where("archived_at", "==", null), orderBy("created_at", "desc")]
    : [where("teacher_id", "==", userId), where("school_id", "==", null), where("archived_at", "==", null), orderBy("created_at", "desc")]

  const classes = await queryDocs(db, "classes", ...classConstraints)
  const classIds = classes.map((c: any) => c.id)

  let enrollments: any[] = []
  let rosterStudents: any[] = []
  let assignments: any[] = []
  let submissions: any[] = []

  if (classIds.length) {
    const batches = batchIds(classIds)

    for (const batch of batches) {
      const [e, r, a] = await Promise.all([
        queryDocs(db, "class_enrollments", where("class_id", "in", batch), where("status", "==", "active")),
        queryDocs(db, "class_students", where("class_id", "in", batch)),
        queryDocs(db, "assignments", where("class_id", "in", batch)),
      ])
      enrollments.push(...e)
      rosterStudents.push(...r)
      assignments.push(...a)
    }

    const assignmentIds = assignments.map((assignment: any) => assignment.id)
    if (assignmentIds.length) {
      for (const batch of batchIds(assignmentIds)) {
        const rows = await queryDocs(db, "submissions", where("assignment_id", "in", batch))
        submissions.push(...rows)
      }
    }
  }

  const classNameById = new Map(classes.map((classRow: any) => [classRow.id, classRow.name]))

  const studentsByClass = new Map<string, number>()
  for (const enrollment of enrollments) {
    studentsByClass.set(enrollment.class_id, (studentsByClass.get(enrollment.class_id) || 0) + 1)
  }

  const rosterByClass = new Map<string, number>()
  for (const row of rosterStudents) {
    rosterByClass.set(row.class_id, (rosterByClass.get(row.class_id) || 0) + 1)
  }

  const assignmentToClass = new Map<string, string>()
  for (const assignment of assignments) assignmentToClass.set(assignment.id, assignment.class_id)

  const assignmentsByClass = new Map<string, number>()
  for (const assignment of assignments) {
    if (assignment.is_published === false) continue
    assignmentsByClass.set(assignment.class_id, (assignmentsByClass.get(assignment.class_id) || 0) + 1)
  }

  const submittedByClass = new Map<string, number>()
  const pendingByClass = new Map<string, number>()
  const scoresByClass = new Map<string, number[]>()

  let pending = 0
  for (const submission of submissions) {
    const classId = assignmentToClass.get(submission.assignment_id)
    if (!classId) continue

    if (submission.status === "submitted" || submission.status === "graded") {
      submittedByClass.set(classId, (submittedByClass.get(classId) || 0) + 1)
    }

    if (submission.status !== "graded") {
      pending += 1
      pendingByClass.set(classId, (pendingByClass.get(classId) || 0) + 1)
    }

    if (typeof submission.score === "number") {
      const scores = scoresByClass.get(classId) || []
      scores.push(submission.score)
      scoresByClass.set(classId, scores)
    }
  }

  const classHealth = classes.map((classRow: any) => {
    const scores = scoresByClass.get(classRow.id) || []
    const avg = scores.length ? Math.round(scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length) : 0
    const students = (rosterByClass.get(classRow.id) || 0) || (studentsByClass.get(classRow.id) || 0)
    const assignmentsCount = assignmentsByClass.get(classRow.id) || 0
    const submittedCount = submittedByClass.get(classRow.id) || 0
    const expectedSubmissions = students > 0 ? students * assignmentsCount : 0
    const submissionRate = expectedSubmissions > 0
      ? Math.min(100, Math.round((submittedCount / expectedSubmissions) * 100))
      : 0

    return {
      id: classRow.id,
      name: classRow.name,
      level: upLevel(classRow.cefr_level),
      students,
      avg,
      assignments: assignmentsCount,
      pending: pendingByClass.get(classRow.id) || 0,
      submissionRate,
    }
  })

  classHealth.sort((left, right) => {
    if (left.pending !== right.pending) return right.pending - left.pending
    if (left.submissionRate !== right.submissionRate) return left.submissionRate - right.submissionRate
    return left.name.localeCompare(right.name, "fr")
  })

  const allScores = submissions
    .map((submission: any) => submission.score)
    .filter((value: any): value is number => typeof value === "number")
  const overallAvg = allScores.length
    ? Math.round(allScores.reduce((sum: number, value: number) => sum + value, 0) / allScores.length)
    : 0

  const pendingSubmissions = submissions
    .filter((submission: any) => submission.status !== "graded")
    .sort((left: any, right: any) => {
      const leftDate = toDate(left.submitted_at)?.getTime() || 0
      const rightDate = toDate(right.submitted_at)?.getTime() || 0
      return leftDate - rightDate
    })

  const pendingStudentIds = Array.from(
    new Set(
      pendingSubmissions
        .map((submission: any) => submission.student_id)
        .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  )

  const profileById = new Map<string, any>()
  for (const studentId of pendingStudentIds) {
    const profileSnap = await getDoc(doc(db, "profiles", studentId))
    if (profileSnap.exists()) {
      profileById.set(studentId, profileSnap.data())
    }
  }

  const assignmentById = new Map(assignments.map((assignment: any) => [assignment.id, assignment]))

  const documentConstraints = schoolId
    ? [where("owner_id", "==", userId), where("school_id", "==", schoolId), orderBy("created_at", "desc")]
    : [where("owner_id", "==", userId), where("school_id", "==", null), orderBy("created_at", "desc")]

  const documents = await queryDocs(db, "documents", ...documentConstraints)

  const aiReadyDocuments = documents.filter((documentRow: any) => {
    const hasSourceText = typeof documentRow.course_source_text === "string"
      && documentRow.course_source_text.trim().length > 0
    const hasTopic = !!parseCourseTopic(documentRow.course_topic)
    const hasMaterial = !!parseCourseMaterialType(documentRow.course_material_type)
    const targetClassIds = Array.isArray(documentRow.target_class_ids)
      ? documentRow.target_class_ids
          .filter((value: unknown): value is string => typeof value === "string")
          .map((value: string) => value.trim())
          .filter(Boolean)
      : []

    return hasSourceText && hasTopic && hasMaterial && targetClassIds.length > 0
  })

  const blockedDocuments = documents.filter((documentRow: any) => !aiReadyDocuments.includes(documentRow))

  const activityConstraints = schoolId
    ? [where("school_id", "==", schoolId), orderBy("created_at", "desc"), limit(80)]
    : [where("actor_id", "==", userId), where("school_id", "==", null), orderBy("created_at", "desc"), limit(80)]

  const activityEvents = await queryDocs(db, "activity_events", ...activityConstraints)

  const normalizeEventText = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  const courseRegenerations = activityEvents.filter((event: any) => {
    const text = normalizeEventText(typeof event.payload?.text === "string" ? event.payload.text : "")
    return text.includes("exercices ia regeneres")
  }).length

  const ocrSessions = activityEvents.filter((event: any) => {
    const text = normalizeEventText(typeof event.payload?.text === "string" ? event.payload.text : "")
    return text.includes("copie photo")
  }).length

  const personalizedRows = await queryDocs(
    db,
    "personalized_exercises",
    where("created_by", "==", userId),
    limit(800),
  )

  const scopedPersonalizedRows = schoolId
    ? personalizedRows.filter((row: any) => row.school_id === schoolId)
    : personalizedRows

  const courseExercises = scopedPersonalizedRows
    .filter((row: any) => (row.source_kind || "") === "course_document")
    .length

  const personalizedExercises = scopedPersonalizedRows
    .filter((row: any) => !!row.source_submission_id && (row.source_kind || "") !== "course_document")
    .length

  const flashcards = await queryDocs(
    db,
    "flashcards",
    where("generated_by", "==", userId),
    where("source_kind", "==", "teacher_correction"),
    limit(800),
  )

  const flashcardsGenerated = schoolId
    ? flashcards.filter((row: any) => row.school_id === schoolId).length
    : flashcards.length

  const recentActivity = activityEvents.slice(0, 8).map((event: any) => ({
    text: event.payload?.text || `Événement: ${(event.event_type || "").replaceAll("_", " ")}`,
    time: toDate(event.created_at)?.toLocaleString("fr-FR") || "-",
    type: event.event_type || "event",
  }))

  const priorityQueue: Array<{
    id: string
    title: string
    detail: string
    href: string
    priority: "high" | "medium" | "low"
  }> = []

  for (const submission of pendingSubmissions.slice(0, 4)) {
    const assignment = assignmentById.get(submission.assignment_id)
    const classId = assignment?.class_id || null
    const className = classId ? classNameById.get(classId) || "Classe" : "Classe"
    const studentName = profileById.get(submission.student_id)?.full_name || "Élève"
    const submittedAt = toDate(submission.submitted_at)
    const ageHours = submittedAt ? (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60) : 0

    priorityQueue.push({
      id: `submission:${submission.id}`,
      title: `${studentName} - ${assignment?.title || "Travail"}`,
      detail: `${className} · soumission ${toLocaleDateFR(submission.submitted_at)}`,
      href: "/teacher/work",
      priority: ageHours >= 72 ? "high" : ageHours >= 24 ? "medium" : "low",
    })
  }

  for (const documentRow of blockedDocuments.slice(0, 2)) {
    const hasSourceText = typeof documentRow.course_source_text === "string"
      && documentRow.course_source_text.trim().length > 0

    priorityQueue.push({
      id: `document:${documentRow.id}`,
      title: `Document à compléter - ${documentRow.name || "Document"}`,
      detail: hasSourceText
        ? "Classes cibles manquantes pour la génération IA"
        : "Texte source manquant pour la génération IA",
      href: "/teacher/documents",
      priority: hasSourceText ? "medium" : "high",
    })
  }

  const fragileClass = classHealth.find((classRow) => classRow.assignments > 0 && classRow.submissionRate < 60)
  if (fragileClass) {
    priorityQueue.push({
      id: `class:${fragileClass.id}`,
      title: `Classe à relancer - ${fragileClass.name}`,
      detail: `Taux de remise ${fragileClass.submissionRate}% · ${fragileClass.pending} correction(s) en attente`,
      href: `/teacher/classes/${fragileClass.id}`,
      priority: "medium",
    })
  }

  return {
    summary: {
      totalStudents: classHealth.reduce((sum: number, classRow: any) => sum + classRow.students, 0),
      activeClasses: classHealth.length,
      pendingReviews: pending,
      overallAvg,
      documentsReady: aiReadyDocuments.length,
      documentsBlocked: blockedDocuments.length,
    },
    classHealth,
    priorityQueue: priorityQueue.slice(0, 8),
    aiImpact: {
      courseExercises,
      courseRegenerations,
      personalizedExercises,
      flashcards: flashcardsGenerated,
      ocrSessions,
    },
    recentActivity,
  }
}

export async function fetchTeacherClassesData(
  db: Firestore,
  userId: string,
  schoolId: string | null,
  includeArchived = false,
) {
  const classConstraints = schoolId
    ? [where("teacher_id", "==", userId), where("school_id", "==", schoolId), orderBy("created_at", "desc")]
    : [where("teacher_id", "==", userId), where("school_id", "==", null), orderBy("created_at", "desc")]

  const classes = await queryDocs(db, "classes", ...classConstraints)
  const filtered = includeArchived ? classes : classes.filter((c: any) => !c.archived_at)
  const classIds = filtered.map((c: any) => c.id)

  let enrollments: any[] = []
  let rosterStudents: any[] = []
  let assignments: any[] = []
  let submissions: any[] = []

  if (classIds.length) {
    for (const batch of batchIds(classIds)) {
      const [e, r, a] = await Promise.all([
        queryDocs(db, "class_enrollments", where("class_id", "in", batch), where("status", "==", "active")),
        queryDocs(db, "class_students", where("class_id", "in", batch)),
        queryDocs(db, "assignments", where("class_id", "in", batch)),
      ])
      enrollments.push(...e)
      rosterStudents.push(...r)
      assignments.push(...a)
    }

    const assignmentIds = assignments.map((a: any) => a.id)
    if (assignmentIds.length) {
      for (const batch of batchIds(assignmentIds)) {
        const s = await queryDocs(db, "submissions", where("assignment_id", "in", batch))
        submissions.push(...s)
      }
    }
  }

  const studentsByClass = new Map<string, number>()
  for (const e of enrollments) {
    studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) || 0) + 1)
  }

  const rosterByClass = new Map<string, number>()
  for (const r of rosterStudents) {
    rosterByClass.set(r.class_id, (rosterByClass.get(r.class_id) || 0) + 1)
  }

  const assignmentToClass = new Map<string, string>()
  for (const a of assignments) assignmentToClass.set(a.id, a.class_id)

  const scoresByClass = new Map<string, number[]>()
  const pendingByClass = new Map<string, number>()

  for (const s of submissions) {
    const classId = assignmentToClass.get(s.assignment_id)
    if (!classId) continue
    if (s.status !== "graded") {
      pendingByClass.set(classId, (pendingByClass.get(classId) || 0) + 1)
    }
    if (typeof s.score === "number") {
      const arr = scoresByClass.get(classId) || []
      arr.push(s.score)
      scoresByClass.set(classId, arr)
    }
  }

  const result: TeacherClassSummary[] = filtered.map((c: any) => {
    const scores = scoresByClass.get(c.id) || []
    const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
    return {
      id: c.id,
      name: c.name,
      level: upLevel(c.cefr_level),
      classCode: c.class_code || null,
      academicYear: c.academic_year || null,
      archivedAt: toISOString(c.archived_at),
      students: (rosterByClass.get(c.id) || 0) || (studentsByClass.get(c.id) || 0),
      avg,
      pending: pendingByClass.get(c.id) || 0,
    }
  })

  return result
}

function generateClassCode(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 4)
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${cleaned || "CLS"}-${suffix}`
}

export async function createTeacherClass(
  db: Firestore,
  userId: string,
  schoolId: string | null,
  input: { name: string; level: string; academicYear?: string; classCode?: string },
) {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error("Le nom de la classe est obligatoire.")
  }

  const desiredCode = input.classCode?.trim().toUpperCase()
  const classCode = desiredCode || generateClassCode(trimmedName)

  const docRef = await addDoc(collection(db, "classes"), {
    school_id: schoolId,
    teacher_id: userId,
    name: trimmedName,
    cefr_level: normalizeLevel(input.level),
    class_code: classCode,
    academic_year: input.academicYear?.trim() || null,
    archived_at: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })

  return docRef.id
}

export async function updateTeacherClass(
  db: Firestore,
  classId: string,
  input: { name: string; level: string; academicYear?: string; classCode?: string },
) {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error("Le nom de la classe est obligatoire.")
  }

  await updateDoc(doc(db, "classes", classId), {
    name: trimmedName,
    cefr_level: normalizeLevel(input.level),
    class_code: input.classCode?.trim().toUpperCase() || null,
    academic_year: input.academicYear?.trim() || null,
    updated_at: serverTimestamp(),
  })
}

export async function archiveTeacherClass(db: Firestore, classId: string) {
  await updateDoc(doc(db, "classes", classId), {
    archived_at: new Date().toISOString(),
    updated_at: serverTimestamp(),
  })
}

export async function unarchiveTeacherClass(db: Firestore, classId: string) {
  await updateDoc(doc(db, "classes", classId), {
    archived_at: null,
    updated_at: serverTimestamp(),
  })
}

export async function fetchTeacherClassDetail(db: Firestore, classId: string) {
  const classSnap = await getDoc(doc(db, "classes", classId))
  if (!classSnap.exists()) return null

  const classRow = { id: classSnap.id, ...classSnap.data() } as any

  const rosterRows = await queryDocs(
    db,
    "class_students",
    where("class_id", "==", classId),
    orderBy("sort_order", "asc"),
    orderBy("last_name", "asc"),
    orderBy("first_name", "asc"),
  )

  const roster = rosterRows.map((row: any) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company || "",
    city: row.city || "",
    sortOrder: row.sort_order,
    createdAt: toISOString(row.created_at) || "",
  }))

  return {
    classItem: {
      id: classRow.id,
      name: classRow.name,
      level: upLevel(classRow.cefr_level),
      classCode: classRow.class_code,
      academicYear: classRow.academic_year,
      archivedAt: toISOString(classRow.archived_at),
      schoolId: classRow.school_id,
    },
    roster,
  }
}

export async function addClassRosterStudent(
  db: Firestore,
  classId: string,
  input: { firstName: string; lastName: string; company?: string; city?: string },
) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error("Le prénom et le nom sont obligatoires.")
  }

  const existing = await queryDocs(
    db,
    "class_students",
    where("class_id", "==", classId),
    orderBy("sort_order", "desc"),
    limit(1),
  )

  const nextSort = (existing[0]?.sort_order || 0) + 1

  await addDoc(collection(db, "class_students"), {
    class_id: classId,
    first_name: firstName,
    last_name: lastName,
    company: input.company?.trim() || null,
    city: input.city?.trim() || null,
    sort_order: nextSort,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })
}

export async function updateClassRosterStudent(
  db: Firestore,
  rosterId: string,
  input: { firstName: string; lastName: string; company?: string; city?: string },
) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error("Le prénom et le nom sont obligatoires.")
  }

  await updateDoc(doc(db, "class_students", rosterId), {
    first_name: firstName,
    last_name: lastName,
    company: input.company?.trim() || null,
    city: input.city?.trim() || null,
    updated_at: serverTimestamp(),
  })
}

export async function removeClassRosterStudent(db: Firestore, rosterId: string) {
  await deleteDoc(doc(db, "class_students", rosterId))
}

export async function importClassRosterRows(
  db: Firestore,
  classId: string,
  rows: Array<{ firstName: string; lastName: string; company?: string; city?: string }>,
) {
  const normalized = rows
    .map((row) => ({
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      company: row.company?.trim() || null,
      city: row.city?.trim() || null,
    }))
    .filter((row) => row.firstName && row.lastName)

  if (!normalized.length) return 0

  const existing = await queryDocs(
    db,
    "class_students",
    where("class_id", "==", classId),
    orderBy("sort_order", "desc"),
    limit(1),
  )

  let nextSort = (existing[0]?.sort_order || 0) + 1

  const existingRows = await queryDocs(db, "class_students", where("class_id", "==", classId))
  const existingKeys = new Set(
    existingRows.map((r: any) => `${(r.first_name || "").toLowerCase()}|${(r.last_name || "").toLowerCase()}`),
  )

  let imported = 0
  for (const row of normalized) {
    const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
    if (existingKeys.has(key)) continue

    await addDoc(collection(db, "class_students"), {
      class_id: classId,
      first_name: row.firstName,
      last_name: row.lastName,
      company: row.company,
      city: row.city,
      sort_order: nextSort++,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    imported++
  }

  return imported
}

export async function fetchTeacherStudentsData(
  db: Firestore,
  userId: string,
  schoolId: string | null,
  classId?: string | null,
): Promise<TeacherStudentsData> {
  let classConstraints: any[] = [
    where("teacher_id", "==", userId),
    where("archived_at", "==", null),
  ]
  if (schoolId) classConstraints.push(where("school_id", "==", schoolId))
  else classConstraints.push(where("school_id", "==", null))
  if (classId) classConstraints.push(where("__name__", "==", classId))

  const classes = await queryDocs(db, "classes", ...classConstraints)
  const classIds = classes.map((c: any) => c.id)
  if (!classIds.length) return { className: "Aucune classe", students: [], classes: [] }

  let rosterStudents: any[] = []
  let enrollments: any[] = []
  let assignments: any[] = []

  for (const batch of batchIds(classIds)) {
    const [r, e, a] = await Promise.all([
      queryDocs(db, "class_students", where("class_id", "in", batch)),
      queryDocs(db, "class_enrollments", where("class_id", "in", batch), where("status", "==", "active")),
      queryDocs(db, "assignments", where("class_id", "in", batch)),
    ])
    rosterStudents.push(...r)
    enrollments.push(...e)
    assignments.push(...a)
  }

  const assignmentIds = assignments.map((a: any) => a.id)
  let submissions: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      const s = await queryDocs(db, "submissions", where("assignment_id", "in", batch))
      submissions.push(...s)
    }
  }

  // Fetch profiles for enrolled students
  const studentIds = Array.from(new Set(enrollments.map((e: any) => e.student_id)))
  const profileMap = new Map<string, any>()
  for (const batch of batchIds(studentIds)) {
    for (const sid of batch) {
      const profileSnap = await getDoc(doc(db, "profiles", sid))
      if (profileSnap.exists()) profileMap.set(sid, profileSnap.data())
    }
  }

  const classLevelMap = new Map(classes.map((c: any) => [c.id, upLevel(c.cefr_level)]))
  const classNameById = new Map(classes.map((c: any) => [c.id, c.name]))
  const assignmentToClass = new Map(assignments.map((a: any) => [a.id, a.class_id]))

  const studentScoreMap = new Map<string, number[]>()
  const studentLastMap = new Map<string, string>()
  for (const s of submissions) {
    const submissionClassId = assignmentToClass.get(s.assignment_id)
    if (!submissionClassId || !s.student_id) continue
    const statKey = `${submissionClassId}:${s.student_id}`

    if (typeof s.score === "number") {
      const arr = studentScoreMap.get(statKey) || []
      arr.push(s.score)
      studentScoreMap.set(statKey, arr)
    }

    const submittedAt = toISOString(s.submitted_at)
    if (submittedAt) {
      const prev = studentLastMap.get(statKey)
      if (!prev || new Date(submittedAt) > new Date(prev)) studentLastMap.set(statKey, submittedAt)
    }
  }

  const rosterList: TeacherStudentRow[] = rosterStudents.map((r: any) => {
    const name = `${r.first_name} ${r.last_name}`.trim()
    return {
      id: `roster:${r.id}`,
      classId: r.class_id,
      className: classNameById.get(r.class_id) || "Classe",
      studentId: null,
      name,
      initials: `${r.first_name[0] || ""}${r.last_name[0] || ""}`.toUpperCase(),
      level: classLevelMap.get(r.class_id) || "B1",
      score: 0,
      lastActive: r.city || "Fiche de liste",
      canEditLevel: false,
    }
  })

  const enrolledList: TeacherStudentRow[] = enrollments.map((e: any) => {
    const profile = profileMap.get(e.student_id)
    const name = profile?.full_name || "Élève"
    const level = upLevel(e.cefr_level || profile?.cefr_level || classLevelMap.get(e.class_id) || "b1")
    const statKey = `${e.class_id}:${e.student_id}`
    const scores = studentScoreMap.get(statKey) || []
    const score = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
    const lastDate = studentLastMap.get(statKey)
    const lastActive = lastDate ? new Date(lastDate).toLocaleDateString("fr-FR") : "Aucune activité"
    return {
      id: `student:${e.class_id}:${e.student_id}`,
      classId: e.class_id,
      className: classNameById.get(e.class_id) || "Classe",
      studentId: e.student_id,
      name,
      initials: name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
      level,
      score,
      lastActive,
      canEditLevel: true,
    }
  })

  const enrolledNameClassKeys = new Set(
    enrolledList.map((student) => `${student.classId}:${normalizePersonKey(student.name)}`),
  )

  const filteredRoster = rosterList.filter((student) => {
    const key = `${student.classId}:${normalizePersonKey(student.name)}`
    return !enrolledNameClassKeys.has(key)
  })

  const merged = [...enrolledList, ...filteredRoster]
  const unique = new Map<string, TeacherStudentRow>()
  for (const student of merged) {
    const key = student.studentId ? `student:${student.classId}:${student.studentId}` : student.id
    const existing = unique.get(key)
    if (!existing || (!existing.canEditLevel && student.canEditLevel)) {
      unique.set(key, student)
    }
  }

  const students = Array.from(unique.values()).sort((a, b) => {
    const classCompare = a.className.localeCompare(b.className, "fr")
    if (classCompare !== 0) return classCompare
    return a.name.localeCompare(b.name, "fr")
  })

  return {
    className: classId ? classes?.[0]?.name || "Classe" : "Toutes les classes actives",
    students,
    classes: classes.map((c: any) => ({ id: c.id, name: c.name })),
  }
}

export async function fetchTeacherWorkData(
  db: Firestore,
  userId: string,
  schoolId: string | null,
  classId?: string | null,
) {
  let classConstraints: any[] = [
    where("teacher_id", "==", userId),
    where("archived_at", "==", null),
  ]
  if (classId) classConstraints.push(where("__name__", "==", classId))

  const classes = await queryDocs(db, "classes", ...classConstraints)
  const classIds = classes.map((c: any) => c.id)
  if (!classIds.length) return { items: [] as any[], classes: [] as any[] }

  const classNameById = new Map(classes.map((c: any) => [c.id, c.name]))

  let assignments: any[] = []
  for (const batch of batchIds(classIds)) {
    const a = await queryDocs(db, "assignments", where("class_id", "in", batch), orderBy("created_at", "desc"))
    assignments.push(...a)
  }

  const assignmentIds = assignments.map((a: any) => a.id)
  if (!assignmentIds.length) {
    return {
      items: [] as any[],
      classes: classes.map((c: any) => ({ id: c.id, name: c.name })),
    }
  }

  let submissions: any[] = []
  for (const batch of batchIds(assignmentIds)) {
    const s = await queryDocs(db, "submissions", where("assignment_id", "in", batch), orderBy("submitted_at", "desc"))
    submissions.push(...s)
  }

  // Fetch student profiles
  const studentIds = Array.from(new Set(submissions.map((s: any) => s.student_id)))
  const profileMap = new Map<string, any>()
  for (const sid of studentIds) {
    const profileSnap = await getDoc(doc(db, "profiles", sid))
    if (profileSnap.exists()) profileMap.set(sid, profileSnap.data())
  }

  const byAssignment = new Map<string, any>()
  for (const a of assignments) byAssignment.set(a.id, a)

  const items = submissions.map((s: any) => {
    const a = byAssignment.get(s.assignment_id)
    const payload = parseSubmissionPayload(s.content)
    const contentPreview = payload.text.trim() ? payload.text.trim().slice(0, 220) : ""

    return {
      id: s.id,
      assignmentId: s.assignment_id,
      classId: a?.class_id || null,
      schoolId: a?.school_id || schoolId,
      studentId: s.student_id,
      title: a?.title || "Devoir",
      student: profileMap.get(s.student_id)?.full_name || "Élève",
      className: classNameById.get(a?.class_id) || "Classe",
      submitted: toLocaleDateFR(s.submitted_at),
      submittedAtRaw: toISOString(s.submitted_at),
      status: s.status === "graded" ? "Graded" : "Pending",
      statusRaw: s.status,
      score: s.score,
      feedback: s.feedback || "",
      gradedAt: toISOString(s.graded_at),
      contentText: payload.text,
      contentPreview,
      document: payload.document,
      type: a?.type || "mixed",
      level: upLevel(a?.cefr_level),
    }
  })

  return {
    items,
    classes: classes.map((c: any) => ({ id: c.id, name: c.name })),
  }
}

export type TeacherClassProgramQuickLinkKey = "course_exercises" | "quiz_assignments" | "personalized_exercises"

export type TeacherClassProgramRow = {
  id: string
  classId: string
  schoolId: string | null
  dateKey: string
  title: string
  majorPoints: string
  notes: string
  assignmentIds: string[]
  documentIds: string[]
  quickLinks: TeacherClassProgramQuickLinkKey[]
  createdAt: string | null
  updatedAt: string | null
}

export type TeacherClassProgramComposerData = {
  programs: TeacherClassProgramRow[]
  assignments: Array<{
    id: string
    title: string
    type: string
    dueAt: string | null
    isPublished: boolean
  }>
  documents: Array<{
    id: string
    name: string
    filePath: string
    sharedAt: string | null
  }>
}

function normalizeProgramDateKey(value: string) {
  const match = (value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ""
  const date = new Date(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10) - 1, Number.parseInt(match[3], 10))
  if (Number.isNaN(date.getTime())) return ""
  return `${match[1]}-${match[2]}-${match[3]}`
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  const rows = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(rows))
}

function normalizeProgramQuickLinks(value: unknown): TeacherClassProgramQuickLinkKey[] {
  const normalized = normalizeStringArray(value)
  const allowed = new Set<TeacherClassProgramQuickLinkKey>([
    "course_exercises",
    "quiz_assignments",
    "personalized_exercises",
  ])

  return normalized.filter((item): item is TeacherClassProgramQuickLinkKey => {
    return allowed.has(item as TeacherClassProgramQuickLinkKey)
  })
}

export async function fetchTeacherClassProgramsData(
  db: Firestore,
  classId: string,
  schoolId?: string | null,
): Promise<TeacherClassProgramComposerData> {
  const rawPrograms = await queryDocs(db, "class_programs", where("class_id", "==", classId))
  const programs = rawPrograms
    .filter((row: any) => !schoolId || row.school_id === schoolId)
    .map((row: any) => ({
      id: row.id,
      classId: typeof row.class_id === "string" ? row.class_id : classId,
      schoolId: typeof row.school_id === "string" ? row.school_id : null,
      dateKey: normalizeProgramDateKey(typeof row.date_key === "string" ? row.date_key : ""),
      title: typeof row.title === "string" ? row.title : "",
      majorPoints: typeof row.major_points === "string" ? row.major_points : "",
      notes: typeof row.notes === "string" ? row.notes : "",
      assignmentIds: normalizeStringArray(row.assignment_ids),
      documentIds: normalizeStringArray(row.document_ids),
      quickLinks: normalizeProgramQuickLinks(row.quick_links),
      createdAt: toISOString(row.created_at),
      updatedAt: toISOString(row.updated_at),
    }))
    .filter((row: TeacherClassProgramRow) => !!row.dateKey)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))

  let assignments = await queryDocs(db, "assignments", where("class_id", "==", classId))
  if (schoolId) assignments = assignments.filter((row: any) => row.school_id === schoolId)
  assignments.sort((left: any, right: any) => {
    const leftDueAt = toDate(left.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightDueAt = toDate(right.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (leftDueAt !== rightDueAt) return leftDueAt - rightDueAt
    const leftTitle = typeof left.title === "string" ? left.title : ""
    const rightTitle = typeof right.title === "string" ? right.title : ""
    return leftTitle.localeCompare(rightTitle, "fr")
  })

  const assignmentRows = assignments.map((assignment: any) => ({
    id: assignment.id,
    title: typeof assignment.title === "string" ? assignment.title : "Devoir",
    type: normalizeAssignmentType(assignment.type),
    dueAt: toISOString(assignment.due_at),
    isPublished: !!assignment.is_published,
  }))

  let shares = await queryDocs(db, "document_shares", where("class_id", "==", classId))
  if (schoolId) shares = shares.filter((row: any) => row.school_id === schoolId)

  const documentIds = Array.from(
    new Set(
      shares
        .map((share: any) => (typeof share.document_id === "string" ? share.document_id : ""))
        .filter(Boolean),
    ),
  )

  let documents: any[] = []
  for (const batch of batchIds(documentIds)) {
    if (!batch.length) continue
    const rows = await queryDocs(db, "documents", where("__name__", "in", batch))
    documents.push(...rows)
  }

  const docById = new Map(documents.map((docRow: any) => [docRow.id, docRow]))
  const documentRows = documentIds
    .map((documentId) => {
      const docRow = docById.get(documentId)
      if (!docRow) return null
      const share = shares.find((row: any) => row.document_id === documentId)
      return {
        id: documentId,
        name: typeof docRow.name === "string" ? docRow.name : "Document",
        filePath: typeof docRow.file_path === "string" ? docRow.file_path : "",
        sharedAt: toISOString(share?.created_at),
      }
    })
    .filter((row): row is { id: string; name: string; filePath: string; sharedAt: string | null } => !!row)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))

  return {
    programs,
    assignments: assignmentRows,
    documents: documentRows,
  }
}

export async function createTeacherClassProgram(
  db: Firestore,
  input: {
    classId: string
    schoolId?: string | null
    teacherId: string
    dateKey: string
    title: string
    majorPoints?: string
    notes?: string
    assignmentIds?: string[]
    documentIds?: string[]
    quickLinks?: TeacherClassProgramQuickLinkKey[]
  },
) {
  const dateKey = normalizeProgramDateKey(input.dateKey)
  if (!dateKey) throw new Error("Date du programme invalide.")

  const title = (input.title || "").trim()
  if (!title) throw new Error("Le titre du programme est obligatoire.")

  const assignmentIds = normalizeStringArray(input.assignmentIds)
  const documentIds = normalizeStringArray(input.documentIds)
  const quickLinks = normalizeProgramQuickLinks(input.quickLinks)

  const existing = await queryDocs(db, "class_programs", where("class_id", "==", input.classId))
  const hasSameDate = existing.some((row: any) => normalizeProgramDateKey(typeof row.date_key === "string" ? row.date_key : "") === dateKey)

  if (hasSameDate) {
    throw new Error("Un programme existe déjà pour cette classe à cette date.")
  }

  const docRef = await addDoc(collection(db, "class_programs"), {
    class_id: input.classId,
    school_id: input.schoolId || null,
    teacher_id: input.teacherId,
    date_key: dateKey,
    title,
    major_points: (input.majorPoints || "").trim(),
    notes: (input.notes || "").trim(),
    assignment_ids: assignmentIds,
    document_ids: documentIds,
    quick_links: quickLinks,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  })

  return docRef.id
}

export async function updateTeacherClassProgram(
  db: Firestore,
  programId: string,
  input: {
    dateKey: string
    title: string
    majorPoints?: string
    notes?: string
    assignmentIds?: string[]
    documentIds?: string[]
    quickLinks?: TeacherClassProgramQuickLinkKey[]
  },
) {
  const dateKey = normalizeProgramDateKey(input.dateKey)
  if (!dateKey) throw new Error("Date du programme invalide.")

  const title = (input.title || "").trim()
  if (!title) throw new Error("Le titre du programme est obligatoire.")

  const currentSnap = await getDoc(doc(db, "class_programs", programId))
  if (!currentSnap.exists()) {
    throw new Error("Programme introuvable.")
  }

  const currentProgram = currentSnap.data() as any
  const classId = typeof currentProgram.class_id === "string" ? currentProgram.class_id : ""

  if (classId) {
    const sameClassRows = await queryDocs(db, "class_programs", where("class_id", "==", classId))
    const duplicate = sameClassRows.some((row: any) => {
      if (row.id === programId) return false
      return normalizeProgramDateKey(typeof row.date_key === "string" ? row.date_key : "") === dateKey
    })

    if (duplicate) {
      throw new Error("Un autre programme existe déjà à cette date pour cette classe.")
    }
  }

  await updateDoc(doc(db, "class_programs", programId), {
    date_key: dateKey,
    title,
    major_points: (input.majorPoints || "").trim(),
    notes: (input.notes || "").trim(),
    assignment_ids: normalizeStringArray(input.assignmentIds),
    document_ids: normalizeStringArray(input.documentIds),
    quick_links: normalizeProgramQuickLinks(input.quickLinks),
    updated_at: serverTimestamp(),
  })
}

export async function deleteTeacherClassProgram(db: Firestore, programId: string) {
  await deleteDoc(doc(db, "class_programs", programId))
}

export async function fetchTeacherCourseExercisesData(
  db: Firestore,
  userId: string,
  schoolId: string | null,
  classId?: string | null,
) {
  let classConstraints: any[] = [
    where("teacher_id", "==", userId),
    where("archived_at", "==", null),
  ]

  if (schoolId) classConstraints.push(where("school_id", "==", schoolId))
  else classConstraints.push(where("school_id", "==", null))

  if (classId) classConstraints.push(where("__name__", "==", classId))

  const classes = await queryDocs(db, "classes", ...classConstraints)
  const classIds = classes.map((classRow: any) => classRow.id)

  if (!classIds.length) {
    return {
      items: [] as any[],
      classes: [] as any[],
    }
  }

  const classNameById = new Map(classes.map((classRow: any) => [classRow.id, classRow.name]))

  let enrollments: any[] = []
  for (const batch of batchIds(classIds)) {
    const rows = await queryDocs(
      db,
      "class_enrollments",
      where("class_id", "in", batch),
      where("status", "==", "active"),
    )
    enrollments.push(...rows)
  }

  const defaultClassByStudent = new Map<string, string>()
  for (const enrollment of enrollments) {
    const studentId = typeof enrollment.student_id === "string" ? enrollment.student_id : ""
    const enrolledClassId = typeof enrollment.class_id === "string" ? enrollment.class_id : ""
    if (!studentId || !enrolledClassId || !classNameById.has(enrolledClassId)) continue
    if (!defaultClassByStudent.has(studentId)) {
      defaultClassByStudent.set(studentId, enrolledClassId)
    }
  }

  const enrollmentStudentIds = Array.from(defaultClassByStudent.keys())

  let personalizedRows: any[] = []
  for (const batch of batchIds(classIds)) {
    const rows = await queryDocs(db, "personalized_exercises", where("class_id", "in", batch))
    personalizedRows.push(...rows)
  }

  if (enrollmentStudentIds.length) {
    for (const batch of batchIds(enrollmentStudentIds)) {
      const rows = await queryDocs(db, "personalized_exercises", where("student_id", "in", batch))
      personalizedRows.push(...rows)
    }
  }

  const dedupedPersonalized = Array.from(
    new Map(personalizedRows.map((row: any) => [row.id, row])).values(),
  )

  const courseRows = dedupedPersonalized.filter((row: any) => {
    const sourceKind = typeof row.source_kind === "string" ? row.source_kind.trim().toLowerCase() : ""
    const sourceDocumentId = typeof row.source_document_id === "string" ? row.source_document_id.trim() : ""
    const topicKey = parseCourseTopic(row.source_topic)

    const isCourseRow = sourceKind === "course_document" || !!sourceDocumentId || !!topicKey
    if (!isCourseRow) return false

    const studentId = typeof row.student_id === "string" ? row.student_id : ""
    const rowClassId = typeof row.class_id === "string" ? row.class_id : ""

    if (rowClassId && classNameById.has(rowClassId)) {
      return true
    }

    if (studentId && defaultClassByStudent.has(studentId)) {
      return true
    }

    return false
  })

  if (!courseRows.length) {
    return {
      items: [] as any[],
      classes: classes.map((classRow: any) => ({ id: classRow.id, name: classRow.name })),
    }
  }

  const studentIds = Array.from(
    new Set(
      courseRows
        .map((row: any) => (typeof row.student_id === "string" ? row.student_id : ""))
        .filter(Boolean),
    ),
  )

  const profileByStudentId = new Map<string, any>()
  for (const studentId of studentIds) {
    const profileSnap = await getDoc(doc(db, "profiles", studentId))
    if (profileSnap.exists()) {
      profileByStudentId.set(studentId, profileSnap.data())
    }
  }

  const sourceDocumentIds = Array.from(
    new Set(
      courseRows
        .map((row: any) => (typeof row.source_document_id === "string" ? row.source_document_id.trim() : ""))
        .filter(Boolean),
    ),
  )

  const documentNameById = new Map<string, string>()
  if (sourceDocumentIds.length) {
    for (const batch of batchIds(sourceDocumentIds)) {
      const docs = await queryDocs(db, "documents", where("__name__", "in", batch))
      for (const row of docs) {
        const name = typeof row.name === "string" ? row.name : "Document"
        documentNameById.set(row.id, name)
      }
    }
  }

  const courseExerciseIds = new Set(courseRows.map((row: any) => row.id))

  const needsCompletionFallback = courseRows.some((row: any) => {
    const hasResponseText = typeof row.response_text === "string" && row.response_text.trim().length > 0
    const hasResponseAnswers = Object.keys(parseCourseExerciseAnswers(row.response_answers)).length > 0
    return !hasResponseText && !hasResponseAnswers
  })

  let completionEvents: any[] = []
  if (needsCompletionFallback) {
    for (const batch of batchIds(classIds)) {
      const rows = await queryDocs(db, "activity_events", where("class_id", "in", batch))
      completionEvents.push(...rows)
    }

    if (studentIds.length) {
      for (const batch of batchIds(studentIds)) {
        const rows = await queryDocs(db, "activity_events", where("actor_id", "in", batch))
        completionEvents.push(...rows)
      }
    }
  }

  completionEvents = Array.from(new Map(completionEvents.map((event: any) => [event.id, event])).values())

  const completionByExerciseId = new Map<string, {
    responseText: string
    submittedAt: string | null
    responseAnswers: CourseExerciseAnswersPayload
  }>()

  const sortedCompletionEvents = completionEvents
    .filter((event: any) => event.event_type === "completion")
    .sort((left: any, right: any) => {
      const leftDate = toDate(left.created_at)?.getTime() || 0
      const rightDate = toDate(right.created_at)?.getTime() || 0
      return rightDate - leftDate
    })

  for (const event of sortedCompletionEvents) {
    if (schoolId && typeof event.school_id === "string" && event.school_id !== schoolId) continue

    const payload = event.payload && typeof event.payload === "object" ? event.payload : null
    const payloadKind = typeof payload?.kind === "string" ? payload.kind : ""
    const isCourseCompletion = payloadKind === "course_exercise_completion"
      || payloadKind === "personalized_exercise_completion"
    if (!payload || !isCourseCompletion) continue

    const exerciseId = typeof payload.exercise_id === "string" ? payload.exercise_id : ""
    if (!courseExerciseIds.has(exerciseId)) continue
    if (!exerciseId || completionByExerciseId.has(exerciseId)) continue

    completionByExerciseId.set(exerciseId, {
      responseText: typeof payload.response === "string" ? payload.response : "",
      submittedAt: typeof payload.submitted_at === "string" ? payload.submitted_at : toISOString(event.created_at),
      responseAnswers: parseCourseExerciseAnswers(payload.answers),
    })
  }

  const items = courseRows
    .map((exercise: any) => {
      const completion = completionByExerciseId.get(exercise.id)
      const storedResponseText = typeof exercise.response_text === "string" ? exercise.response_text : ""
      const storedResponseAnswers = parseCourseExerciseAnswers(exercise.response_answers)
      const completionAnswers = completion?.responseAnswers || {}
      const responseAnswers = Object.keys(completionAnswers).length ? completionAnswers : storedResponseAnswers
      const responseText = completion?.responseText || storedResponseText
      const responseSubmittedAt = completion?.submittedAt
        || toISOString(exercise.response_submitted_at)
        || toISOString(exercise.completed_at)
        || null
      const submittedAtRaw = responseSubmittedAt
        || toISOString(exercise.completed_at)
        || toISOString(exercise.updated_at)
        || toISOString(exercise.created_at)
        || null

      const isCompleted = !!exercise.is_completed || !!completion || !!responseSubmittedAt
      const teacherFeedback = typeof exercise.teacher_feedback === "string" ? exercise.teacher_feedback.trim() : ""
      const teacherFeedbackAt = toISOString(exercise.teacher_feedback_at)
      const teacherQuestionFeedback = parseCourseExerciseQuestionReviews(exercise.teacher_question_feedback)
      const hasTeacherQuestionFeedback = Object.keys(teacherQuestionFeedback).length > 0

      const topicKey = parseCourseTopic(exercise.source_topic)
      const materialType = parseCourseMaterialType(exercise.source_material_type)

      const studentId = typeof exercise.student_id === "string" ? exercise.student_id : ""
      const sourceDocumentId = typeof exercise.source_document_id === "string"
        ? exercise.source_document_id
        : null
      const sourceDocumentNameRaw = typeof exercise.source_document_name === "string"
        ? exercise.source_document_name.trim()
        : ""
      const sourceDocumentName = sourceDocumentNameRaw
        || (sourceDocumentId ? documentNameById.get(sourceDocumentId) || null : null)

      const rawClassId = typeof exercise.class_id === "string" ? exercise.class_id : ""
      const resolvedClassId = rawClassId && classNameById.has(rawClassId)
        ? rawClassId
        : defaultClassByStudent.get(studentId) || null

      if (!resolvedClassId) return null
      if (classId && resolvedClassId !== classId) return null

      return {
        id: exercise.id,
        classId: resolvedClassId,
        schoolId: exercise.school_id || schoolId,
        studentId,
        student: profileByStudentId.get(studentId)?.full_name || "Élève",
        className: classNameById.get(resolvedClassId) || "Classe",
        title: typeof exercise.title === "string" ? exercise.title : "Exercice de cours",
        submitted: submittedAtRaw ? toLocaleDateFR(submittedAtRaw) : "-",
        submittedAtRaw,
        status: teacherFeedback || hasTeacherQuestionFeedback ? "Graded" : "Pending",
        statusRaw: teacherFeedback || hasTeacherQuestionFeedback ? "graded" : "submitted",
        level: upLevel(exercise.cefr_level),
        type: normalizeAssignmentType(exercise.exercise_type),
        instructions: typeof exercise.instructions === "string" ? exercise.instructions : "",
        responseText,
        responseAnswers,
        questions: parseCourseExerciseQuestions(exercise.questions),
        sourceDocumentId,
        sourceDocumentName,
        topicKey,
        topicLabel: topicKey ? courseTopicLabel(topicKey) : null,
        materialType,
        materialLabel: materialType ? courseMaterialTypeLabel(materialType) : null,
        teacherFeedback,
        teacherFeedbackAt,
        teacherQuestionFeedback,
        isCompleted,
      }
    })
    .filter((item: any) => !!item)
    .filter((item: any) => item.isCompleted || !!item.teacherFeedback || Object.keys(item.teacherQuestionFeedback || {}).length > 0)

  items.sort((left: any, right: any) => {
    if (left.status !== right.status) {
      return left.status === "Pending" ? -1 : 1
    }

    const leftDate = left.submittedAtRaw ? new Date(left.submittedAtRaw).getTime() : 0
    const rightDate = right.submittedAtRaw ? new Date(right.submittedAtRaw).getTime() : 0
    if (leftDate !== rightDate) return rightDate - leftDate

    return String(left.student || "").localeCompare(String(right.student || ""), "fr")
  })

  return {
    items,
    classes: classes.map((classRow: any) => ({ id: classRow.id, name: classRow.name })),
  }
}

export async function fetchTeacherDocumentsData(db: Firestore, userId: string, schoolId: string | null) {
  const classes = schoolId
    ? await queryDocs(db, "classes", where("teacher_id", "==", userId), where("school_id", "==", schoolId), where("archived_at", "==", null), orderBy("name", "asc"))
    : []

  const docs = schoolId
    ? await queryDocs(db, "documents", where("owner_id", "==", userId), where("school_id", "==", schoolId), orderBy("created_at", "desc"))
    : await queryDocs(db, "documents", where("owner_id", "==", userId), where("school_id", "==", null), orderBy("created_at", "desc"))

  const documentIds = docs.map((d: any) => d.id)
  let shares: any[] = []
  if (schoolId && documentIds.length) {
    for (const batch of batchIds(documentIds)) {
      const s = await queryDocs(db, "document_shares", where("school_id", "==", schoolId), where("document_id", "in", batch))
      shares.push(...s)
    }
  }

  const classNameById = new Map(classes.map((c: any) => [c.id, c.name]))
  const sharedByDocument = new Map<string, Array<{ id: string; name: string }>>()

  for (const share of shares) {
    const className = classNameById.get(share.class_id)
    if (!className) continue
    const arr = sharedByDocument.get(share.document_id) || []
    arr.push({ id: share.class_id, name: className })
    sharedByDocument.set(share.document_id, arr)
  }

  return {
    classes: classes.map((c: any) => ({ id: c.id, name: c.name })),
    documents: docs.map((d: any) => {
      const shared = sharedByDocument.get(d.id) || []
      const topicKey = parseCourseTopic(d.course_topic)
      const materialType = parseCourseMaterialType(d.course_material_type)
      const visibilityMode = parseDocumentVisibilityMode(d.visibility_mode)

      const shareClassIds = shared.map((s) => s.id)
      const explicitTargetClassIds = Array.isArray(d.target_class_ids)
        ? Array.from(
            new Set(
              d.target_class_ids
                .filter((value: unknown) => typeof value === "string")
                .map((value: string) => value.trim())
                .filter(Boolean),
            ),
          )
        : []

      const targetClassIds = explicitTargetClassIds.length ? explicitTargetClassIds : shareClassIds
      const targetClassNames = targetClassIds
        .map((classId) => classNameById.get(classId))
        .filter((value): value is string => !!value)

      return {
        id: d.id,
        name: d.name,
        filePath: typeof d.file_path === "string" ? d.file_path : "",
        type: toFileType(d.mime_type),
        size: toFileSize(d.size_bytes),
        date: toLocaleDateFR(d.created_at),
        topicKey,
        topicLabel: topicKey ? courseTopicLabel(topicKey) : "Ressource hors topic",
        materialType,
        materialLabel: materialType ? courseMaterialTypeLabel(materialType) : "Non classé",
        isTextOnly: !(typeof d.file_path === "string" && d.file_path.trim().length > 0),
        sourceText: typeof d.course_source_text === "string" ? d.course_source_text : "",
        hasSourceText:
          typeof d.course_source_text === "string"
          && d.course_source_text.trim().length > 0,
        visibilityMode,
        targetClassIds,
        targetClassNames,
        sharedClassIds: shareClassIds,
        sharedClassNames: shared.map((s) => s.name),
      }
    }),
  }
}

export async function fetchStudentDocumentsData(db: Firestore, userId: string, schoolId: string | null) {
  const enrollments = await queryDocs(db, "class_enrollments", where("student_id", "==", userId), where("status", "==", "active"))
  const enrolledClassIds = enrollments.map((e: any) => e.class_id)
  if (!enrolledClassIds.length) return [] as any[]

  let classes: any[] = []
  for (const batch of batchIds(enrolledClassIds)) {
    const constraints: any[] = [where("__name__", "in", batch), where("archived_at", "==", null)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const c = await queryDocs(db, "classes", ...constraints)
    classes.push(...c)
  }

  const classIds = classes.map((c: any) => c.id)
  if (!classIds.length) return [] as any[]

  let classShares: any[] = []
  for (const batch of batchIds(classIds)) {
    const constraints: any[] = [where("class_id", "in", batch)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const s = await queryDocs(db, "document_shares", ...constraints)
    classShares.push(...s)
  }

  let assignments: any[] = []
  for (const batch of batchIds(classIds)) {
    const constraints: any[] = [where("class_id", "in", batch)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const a = await queryDocs(db, "assignments", ...constraints)
    assignments.push(...a)
  }

  const assignmentIds = assignments.map((a: any) => a.id)
  let assignmentShares: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      const constraints: any[] = [where("assignment_id", "in", batch)]
      if (schoolId) constraints.push(where("school_id", "==", schoolId))
      const s = await queryDocs(db, "document_shares", ...constraints)
      assignmentShares.push(...s)
    }
  }

  const shares = [...classShares, ...assignmentShares]
  const documentIds = Array.from(new Set(shares.map((s: any) => s.document_id)))
  if (!documentIds.length) return [] as any[]

  let docs: any[] = []
  for (const batch of batchIds(documentIds)) {
    const d = await queryDocs(db, "documents", where("__name__", "in", batch))
    docs.push(...d)
  }

  docs = docs.filter((d: any) => parseDocumentVisibilityMode(d.visibility_mode) !== "internal_teacher")

  docs.sort((a: any, b: any) => {
    const da = toDate(a.created_at)?.getTime() || 0
    const db2 = toDate(b.created_at)?.getTime() || 0
    return db2 - da
  })

  const classNameById = new Map(classes.map((c: any) => [c.id, c.name]))
  const assignmentTitleById = new Map(assignments.map((a: any) => [a.id, a.title]))
  const classNamesByDocument = new Map<string, string[]>()
  const assignmentTitlesByDocument = new Map<string, string[]>()
  const lastSharedAtByDocument = new Map<string, string>()

  for (const share of shares) {
    const className = classNameById.get(share.class_id)
    if (className) {
      const names = classNamesByDocument.get(share.document_id) || []
      if (!names.includes(className)) names.push(className)
      classNamesByDocument.set(share.document_id, names)
    }

    const createdAt = toISOString(share.created_at)
    if (createdAt) {
      const previous = lastSharedAtByDocument.get(share.document_id)
      if (!previous || new Date(createdAt) > new Date(previous)) {
        lastSharedAtByDocument.set(share.document_id, createdAt)
      }
    }

    if (share.assignment_id) {
      const assignmentTitle = assignmentTitleById.get(share.assignment_id)
      if (assignmentTitle) {
        const titles = assignmentTitlesByDocument.get(share.document_id) || []
        if (!titles.includes(assignmentTitle)) titles.push(assignmentTitle)
        assignmentTitlesByDocument.set(share.document_id, titles)
      }
    }
  }

  return docs.map((d: any) => {
    const topicKey = parseCourseTopic(d.course_topic)
    const materialType = parseCourseMaterialType(d.course_material_type)

    return {
      id: d.id,
      name: d.name,
      filePath: d.file_path,
      type: toFileType(d.mime_type),
      size: toFileSize(d.size_bytes),
      date: toLocaleDateFR(d.created_at),
      sharedAt: lastSharedAtByDocument.get(d.id)
        ? new Date(lastSharedAtByDocument.get(d.id)!).toLocaleDateString("fr-FR")
        : toLocaleDateFR(d.created_at),
      sharedClassNames: classNamesByDocument.get(d.id) || [],
      sharedAssignmentTitles: assignmentTitlesByDocument.get(d.id) || [],
      topicKey,
      topicLabel: topicKey ? courseTopicLabel(topicKey) : "Ressource hors topic",
      materialType,
      materialLabel: materialType ? courseMaterialTypeLabel(materialType) : "Non classé",
    }
  })
}

export async function fetchStudentGrammarLessonsData(db: Firestore, userId: string, schoolId: string | null) {
  const enrollments = await queryDocs(
    db,
    "class_enrollments",
    where("student_id", "==", userId),
    where("status", "==", "active"),
  )

  const enrolledClassIds = enrollments
    .map((enrollment: any) => (typeof enrollment.class_id === "string" ? enrollment.class_id : ""))
    .filter(Boolean)

  if (!enrolledClassIds.length) return [] as any[]

  let classes: any[] = []
  for (const batch of batchIds(enrolledClassIds)) {
    const constraints: any[] = [where("__name__", "in", batch), where("archived_at", "==", null)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const rows = await queryDocs(db, "classes", ...constraints)
    classes.push(...rows)
  }

  const classIds = classes.map((classRow: any) => classRow.id)
  if (!classIds.length) return [] as any[]

  const classIdSet = new Set(classIds)
  const classNameById = new Map(classes.map((classRow: any) => [classRow.id, classRow.name]))

  let classShares: any[] = []
  for (const batch of batchIds(classIds)) {
    const constraints: any[] = [where("class_id", "in", batch)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const rows = await queryDocs(db, "document_shares", ...constraints)
    classShares.push(...rows)
  }

  const sharedClassNamesByDocument = new Map<string, string[]>()
  const sharedClassIdsByDocument = new Map<string, string[]>()

  for (const share of classShares) {
    const documentId = typeof share.document_id === "string" ? share.document_id : ""
    const classId = typeof share.class_id === "string" ? share.class_id : ""
    if (!documentId || !classId) continue

    const className = classNameById.get(classId)
    if (!className) continue

    const classNames = sharedClassNamesByDocument.get(documentId) || []
    if (!classNames.includes(className)) {
      classNames.push(className)
      sharedClassNamesByDocument.set(documentId, classNames)
    }

    const classIdsForDoc = sharedClassIdsByDocument.get(documentId) || []
    if (!classIdsForDoc.includes(classId)) {
      classIdsForDoc.push(classId)
      sharedClassIdsByDocument.set(documentId, classIdsForDoc)
    }
  }

  const sharedDocumentIds = Array.from(new Set(classShares.map((share: any) => share.document_id).filter(Boolean)))

  let sharedDocs: any[] = []
  for (const batch of batchIds(sharedDocumentIds)) {
    if (!batch.length) continue
    const rows = await queryDocs(db, "documents", where("__name__", "in", batch))
    sharedDocs.push(...rows)
  }

  let internalDocs: any[] = []
  try {
    const buildConstraints = (materialType: "grammar" | "conjugation") => {
      const constraints: any[] = [
        where("course_material_type", "==", materialType),
        where("visibility_mode", "==", "internal_teacher"),
      ]
      if (schoolId) constraints.push(where("school_id", "==", schoolId))
      else constraints.push(where("school_id", "==", null))
      return constraints
    }

    const [grammarRows, conjugationRows] = await Promise.all([
      queryDocs(db, "documents", ...buildConstraints("grammar")),
      queryDocs(db, "documents", ...buildConstraints("conjugation")),
    ])

    const rows = [...grammarRows, ...conjugationRows]

    internalDocs = rows.filter((row: any) => {
      const targetClassIds = Array.isArray(row.target_class_ids)
        ? row.target_class_ids
            .filter((value: unknown): value is string => typeof value === "string")
            .map((value: string) => value.trim())
            .filter(Boolean)
        : []
      return targetClassIds.some((classId: string) => classIdSet.has(classId))
    })
  } catch {
    internalDocs = []
  }

  const byId = new Map<string, any>()
  for (const row of sharedDocs) {
    byId.set(row.id, row)
  }
  for (const row of internalDocs) {
    byId.set(row.id, row)
  }

  const rows = Array.from(byId.values())
    .filter((row: any) => {
      const materialType = parseCourseMaterialType(row.course_material_type)
      return materialType === "grammar" || materialType === "conjugation"
    })
    .map((row: any) => {
      const visibilityMode = parseDocumentVisibilityMode(row.visibility_mode)
      const explicitTargetClassIds: string[] = Array.isArray(row.target_class_ids)
        ? Array.from(
            new Set(
              row.target_class_ids
                .filter((value: unknown): value is string => typeof value === "string")
                .map((value: string) => value.trim())
                .filter(Boolean),
            ),
          )
        : []

      const fallbackSharedIds = sharedClassIdsByDocument.get(row.id) || []
      const targetClassIds = explicitTargetClassIds.length ? explicitTargetClassIds : fallbackSharedIds
      const targetClassNames = targetClassIds
        .map((classId: string) => classNameById.get(classId))
        .filter((value): value is string => !!value)

      const topicKey = parseCourseTopic(row.course_topic)

      return {
        id: row.id,
        name: row.name,
        filePath: typeof row.file_path === "string" ? row.file_path : "",
        type: toFileType(row.mime_type),
        size: toFileSize(row.size_bytes),
        date: toLocaleDateFR(row.created_at),
        sourceText: typeof row.course_source_text === "string" ? row.course_source_text : "",
        visibilityMode,
        topicKey,
        topicLabel: topicKey ? courseTopicLabel(topicKey) : "Ressource hors topic",
        targetClassNames,
        sharedClassNames: sharedClassNamesByDocument.get(row.id) || [],
        createdAtIso: toISOString(row.created_at),
      }
    })

  rows.sort((left: any, right: any) => {
    const leftDate = Date.parse(left.createdAtIso || "") || 0
    const rightDate = Date.parse(right.createdAtIso || "") || 0
    return rightDate - leftDate
  })

  return rows.map(({ createdAtIso, ...rest }: any) => rest)
}

export async function fetchTeacherActivityData(db: Firestore, userId: string, schoolId: string | null) {
  const constraints = schoolId
    ? [where("school_id", "==", schoolId), orderBy("created_at", "desc"), limit(20)]
    : [where("actor_id", "==", userId), where("school_id", "==", null), orderBy("created_at", "desc"), limit(20)]

  const data = await queryDocs(db, "activity_events", ...constraints)

  // Fetch actor profiles
  const actorIds = Array.from(new Set(data.map((e: any) => e.actor_id)))
  const profileMap = new Map<string, any>()
  for (const aid of actorIds) {
    const profileSnap = await getDoc(doc(db, "profiles", aid))
    if (profileSnap.exists()) profileMap.set(aid, profileSnap.data())
  }

  return data.map((e: any) => ({
    text: e.payload?.text || `${profileMap.get(e.actor_id)?.full_name || "Quelqu'un"} ${(e.event_type || "").replaceAll("_", " ")}`,
    time: toDate(e.created_at)?.toLocaleString("fr-FR") || "-",
    type: e.event_type,
  }))
}

export async function fetchStudentDashboardData(db: Firestore, userId: string, schoolId: string | null) {
  const safeQueryDocs = async (collectionName: string, ...constraints: any[]) => {
    try {
      return await queryDocs(db, collectionName, ...constraints)
    } catch {
      return [] as any[]
    }
  }

  const safeGetDocData = async (collectionName: string, docId: string) => {
    try {
      const documentSnap = await getDoc(doc(db, collectionName, docId))
      return documentSnap.exists() ? documentSnap.data() : null
    } catch {
      return null
    }
  }

  const enrollments = await safeQueryDocs(
    "class_enrollments",
    where("student_id", "==", userId),
    where("status", "==", "active"),
  )

  const enrolledClassIds = Array.from(
    new Set(
      enrollments
        .map((enrollment: any) => enrollment.class_id)
        .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  )

  let classes: any[] = []
  if (enrolledClassIds.length) {
    for (const batch of batchIds(enrolledClassIds)) {
      const rows = await safeQueryDocs("classes", where("__name__", "in", batch))
      classes.push(
        ...rows.filter((row: any) => {
          if (row.archived_at) return false
          if (schoolId && row.school_id !== schoolId) return false
          return true
        }),
      )
    }
  }

  const activeClassIds = classes.map((classRow: any) => classRow.id)

  let assignments: any[] = []
  if (activeClassIds.length) {
    for (const batch of batchIds(activeClassIds)) {
      const rows = await safeQueryDocs("assignments", where("class_id", "in", batch))
      assignments.push(...rows)
    }
  }

  assignments = assignments
    .filter((assignment: any) => !schoolId || assignment.school_id === schoolId)
    .sort((left: any, right: any) => {
      const leftDate = toDate(left.due_at)?.getTime() || Number.MAX_SAFE_INTEGER
      const rightDate = toDate(right.due_at)?.getTime() || Number.MAX_SAFE_INTEGER
      return leftDate - rightDate
    })

  const assignmentIds = assignments.map((assignment: any) => assignment.id)

  let submissions: any[] = []
  if (assignmentIds.length) {
    const assignmentIdSet = new Set(assignmentIds)
    const allStudentSubmissions = await safeQueryDocs("submissions", where("student_id", "==", userId))
    submissions = allStudentSubmissions.filter((row: any) => assignmentIdSet.has(row.assignment_id))
  }

  const submissionByAssignmentId = new Map<string, any>()
  for (const submission of submissions) {
    submissionByAssignmentId.set(submission.assignment_id, submission)
  }

  let assignmentShares: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      const rows = await safeQueryDocs("document_shares", where("assignment_id", "in", batch))
      assignmentShares.push(...rows)
    }

    if (schoolId) {
      assignmentShares = assignmentShares.filter((row: any) => row.school_id === schoolId)
    }
  }

  const assignmentIdsWithDocuments = new Set(
    assignmentShares
      .map((share: any) => share.assignment_id)
      .filter((value: unknown): value is string => typeof value === "string"),
  )

  const pendingAssignments = assignments.filter((assignment: any) => {
    const submission = submissionByAssignmentId.get(assignment.id)
    return !submission || submission.status !== "graded"
  })

  const assignmentTab = (type: string) => {
    const key = (type || "").toLowerCase()
    if (key === "reading") return "reading"
    if (key === "writing" || key === "project") return "writing"
    return "quiz"
  }

  let personalized = await safeQueryDocs("personalized_exercises", where("student_id", "==", userId))
  if (schoolId) {
    personalized = personalized.filter((row: any) => row.school_id === schoolId)
  }
  personalized.sort((left: any, right: any) => {
    const leftDate = toDate(left.created_at)?.getTime() || 0
    const rightDate = toDate(right.created_at)?.getTime() || 0
    return rightDate - leftDate
  })

  const isCourseExercise = (row: any) => {
    const sourceKind = typeof row.source_kind === "string" ? row.source_kind.trim().toLowerCase() : ""
    if (sourceKind === "course_document") return true
    if (typeof row.source_document_id === "string" && row.source_document_id.trim().length > 0) return true
    if (typeof row.source_topic === "string" && row.source_topic.trim().length > 0) return true
    return false
  }

  const courseExercises = personalized.filter((row: any) => isCourseExercise(row))
  const remediationExercises = personalized.filter((row: any) => !isCourseExercise(row))

  const pendingCourseExercises = courseExercises.filter((row: any) => !row.is_completed)
  const pendingRemediationExercises = remediationExercises.filter((row: any) => !row.is_completed)

  const topicProgressMap = new Map<string, { topicLabel: string; completed: number; total: number }>()
  for (const topic of COURSE_TOPIC_OPTIONS) {
    topicProgressMap.set(topic.value, {
      topicLabel: topic.label,
      completed: 0,
      total: 0,
    })
  }
  topicProgressMap.set("other", {
    topicLabel: "Autres",
    completed: 0,
    total: 0,
  })

  for (const exercise of courseExercises) {
    const topicKey = parseCourseTopic(exercise.source_topic) || "other"
    const row = topicProgressMap.get(topicKey) || {
      topicLabel: "Autres",
      completed: 0,
      total: 0,
    }
    row.total += 1
    if (exercise.is_completed) {
      row.completed += 1
    }
    topicProgressMap.set(topicKey, row)
  }

  const moduleProgress = Array.from(topicProgressMap.entries())
    .map(([topicKey, row]) => ({
      topicKey,
      topicLabel: row.topicLabel,
      completed: row.completed,
      total: row.total,
      pending: Math.max(0, row.total - row.completed),
    }))
    .filter((row) => row.total > 0)

  const progressRow = await safeGetDocData("flashcard_progress", userId)
  const fallbackLevel = "B1"

  const adaptiveMastery = {
    levels: {
      vocabulary: typeof progressRow?.levels?.vocabulary === "string"
        ? progressRow.levels.vocabulary.toUpperCase()
        : fallbackLevel,
      grammar: typeof progressRow?.levels?.grammar === "string"
        ? progressRow.levels.grammar.toUpperCase()
        : fallbackLevel,
      tense: typeof progressRow?.levels?.tense === "string"
        ? progressRow.levels.tense.toUpperCase()
        : fallbackLevel,
    },
    streaks: {
      vocabulary: typeof progressRow?.streaks?.vocabulary === "number" ? progressRow.streaks.vocabulary : 0,
      grammar: typeof progressRow?.streaks?.grammar === "number" ? progressRow.streaks.grammar : 0,
      tense: typeof progressRow?.streaks?.tense === "number" ? progressRow.streaks.tense : 0,
    },
    deckCount: 0,
  }

  const learningFlashcards = await safeQueryDocs(
    "flashcards",
    where("student_id", "==", userId),
  )

  adaptiveMastery.deckCount = learningFlashcards
    .filter((row: any) => row.status === "learning" && row.source_kind === "adaptive_level")
    .slice(0, 100)
    .length

  const history = (await safeQueryDocs("score_history", where("user_id", "==", userId)))
    .sort((left: any, right: any) => {
      const leftDate = toDate(left.month_date)?.getTime() || 0
      const rightDate = toDate(right.month_date)?.getTime() || 0
      return rightDate - leftDate
    })
    .slice(0, 2)

  const xp = await safeQueryDocs("user_xp_events", where("user_id", "==", userId))
  const badges = await safeQueryDocs("user_badges", where("user_id", "==", userId))

  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - 7)
  const weekXp = xp
    .filter((row: any) => {
      const date = toDate(row.created_at)
      return date && date >= thisWeekStart
    })
    .reduce((sum: number, row: any) => sum + (row.points || 0), 0)

  const skillRows = await safeQueryDocs("student_skill_scores", where("user_id", "==", userId))
  skillRows.sort((left: any, right: any) => {
    const leftDate = toDate(left.as_of_date)?.getTime() || 0
    const rightDate = toDate(right.as_of_date)?.getTime() || 0
    return rightDate - leftDate
  })

  const skillIds = Array.from(new Set(skillRows.map((row: any) => row.skill_id)))
  const skillMap = new Map<string, any>()
  for (const skillId of skillIds) {
    const skillData = await safeGetDocData("skills", skillId)
    if (skillData) skillMap.set(skillId, skillData)
  }

  const uniqueSkills = new Map<string, any>()
  for (const row of skillRows) {
    const key = `${row.skill_id}`
    if (!uniqueSkills.has(key)) uniqueSkills.set(key, row)
  }

  const gradedSubmissions = submissions
    .filter((submission: any) => submission.status === "graded")
    .sort((left: any, right: any) => {
      const leftDate = toDate(left.graded_at)?.getTime() || 0
      const rightDate = toDate(right.graded_at)?.getTime() || 0
      return rightDate - leftDate
    })

  const assignmentById = new Map(assignments.map((assignment: any) => [assignment.id, assignment]))
  const latestGradeSubmission = gradedSubmissions[0] || null
  const latestGradeAssignment = latestGradeSubmission
    ? assignmentById.get(latestGradeSubmission.assignment_id)
    : null

  let feedbackRows = await safeQueryDocs("teacher_feedback", where("student_id", "==", userId))
  if (schoolId) {
    feedbackRows = feedbackRows.filter((row: any) => row.school_id === schoolId)
  }
  feedbackRows.sort((left: any, right: any) => {
    const leftDate = toDate(left.created_at)?.getTime() || 0
    const rightDate = toDate(right.created_at)?.getTime() || 0
    return rightDate - leftDate
  })
  feedbackRows = feedbackRows.slice(0, 1)

  let feedbackTeacherName: string | null = null
  if (feedbackRows[0]?.teacher_id) {
    const teacherData = await safeGetDocData("profiles", feedbackRows[0].teacher_id)
    feedbackTeacherName = teacherData?.full_name || null
  }

  const toDateKey = (date: Date) => date.toISOString().slice(0, 10)
  const today = new Date()
  const todayKey = toDateKey(today)
  const practiceStart = new Date(today)
  practiceStart.setDate(practiceStart.getDate() - 13)

  const practiceRows = (await safeQueryDocs("practice_daily", where("user_id", "==", userId)))
    .filter((row: any) => {
      const dateKey = typeof row.practice_date === "string" ? row.practice_date : ""
      return !!dateKey && dateKey >= toDateKey(practiceStart) && dateKey <= todayKey
    })

  const activePracticeDates = new Set(
    practiceRows
      .filter((row: any) => {
        const count = typeof row.completed_count === "number" ? row.completed_count : 0
        const status = typeof row.status === "string" ? row.status : ""
        return count > 0 || status === "partial" || status === "full"
      })
      .map((row: any) => String(row.practice_date)),
  )

  let currentStreak = 0
  for (let offset = 0; offset < 45; offset += 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - offset)
    const key = toDateKey(day)
    if (activePracticeDates.has(key)) {
      currentStreak += 1
      continue
    }
    break
  }

  const missionQueue: Array<{
    id: string
    title: string
    subtitle: string
    href: string
    urgent: boolean
    kind: "course" | "assignment" | "flashcards" | "remediation"
  }> = []

  if (pendingCourseExercises.length) {
    missionQueue.push({
      id: "course-exercises",
      title: `${pendingCourseExercises.length} exercice(s) de cours à terminer`,
      subtitle: "Poursuis les modules du thème en mélangeant compréhension, vocabulaire et structure.",
      href: "/student/course-exercises",
      urgent: pendingCourseExercises.length >= 3,
      kind: "course",
    })
  }

  for (const assignment of pendingAssignments.slice(0, 3)) {
    const dueDate = toDate(assignment.due_at)
    missionQueue.push({
      id: `assignment:${assignment.id}`,
      title: assignment.title || "Devoir",
      subtitle: dueDate
        ? `Échéance ${dueDate.toLocaleDateString("fr-FR")}${assignmentIdsWithDocuments.has(assignment.id) ? " · document joint" : ""}`
        : `Sans date limite${assignmentIdsWithDocuments.has(assignment.id) ? " · document joint" : ""}`,
      href: `/student/exercises?tab=${assignmentTab(assignment.type || "quiz")}&assignment=${assignment.id}`,
      urgent: !!dueDate && dueDate.getTime() - Date.now() < 1000 * 60 * 60 * 48,
      kind: "assignment",
    })
  }

  if (pendingRemediationExercises.length) {
    missionQueue.push({
      id: "remediation",
      title: `${pendingRemediationExercises.length} exercice(s) personnalisé(s) à finaliser`,
      subtitle: "Consolide les points de correction donnés par ton enseignant.",
      href: "/student/exercises?tab=personalized",
      urgent: pendingRemediationExercises.length >= 2,
      kind: "remediation",
    })
  }

  if (adaptiveMastery.deckCount > 0) {
    missionQueue.push({
      id: "flashcards",
      title: `${adaptiveMastery.deckCount} flashcard(s) adaptative(s) active(s)`,
      subtitle: "Fais une série pour monter de niveau sur vocabulaire, grammaire et temps.",
      href: "/student/flashcards",
      urgent: adaptiveMastery.deckCount >= 12,
      kind: "flashcards",
    })
  }

  if (!missionQueue.length) {
    missionQueue.push({
      id: "revision",
      title: "Aucune urgence - lance une session de révision",
      subtitle: "Choisis un thème, révise les documents puis enchaîne sur les flashcards.",
      href: "/student/documents",
      urgent: false,
      kind: "course",
    })
  }

  return {
    overallScore: Math.round(history[0]?.overall_score || 0),
    overallTrend: history.length > 1 ? Math.round((history[0]?.overall_score || 0) - (history[1]?.overall_score || 0)) : 0,
    xpWeek: weekXp,
    badgeCount: badges.length,
    lessonsDone: courseExercises.filter((row: any) => !!row.is_completed).length,
    missionQueue,
    moduleProgress,
    adaptiveMastery,
    feedbackLoop: {
      latestGrade: latestGradeSubmission
        ? {
            title: latestGradeAssignment?.title || "Devoir",
            score: typeof latestGradeSubmission.score === "number" ? Math.round(latestGradeSubmission.score) : 0,
            date: toLocaleDateFR(latestGradeSubmission.graded_at || latestGradeSubmission.submitted_at),
            feedback: typeof latestGradeSubmission.feedback === "string" ? latestGradeSubmission.feedback : "",
          }
        : null,
      latestTeacherFeedback: feedbackRows[0]
        ? {
            teacher: feedbackTeacherName || "Enseignant",
            date: toLocaleDateFR(feedbackRows[0].created_at),
            text: typeof feedbackRows[0].feedback === "string" ? feedbackRows[0].feedback : "",
          }
        : null,
      pendingRemediation: pendingRemediationExercises.length,
    },
    momentum: {
      activeDays14: activePracticeDates.size,
      currentStreak,
    },
    skills: Array.from(uniqueSkills.values()).slice(0, 5).map((row: any) => ({
      label: skillMap.get(row.skill_id)?.label || "Compétence",
      score: Math.round(row.score || 0),
    })),
  }
}

export async function fetchStudentProgressData(db: Firestore, userId: string) {
  const skillRows = await queryDocs(
    db,
    "student_skill_scores",
    where("user_id", "==", userId),
    orderBy("as_of_date", "desc"),
  )

  const skillIds = Array.from(new Set(skillRows.map((r: any) => r.skill_id)))
  const skillMap = new Map<string, any>()
  for (const sid of skillIds) {
    const skillSnap = await getDoc(doc(db, "skills", sid))
    if (skillSnap.exists()) skillMap.set(sid, skillSnap.data())
  }

  const seenSkills = new Set<string>()
  const skills = [] as any[]
  for (const row of skillRows) {
    const key = String(row.skill_id)
    if (seenSkills.has(key)) continue
    seenSkills.add(key)
    skills.push({
      skill: skillMap.get(row.skill_id)?.label || "Compétence",
      score: Math.round(row.score || 0),
      trend: row.trend || 0,
    })
  }

  const historyRows = await queryDocs(
    db,
    "score_history",
    where("user_id", "==", userId),
    orderBy("month_date", "asc"),
  )

  const grades = await queryDocs(
    db,
    "submissions",
    where("student_id", "==", userId),
    where("status", "==", "graded"),
    orderBy("graded_at", "desc"),
    limit(8),
  )

  // Fetch assignment info for grades
  const gradeAssignmentIds = Array.from(new Set(grades.map((g: any) => g.assignment_id)))
  const assignmentMap = new Map<string, any>()
  for (const aid of gradeAssignmentIds) {
    const assignmentSnap = await getDoc(doc(db, "assignments", aid))
    if (assignmentSnap.exists()) assignmentMap.set(aid, assignmentSnap.data())
  }

  const feedback = await queryDocs(
    db,
    "teacher_feedback",
    where("student_id", "==", userId),
    orderBy("created_at", "desc"),
    limit(1),
  )

  let feedbackTeacherName: string | null = null
  if (feedback[0]?.teacher_id) {
    const teacherSnap = await getDoc(doc(db, "profiles", feedback[0].teacher_id))
    feedbackTeacherName = teacherSnap.exists() ? teacherSnap.data()?.full_name : null
  }

  return {
    skills,
    scoreEvolution: historyRows.map((h: any) => ({
      month: toDate(h.month_date)?.toLocaleDateString("fr-FR", { month: "short" }) || "-",
      score: Math.round(h.overall_score),
    })),
    recentGrades: grades.map((g: any) => {
      const a = assignmentMap.get(g.assignment_id)
      return {
        title: a?.title || "Devoir",
        type: a?.type || "exercice",
        date: toLocaleDateFR(g.graded_at),
        score: Math.round(g.score || 0),
        max: Math.round(a?.max_score || 100),
      }
    }),
    feedback: feedback[0]
      ? {
          teacher: feedbackTeacherName || "Enseignant",
          date: toLocaleDateFR(feedback[0].created_at),
          text: feedback[0].feedback,
        }
      : null,
  }
}

export async function fetchStudentCalendarData(
  db: Firestore,
  userId: string,
  monthStart: Date,
  monthEnd: Date,
  schoolId?: string | null,
) {
  type CalendarTaskKind = "assignment" | "course_exercise" | "personalized_exercise" | "quick_link"
  type CalendarTaskDocument = {
    id: string
    name: string
    filePath: string
    mimeType: string | null
    sizeBytes: number | null
  }

  type CalendarTask = {
    id: string
    kind: CalendarTaskKind
    title: string
    subtitle: string
    className: string
    dueAt: string | null
    href: string
    completed: boolean
    trackCompletion: boolean
    documents: CalendarTaskDocument[]
  }

  type CalendarDayStatus = "planned" | "full" | "partial" | "missed"

  type CalendarProgramSession = {
    id: string
    classId: string
    className: string
    dateKey: string
    title: string
    majorPoints: string
    notes: string
    status: CalendarDayStatus
    totalCount: number
    completedCount: number
    completionRatio: number
    tasks: CalendarTask[]
    documents: CalendarTaskDocument[]
  }

  type CalendarProgramDay = {
    dateKey: string
    dateLabel: string
    totalCount: number
    completedCount: number
    completionRatio: number
    status: CalendarDayStatus
    sessions: CalendarProgramSession[]
    tasks: CalendarTask[]
    documents: CalendarTaskDocument[]
  }

  const emptyPayload = () => ({
    days: {} as Record<number, { totalCount: number; completedCount: number; status: CalendarDayStatus }>,
    programsByDate: {} as Record<string, CalendarProgramDay>,
    unscheduledTasks: [] as CalendarTask[],
  })

  const safeQueryDocs = async (collectionName: string, ...constraints: any[]) => {
    try {
      return await queryDocs(db, collectionName, ...constraints)
    } catch {
      return [] as any[]
    }
  }

  const normalizeText = (value: unknown, max = 120) => {
    const cleaned = typeof value === "string"
      ? value.replace(/\s+/g, " ").trim()
      : ""
    if (cleaned.length <= max) return cleaned
    return `${cleaned.slice(0, max - 3)}...`
  }

  const dateKey = (value: Date) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const parseDateKey = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)
    return new Date(year, month - 1, day)
  }

  const taskHrefForAssignmentType = (type: string, assignmentId: string) => {
    const normalized = normalizeAssignmentType(type)
    const tab = normalized === "reading"
      ? "reading"
      : normalized === "writing" || normalized === "project"
      ? "writing"
      : "quiz"
    return `/student/exercises?tab=${tab}&assignment=${assignmentId}`
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = dateKey(today)
  const monthStartKey = dateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate()))
  const monthEndKey = dateKey(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate()))

  const statusForProgress = (dayKey: string, completedCount: number, totalCount: number): CalendarDayStatus => {
    if (totalCount <= 0) return "planned"
    if (completedCount >= totalCount) return "full"
    if (dayKey > todayKey) return "planned"
    if (completedCount > 0) return "partial"
    return "missed"
  }

  const quickLinkConfig: Record<TeacherClassProgramQuickLinkKey, {
    kind: CalendarTaskKind
    title: string
    subtitle: string
    href: string
  }> = {
    course_exercises: {
      kind: "course_exercise",
      title: "Exercices basés sur les cours",
      subtitle: "Travail guidé à partir des documents vus en classe.",
      href: "/student/course-exercises",
    },
    quiz_assignments: {
      kind: "assignment",
      title: "Quiz / grammaire de la séance",
      subtitle: "Vérifie les acquis essentiels de la séance.",
      href: "/student/exercises?tab=quiz",
    },
    personalized_exercises: {
      kind: "personalized_exercise",
      title: "Remédiation personnalisée",
      subtitle: "Consolide tes points de progression ciblés.",
      href: "/student/exercises?tab=personalized",
    },
  }

  const enrollments = await safeQueryDocs(
    "class_enrollments",
    where("student_id", "==", userId),
    where("status", "==", "active"),
  )

  const enrolledClassIds = Array.from(
    new Set(
      enrollments
        .map((enrollment: any) => (typeof enrollment.class_id === "string" ? enrollment.class_id : ""))
        .filter(Boolean),
    ),
  )

  if (!enrolledClassIds.length) {
    return emptyPayload()
  }

  let classes: any[] = []
  for (const batch of batchIds(enrolledClassIds)) {
    if (!batch.length) continue
    const rows = await safeQueryDocs("classes", where("__name__", "in", batch), where("archived_at", "==", null))
    classes.push(...rows)
  }

  classes = classes.filter((classRow: any) => {
    if (classRow.archived_at) return false
    if (schoolId && classRow.school_id !== schoolId) return false
    return true
  })

  const classIds = classes.map((classRow: any) => classRow.id)
  const classNameById = new Map(classes.map((classRow: any) => [classRow.id, classRow.name || "Classe"]))

  if (!classIds.length) {
    return emptyPayload()
  }

  let rawPrograms: any[] = []
  for (const batch of batchIds(classIds)) {
    if (!batch.length) continue
    const rows = await safeQueryDocs("class_programs", where("class_id", "in", batch))
    rawPrograms.push(...rows)
  }

  const programs = rawPrograms
    .filter((row: any) => {
      if (schoolId && row.school_id !== schoolId) return false
      const rowDateKey = normalizeProgramDateKey(typeof row.date_key === "string" ? row.date_key : "")
      if (!rowDateKey) return false
      return rowDateKey >= monthStartKey && rowDateKey <= monthEndKey
    })
    .map((row: any) => ({
      id: row.id,
      classId: typeof row.class_id === "string" ? row.class_id : "",
      dateKey: normalizeProgramDateKey(typeof row.date_key === "string" ? row.date_key : ""),
      title: typeof row.title === "string" ? row.title : "Séance de classe",
      majorPoints: typeof row.major_points === "string" ? row.major_points : "",
      notes: typeof row.notes === "string" ? row.notes : "",
      assignmentIds: normalizeStringArray(row.assignment_ids),
      documentIds: normalizeStringArray(row.document_ids),
      quickLinks: normalizeProgramQuickLinks(row.quick_links),
    }))
    .filter((program) => !!program.classId && !!program.dateKey)
    .sort((left, right) => {
      if (left.dateKey !== right.dateKey) return left.dateKey.localeCompare(right.dateKey)
      return (classNameById.get(left.classId) || "").localeCompare(classNameById.get(right.classId) || "", "fr")
    })

  if (!programs.length) {
    return emptyPayload()
  }

  const assignmentIds = Array.from(
    new Set(programs.flatMap((program) => program.assignmentIds).filter(Boolean)),
  )

  const programDocumentIds = Array.from(
    new Set(programs.flatMap((program) => program.documentIds).filter(Boolean)),
  )

  let assignments: any[] = []
  for (const batch of batchIds(assignmentIds)) {
    if (!batch.length) continue
    const rows = await safeQueryDocs("assignments", where("__name__", "in", batch))
    assignments.push(...rows)
  }

  assignments = assignments.filter((assignment: any) => {
    if (!classIds.includes(assignment.class_id)) return false
    if (schoolId && assignment.school_id !== schoolId) return false
    if (assignment.is_published === false) return false
    return true
  })

  const assignmentById = new Map(assignments.map((assignment: any) => [assignment.id, assignment]))

  let submissions: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      if (!batch.length) continue
      const rows = await safeQueryDocs(
        "submissions",
        where("student_id", "==", userId),
        where("assignment_id", "in", batch),
      )
      submissions.push(...rows)
    }
  }

  const submissionByAssignmentId = new Map<string, any[]>()
  for (const submission of submissions) {
    const assignmentId = typeof submission.assignment_id === "string" ? submission.assignment_id : ""
    if (!assignmentId) continue
    const rows = submissionByAssignmentId.get(assignmentId) || []
    rows.push(submission)
    submissionByAssignmentId.set(assignmentId, rows)
  }

  const latestSubmissionByAssignment = new Map<string, any>()
  for (const [assignmentId, rows] of submissionByAssignmentId.entries()) {
    const latest = [...rows].sort((left: any, right: any) => {
      const leftDate = toDate(left.updated_at || left.submitted_at || left.created_at)?.getTime() || 0
      const rightDate = toDate(right.updated_at || right.submitted_at || right.created_at)?.getTime() || 0
      return rightDate - leftDate
    })[0]
    latestSubmissionByAssignment.set(assignmentId, latest)
  }

  let assignmentShares: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      if (!batch.length) continue
      const rows = await safeQueryDocs("document_shares", where("assignment_id", "in", batch))
      assignmentShares.push(...rows)
    }

    if (schoolId) {
      assignmentShares = assignmentShares.filter((row: any) => row.school_id === schoolId)
    }
  }

  const assignmentDocumentIds = Array.from(
    new Set(
      assignmentShares
        .map((share: any) => (typeof share.document_id === "string" ? share.document_id : ""))
        .filter(Boolean),
    ),
  )

  const allDocumentIds = Array.from(new Set([...programDocumentIds, ...assignmentDocumentIds]))

  let allDocuments: any[] = []
  for (const batch of batchIds(allDocumentIds)) {
    if (!batch.length) continue
    const rows = await safeQueryDocs("documents", where("__name__", "in", batch))
    allDocuments.push(...rows)
  }

  const documentById = new Map(allDocuments.map((documentRow: any) => [documentRow.id, documentRow]))
  const documentsByAssignmentId = new Map<string, CalendarTaskDocument[]>()

  for (const share of assignmentShares) {
    const assignmentId = typeof share.assignment_id === "string" ? share.assignment_id : ""
    const documentId = typeof share.document_id === "string" ? share.document_id : ""
    if (!assignmentId || !documentId) continue

    const documentRow = documentById.get(documentId)
    if (!documentRow) continue

    const rows = documentsByAssignmentId.get(assignmentId) || []
    if (!rows.some((row) => row.id === documentRow.id)) {
      rows.push({
        id: documentRow.id,
        name: typeof documentRow.name === "string" ? documentRow.name : "Document",
        filePath: typeof documentRow.file_path === "string" ? documentRow.file_path : "",
        mimeType: typeof documentRow.mime_type === "string" ? documentRow.mime_type : null,
        sizeBytes: typeof documentRow.size_bytes === "number" ? documentRow.size_bytes : null,
      })
    }
    documentsByAssignmentId.set(assignmentId, rows)
  }

  const sessionsByDate = new Map<string, CalendarProgramSession[]>()

  for (const program of programs) {
    const className = classNameById.get(program.classId) || "Classe"

    const sessionDocuments = program.documentIds
      .map((documentId) => {
        const documentRow = documentById.get(documentId)
        if (!documentRow) return null
        const filePath = typeof documentRow.file_path === "string" ? documentRow.file_path : ""
        if (!filePath) return null

        return {
          id: documentRow.id,
          name: typeof documentRow.name === "string" ? documentRow.name : "Document",
          filePath,
          mimeType: typeof documentRow.mime_type === "string" ? documentRow.mime_type : null,
          sizeBytes: typeof documentRow.size_bytes === "number" ? documentRow.size_bytes : null,
        }
      })
      .filter((row): row is CalendarTaskDocument => !!row)

    const sessionTasks: CalendarTask[] = []

    for (const assignmentId of program.assignmentIds) {
      const assignment = assignmentById.get(assignmentId)
      if (!assignment) continue

      const submission = latestSubmissionByAssignment.get(assignmentId)
      const completed = !!submission && (submission.status === "submitted" || submission.status === "graded")

      sessionTasks.push({
        id: `assignment:${assignment.id}`,
        kind: "assignment",
        title: typeof assignment.title === "string" && assignment.title.trim().length
          ? assignment.title
          : "Devoir",
        subtitle: normalizeText(assignment.description, 120) || "Exercice de classe à finaliser.",
        className,
        dueAt: toISOString(assignment.due_at),
        href: taskHrefForAssignmentType(assignment.type, assignment.id),
        completed,
        trackCompletion: true,
        documents: documentsByAssignmentId.get(assignment.id) || [],
      })
    }

    for (const quickLink of program.quickLinks) {
      const config = quickLinkConfig[quickLink]
      if (!config) continue

      sessionTasks.push({
        id: `quick:${program.id}:${quickLink}`,
        kind: config.kind,
        title: config.title,
        subtitle: config.subtitle,
        className,
        dueAt: null,
        href: config.href,
        completed: false,
        trackCompletion: false,
        documents: [],
      })
    }

    sessionTasks.sort((left, right) => {
      if (left.trackCompletion !== right.trackCompletion) return left.trackCompletion ? -1 : 1
      if (left.completed !== right.completed) return left.completed ? 1 : -1
      return left.title.localeCompare(right.title, "fr")
    })

    const trackableTasks = sessionTasks.filter((task) => task.trackCompletion)
    const completedCount = trackableTasks.filter((task) => task.completed).length
    const totalCount = trackableTasks.length
    const completionRatio = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

    const session: CalendarProgramSession = {
      id: program.id,
      classId: program.classId,
      className,
      dateKey: program.dateKey,
      title: (program.title || "").trim() || "Programme de séance",
      majorPoints: (program.majorPoints || "").trim(),
      notes: (program.notes || "").trim(),
      status: statusForProgress(program.dateKey, completedCount, totalCount),
      totalCount,
      completedCount,
      completionRatio,
      tasks: sessionTasks,
      documents: sessionDocuments,
    }

    const rows = sessionsByDate.get(program.dateKey) || []
    rows.push(session)
    sessionsByDate.set(program.dateKey, rows)
  }

  const sortedDateKeys = Array.from(sessionsByDate.keys()).sort((left, right) => left.localeCompare(right))
  const days: Record<number, { totalCount: number; completedCount: number; status: CalendarDayStatus }> = {}
  const programsByDate: Record<string, CalendarProgramDay> = {}

  for (const key of sortedDateKeys) {
    const dayDate = parseDateKey(key)
    if (!dayDate) continue

    const sessions = (sessionsByDate.get(key) || [])
      .sort((left, right) => left.className.localeCompare(right.className, "fr"))

    const totalCount = sessions.reduce((sum, session) => sum + session.totalCount, 0)
    const completedCount = sessions.reduce((sum, session) => sum + session.completedCount, 0)
    const completionRatio = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

    const tasks = sessions
      .flatMap((session) => session.tasks)
      .sort((left, right) => {
        if (left.trackCompletion !== right.trackCompletion) return left.trackCompletion ? -1 : 1
        if (left.completed !== right.completed) return left.completed ? 1 : -1
        return left.title.localeCompare(right.title, "fr")
      })

    const documents = Array.from(
      new Map(
        sessions
          .flatMap((session) => session.documents)
          .filter((documentRow) => !!documentRow.filePath)
          .map((documentRow) => [documentRow.id, documentRow]),
      ).values(),
    )

    const status = statusForProgress(key, completedCount, totalCount)

    programsByDate[key] = {
      dateKey: key,
      dateLabel: dayDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      totalCount,
      completedCount,
      completionRatio,
      status,
      sessions,
      tasks,
      documents,
    }

    days[dayDate.getDate()] = {
      totalCount,
      completedCount,
      status,
    }
  }

  return {
    days,
    programsByDate,
    unscheduledTasks: [] as CalendarTask[],
  }
}

export async function fetchStudentExercisesData(db: Firestore, userId: string, schoolId?: string | null) {
  const enrollments = await queryDocs(
    db,
    "class_enrollments",
    where("student_id", "==", userId),
    where("status", "==", "active"),
  )

  const classIds = Array.from(new Set(enrollments.map((e: any) => e.class_id)))
  if (!classIds.length) {
    return { assignments: [] as any[], personalizedExercises: [] as any[], classes: [] as any[] }
  }

  let classes: any[] = []
  for (const batch of batchIds(classIds)) {
    const constraints: any[] = [where("__name__", "in", batch), where("archived_at", "==", null)]
    if (schoolId) constraints.push(where("school_id", "==", schoolId))
    const c = await queryDocs(db, "classes", ...constraints)
    classes.push(...c)
  }

  const activeClassIds = classes.map((c: any) => c.id)
  if (!activeClassIds.length) {
    return { assignments: [] as any[], personalizedExercises: [] as any[], classes: [] as any[] }
  }

  let assignments: any[] = []
  for (const batch of batchIds(activeClassIds)) {
    const a = await queryDocs(db, "assignments", where("class_id", "in", batch), where("is_published", "==", true), orderBy("due_at", "asc"))
    assignments.push(...a)
  }

  const assignmentIds = assignments.map((a: any) => a.id)
  let submissions: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      const s = await queryDocs(db, "submissions", where("student_id", "==", userId), where("assignment_id", "in", batch))
      submissions.push(...s)
    }
  }

  let assignmentSharesList: any[] = []
  if (assignmentIds.length) {
    for (const batch of batchIds(assignmentIds)) {
      const constraints: any[] = [where("assignment_id", "in", batch)]
      if (schoolId) constraints.push(where("school_id", "==", schoolId))
      const s = await queryDocs(db, "document_shares", ...constraints)
      assignmentSharesList.push(...s)
    }
  }

  const assignmentDocumentIds = Array.from(new Set(assignmentSharesList.map((share: any) => share.document_id)))
  let assignmentDocs: any[] = []
  if (assignmentDocumentIds.length) {
    for (const batch of batchIds(assignmentDocumentIds)) {
      const d = await queryDocs(db, "documents", where("__name__", "in", batch))
      assignmentDocs.push(...d)
    }
  }

  const personalizedConstraints: any[] = [where("student_id", "==", userId), orderBy("created_at", "desc")]
  if (schoolId) personalizedConstraints.push(where("school_id", "==", schoolId))
  const personalized = await queryDocs(db, "personalized_exercises", ...personalizedConstraints)

  const completionConstraints: any[] = [
    where("actor_id", "==", userId),
    where("event_type", "==", "completion"),
    orderBy("created_at", "desc"),
    limit(500),
  ]
  if (schoolId) completionConstraints.push(where("school_id", "==", schoolId))
  const completionEvents = await queryDocs(db, "activity_events", ...completionConstraints)

  const completionByExerciseId = new Map<string, {
    responseText: string
    submittedAt: string | null
    responseAnswers: CourseExerciseAnswersPayload
  }>()
  for (const event of completionEvents) {
    const payload = event.payload && typeof event.payload === "object" ? event.payload : null
    const payloadKind = typeof payload?.kind === "string" ? payload.kind : ""
    if (!payload || (payloadKind !== "personalized_exercise_completion" && payloadKind !== "course_exercise_completion")) continue

    const exerciseId = typeof payload.exercise_id === "string" ? payload.exercise_id : ""
    if (!exerciseId || completionByExerciseId.has(exerciseId)) continue

    completionByExerciseId.set(exerciseId, {
      responseText: typeof payload.response === "string" ? payload.response : "",
      submittedAt: typeof payload.submitted_at === "string" ? payload.submitted_at : toISOString(event.created_at),
      responseAnswers: parseCourseExerciseAnswers(payload.answers),
    })
  }

  const classNameById = new Map(classes.map((c: any) => [c.id, c.name]))
  const submissionByAssignment = new Map<string, any>()
  for (const submission of submissions) submissionByAssignment.set(submission.assignment_id, submission)

  const documentById = new Map(assignmentDocs.map((doc: any) => [doc.id, doc]))
  const documentsByAssignment = new Map<string, Array<{ id: string; name: string; filePath: string; mimeType: string | null; sizeBytes: number | null }>>()

  for (const share of assignmentSharesList) {
    const d = documentById.get(share.document_id)
    if (!d) continue
    const rows = documentsByAssignment.get(share.assignment_id) || []
    if (!rows.some((row) => row.id === d.id)) {
      rows.push({
        id: d.id,
        name: d.name,
        filePath: d.file_path,
        mimeType: d.mime_type || null,
        sizeBytes: typeof d.size_bytes === "number" ? d.size_bytes : null,
      })
    }
    documentsByAssignment.set(share.assignment_id, rows)
  }

  return {
    classes: classes.map((c: any) => ({ id: c.id, name: c.name })),
    assignments: assignments.map((assignment: any) => {
      const submission = submissionByAssignment.get(assignment.id)
      const payload = parseSubmissionPayload(submission?.content)

      return {
        id: assignment.id,
        schoolId: assignment.school_id,
        classId: assignment.class_id,
        className: classNameById.get(assignment.class_id) || "Classe",
        title: assignment.title,
        description: assignment.description || "",
        type: normalizeAssignmentType(assignment.type),
        cefrLevel: upLevel(assignment.cefr_level),
        dueAt: toISOString(assignment.due_at),
        createdAt: toISOString(assignment.created_at),
        documents: documentsByAssignment.get(assignment.id) || [],
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              score: submission.score,
              feedback: submission.feedback || "",
              submittedAt: toISOString(submission.submitted_at),
              gradedAt: toISOString(submission.graded_at),
              content: payload,
            }
          : null,
      }
    }),
    personalizedExercises: personalized.map((exercise: any) => {
      const completion = completionByExerciseId.get(exercise.id)
      const storedResponseText = typeof exercise.response_text === "string" ? exercise.response_text : ""
      const storedResponseAnswers = parseCourseExerciseAnswers(exercise.response_answers)
      const completionAnswers = completion?.responseAnswers || {}
      const responseAnswers = Object.keys(completionAnswers).length ? completionAnswers : storedResponseAnswers
      const responseSubmittedAt = completion?.submittedAt
        || toISOString(exercise.response_submitted_at)
        || toISOString(exercise.completed_at)
        || null
      const topicKey = parseCourseTopic(exercise.source_topic)
      const materialType = parseCourseMaterialType(exercise.source_material_type)
      const questions = parseCourseExerciseQuestions(exercise.questions)
      const teacherQuestionFeedback = parseCourseExerciseQuestionReviews(exercise.teacher_question_feedback)

      return {
        id: exercise.id,
        schoolId: exercise.school_id || null,
        classId: exercise.class_id || null,
        title: exercise.title,
        instructions: exercise.instructions,
        type: normalizeAssignmentType(exercise.exercise_type),
        level: upLevel(exercise.cefr_level),
        isCompleted: !!exercise.is_completed || !!completion || !!responseSubmittedAt,
        dueAt: toISOString(exercise.due_at),
        createdAt: toISOString(exercise.created_at),
        readOnly: false,
        responseText: completion?.responseText || storedResponseText,
        responseSubmittedAt,
        responseAnswers,
        questions,
        sourceKind: typeof exercise.source_kind === "string" ? exercise.source_kind : null,
        sourceDocumentId: typeof exercise.source_document_id === "string" ? exercise.source_document_id : null,
        sourceDocumentName: typeof exercise.source_document_name === "string" ? exercise.source_document_name : null,
        topicKey,
        topicLabel: topicKey ? courseTopicLabel(topicKey) : null,
        materialType,
        materialLabel: materialType ? courseMaterialTypeLabel(materialType) : null,
        teacherFeedback: typeof exercise.teacher_feedback === "string" ? exercise.teacher_feedback : "",
        teacherFeedbackAt: toISOString(exercise.teacher_feedback_at),
        teacherQuestionFeedback,
      }
    }),
  }
}

export function generatePersonalizedExercises(params: {
  assignmentTitle: string
  improvementsFocus?: string
  cefrLevel: string
}) {
  type Theme = "conjugation" | "grammar" | "vocabulary"
  type TargetLevel = "a1" | "a2" | "b1" | "b2"

  const levelSettings: Record<TargetLevel, {
    label: string
    conjugationFocus: string
    grammarFocus: string
    vocabularyFocus: string
    conjugationItems: number
    grammarItems: number
    vocabularyItems: number
    reuseSentences: number
  }> = {
    a1: {
      label: "A1",
      conjugationFocus: "be/have, present simple, formes affirmatives et négatives",
      grammarFocus: "ordre des mots simple, articles a/an/the, pronoms sujets",
      vocabularyFocus: "lexique du quotidien (école, travail, routines)",
      conjugationItems: 8,
      grammarItems: 8,
      vocabularyItems: 10,
      reuseSentences: 4,
    },
    a2: {
      label: "A2",
      conjugationFocus: "present simple, present continuous, passé simple fréquent",
      grammarFocus: "accord sujet-verbe, prépositions de base, questions courtes",
      vocabularyFocus: "lexique des situations concrètes et expressions utiles",
      conjugationItems: 10,
      grammarItems: 10,
      vocabularyItems: 12,
      reuseSentences: 5,
    },
    b1: {
      label: "B1",
      conjugationFocus: "present perfect vs preterit, modaux courants, cohérence des temps",
      grammarFocus: "structures complexes, connecteurs, relatives simples",
      vocabularyFocus: "lexique thématique et reformulation en contexte",
      conjugationItems: 12,
      grammarItems: 12,
      vocabularyItems: 14,
      reuseSentences: 6,
    },
    b2: {
      label: "B2",
      conjugationFocus: "nuances temporelles, conditionnels, voix passive ciblée",
      grammarFocus: "grammaire avancée, précision syntaxique, fluidité",
      vocabularyFocus: "registre précis, collocations, reformulation nuancée",
      conjugationItems: 14,
      grammarItems: 14,
      vocabularyItems: 16,
      reuseSentences: 7,
    },
  }

  const themes: Theme[] = ["conjugation", "grammar", "vocabulary"]

  const keywordMap: Record<Theme, string[]> = {
    conjugation: [
      "conjugaison",
      "temps",
      "verbe",
      "verbal",
      "present",
      "preterit",
      "past simple",
      "present perfect",
      "future",
      "conditionnel",
      "auxiliaire",
      "infinitif",
      "participe",
    ],
    grammar: [
      "grammaire",
      "accord",
      "article",
      "preposition",
      "syntaxe",
      "structure",
      "ordre des mots",
      "pronom",
      "negation",
      "comparatif",
      "superlatif",
      "ponctuation",
    ],
    vocabulary: [
      "vocabulaire",
      "lexique",
      "mot",
      "mots",
      "expression",
      "collocation",
      "registre",
      "synonyme",
      "antonyme",
      "formulation",
    ],
  }

  const toTargetLevel = (value: string): TargetLevel => {
    const normalized = (value || "b1").trim().toLowerCase()
    if (normalized === "a1" || normalized === "a2" || normalized === "b1" || normalized === "b2") {
      return normalized
    }
    if (normalized === "c1" || normalized === "c2") return "b2"
    return "b1"
  }

  const normalizeForKeywords = (value: string) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()

  const compact = (value: string, max = 220) => {
    const cleaned = (value || "").replace(/\s+/g, " ").trim()
    if (cleaned.length <= max) return cleaned
    return `${cleaned.slice(0, max - 3)}...`
  }

  const rankThemes = (improvements: string) => {
    const normalized = normalizeForKeywords(improvements)
    if (!normalized) return themes

    const scores = new Map<Theme, number>()
    for (const theme of themes) {
      let score = 0
      for (const keyword of keywordMap[theme]) {
        if (normalized.includes(keyword)) score += 1
      }
      scores.set(theme, score)
    }

    return [...themes].sort((left, right) => {
      const rightScore = scores.get(right) || 0
      const leftScore = scores.get(left) || 0
      if (rightScore !== leftScore) return rightScore - leftScore
      return themes.indexOf(left) - themes.indexOf(right)
    })
  }

  const assignmentTitle = (params.assignmentTitle || "Devoir personnalisé").trim() || "Devoir personnalisé"
  const level = toTargetLevel(params.cefrLevel)
  const settings = levelSettings[level]
  const improvementsFocus = (params.improvementsFocus || "").trim()
  const hasImprovementsFocus = !!improvementsFocus
  const prioritizedThemes = rankThemes(improvementsFocus)
  const focusLine = hasImprovementsFocus
    ? `Priorité professeur (bloc À améliorer): ${compact(improvementsFocus)}`
    : "Priorité professeur (bloc À améliorer): vide. Exercices standards par niveau attendu."

  const buildExercise = (theme: Theme) => {
    if (theme === "conjugation") {
      return {
        title: `Conjugaison ciblée (${settings.label}) - ${assignmentTitle}`,
        instructions: [
          focusLine,
          `Niveau attendu: ${settings.label}.`,
          `Objectif: ${settings.conjugationFocus}.`,
          `Consigne: complète ${settings.conjugationItems} phrases avec le bon temps puis transforme 3 phrases (affirmative, négative, interrogative).`,
        ].join("\n"),
        exerciseType: "conjugation" as const,
        cefrLevel: level,
      }
    }

    if (theme === "grammar") {
      return {
        title: `Grammaire ciblée (${settings.label}) - ${assignmentTitle}`,
        instructions: [
          focusLine,
          `Niveau attendu: ${settings.label}.`,
          `Objectif: ${settings.grammarFocus}.`,
          `Consigne: corrige ${settings.grammarItems} phrases (accords, structure, ponctuation) puis explique la règle pour 2 corrections.`,
        ].join("\n"),
        exerciseType: "grammar" as const,
        cefrLevel: level,
      }
    }

    return {
      title: `Vocabulaire ciblé (${settings.label}) - ${assignmentTitle}`,
      instructions: [
        focusLine,
        `Niveau attendu: ${settings.label}.`,
        `Objectif: ${settings.vocabularyFocus}.`,
        `Consigne: travaille ${settings.vocabularyItems} mots/expressions puis rédige ${settings.reuseSentences} phrases de réemploi en contexte.`,
      ].join("\n"),
      exerciseType: "vocabulary" as const,
      cefrLevel: level,
    }
  }

  return prioritizedThemes.map((theme) => buildExercise(theme))
}

function batchIds(ids: string[], size = 30): string[][] {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size))
  }
  return batches.length ? batches : [[]]
}

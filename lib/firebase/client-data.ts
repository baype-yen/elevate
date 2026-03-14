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

function upLevel(level: string | null | undefined) {
  return (level || "b1").toUpperCase()
}

function normalizeLevel(level: string) {
  return level.toLowerCase()
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

function normalizeAssignmentType(type: string | null | undefined) {
  const value = (type || "exercise").toLowerCase()
  const allowed = new Set([
    "quiz",
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
        queryDocs(db, "class_enrollments", where("class_id", "in", batch)),
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
    studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) || 0) + (e.status === "active" ? 1 : 0))
  }

  const rosterByClass = new Map<string, number>()
  for (const r of rosterStudents) {
    rosterByClass.set(r.class_id, (rosterByClass.get(r.class_id) || 0) + 1)
  }

  const assignmentToClass = new Map<string, string>()
  for (const a of assignments) assignmentToClass.set(a.id, a.class_id)

  const scoresByClass = new Map<string, number[]>()
  let pending = 0
  for (const s of submissions) {
    const classId = assignmentToClass.get(s.assignment_id)
    if (!classId) continue
    if (s.status !== "graded") pending += 1
    if (typeof s.score === "number") {
      const arr = scoresByClass.get(classId) || []
      arr.push(s.score)
      scoresByClass.set(classId, arr)
    }
  }

  const classCards = classes.map((c: any) => {
    const scores = scoresByClass.get(c.id) || []
    const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
    return {
      id: c.id,
      name: c.name,
      level: upLevel(c.cefr_level),
      students: (rosterByClass.get(c.id) || 0) || (studentsByClass.get(c.id) || 0),
      avg,
      lessons: 0,
    }
  })

  const allScores = submissions.map((s: any) => s.score).filter((v: any): v is number => typeof v === "number")
  const overallAvg = allScores.length ? Math.round(allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length) : 0

  return {
    classCards,
    totalStudents: classCards.reduce((sum: number, c: any) => sum + c.students, 0),
    activeClasses: classCards.length,
    pendingReviews: pending,
    overallAvg,
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

  const studentScoreMap = new Map<string, number[]>()
  const studentLastMap = new Map<string, string>()
  for (const s of submissions) {
    if (typeof s.score === "number") {
      const arr = studentScoreMap.get(s.student_id) || []
      arr.push(s.score)
      studentScoreMap.set(s.student_id, arr)
    }
    const submittedAt = toISOString(s.submitted_at)
    if (submittedAt) {
      const prev = studentLastMap.get(s.student_id)
      if (!prev || new Date(submittedAt) > new Date(prev)) studentLastMap.set(s.student_id, submittedAt)
    }
  }

  const rosterList: TeacherStudentRow[] = rosterStudents.map((r: any) => {
    const name = `${r.first_name} ${r.last_name}`.trim()
    return {
      id: `roster:${r.id}`,
      classId: r.class_id,
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
    const scores = studentScoreMap.get(e.student_id) || []
    const score = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
    const lastDate = studentLastMap.get(e.student_id)
    const lastActive = lastDate ? new Date(lastDate).toLocaleDateString("fr-FR") : "Aucune activité"
    return {
      id: `student:${e.student_id}`,
      classId: e.class_id,
      studentId: e.student_id,
      name,
      initials: name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
      level: upLevel(profile?.cefr_level),
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
    const key = student.studentId ? `student:${student.studentId}` : student.id
    const existing = unique.get(key)
    if (!existing || (!existing.canEditLevel && student.canEditLevel)) {
      unique.set(key, student)
    }
  }

  const students = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"))

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
      return {
        id: d.id,
        name: d.name,
        filePath: d.file_path,
        type: toFileType(d.mime_type),
        size: toFileSize(d.size_bytes),
        date: toLocaleDateFR(d.created_at),
        sharedClassIds: shared.map((s) => s.id),
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

  return docs.map((d: any) => ({
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
  }))
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
  const enrollments = await queryDocs(
    db,
    "class_enrollments",
    where("student_id", "==", userId),
    where("status", "==", "active"),
    limit(1),
  )

  const classId = enrollments[0]?.class_id || null

  let upcoming: any[] = []
  if (classId) {
    upcoming = await queryDocs(db, "assignments", where("class_id", "==", classId), orderBy("due_at", "asc"), limit(8))
  }

  const upcomingIds = upcoming.map((u: any) => u.id)
  let upcomingShares: any[] = []
  if (upcomingIds.length) {
    for (const batch of batchIds(upcomingIds)) {
      const constraints: any[] = [where("assignment_id", "in", batch)]
      if (schoolId) constraints.push(where("school_id", "==", schoolId))
      const s = await queryDocs(db, "document_shares", ...constraints)
      upcomingShares.push(...s)
    }
  }

  const assignmentIdsWithDocuments = new Set(upcomingShares.map((share: any) => share.assignment_id))

  const history = await queryDocs(
    db,
    "score_history",
    where("user_id", "==", userId),
    orderBy("month_date", "desc"),
    limit(1),
  )

  const xp = await queryDocs(db, "user_xp_events", where("user_id", "==", userId))
  const badges = await queryDocs(db, "user_badges", where("user_id", "==", userId))

  const skillRows = await queryDocs(
    db,
    "student_skill_scores",
    where("user_id", "==", userId),
    orderBy("as_of_date", "desc"),
  )

  // Fetch skill labels
  const skillIds = Array.from(new Set(skillRows.map((r: any) => r.skill_id)))
  const skillMap = new Map<string, any>()
  for (const sid of skillIds) {
    const skillSnap = await getDoc(doc(db, "skills", sid))
    if (skillSnap.exists()) skillMap.set(sid, skillSnap.data())
  }

  const uniqueSkills = new Map<string, any>()
  for (const row of skillRows) {
    const key = `${row.skill_id}`
    if (!uniqueSkills.has(key)) uniqueSkills.set(key, row)
  }

  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - 7)
  const weekXp = xp
    .filter((r: any) => {
      const d = toDate(r.created_at)
      return d && d >= thisWeekStart
    })
    .reduce((sum: number, r: any) => sum + (r.points || 0), 0)

  return {
    overallScore: Math.round(history[0]?.overall_score || 0),
    xpWeek: weekXp,
    badgeCount: badges.length,
    lessonsDone: 0,
    upcomingWork: upcoming.map((u: any) => ({
      id: u.id,
      title: u.title,
      due: u.due_at ? toDate(u.due_at)?.toLocaleDateString("fr-FR") || "Pas de date limite" : "Pas de date limite",
      type: (u.type || "exercice").toString(),
      urgent: !!u.due_at && (toDate(u.due_at)?.getTime() || 0) - Date.now() < 1000 * 60 * 60 * 24 * 2,
      hasDocuments: assignmentIdsWithDocuments.has(u.id),
    })),
    skills: Array.from(uniqueSkills.values()).slice(0, 5).map((r: any) => ({
      label: skillMap.get(r.skill_id)?.label || "Compétence",
      score: Math.round(r.score || 0),
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
) {
  const data = await queryDocs(
    db,
    "practice_daily",
    where("user_id", "==", userId),
    where("practice_date", ">=", monthStart.toISOString().slice(0, 10)),
    where("practice_date", "<=", monthEnd.toISOString().slice(0, 10)),
  )

  const map: Record<number, { count: number; type: "full" | "partial" | "missed" }> = {}
  for (const row of data) {
    const day = new Date(row.practice_date).getDate()
    map[day] = {
      count: row.completed_count || 0,
      type: (row.status as "full" | "partial" | "missed") || "missed",
    }
  }
  return map
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

  const completionByExerciseId = new Map<string, { responseText: string; submittedAt: string | null }>()
  for (const event of completionEvents) {
    const payload = event.payload && typeof event.payload === "object" ? event.payload : null
    if (!payload || payload.kind !== "personalized_exercise_completion") continue

    const exerciseId = typeof payload.exercise_id === "string" ? payload.exercise_id : ""
    if (!exerciseId || completionByExerciseId.has(exerciseId)) continue

    completionByExerciseId.set(exerciseId, {
      responseText: typeof payload.response === "string" ? payload.response : "",
      submittedAt: typeof payload.submitted_at === "string" ? payload.submitted_at : toISOString(event.created_at),
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
      return {
        id: exercise.id,
        schoolId: exercise.school_id || null,
        classId: exercise.class_id || null,
        title: exercise.title,
        instructions: exercise.instructions,
        type: normalizeAssignmentType(exercise.exercise_type),
        level: upLevel(exercise.cefr_level),
        isCompleted: !!exercise.is_completed || !!completion,
        dueAt: toISOString(exercise.due_at),
        createdAt: toISOString(exercise.created_at),
        readOnly: false,
        responseText: completion?.responseText || "",
        responseSubmittedAt: completion?.submittedAt || null,
      }
    }),
  }
}

export function generatePersonalizedExercises(params: {
  assignmentTitle: string
  score: number
  feedback: string
  cefrLevel: string
}) {
  const level = normalizeLevel(params.cefrLevel)
  const score = Math.max(0, Math.min(100, Math.round(params.score)))
  const feedback = (params.feedback || "").trim()

  if (score < 60) {
    return [
      {
        title: `Réécriture guidée - ${params.assignmentTitle}`,
        instructions: `Réécris l'e-mail avec cette structure: objet clair, formule d'ouverture, 3 idées principales, formule de clôture. ${feedback ? `Point d'attention: ${feedback}` : ""}`,
        exerciseType: "writing",
        cefrLevel: level,
      },
      {
        title: "Formules professionnelles",
        instructions: "Transforme 10 phrases informelles en formulations professionnelles adaptées à un e-mail professionnel.",
        exerciseType: "vocabulary",
        cefrLevel: level,
      },
      {
        title: "Correction grammaire ciblée",
        instructions: "Corrige les erreurs de grammaire et de ponctuation dans un mini e-mail (temps verbaux, accords, majuscules, ponctuation).",
        exerciseType: "grammar",
        cefrLevel: level,
      },
    ]
  }

  if (score < 80) {
    return [
      {
        title: `Amélioration de style - ${params.assignmentTitle}`,
        instructions: `Améliore ton e-mail pour le rendre plus précis et plus professionnel (cohérence, transitions, ton). ${feedback ? `Retour enseignant: ${feedback}` : ""}`,
        exerciseType: "writing",
        cefrLevel: level,
      },
      {
        title: "Object line & call-to-action",
        instructions: "Rédige 5 objets d'e-mail efficaces puis ajoute une phrase de call-to-action claire dans chaque e-mail.",
        exerciseType: "exercise",
        cefrLevel: level,
      },
    ]
  }

  return [
    {
      title: `Version avancée - ${params.assignmentTitle}`,
      instructions: "Rédige une version plus concise et plus persuasive de ton e-mail, avec un registre professionnel constant.",
      exerciseType: "writing",
      cefrLevel: level,
    },
  ]
}

function batchIds(ids: string[], size = 30): string[][] {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size))
  }
  return batches.length ? batches : [[]]
}

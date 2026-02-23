import type { SupabaseClient } from "@supabase/supabase-js"

function upLevel(level: string | null | undefined) {
  return (level || "b1").toUpperCase()
}

function normalizeLevel(level: string) {
  return level.toLowerCase()
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

export async function fetchTeacherDashboardData(supabase: SupabaseClient, userId: string, schoolId: string | null) {
  const classesQuery = supabase
    .from("classes")
    .select("id, name, cefr_level")
    .eq("teacher_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })

  const { data: classes } = schoolId ? await classesQuery.eq("school_id", schoolId) : await classesQuery.is("school_id", null)

  const classIds = (classes || []).map((c) => c.id)
  const { data: enrollments } = classIds.length
    ? await supabase.from("class_enrollments").select("class_id, status").in("class_id", classIds)
    : { data: [] as any[] }

  const { data: rosterStudents } = classIds.length
    ? await supabase.from("class_students").select("class_id").in("class_id", classIds)
    : { data: [] as any[] }

  const { data: assignments } = classIds.length
    ? await supabase.from("assignments").select("id, class_id").in("class_id", classIds)
    : { data: [] as any[] }

  const assignmentIds = (assignments || []).map((a) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await supabase.from("submissions").select("assignment_id, status, score").in("assignment_id", assignmentIds)
    : { data: [] as any[] }

  const studentsByClass = new Map<string, number>()
  for (const e of enrollments || []) {
    studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) || 0) + (e.status === "active" ? 1 : 0))
  }

  const rosterByClass = new Map<string, number>()
  for (const r of rosterStudents || []) {
    rosterByClass.set(r.class_id, (rosterByClass.get(r.class_id) || 0) + 1)
  }

  const assignmentToClass = new Map<string, string>()
  for (const a of assignments || []) assignmentToClass.set(a.id, a.class_id)

  const scoresByClass = new Map<string, number[]>()
  let pending = 0
  for (const s of submissions || []) {
    const classId = assignmentToClass.get(s.assignment_id)
    if (!classId) continue
    if (s.status !== "graded") pending += 1
    if (typeof s.score === "number") {
      const arr = scoresByClass.get(classId) || []
      arr.push(s.score)
      scoresByClass.set(classId, arr)
    }
  }

  const classCards = (classes || []).map((c) => {
    const scores = scoresByClass.get(c.id) || []
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return {
      id: c.id,
      name: c.name,
      level: upLevel(c.cefr_level),
      students: (rosterByClass.get(c.id) || 0) || (studentsByClass.get(c.id) || 0),
      avg,
      lessons: 0,
    }
  })

  const allScores = (submissions || []).map((s) => s.score).filter((v): v is number => typeof v === "number")
  const overallAvg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0

  return {
    classCards,
    totalStudents: classCards.reduce((sum, c) => sum + c.students, 0),
    activeClasses: classCards.length,
    pendingReviews: pending,
    overallAvg,
  }
}

export async function fetchTeacherClassesData(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string | null,
  includeArchived = false,
) {
  const classQuery = supabase
    .from("classes")
    .select("id, name, cefr_level, class_code, academic_year, archived_at")
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false })

  const { data: classes } = schoolId
    ? await classQuery.eq("school_id", schoolId)
    : await classQuery.is("school_id", null)

  const filtered = includeArchived ? classes || [] : (classes || []).filter((c) => !c.archived_at)
  const classIds = filtered.map((c) => c.id)

  const { data: enrollments } = classIds.length
    ? await supabase
        .from("class_enrollments")
        .select("class_id, status")
        .in("class_id", classIds)
        .eq("status", "active")
    : { data: [] as any[] }

  const { data: rosterStudents } = classIds.length
    ? await supabase
        .from("class_students")
        .select("class_id")
        .in("class_id", classIds)
    : { data: [] as any[] }

  const { data: assignments } = classIds.length
    ? await supabase.from("assignments").select("id, class_id").in("class_id", classIds)
    : { data: [] as any[] }

  const assignmentIds = (assignments || []).map((a) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await supabase.from("submissions").select("assignment_id, status, score").in("assignment_id", assignmentIds)
    : { data: [] as any[] }

  const studentsByClass = new Map<string, number>()
  for (const e of enrollments || []) {
    studentsByClass.set(e.class_id, (studentsByClass.get(e.class_id) || 0) + 1)
  }

  const rosterByClass = new Map<string, number>()
  for (const r of rosterStudents || []) {
    rosterByClass.set(r.class_id, (rosterByClass.get(r.class_id) || 0) + 1)
  }

  const assignmentToClass = new Map<string, string>()
  for (const a of assignments || []) assignmentToClass.set(a.id, a.class_id)

  const scoresByClass = new Map<string, number[]>()
  const pendingByClass = new Map<string, number>()

  for (const s of submissions || []) {
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

  const result: TeacherClassSummary[] = filtered.map((c) => {
    const scores = scoresByClass.get(c.id) || []
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

    return {
      id: c.id,
      name: c.name,
      level: upLevel(c.cefr_level),
      classCode: c.class_code,
      academicYear: c.academic_year,
      archivedAt: c.archived_at,
      students: (rosterByClass.get(c.id) || 0) || (studentsByClass.get(c.id) || 0),
      avg,
      pending: pendingByClass.get(c.id) || 0,
    }
  })

  return result
}

export async function createTeacherClass(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string | null,
  input: { name: string; level: string; academicYear?: string; classCode?: string },
) {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error("Le nom de la classe est obligatoire.")
  }

  const desiredCode = input.classCode?.trim().toUpperCase()
  let classCode = desiredCode || null

  if (!classCode) {
    const { data: generatedCode } = await supabase.rpc("generate_class_code", { p_name: trimmedName })
    classCode = generatedCode || null
  }

  const { data, error } = await supabase
    .from("classes")
    .insert({
      school_id: schoolId,
      teacher_id: userId,
      name: trimmedName,
      cefr_level: normalizeLevel(input.level),
      class_code: classCode,
      academic_year: input.academicYear?.trim() || null,
    })
    .select("id")
    .single()

  if (error) throw error
  return data.id as string
}

export async function updateTeacherClass(
  supabase: SupabaseClient,
  classId: string,
  input: { name: string; level: string; academicYear?: string; classCode?: string },
) {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error("Le nom de la classe est obligatoire.")
  }

  const { error } = await supabase
    .from("classes")
    .update({
      name: trimmedName,
      cefr_level: normalizeLevel(input.level),
      class_code: input.classCode?.trim().toUpperCase() || null,
      academic_year: input.academicYear?.trim() || null,
    })
    .eq("id", classId)

  if (error) throw error
}

export async function archiveTeacherClass(supabase: SupabaseClient, classId: string) {
  const { error } = await supabase.from("classes").update({ archived_at: new Date().toISOString() }).eq("id", classId)
  if (error) throw error
}

export async function unarchiveTeacherClass(supabase: SupabaseClient, classId: string) {
  const { error } = await supabase.from("classes").update({ archived_at: null }).eq("id", classId)
  if (error) throw error
}

export async function fetchTeacherClassDetail(supabase: SupabaseClient, classId: string) {
  const { data: classRow } = await supabase
    .from("classes")
    .select("id, school_id, name, cefr_level, class_code, academic_year, archived_at")
    .eq("id", classId)
    .single()

  if (!classRow) return null

  const { data: rosterRows } = await supabase
    .from("class_students")
    .select("id, first_name, last_name, company, city, sort_order, created_at")
    .eq("class_id", classId)
    .order("sort_order", { ascending: true })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  const roster = (rosterRows || []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company || "",
    city: row.city || "",
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }))

  return {
    classItem: {
      id: classRow.id,
      name: classRow.name,
      level: upLevel(classRow.cefr_level),
      classCode: classRow.class_code,
      academicYear: classRow.academic_year,
      archivedAt: classRow.archived_at,
      schoolId: classRow.school_id,
    },
    roster,
  }
}

export async function addClassRosterStudent(
  supabase: SupabaseClient,
  classId: string,
  input: { firstName: string; lastName: string; company?: string; city?: string },
) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error("Le prénom et le nom sont obligatoires.")
  }

  const { data: latest } = await supabase
    .from("class_students")
    .select("sort_order")
    .eq("class_id", classId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSort = (latest?.sort_order || 0) + 1

  const { error } = await supabase
    .from("class_students")
    .insert({
      class_id: classId,
      first_name: firstName,
      last_name: lastName,
      company: input.company?.trim() || null,
      city: input.city?.trim() || null,
      sort_order: nextSort,
    })

  if (error) throw error
}

export async function updateClassRosterStudent(
  supabase: SupabaseClient,
  rosterId: string,
  input: { firstName: string; lastName: string; company?: string; city?: string },
) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error("Le prénom et le nom sont obligatoires.")
  }

  const { error } = await supabase
    .from("class_students")
    .update({
      first_name: firstName,
      last_name: lastName,
      company: input.company?.trim() || null,
      city: input.city?.trim() || null,
    })
    .eq("id", rosterId)

  if (error) throw error
}

export async function removeClassRosterStudent(supabase: SupabaseClient, rosterId: string) {
  const { error } = await supabase
    .from("class_students")
    .delete()
    .eq("id", rosterId)

  if (error) throw error
}

export async function importClassRosterRows(
  supabase: SupabaseClient,
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

  if (!normalized.length) {
    return 0
  }

  const { data: latest } = await supabase
    .from("class_students")
    .select("sort_order")
    .eq("class_id", classId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSort = (latest?.sort_order || 0) + 1

  const payload = normalized.map((row) => ({
    class_id: classId,
    first_name: row.firstName,
    last_name: row.lastName,
    company: row.company,
    city: row.city,
    sort_order: nextSort++,
  }))

  const { error } = await supabase
    .from("class_students")
    .upsert(payload, { onConflict: "class_id,first_name,last_name" })

  if (error) throw error
  return payload.length
}

export async function fetchTeacherStudentsData(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string | null,
  classId?: string | null,
) {
  let classQuery = supabase
    .from("classes")
    .select("id, name, cefr_level")
    .eq("teacher_id", userId)
    .is("archived_at", null)

  classQuery = schoolId ? classQuery.eq("school_id", schoolId) : classQuery.is("school_id", null)
  classQuery = classId ? classQuery.eq("id", classId) : classQuery

  const { data: classes } = await classQuery

  const classIds = (classes || []).map((c) => c.id)
  if (!classIds.length) return { className: "Aucune classe", students: [] as any[], classes: [] as any[] }

  const { data: rosterStudents } = await supabase
    .from("class_students")
    .select("id, class_id, first_name, last_name, city")
    .in("class_id", classIds)

  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id, student_id, status, profiles(full_name, cefr_level)")
    .in("class_id", classIds)
    .eq("status", "active")

  const { data: assignments } = await supabase.from("assignments").select("id, class_id").in("class_id", classIds)
  const assignmentIds = (assignments || []).map((a) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await supabase.from("submissions").select("assignment_id, student_id, score, submitted_at")
        .in("assignment_id", assignmentIds)
    : { data: [] as any[] }

  const classLevelMap = new Map((classes || []).map((c) => [c.id, upLevel(c.cefr_level)]))

  const studentScoreMap = new Map<string, number[]>()
  const studentLastMap = new Map<string, string>()
  for (const s of submissions || []) {
    if (typeof s.score === "number") {
      const arr = studentScoreMap.get(s.student_id) || []
      arr.push(s.score)
      studentScoreMap.set(s.student_id, arr)
    }
    if (s.submitted_at) {
      const prev = studentLastMap.get(s.student_id)
      if (!prev || new Date(s.submitted_at) > new Date(prev)) studentLastMap.set(s.student_id, s.submitted_at)
    }
  }

  const rosterList = (rosterStudents || []).map((r) => {
    const name = `${r.first_name} ${r.last_name}`.trim()
    return {
      name,
      initials: `${r.first_name[0] || ""}${r.last_name[0] || ""}`.toUpperCase(),
      level: classLevelMap.get(r.class_id) || "B1",
      score: 0,
      lastActive: r.city || "Fiche de liste",
    }
  })

  const enrolledList = (enrollments || []).map((e) => {
    const name = (e.profiles as any)?.full_name || "Élève"
    const scores = studentScoreMap.get(e.student_id) || []
    const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const lastDate = studentLastMap.get(e.student_id)
    const lastActive = lastDate ? new Date(lastDate).toLocaleDateString("fr-FR") : "Aucune activité"
    return {
      name,
      initials: name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
      level: upLevel((e.profiles as any)?.cefr_level),
      score,
      lastActive,
    }
  })

  const merged = [...enrolledList, ...rosterList]
  const unique = new Map<string, any>()
  for (const student of merged) {
    const key = `${student.name}|${student.level}`
    if (!unique.has(key)) {
      unique.set(key, student)
    }
  }

  return {
    className: classId ? classes?.[0]?.name || "Classe" : "Toutes les classes actives",
    students: Array.from(unique.values()),
    classes: (classes || []).map((c) => ({ id: c.id, name: c.name })),
  }
}

export async function fetchTeacherWorkData(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string | null,
  classId?: string | null,
) {
  let classQuery = supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", userId)
    .is("archived_at", null)

  classQuery = schoolId ? classQuery.eq("school_id", schoolId) : classQuery.is("school_id", null)
  classQuery = classId ? classQuery.eq("id", classId) : classQuery

  const { data: classes } = await classQuery

  const classIds = (classes || []).map((c) => c.id)
  if (!classIds.length) return { items: [] as any[], classes: [] as any[] }

  const classNameById = new Map((classes || []).map((c) => [c.id, c.name]))

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, type, cefr_level, class_id, school_id, due_at")
    .in("class_id", classIds)
    .order("created_at", { ascending: false })

  const assignmentIds = (assignments || []).map((a) => a.id)
  if (!assignmentIds.length) {
    return {
      items: [] as any[],
      classes: (classes || []).map((c) => ({ id: c.id, name: c.name })),
    }
  }

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, assignment_id, student_id, status, score, content, feedback, submitted_at, graded_at, profiles(full_name)")
    .in("assignment_id", assignmentIds)
    .order("submitted_at", { ascending: false })

  const byAssignment = new Map<string, any>()
  for (const a of assignments || []) byAssignment.set(a.id, a)

  const items = (submissions || []).map((s) => {
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
      student: (s.profiles as any)?.full_name || "Élève",
      className: classNameById.get(a?.class_id) || "Classe",
      submitted: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("fr-FR") : "-",
      submittedAtRaw: s.submitted_at || null,
      status: s.status === "graded" ? "Graded" : "Pending",
      statusRaw: s.status,
      score: s.score,
      feedback: s.feedback || "",
      gradedAt: s.graded_at || null,
      contentText: payload.text,
      contentPreview,
      document: payload.document,
      type: a?.type || "mixed",
      level: upLevel(a?.cefr_level),
    }
  })

  return {
    items,
    classes: (classes || []).map((c) => ({ id: c.id, name: c.name })),
  }
}

export async function fetchTeacherDocumentsData(supabase: SupabaseClient, userId: string, schoolId: string | null) {
  const { data: classes } = schoolId
    ? await supabase
        .from("classes")
        .select("id, name")
        .eq("teacher_id", userId)
        .eq("school_id", schoolId)
        .is("archived_at", null)
        .order("name", { ascending: true })
    : { data: [] as any[] }

  const { data: docs } = schoolId
    ? await supabase
        .from("documents")
        .select("id, name, file_path, mime_type, size_bytes, created_at")
        .eq("owner_id", userId)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
    : await supabase
        .from("documents")
        .select("id, name, file_path, mime_type, size_bytes, created_at")
        .eq("owner_id", userId)
        .is("school_id", null)
        .order("created_at", { ascending: false })

  const documentIds = (docs || []).map((d) => d.id)
  const { data: shares } = schoolId && documentIds.length
    ? await supabase
        .from("document_shares")
        .select("document_id, class_id")
        .eq("school_id", schoolId)
        .in("document_id", documentIds)
    : { data: [] as any[] }

  const classNameById = new Map((classes || []).map((c) => [c.id, c.name]))
  const sharedByDocument = new Map<string, Array<{ id: string; name: string }>>()

  for (const share of shares || []) {
    const className = classNameById.get(share.class_id)
    if (!className) continue
    const arr = sharedByDocument.get(share.document_id) || []
    arr.push({ id: share.class_id, name: className })
    sharedByDocument.set(share.document_id, arr)
  }

  return {
    classes: (classes || []).map((c) => ({ id: c.id, name: c.name })),
    documents: (docs || []).map((d) => {
      const shared = sharedByDocument.get(d.id) || []
      return {
        id: d.id,
        name: d.name,
        filePath: d.file_path,
        type: toFileType(d.mime_type),
        size: toFileSize(d.size_bytes),
        date: new Date(d.created_at).toLocaleDateString("fr-FR"),
        sharedClassIds: shared.map((s) => s.id),
        sharedClassNames: shared.map((s) => s.name),
      }
    }),
  }
}

export async function fetchStudentDocumentsData(supabase: SupabaseClient, userId: string, schoolId: string | null) {
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("student_id", userId)
    .eq("status", "active")

  const enrolledClassIds = (enrollments || []).map((e) => e.class_id)
  if (!enrolledClassIds.length) return [] as any[]

  let classQuery = supabase
    .from("classes")
    .select("id, name")
    .in("id", enrolledClassIds)
    .is("archived_at", null)

  classQuery = schoolId ? classQuery.eq("school_id", schoolId) : classQuery.is("school_id", null)
  const { data: classes } = await classQuery

  const classIds = (classes || []).map((c) => c.id)
  if (!classIds.length) return [] as any[]

  let classShareQuery = supabase
    .from("document_shares")
    .select("document_id, class_id, assignment_id, created_at")
    .in("class_id", classIds)

  classShareQuery = schoolId ? classShareQuery.eq("school_id", schoolId) : classShareQuery
  const { data: classShares } = await classShareQuery

  let assignmentQuery = supabase
    .from("assignments")
    .select("id, title, class_id")
    .in("class_id", classIds)

  assignmentQuery = schoolId ? assignmentQuery.eq("school_id", schoolId) : assignmentQuery
  const { data: assignments } = await assignmentQuery

  const assignmentIds = (assignments || []).map((a) => a.id)
  const { data: assignmentShares } = assignmentIds.length
    ? await (schoolId
        ? supabase
            .from("document_shares")
            .select("document_id, class_id, assignment_id, created_at")
            .in("assignment_id", assignmentIds)
            .eq("school_id", schoolId)
        : supabase
            .from("document_shares")
            .select("document_id, class_id, assignment_id, created_at")
            .in("assignment_id", assignmentIds))
    : { data: [] as any[] }

  const shares = [...(classShares || []), ...(assignmentShares || [])]
  const documentIds = Array.from(new Set(shares.map((s) => s.document_id)))
  if (!documentIds.length) return [] as any[]

  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, file_path, mime_type, size_bytes, created_at")
    .in("id", documentIds)
    .order("created_at", { ascending: false })

  const classNameById = new Map((classes || []).map((c) => [c.id, c.name]))
  const assignmentTitleById = new Map((assignments || []).map((a) => [a.id, a.title]))
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

    const previous = lastSharedAtByDocument.get(share.document_id)
    if (!previous || new Date(share.created_at) > new Date(previous)) {
      lastSharedAtByDocument.set(share.document_id, share.created_at)
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

  return (docs || []).map((d) => ({
    id: d.id,
    name: d.name,
    filePath: d.file_path,
    type: toFileType(d.mime_type),
    size: toFileSize(d.size_bytes),
    date: new Date(d.created_at).toLocaleDateString("fr-FR"),
    sharedAt: lastSharedAtByDocument.get(d.id)
      ? new Date(lastSharedAtByDocument.get(d.id) as string).toLocaleDateString("fr-FR")
      : new Date(d.created_at).toLocaleDateString("fr-FR"),
    sharedClassNames: classNamesByDocument.get(d.id) || [],
    sharedAssignmentTitles: assignmentTitlesByDocument.get(d.id) || [],
  }))
}

export async function fetchTeacherActivityData(supabase: SupabaseClient, userId: string, schoolId: string | null) {
  const query = supabase
    .from("activity_events")
    .select("event_type, payload, created_at, target_user_id, profiles!activity_events_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(20)

  const { data } = schoolId ? await query.eq("school_id", schoolId) : await query.eq("actor_id", userId).is("school_id", null)

  return (data || []).map((e) => ({
    text: (e.payload as any)?.text || `${(e.profiles as any)?.full_name || "Quelqu'un"} ${e.event_type.replaceAll("_", " ")}`,
    time: new Date(e.created_at).toLocaleString("fr-FR"),
    type: e.event_type,
  }))
}

export async function fetchStudentDashboardData(supabase: SupabaseClient, userId: string, schoolId: string | null) {
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id, classes(name)")
    .eq("student_id", userId)
    .eq("status", "active")
    .limit(1)

  const classId = enrollments?.[0]?.class_id || null

  const { data: upcoming } = classId
    ? await supabase
        .from("assignments")
        .select("id, title, type, due_at")
        .eq("class_id", classId)
        .order("due_at", { ascending: true })
        .limit(8)
    : { data: [] as any[] }

  const upcomingIds = (upcoming || []).map((u) => u.id)
  const { data: upcomingShares } = upcomingIds.length
    ? await (schoolId
        ? supabase
            .from("document_shares")
            .select("assignment_id")
            .in("assignment_id", upcomingIds)
            .eq("school_id", schoolId)
        : supabase
            .from("document_shares")
            .select("assignment_id")
            .in("assignment_id", upcomingIds))
    : { data: [] as any[] }

  const assignmentIdsWithDocuments = new Set((upcomingShares || []).map((share) => share.assignment_id))

  const { data: history } = await supabase
    .from("score_history")
    .select("overall_score")
    .eq("user_id", userId)
    .order("month_date", { ascending: false })
    .limit(1)

  const { data: xp } = await supabase
    .from("user_xp_events")
    .select("points, created_at")
    .eq("user_id", userId)

  const { data: badges } = await supabase.from("user_badges").select("id").eq("user_id", userId)

  const { data: skillRows } = await supabase
    .from("student_skill_scores")
    .select("score, skill_id, skills(key, label)")
    .eq("user_id", userId)
    .order("as_of_date", { ascending: false })

  const uniqueSkills = new Map<string, any>()
  for (const row of skillRows || []) {
    const key = `${row.skill_id}`
    if (!uniqueSkills.has(key)) uniqueSkills.set(key, row)
  }

  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - 7)
  const weekXp = (xp || [])
    .filter((r) => new Date(r.created_at) >= thisWeekStart)
    .reduce((sum, r) => sum + r.points, 0)

  return {
    overallScore: Math.round(history?.[0]?.overall_score || 0),
    xpWeek: weekXp,
    badgeCount: (badges || []).length,
    lessonsDone: 0,
    upcomingWork: (upcoming || []).map((u) => ({
      id: u.id,
      title: u.title,
      due: u.due_at ? new Date(u.due_at).toLocaleDateString("fr-FR") : "Pas de date limite",
      type: (u.type || "exercice").toString(),
      urgent: !!u.due_at && new Date(u.due_at).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 2,
      hasDocuments: assignmentIdsWithDocuments.has(u.id),
    })),
    skills: Array.from(uniqueSkills.values()).slice(0, 5).map((r) => ({
      label: (r.skills as any)?.label || "Compétence",
      score: Math.round(r.score || 0),
    })),
  }
}

export async function fetchStudentProgressData(supabase: SupabaseClient, userId: string) {
  const { data: skillRows } = await supabase
    .from("student_skill_scores")
    .select("score, trend, as_of_date, skill_id, skills(label)")
    .eq("user_id", userId)
    .order("as_of_date", { ascending: false })

  const seenSkills = new Set<string>()
  const skills = [] as any[]
  for (const row of skillRows || []) {
    const key = String(row.skill_id)
    if (seenSkills.has(key)) continue
    seenSkills.add(key)
    skills.push({
      skill: (row.skills as any)?.label || "Compétence",
      score: Math.round(row.score || 0),
      trend: row.trend || 0,
    })
  }

  const { data: history } = await supabase
    .from("score_history")
    .select("month_date, overall_score")
    .eq("user_id", userId)
    .order("month_date", { ascending: true })

  const { data: grades } = await supabase
    .from("submissions")
    .select("score, graded_at, assignments(title, type, max_score)")
    .eq("student_id", userId)
    .eq("status", "graded")
    .order("graded_at", { ascending: false })
    .limit(8)

  const { data: feedback } = await supabase
    .from("teacher_feedback")
    .select("feedback, created_at, profiles!teacher_feedback_teacher_id_fkey(full_name)")
    .eq("student_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)

  return {
    skills,
    scoreEvolution: (history || []).map((h) => ({
      month: new Date(h.month_date).toLocaleDateString("fr-FR", { month: "short" }),
      score: Math.round(h.overall_score),
    })),
    recentGrades: (grades || []).map((g) => ({
      title: (g.assignments as any)?.title || "Devoir",
      type: (g.assignments as any)?.type || "exercice",
      date: g.graded_at ? new Date(g.graded_at).toLocaleDateString("fr-FR") : "-",
      score: Math.round(g.score || 0),
      max: Math.round((g.assignments as any)?.max_score || 100),
    })),
    feedback: feedback?.[0]
      ? {
          teacher: (feedback[0].profiles as any)?.full_name || "Enseignant",
          date: new Date(feedback[0].created_at).toLocaleDateString("fr-FR"),
          text: feedback[0].feedback,
        }
      : null,
  }
}

export async function fetchStudentCalendarData(
  supabase: SupabaseClient,
  userId: string,
  monthStart: Date,
  monthEnd: Date,
) {
  const { data } = await supabase
    .from("practice_daily")
    .select("practice_date, completed_count, target_count, status")
    .eq("user_id", userId)
    .gte("practice_date", monthStart.toISOString().slice(0, 10))
    .lte("practice_date", monthEnd.toISOString().slice(0, 10))

  const map: Record<number, { count: number; type: "full" | "partial" | "missed" }> = {}
  for (const row of data || []) {
    const day = new Date(row.practice_date).getDate()
    map[day] = {
      count: row.completed_count || 0,
      type: (row.status as "full" | "partial" | "missed") || "missed",
    }
  }
  return map
}

export async function fetchStudentExercisesData(supabase: SupabaseClient, userId: string, schoolId?: string | null) {
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("student_id", userId)
    .eq("status", "active")

  const classIds = Array.from(new Set((enrollments || []).map((e) => e.class_id)))
  if (!classIds.length) {
    return {
      assignments: [] as any[],
      personalizedExercises: [] as any[],
      classes: [] as any[],
    }
  }

  let classQuery = supabase
    .from("classes")
    .select("id, name")
    .in("id", classIds)
    .is("archived_at", null)

  classQuery = schoolId ? classQuery.eq("school_id", schoolId) : classQuery
  const { data: classes } = await classQuery

  const activeClassIds = (classes || []).map((c) => c.id)
  if (!activeClassIds.length) {
    return {
      assignments: [] as any[],
      personalizedExercises: [] as any[],
      classes: [] as any[],
    }
  }

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, school_id, class_id, title, description, type, cefr_level, due_at, created_at")
    .in("class_id", activeClassIds)
    .eq("is_published", true)
    .order("due_at", { ascending: true, nullsFirst: false })

  const assignmentIds = (assignments || []).map((a) => a.id)
  const { data: submissions } = assignmentIds.length
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, status, content, score, feedback, submitted_at, graded_at")
        .eq("student_id", userId)
        .in("assignment_id", assignmentIds)
    : { data: [] as any[] }

  const { data: assignmentShares } = assignmentIds.length
    ? await (schoolId
        ? supabase
            .from("document_shares")
            .select("assignment_id, document_id")
            .in("assignment_id", assignmentIds)
            .eq("school_id", schoolId)
        : supabase
            .from("document_shares")
            .select("assignment_id, document_id")
            .in("assignment_id", assignmentIds))
    : { data: [] as any[] }

  const assignmentDocumentIds = Array.from(new Set((assignmentShares || []).map((share) => share.document_id)))
  const { data: assignmentDocs } = assignmentDocumentIds.length
    ? await supabase
        .from("documents")
        .select("id, name, file_path, mime_type, size_bytes")
        .in("id", assignmentDocumentIds)
    : { data: [] as any[] }

  let personalizedQuery = supabase
    .from("personalized_exercises")
    .select("id, title, instructions, exercise_type, cefr_level, is_completed, due_at, created_at")
    .eq("student_id", userId)
    .order("created_at", { ascending: false })

  personalizedQuery = schoolId ? personalizedQuery.eq("school_id", schoolId) : personalizedQuery
  const { data: personalized } = await personalizedQuery

  const classNameById = new Map((classes || []).map((c) => [c.id, c.name]))
  const submissionByAssignment = new Map<string, any>()
  for (const submission of submissions || []) submissionByAssignment.set(submission.assignment_id, submission)

  const documentById = new Map((assignmentDocs || []).map((doc) => [doc.id, doc]))
  const documentsByAssignment = new Map<string, Array<{ id: string; name: string; filePath: string; mimeType: string | null; sizeBytes: number | null }>>()

  for (const share of assignmentShares || []) {
    const doc = documentById.get(share.document_id)
    if (!doc) continue
    const rows = documentsByAssignment.get(share.assignment_id) || []
    if (!rows.some((row) => row.id === doc.id)) {
      rows.push({
        id: doc.id,
        name: doc.name,
        filePath: doc.file_path,
        mimeType: doc.mime_type || null,
        sizeBytes: typeof doc.size_bytes === "number" ? doc.size_bytes : null,
      })
    }
    documentsByAssignment.set(share.assignment_id, rows)
  }

  return {
    classes: (classes || []).map((c) => ({ id: c.id, name: c.name })),
    assignments: (assignments || []).map((assignment) => {
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
        dueAt: assignment.due_at,
        createdAt: assignment.created_at,
        documents: documentsByAssignment.get(assignment.id) || [],
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              score: submission.score,
              feedback: submission.feedback || "",
              submittedAt: submission.submitted_at,
              gradedAt: submission.graded_at,
              content: payload,
            }
          : null,
      }
    }),
    personalizedExercises: (personalized || []).map((exercise) => ({
      id: exercise.id,
      title: exercise.title,
      instructions: exercise.instructions,
      type: normalizeAssignmentType(exercise.exercise_type),
      level: upLevel(exercise.cefr_level),
      isCompleted: !!exercise.is_completed,
      dueAt: exercise.due_at,
      createdAt: exercise.created_at,
    })),
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

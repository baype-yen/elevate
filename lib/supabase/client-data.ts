import type { SupabaseClient } from "@supabase/supabase-js"

function upLevel(level: string | null | undefined) {
  return (level || "b1").toUpperCase()
}

function normalizeLevel(level: string) {
  return level.toLowerCase()
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
    throw new Error("Class name is required.")
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
    throw new Error("Class name is required.")
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
    throw new Error("First name and last name are required.")
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
    throw new Error("First name and last name are required.")
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
  if (!classIds.length) return { className: "No class", students: [] as any[], classes: [] as any[] }

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
      lastActive: r.city || "Roster record",
    }
  })

  const enrolledList = (enrollments || []).map((e) => {
    const name = (e.profiles as any)?.full_name || "Student"
    const scores = studentScoreMap.get(e.student_id) || []
    const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const lastDate = studentLastMap.get(e.student_id)
    const lastActive = lastDate ? new Date(lastDate).toLocaleDateString() : "No activity"
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
    className: classId ? classes?.[0]?.name || "Class" : "All Active Classes",
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

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, type, cefr_level, class_id, due_at")
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
    .select("assignment_id, student_id, status, score, submitted_at, profiles(full_name)")
    .in("assignment_id", assignmentIds)
    .order("submitted_at", { ascending: false })

  const byAssignment = new Map<string, any>()
  for (const a of assignments || []) byAssignment.set(a.id, a)

  const items = (submissions || []).map((s) => {
    const a = byAssignment.get(s.assignment_id)
    return {
      title: a?.title || "Assignment",
      student: (s.profiles as any)?.full_name || "Student",
      submitted: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "-",
      status: s.status === "graded" ? "Graded" : "Pending",
      score: s.score,
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
  const { data } = schoolId
    ? await supabase
        .from("documents")
        .select("id, name, mime_type, size_bytes, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
    : await supabase
        .from("documents")
        .select("id, name, mime_type, size_bytes, created_at")
        .eq("owner_id", userId)
        .is("school_id", null)
        .order("created_at", { ascending: false })

  return (data || []).map((d) => ({
    name: d.name,
    type: (d.mime_type || "FILE").split("/").pop()?.toUpperCase() || "FILE",
    size: d.size_bytes > 1024 * 1024 ? `${(d.size_bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(d.size_bytes / 1024)} KB`,
    date: new Date(d.created_at).toLocaleDateString(),
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
    text: (e.payload as any)?.text || `${(e.profiles as any)?.full_name || "Someone"} ${e.event_type.replaceAll("_", " ")}`,
    time: new Date(e.created_at).toLocaleString(),
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
      title: u.title,
      due: u.due_at ? new Date(u.due_at).toLocaleDateString() : "No due date",
      type: (u.type || "exercise").toString(),
      urgent: !!u.due_at && new Date(u.due_at).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 2,
    })),
    skills: Array.from(uniqueSkills.values()).slice(0, 5).map((r) => ({
      label: (r.skills as any)?.label || "Skill",
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
      skill: (row.skills as any)?.label || "Skill",
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
      month: new Date(h.month_date).toLocaleDateString(undefined, { month: "short" }),
      score: Math.round(h.overall_score),
    })),
    recentGrades: (grades || []).map((g) => ({
      title: (g.assignments as any)?.title || "Assignment",
      type: (g.assignments as any)?.type || "exercise",
      date: g.graded_at ? new Date(g.graded_at).toLocaleDateString() : "-",
      score: Math.round(g.score || 0),
      max: Math.round((g.assignments as any)?.max_score || 100),
    })),
    feedback: feedback?.[0]
      ? {
          teacher: (feedback[0].profiles as any)?.full_name || "Teacher",
          date: new Date(feedback[0].created_at).toLocaleDateString(),
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

export async function fetchStudentExercisesData(supabase: SupabaseClient, userId: string) {
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("student_id", userId)
    .eq("status", "active")
    .limit(1)

  const classId = enrollments?.[0]?.class_id || null
  if (!classId) return [] as any[]

  const { data } = await supabase
    .from("assignments")
    .select("id, title, type, cefr_level, due_at")
    .eq("class_id", classId)
    .order("due_at", { ascending: true })

  return data || []
}

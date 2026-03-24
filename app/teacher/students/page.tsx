"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db, auth } from "@/lib/firebase/client"
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, limit } from "firebase/firestore"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherStudentsData, type TeacherStudentRow, type TeacherStudentsData } from "@/lib/firebase/client-data"

const avatarColors = ["bg-abricot", "bg-violet", "bg-watermelon", "bg-navy"]
const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const

type ManualExerciseType = "mixed" | "grammar" | "conjugation" | "vocabulary" | "writing"

const manualExerciseTypeOptions: Array<{ value: ManualExerciseType; label: string }> = [
  { value: "mixed", label: "Mixte" },
  { value: "grammar", label: "Grammaire" },
  { value: "conjugation", label: "Conjugaison" },
  { value: "vocabulary", label: "Vocabulaire" },
  { value: "writing", label: "Écriture" },
]

const manualExerciseTemplates: Record<ManualExerciseType, { title: string; instructions: string }> = {
  mixed: {
    title: "Remédiation ciblée - Compétences mixtes",
    instructions: "Travaille les difficultés repérées aujourd'hui : 2 exercices de grammaire, 2 de vocabulaire et 2 de reformulation. Soigne la précision et l'orthographe.",
  },
  grammar: {
    title: "Remédiation ciblée - Grammaire",
    instructions: "Corrige des phrases avec erreurs de structure (accord sujet-verbe, articles, prépositions, ordre des mots). Pour chaque correction, explique brièvement la règle utilisée.",
  },
  conjugation: {
    title: "Remédiation ciblée - Conjugaison",
    instructions: "Reprends les temps verbaux vus en cours. Complète puis réécris des phrases en choisissant le bon temps et le bon auxiliaire. Justifie les choix sur 2 exemples.",
  },
  vocabulary: {
    title: "Remédiation ciblée - Vocabulaire",
    instructions: "Renforce le lexique professionnel : reformule les phrases avec un vocabulaire plus précis, puis crée 8 phrases personnelles pour mémoriser les nouveaux mots.",
  },
  writing: {
    title: "Remédiation ciblée - Production écrite",
    instructions: "Rédige un texte court structuré en appliquant les corrections vues ensemble : clarté, connecteurs, grammaire, ponctuation et vocabulaire adapté au contexte.",
  },
}

function normalizeManualExerciseType(value: string): ManualExerciseType {
  if (value === "grammar") return "grammar"
  if (value === "conjugation") return "conjugation"
  if (value === "vocabulary") return "vocabulary"
  if (value === "writing") return "writing"
  return "mixed"
}

function levelColorClass(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

function sanitizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function normalizeNameKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const btsMcoCredentialsByName: Record<string, { email: string; password: string }> = {
  [normalizeNameKey("Cheyma ALLIOUA")]: {
    email: "cheyma.allioua@btsmco.local",
    password: "CAll!26Mco#",
  },
  [normalizeNameKey("Lisa DI LUIGI")]: {
    email: "lisa.diluigi@btsmco.local",
    password: "LDi!26Mco#",
  },
  [normalizeNameKey("Romain FIEFEL")]: {
    email: "romain.fiefel@btsmco.local",
    password: "RFi!26Mco#",
  },
  [normalizeNameKey("Jessica FIGUEIREDO")]: {
    email: "jessica.figueiredo@btsmco.local",
    password: "JFi!26Mco#",
  },
  [normalizeNameKey("Emma FREYWALD")]: {
    email: "emma.freywald@btsmco.local",
    password: "EFr!26Mco#",
  },
  [normalizeNameKey("Emma HILT")]: {
    email: "emma.hilt@btsmco.local",
    password: "EHi!26Mco#",
  },
  [normalizeNameKey("Matys OLIVAREZ")]: {
    email: "matys.olivarez@btsmco.local",
    password: "MOl!26Mco#",
  },
  [normalizeNameKey("Tom PINNA")]: {
    email: "tom.pinna@btsmco.local",
    password: "TPi!26Mco#",
  },
  [normalizeNameKey("Soumiya RAHMI")]: {
    email: "soumiya.rahmi@btsmco.local",
    password: "SRa!26Mco#",
  },
  [normalizeNameKey("Tom SCHEIBER")]: {
    email: "tom.scheiber@btsmco.local",
    password: "TSc!26Mco#",
  },
  [normalizeNameKey("Lylian SCHMIDLIN")]: {
    email: "lylian.schmidlin@btsmco.local",
    password: "LSc!26Mco#",
  },
}

function normalizeEmailDomain(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/^@+/, "")
  return cleaned || "ecole.local"
}

function toDateMs(value: any): number {
  if (!value) return 0
  if (typeof value?.toDate === "function") return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function buildTempPassword(firstName: string, lastName: string, index: number) {
  const firstToken = sanitizeToken(firstName)
  const lastToken = sanitizeToken(lastName)
  const firstInitial = (firstToken[0] || "x").toUpperCase()
  const lastChunk = (lastToken.slice(0, 2) || "xx").toLowerCase()
  const serial = String(index + 1).padStart(2, "0")
  return `${firstInitial}${lastChunk}!26Mco${serial}`
}

export default function StudentsPage() {
  const { context, loading } = useAppContext()
  const [selectedClass, setSelectedClass] = useState<string | string[]>("all")
  const [data, setData] = useState<TeacherStudentsData | null>(null)
  const [enrollClassId, setEnrollClassId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [studentEmail, setStudentEmail] = useState("")
  const [studentPassword, setStudentPassword] = useState("")
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [bulkSyncBusy, setBulkSyncBusy] = useState(false)
  const [levelBusyId, setLevelBusyId] = useState<string | null>(null)
  const [manualExerciseBusy, setManualExerciseBusy] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null)
  const [levelError, setLevelError] = useState<string | null>(null)
  const [levelSuccess, setLevelSuccess] = useState<string | null>(null)
  const [manualExerciseError, setManualExerciseError] = useState<string | null>(null)
  const [manualExerciseSuccess, setManualExerciseSuccess] = useState<string | null>(null)
  const [levelDrafts, setLevelDrafts] = useState<Record<string, string>>({})
  const [manualTargetStudentRowId, setManualTargetStudentRowId] = useState("")
  const [manualExerciseType, setManualExerciseType] = useState<ManualExerciseType>("mixed")
  const [manualExerciseLevel, setManualExerciseLevel] = useState("B1")
  const [manualExerciseTitle, setManualExerciseTitle] = useState("")
  const [manualExerciseInstructions, setManualExerciseInstructions] = useState("")
  const [manualExerciseDueDate, setManualExerciseDueDate] = useState("")
  const [manualAssignedTodayByRow, setManualAssignedTodayByRow] = useState<Record<string, number>>({})
  const [emailDomain, setEmailDomain] = useState("btsmco.local")
  const [credentialHelperMessage, setCredentialHelperMessage] = useState<string | null>(null)
  const [rosterCandidates, setRosterCandidates] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])

  const loadManualAssignmentsToday = async (nextData?: TeacherStudentsData | null) => {
    if (!context) {
      setManualAssignedTodayByRow({})
      return
    }

    const sourceData = nextData || data
    if (!sourceData?.students.length) {
      setManualAssignedTodayByRow({})
      return
    }

    const assignableRows = sourceData.students.filter((student) => student.canEditLevel && !!student.studentId && !!student.classId)
    if (!assignableRows.length) {
      setManualAssignedTodayByRow({})
      return
    }

    const rowKeys = new Set(assignableRows.map((student) => `${student.classId}:${student.studentId}`))
    const selectedClassId = !Array.isArray(selectedClass) && selectedClass !== "all" ? selectedClass : null

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const startOfTodayMs = startOfToday.getTime()

    try {
      const eventsSnapshot = await getDocs(query(
        collection(db, "activity_events"),
        where("actor_id", "==", context.userId),
        where("school_id", "==", context.activeSchoolId),
        orderBy("created_at", "desc"),
        limit(800),
      ))

      const countsByRow: Record<string, number> = {}

      for (const eventDoc of eventsSnapshot.docs) {
        const event = eventDoc.data() as any
        const createdAtMs = toDateMs(event.created_at)
        if (createdAtMs && createdAtMs < startOfTodayMs) break

        if (event.event_type !== "assignment_created") continue

        const payload = event.payload && typeof event.payload === "object" ? event.payload : null
        const payloadKind = typeof payload?.kind === "string" ? payload.kind : ""
        if (payloadKind !== "teacher_manual_exercise") continue

        const studentId = typeof event.target_user_id === "string" ? event.target_user_id : ""
        const classId = typeof event.class_id === "string" ? event.class_id : ""
        if (!studentId || !classId) continue
        if (selectedClassId && classId !== selectedClassId) continue

        const rowKey = `${classId}:${studentId}`
        if (!rowKeys.has(rowKey)) continue

        countsByRow[rowKey] = (countsByRow[rowKey] || 0) + 1
      }

      setManualAssignedTodayByRow(countsByRow)
    } catch {
      setManualAssignedTodayByRow({})
    }
  }

  const loadStudents = async () => {
    if (!context) return
    const nextData = await fetchTeacherStudentsData(
      db,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    )
    setData(nextData)
    await loadManualAssignmentsToday(nextData)
  }

  useEffect(() => {
    setLevelError(null)
    setLevelSuccess(null)
    loadStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId, selectedClass])

  useEffect(() => {
    if (!data?.classes.length) {
      setEnrollClassId("")
      return
    }

    const classStillVisible = data.classes.some((classItem) => classItem.id === enrollClassId)
    if (!classStillVisible) {
      setEnrollClassId(data.classes[0].id)
    }
  }, [data?.classes, enrollClassId])

  useEffect(() => {
    if (!data?.students.length) {
      setLevelDrafts({})
      return
    }

    const nextDrafts: Record<string, string> = {}
    for (const student of data.students) {
      if (student.canEditLevel) {
        nextDrafts[student.id] = student.level
      }
    }
    setLevelDrafts(nextDrafts)
  }, [data?.students])

  const assignableStudents = useMemo(
    () => data?.students.filter((student) => student.canEditLevel && !!student.studentId && !!student.classId) || [],
    [data?.students],
  )

  const manualTargetStudent = useMemo(
    () => assignableStudents.find((student) => student.id === manualTargetStudentRowId) || null,
    [assignableStudents, manualTargetStudentRowId],
  )

  useEffect(() => {
    if (!assignableStudents.length) {
      setManualTargetStudentRowId("")
      return
    }

    if (!manualTargetStudentRowId || !assignableStudents.some((student) => student.id === manualTargetStudentRowId)) {
      setManualTargetStudentRowId(assignableStudents[0].id)
    }
  }, [assignableStudents, manualTargetStudentRowId])

  useEffect(() => {
    if (!manualTargetStudent) return
    if (manualExerciseTitle.trim() || manualExerciseInstructions.trim()) return

    const nextLevel = (levelDrafts[manualTargetStudent.id] || manualTargetStudent.level || "B1").toUpperCase()
    const template = manualExerciseTemplates[manualExerciseType]

    setManualExerciseLevel(nextLevel)
    setManualExerciseTitle(`${template.title} (${nextLevel})`)
    setManualExerciseInstructions(template.instructions)
  }, [
    manualTargetStudent,
    levelDrafts,
    manualExerciseType,
    manualExerciseTitle,
    manualExerciseInstructions,
  ])

  useEffect(() => {
    if (!context || !enrollClassId) {
      setRosterCandidates([])
      return
    }

    let active = true

    async function loadRosterCandidates() {
      const q = query(
        collection(db, "class_students"),
        where("class_id", "==", enrollClassId),
        orderBy("sort_order", "asc"),
        orderBy("last_name", "asc"),
        orderBy("first_name", "asc"),
      )
      const snapshot = await getDocs(q)

      if (!active) return

      setRosterCandidates(
        snapshot.docs.map((d) => {
          const row = d.data()
          return {
            id: d.id,
            firstName: row.first_name,
            lastName: row.last_name,
          }
        }),
      )
    }

    loadRosterCandidates()

    return () => {
      active = false
    }
  }, [context, enrollClassId])

  const credentialSuggestions = useMemo(() => {
    const domain = normalizeEmailDomain(emailDomain)
    const counters = new Map<string, number>()

    return rosterCandidates.map((student, index) => {
      const firstToken = sanitizeToken(student.firstName) || "student"
      const lastToken = sanitizeToken(student.lastName) || "classe"
      const baseLocal = `${firstToken}.${lastToken}`
      const seen = (counters.get(baseLocal) || 0) + 1
      counters.set(baseLocal, seen)

      const localPart = seen > 1 ? `${baseLocal}${seen}` : baseLocal
      const fullName = `${student.firstName} ${student.lastName}`.trim()
      const mappedCredentials = btsMcoCredentialsByName[normalizeNameKey(fullName)]

      return {
        id: student.id,
        fullName,
        email: mappedCredentials?.email || `${localPart}@${domain}`,
        password: mappedCredentials?.password || buildTempPassword(student.firstName, student.lastName, index),
      }
    })
  }, [emailDomain, rosterCandidates])

  const copyToClipboard = async (content: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCredentialHelperMessage(successMessage)
    } catch {
      setCredentialHelperMessage("Copie impossible depuis ce navigateur. Copiez manuellement.")
    }
  }

  const copySuggestionLine = async (suggestion: { fullName: string; email: string; password: string }) => {
    await copyToClipboard(`${suggestion.fullName},${suggestion.email},${suggestion.password}`, "Identifiants copiés.")
  }

  const copySuggestionCsv = async () => {
    if (!credentialSuggestions.length) {
      setCredentialHelperMessage("Aucune suggestion disponible pour cette classe.")
      return
    }

    const csv = [
      "fullName,email,tempPassword",
      ...credentialSuggestions.map((suggestion) => `${suggestion.fullName},${suggestion.email},${suggestion.password}`),
    ].join("\n")

    await copyToClipboard(csv, "Liste CSV copiée.")
  }

  const applySuggestionToForm = (suggestion: { fullName: string; email: string; password: string }) => {
    setStudentName(suggestion.fullName)
    setStudentEmail(suggestion.email)
    setStudentPassword(suggestion.password)
    setCredentialHelperMessage(`Formulaire prérempli pour ${suggestion.fullName}.`)
  }

  const provisionStudentAccess = async (input: {
    fullName: string
    email: string
    password: string
    classId: string
  }) => {
    const idToken = await auth.currentUser?.getIdToken()
    const response = await fetch("/api/teacher/enroll-student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(input),
    })

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      email?: string
      accountMode?: "created" | "updated"
    }

    if (!response.ok) {
      throw new Error(payload.error || "Impossible de créer l'accès élève.")
    }

    return payload
  }

  const onSyncSuggestedCredentials = async () => {
    if (!enrollClassId) {
      setEnrollError("Sélectionnez une classe avant de synchroniser les identifiants.")
      return
    }

    if (!credentialSuggestions.length) {
      setEnrollError("Aucun élève de liste trouvé pour cette classe.")
      return
    }

    try {
      setBulkSyncBusy(true)
      setEnrollError(null)
      setEnrollSuccess(null)

      let created = 0
      let updated = 0
      const failed: string[] = []

      for (const suggestion of credentialSuggestions) {
        try {
          const payload = await provisionStudentAccess({
            fullName: suggestion.fullName,
            email: suggestion.email,
            password: suggestion.password,
            classId: enrollClassId,
          })

          if (payload.accountMode === "updated") {
            updated += 1
          } else {
            created += 1
          }
        } catch (error: any) {
          failed.push(`${suggestion.fullName}: ${error?.message || "échec"}`)
        }
      }

      await loadStudents()

      if (failed.length) {
        const preview = failed.slice(0, 2).join(" | ")
        const suffix = failed.length > 2 ? " | ..." : ""
        setEnrollError(`${failed.length} élève(s) en échec. ${preview}${suffix}`)
      }

      setEnrollSuccess(`Synchronisation terminée : ${created} créés, ${updated} mots de passe réinitialisés.`)
    } finally {
      setBulkSyncBusy(false)
    }
  }

  const openManualExerciseComposer = (student: TeacherStudentRow, preferredType: ManualExerciseType = "mixed") => {
    if (!student.canEditLevel || !student.studentId || !student.classId) {
      setManualExerciseError("Créez d'abord l'accès élève pour pouvoir assigner des exercices personnalisés.")
      return
    }

    const nextType = normalizeManualExerciseType(preferredType)
    const nextLevel = (levelDrafts[student.id] || student.level || "B1").toUpperCase()
    const template = manualExerciseTemplates[nextType]

    setManualTargetStudentRowId(student.id)
    setManualExerciseType(nextType)
    setManualExerciseLevel(nextLevel)
    setManualExerciseTitle(`${template.title} (${nextLevel})`)
    setManualExerciseInstructions(template.instructions)
    setManualExerciseDueDate("")
    setManualExerciseError(null)
    setManualExerciseSuccess(null)
  }

  const onApplyManualTemplate = () => {
    const nextType = normalizeManualExerciseType(manualExerciseType)
    const nextLevel = (manualExerciseLevel || "B1").toUpperCase()
    const template = manualExerciseTemplates[nextType]

    setManualExerciseType(nextType)
    setManualExerciseLevel(nextLevel)
    setManualExerciseTitle(`${template.title} (${nextLevel})`)
    setManualExerciseInstructions(template.instructions)
  }

  const onAssignManualExercise = async () => {
    if (!context) return

    if (!manualTargetStudent?.studentId || !manualTargetStudent.classId) {
      setManualExerciseError("Sélectionnez un élève avec accès actif avant d'assigner un exercice.")
      return
    }

    const title = manualExerciseTitle.trim()
    const instructions = manualExerciseInstructions.trim()
    if (!title || !instructions) {
      setManualExerciseError("Le titre et la consigne sont obligatoires.")
      return
    }

    const level = (manualExerciseLevel || manualTargetStudent.level || "B1").toUpperCase()
    if (!cefrLevels.includes(level as (typeof cefrLevels)[number])) {
      setManualExerciseError("Niveau CECRL invalide.")
      return
    }

    const dueAt = manualExerciseDueDate
      ? new Date(`${manualExerciseDueDate}T23:59:59`).toISOString()
      : null

    try {
      setManualExerciseBusy(true)
      setManualExerciseError(null)
      setManualExerciseSuccess(null)

      await addDoc(collection(db, "personalized_exercises"), {
        school_id: context.activeSchoolId,
        class_id: manualTargetStudent.classId,
        student_id: manualTargetStudent.studentId,
        created_by: context.userId,
        title,
        instructions,
        exercise_type: manualExerciseType,
        cefr_level: level.toLowerCase(),
        due_at: dueAt,
        source_kind: "teacher_manual",
        is_completed: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      await addDoc(collection(db, "activity_events"), {
        school_id: context.activeSchoolId,
        class_id: manualTargetStudent.classId,
        actor_id: context.userId,
        target_user_id: manualTargetStudent.studentId,
        event_type: "assignment_created",
        payload: {
          kind: "teacher_manual_exercise",
          text: `Exercice personnalisé ajouté pour ${manualTargetStudent.name}.`,
          title,
          exercise_type: manualExerciseType,
          cefr_level: level,
        },
        created_at: serverTimestamp(),
      })

      const rowKey = `${manualTargetStudent.classId}:${manualTargetStudent.studentId}`
      setManualAssignedTodayByRow((previous) => ({
        ...previous,
        [rowKey]: (previous[rowKey] || 0) + 1,
      }))
      setManualExerciseSuccess(`Exercice personnalisé assigné à ${manualTargetStudent.name}.`)
      setManualExerciseDueDate("")
    } catch (error: any) {
      setManualExerciseError(error?.message || "Impossible d'assigner l'exercice personnalisé.")
    } finally {
      setManualExerciseBusy(false)
    }
  }

  const updateLevelDraft = (studentRowId: string, level: string) => {
    setLevelDrafts((previous) => ({
      ...previous,
      [studentRowId]: level,
    }))
  }

  const onSaveStudentLevel = async (student: TeacherStudentRow) => {
    if (!student.canEditLevel || !student.studentId || !student.classId) {
      setLevelError("Ce profil n'a pas encore d'accès élève actif.")
      return
    }

    const selectedLevel = (levelDrafts[student.id] || student.level || "B1").toUpperCase()
    if (selectedLevel === student.level) {
      setLevelSuccess(`Le niveau de ${student.name} (${student.className}) est déjà ${selectedLevel}.`)
      setLevelError(null)
      return
    }

    try {
      setLevelBusyId(student.id)
      setLevelError(null)
      setLevelSuccess(null)

      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch("/api/teacher/update-student-level", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          classId: student.classId,
          studentId: student.studentId,
          cefrLevel: selectedLevel,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string; cefrLevel?: string }
      if (!response.ok) {
        throw new Error(payload.error || "Impossible de mettre à jour le niveau de l'élève.")
      }

      setLevelSuccess(`Niveau mis à jour pour ${student.name} (${student.className}) : ${payload.cefrLevel || selectedLevel}.`)
      await loadStudents()
    } catch (error: any) {
      setLevelError(error?.message || "Impossible de mettre à jour le niveau de l'élève.")
    } finally {
      setLevelBusyId(null)
    }
  }

  const onProvisionStudent = async () => {
    if (!enrollClassId) {
      setEnrollError("Sélectionnez une classe avant de créer un accès élève.")
      return
    }

    if (!studentName.trim() || !studentEmail.trim() || !studentPassword.trim()) {
      setEnrollError("Le nom complet, l'e-mail et le mot de passe sont obligatoires.")
      return
    }

    try {
      setEnrollBusy(true)
      setEnrollError(null)
      setEnrollSuccess(null)

      const payload = await provisionStudentAccess({
        fullName: studentName,
        email: studentEmail,
        password: studentPassword,
        classId: enrollClassId,
      })

      const normalizedEmail = payload.email || studentEmail.trim().toLowerCase()
      if (payload.accountMode === "updated") {
        setEnrollSuccess(`Compte existant mis à jour pour ${normalizedEmail}. Le mot de passe temporaire a été réinitialisé.`)
      } else {
        setEnrollSuccess(`Accès créé pour ${normalizedEmail}. Partagez les identifiants avec l'élève.`)
      }
      setStudentName("")
      setStudentEmail("")
      setStudentPassword("")
      await loadStudents()
    } catch (e: any) {
      setEnrollError(e.message || "Impossible de créer l'accès élève.")
    } finally {
      setEnrollBusy(false)
    }
  }

  if (loading || !data) {
    return <div className="font-sans text-sm text-text-mid">Chargement des élèves...</div>
  }

  const showClassContext = !Array.isArray(selectedClass) && selectedClass === "all"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="font-serif text-lg font-bold text-navy">Profils élèves - {data.className}</h4>
        <BadgeChooser
          selected={selectedClass}
          onSelect={setSelectedClass}
          options={[
            { value: "all", label: "Toutes les classes" },
            ...data.classes.map((classItem) => ({ value: classItem.id, label: classItem.name })),
          ]}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_2fr] gap-4">
        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3.5">
          <h5 className="font-serif text-base font-bold text-navy">Créer un accès élève</h5>
          <p className="font-sans text-[13px] text-text-mid">
            Créez des identifiants de connexion et inscrivez l'élève directement dans une classe.
          </p>

          <InputField
            label="Nom complet"
            placeholder="ex. Marie Dupont"
            icon={<Icons.User />}
            value={studentName}
            onChange={setStudentName}
          />
          <InputField
            label="E-mail"
            placeholder="prenom.nom@ecole.fr"
            icon={<Icons.Mail />}
            type="email"
            value={studentEmail}
            onChange={setStudentEmail}
          />
          <InputField
            label="Mot de passe temporaire"
            placeholder="Au moins 8 caractères"
            icon={<Icons.Lock />}
            type="password"
            helper="Partagez ce mot de passe avec l'élève."
            value={studentPassword}
            onChange={setStudentPassword}
          />

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy mb-2">Affecter à une classe</div>
            {data.classes.length ? (
              <BadgeChooser
                selected={enrollClassId}
                onSelect={(value) => setEnrollClassId(Array.isArray(value) ? value[0] || "" : value)}
                options={data.classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
              />
            ) : (
              <div className="font-sans text-sm text-text-mid">Créez une classe avant de créer des comptes élèves.</div>
            )}
          </div>

          <div className="rounded-xl border border-gray-mid bg-off-white p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-sans text-[13px] font-semibold text-navy">Assistant identifiants (liste de classe)</div>
                <div className="font-sans text-[11px] text-text-light">Idéal pour préparer rapidement les comptes de groupe (ex. BTS MCO).</div>
              </div>
              <ElevateButton variant="outline" size="sm" onClick={copySuggestionCsv} disabled={!credentialSuggestions.length}>
                Copier CSV
              </ElevateButton>
            </div>

            <ElevateButton
              variant="secondary"
              size="sm"
              onClick={onSyncSuggestedCredentials}
              disabled={!credentialSuggestions.length || bulkSyncBusy || enrollBusy}
            >
              {bulkSyncBusy ? "Synchronisation..." : "Synchroniser les accès"}
            </ElevateButton>

            <InputField
              label="Domaine e-mail"
              placeholder="btsmco.local"
              icon={<Icons.Mail />}
              value={emailDomain}
              onChange={setEmailDomain}
              helper="Exemple : btsmco.local"
            />

            {credentialSuggestions.length ? (
              <div className="max-h-56 overflow-auto pr-1 flex flex-col gap-2">
                {credentialSuggestions.map((suggestion) => (
                  <div key={suggestion.id} className="rounded-lg border border-gray-light bg-card px-3 py-2.5">
                    <div className="font-sans text-[13px] font-semibold text-text-dark">{suggestion.fullName}</div>
                    <div className="font-sans text-xs text-text-mid">{suggestion.email}</div>
                    <div className="font-sans text-xs text-text-light">Mot de passe: {suggestion.password}</div>
                    <div className="mt-2 flex gap-2">
                      <ElevateButton size="sm" variant="secondary" onClick={() => applySuggestionToForm(suggestion)}>
                        Utiliser
                      </ElevateButton>
                      <ElevateButton size="sm" variant="outline" onClick={() => copySuggestionLine(suggestion)}>
                        Copier
                      </ElevateButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-sans text-sm text-text-mid">
                Ajoutez des élèves dans la liste de classe pour générer automatiquement leurs identifiants.
              </div>
            )}

            {credentialHelperMessage && <div className="font-sans text-xs text-violet">{credentialHelperMessage}</div>}
          </div>

          <ElevateButton
            variant="primary"
            icon={<Icons.Plus />}
            onClick={onProvisionStudent}
            disabled={enrollBusy || !data.classes.length}
          >
            Créer l'accès
          </ElevateButton>

          {enrollError && <p className="font-sans text-sm text-watermelon">{enrollError}</p>}
          {enrollSuccess && <p className="font-sans text-sm text-violet">{enrollSuccess}</p>}
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.9fr_1.7fr_0.8fr_1fr_120px] px-5 py-3 bg-gray-light font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
            <span>Élève</span>
            <span>Niveau CECRL</span>
            <span>Score</span>
            <span>Dernière activité</span>
            <span>Actions</span>
          </div>
          {levelError && <div className="px-5 py-2 font-sans text-sm text-watermelon border-t border-gray-light">{levelError}</div>}
          {levelSuccess && <div className="px-5 py-2 font-sans text-sm text-violet border-t border-gray-light">{levelSuccess}</div>}
          {data.students.map((s, i) => {
            const assignedTodayCount = s.studentId
              ? (manualAssignedTodayByRow[`${s.classId}:${s.studentId}`] || 0)
              : 0

            return (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-[1.9fr_1.7fr_0.8fr_1fr_120px] px-5 py-3.5 items-center border-t border-gray-light gap-2 md:gap-0">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center font-sans font-bold text-xs text-white shrink-0",
                  avatarColors[i % 4],
                )}>
                  {s.initials}
                </div>
                <div>
                  <div className="font-sans text-sm font-semibold text-text-dark">{s.name}</div>
                  {showClassContext && <div className="font-sans text-[11px] text-text-light">{s.className}</div>}
                </div>
              </div>
              <div>
                {s.canEditLevel ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={levelDrafts[s.id] || s.level}
                      onChange={(event) => updateLevelDraft(s.id, event.target.value.toUpperCase())}
                      className="h-9 px-2.5 rounded-lg border border-gray-mid bg-card font-sans text-sm font-semibold text-navy outline-none focus:border-navy"
                      disabled={levelBusyId === s.id}
                    >
                      {cefrLevels.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                    <ElevateButton
                      size="sm"
                      variant="outline"
                      onClick={() => onSaveStudentLevel(s)}
                      disabled={levelBusyId === s.id || (levelDrafts[s.id] || s.level) === s.level}
                    >
                      {levelBusyId === s.id ? "..." : "OK"}
                    </ElevateButton>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LevelBadge level={s.level} colorClass={levelColorClass(s.level)} />
                    <span className="font-sans text-[11px] text-text-light">Inscrire le compte pour personnaliser</span>
                  </div>
                )}
              </div>
              <div className="font-serif text-base font-bold text-navy">{s.score}%</div>
              <div>
                <div className="font-sans text-[13px] text-text-light">{s.lastActive}</div>
                <div className="mt-1 inline-flex rounded-md border border-violet/25 bg-violet/10 px-2 py-0.5 font-sans text-[10px] font-semibold text-violet">
                  Auj.: {assignedTodayCount}
                </div>
              </div>
              <div className="flex gap-1.5 justify-start md:justify-end">
                <button
                  onClick={() => openManualExerciseComposer(s)}
                  disabled={!s.canEditLevel || !s.studentId || !s.classId || manualExerciseBusy}
                  title={s.canEditLevel ? "Assigner un exercice personnalisé" : "Créez l'accès élève pour assigner"}
                  className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Icons.Target />
                </button>
                <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                  <Icons.BarChart />
                </button>
              </div>
            </div>
            )
          })}
          {!data.students.length && (
            <div className="px-5 py-6 font-sans text-sm text-text-mid">Aucun élève inscrit trouvé.</div>
          )}

          <div className="border-t border-gray-mid bg-off-white px-5 py-4 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h6 className="font-serif text-base font-bold text-navy">Assigner un exercice personnalisé</h6>
                <p className="font-sans text-[12px] text-text-mid">
                  Utilisez cet espace pendant la séance pour envoyer une remédiation ciblée dès qu'une difficulté est repérée.
                </p>
              </div>
              {manualTargetStudent && (
                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs text-text-light">{manualTargetStudent.name}</span>
                  <LevelBadge level={manualExerciseLevel || manualTargetStudent.level} colorClass={levelColorClass((manualExerciseLevel || manualTargetStudent.level).toUpperCase())} />
                </div>
              )}
            </div>

            {assignableStudents.length ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-2.5">
                  <div>
                    <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">Élève cible</label>
                    <select
                      value={manualTargetStudentRowId}
                      onChange={(event) => {
                        const target = assignableStudents.find((student) => student.id === event.target.value)
                        if (!target) return
                        openManualExerciseComposer(target, manualExerciseType)
                      }}
                      className="w-full h-10 rounded-lg border border-gray-mid bg-card px-2.5 font-sans text-sm text-text-dark outline-none focus:border-navy"
                      disabled={manualExerciseBusy}
                    >
                      {assignableStudents.map((student) => (
                        <option key={student.id} value={student.id}>{student.name} · {student.className}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">Niveau ciblé</label>
                    <select
                      value={(manualExerciseLevel || "B1").toUpperCase()}
                      onChange={(event) => setManualExerciseLevel(event.target.value.toUpperCase())}
                      className="w-full h-10 rounded-lg border border-gray-mid bg-card px-2.5 font-sans text-sm text-text-dark outline-none focus:border-navy"
                      disabled={manualExerciseBusy}
                    >
                      {cefrLevels.map((level) => (
                        <option key={`manual-level-${level}`} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>

                  <InputField
                    label="Échéance (optionnelle)"
                    type="date"
                    value={manualExerciseDueDate}
                    onChange={setManualExerciseDueDate}
                  />
                </div>

                <div>
                  <div className="font-sans text-[13px] font-semibold text-navy mb-1.5">Type d'exercice</div>
                  <BadgeChooser
                    selected={manualExerciseType}
                    onSelect={(value) => setManualExerciseType(normalizeManualExerciseType(String(value)))}
                    options={manualExerciseTypeOptions}
                  />
                </div>

                <InputField
                  label="Titre"
                  placeholder="ex. Remédiation ciblée - Grammaire"
                  icon={<Icons.Clipboard />}
                  value={manualExerciseTitle}
                  onChange={setManualExerciseTitle}
                />

                <div>
                  <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
                    Consigne personnalisée
                  </label>
                  <textarea
                    value={manualExerciseInstructions}
                    onChange={(event) => setManualExerciseInstructions(event.target.value)}
                    placeholder="Décrivez précisément l'exercice demandé à l'élève..."
                    className="w-full min-h-[110px] rounded-[10px] border-2 border-gray-mid bg-card px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <ElevateButton variant="primary" icon={<Icons.Target />} onClick={onAssignManualExercise} disabled={manualExerciseBusy}>
                    {manualExerciseBusy ? "Envoi..." : "Assigner l'exercice"}
                  </ElevateButton>
                  <ElevateButton variant="outline" onClick={onApplyManualTemplate} disabled={manualExerciseBusy}>
                    Utiliser le modèle
                  </ElevateButton>
                  <ElevateButton
                    variant="ghost"
                    onClick={() => {
                      setManualExerciseTitle("")
                      setManualExerciseInstructions("")
                      setManualExerciseDueDate("")
                      setManualExerciseError(null)
                      setManualExerciseSuccess(null)
                    }}
                    disabled={manualExerciseBusy}
                  >
                    Effacer
                  </ElevateButton>
                </div>

                {manualExerciseError && <div className="font-sans text-sm text-watermelon">{manualExerciseError}</div>}
                {manualExerciseSuccess && <div className="font-sans text-sm text-violet">{manualExerciseSuccess}</div>}
              </>
            ) : (
              <div className="font-sans text-sm text-text-mid">
                Aucun élève avec accès actif pour l'instant. Créez d'abord les comptes depuis le panneau de gauche.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

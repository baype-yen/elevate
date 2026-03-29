"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { db } from "@/lib/firebase/client"
import { cn } from "@/lib/utils"
import {
  addClassRosterStudent,
  archiveTeacherClass,
  createTeacherClassProgram,
  deleteTeacherClassProgram,
  fetchTeacherClassDetail,
  fetchTeacherClassProgramsData,
  importClassRosterRows,
  removeClassRosterStudent,
  type TeacherClassProgramComposerData,
  type TeacherClassProgramQuickLinkKey,
  unarchiveTeacherClass,
  updateTeacherClassProgram,
} from "@/lib/firebase/client-data"
import { useAppContext } from "@/hooks/use-app-context"

function levelColor(level: string) {
  if (level === "B2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

function detectDelimiter(line: string) {
  const commaCount = (line.match(/,/g) || []).length
  const semicolonCount = (line.match(/;/g) || []).length
  return semicolonCount > commaCount ? ";" : ","
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === delimiter) {
      row.push(value.trim())
      value = ""
      continue
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1
      row.push(value.trim())
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      value = ""
      continue
    }

    value += char
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim())
    if (row.some((cell) => cell.length > 0)) rows.push(row)
  }

  return rows
}

function normalizeHeader(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
}

function parseRosterCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ""
  const delimiter = detectDelimiter(firstLine)
  const rows = parseDelimited(text, delimiter)
  if (!rows.length) return [] as Array<{ firstName: string; lastName: string; company: string; city: string }>

  const headerCells = rows[0].map(normalizeHeader)
  const hasNamedHeader = headerCells.includes("nom") && headerCells.includes("prenom")

  let dataRows = rows
  let map = {
    lastName: 0,
    firstName: 1,
    company: 2,
    city: 3,
  }

  if (hasNamedHeader) {
    dataRows = rows.slice(1)
    map = {
      lastName: headerCells.findIndex((h) => h === "nom" || h === "lastname" || h === "last"),
      firstName: headerCells.findIndex((h) => h === "prenom" || h === "firstname" || h === "first"),
      company: headerCells.findIndex((h) => h === "entreprise" || h === "company"),
      city: headerCells.findIndex((h) => h === "ville" || h === "city"),
    }
  }

  return dataRows
    .map((row) => ({
      lastName: (row[map.lastName] || "").trim(),
      firstName: (row[map.firstName] || "").trim(),
      company: map.company >= 0 ? (row[map.company] || "").trim() : "",
      city: map.city >= 0 ? (row[map.city] || "").trim() : "",
    }))
    .filter((row) => row.lastName && row.firstName)
}

const programQuickLinkOptions: Array<{ key: TeacherClassProgramQuickLinkKey; label: string; description: string }> = [
  {
    key: "course_exercises",
    label: "Exercices basés sur les cours",
    description: "Ouvre le module d'exercices lié aux documents étudiés.",
  },
  {
    key: "quiz_assignments",
    label: "Quiz / grammaire",
    description: "Dirige vers les quiz et exercices de grammaire.",
  },
  {
    key: "personalized_exercises",
    label: "Exercices personnalisés",
    description: "Accès rapide aux remédiations ciblées.",
  },
]

function normalizeDateKey(value: string) {
  const match = (value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ""
  return `${match[1]}-${match[2]}-${match[3]}`
}

type ClassDetailState = {
  classItem: {
    id: string
    name: string
    level: string
    classCode?: string | null
    academicYear: string | null
    archivedAt: string | null
    schoolId: string
  }
  roster: Array<{
    id: string
    firstName: string
    lastName: string
    company: string
    city: string
    sortOrder: number
    createdAt: string
  }>
}

export default function TeacherClassDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { context, loading } = useAppContext()
  const classId = typeof params.id === "string" ? params.id : ""

  const [data, setData] = useState<ClassDetailState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [lastName, setLastName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [company, setCompany] = useState("")
  const [city, setCity] = useState("")

  const [programData, setProgramData] = useState<TeacherClassProgramComposerData>({
    programs: [],
    assignments: [],
    documents: [],
  })
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [programDate, setProgramDate] = useState("")
  const [programTitle, setProgramTitle] = useState("")
  const [programMajorPoints, setProgramMajorPoints] = useState("")
  const [programNotes, setProgramNotes] = useState("")
  const [programAssignmentIds, setProgramAssignmentIds] = useState<string[]>([])
  const [programDocumentIds, setProgramDocumentIds] = useState<string[]>([])
  const [programQuickLinks, setProgramQuickLinks] = useState<TeacherClassProgramQuickLinkKey[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = async () => {
    if (!classId) return

    try {
      const result = await fetchTeacherClassDetail(db, classId)
      setData(result)
    } catch {
      setData(null)
    }

    try {
      const programs = await fetchTeacherClassProgramsData(db, classId, context?.activeSchoolId)
      setProgramData(programs)
    } catch {
      setProgramData({ programs: [], assignments: [], documents: [] })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, context?.activeSchoolId])

  const roster = useMemo(() => {
    return [...(data?.roster || [])].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    })
  }, [data?.roster])

  const sortedPrograms = useMemo(() => {
    return [...(programData.programs || [])].sort((left, right) => right.dateKey.localeCompare(left.dateKey))
  }, [programData.programs])

  const assignableAssignments = useMemo(
    () => (programData.assignments || []).filter((assignment) => assignment.isPublished),
    [programData.assignments],
  )

  const resetProgramComposer = () => {
    setEditingProgramId(null)
    setProgramDate("")
    setProgramTitle("")
    setProgramMajorPoints("")
    setProgramNotes("")
    setProgramAssignmentIds([])
    setProgramDocumentIds([])
    setProgramQuickLinks([])
  }

  const toggleStringValue = (current: string[], value: string) => {
    if (current.includes(value)) return current.filter((item) => item !== value)
    return [...current, value]
  }

  const toggleQuickLinkValue = (current: TeacherClassProgramQuickLinkKey[], value: TeacherClassProgramQuickLinkKey) => {
    if (current.includes(value)) return current.filter((item) => item !== value)
    return [...current, value]
  }

  const onEditProgram = (programId: string) => {
    const row = programData.programs.find((program) => program.id === programId)
    if (!row) return

    setEditingProgramId(row.id)
    setProgramDate(row.dateKey)
    setProgramTitle(row.title)
    setProgramMajorPoints(row.majorPoints || "")
    setProgramNotes(row.notes || "")
    setProgramAssignmentIds(row.assignmentIds || [])
    setProgramDocumentIds(row.documentIds || [])
    setProgramQuickLinks(row.quickLinks || [])
    setError(null)
    setSuccess(null)
  }

  const onSaveProgram = async () => {
    if (!context || !data) return

    const dateKey = normalizeDateKey(programDate)
    if (!dateKey) {
      setError("La date du programme est obligatoire.")
      return
    }

    if (!programTitle.trim()) {
      setError("Le titre du programme est obligatoire.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      if (editingProgramId) {
        await updateTeacherClassProgram(db, editingProgramId, {
          dateKey,
          title: programTitle,
          majorPoints: programMajorPoints,
          notes: programNotes,
          assignmentIds: programAssignmentIds,
          documentIds: programDocumentIds,
          quickLinks: programQuickLinks,
        })
        setSuccess("Programme de séance mis à jour.")
      } else {
        await createTeacherClassProgram(db, {
          classId,
          schoolId: data.classItem.schoolId,
          teacherId: context.userId,
          dateKey,
          title: programTitle,
          majorPoints: programMajorPoints,
          notes: programNotes,
          assignmentIds: programAssignmentIds,
          documentIds: programDocumentIds,
          quickLinks: programQuickLinks,
        })
        setSuccess("Programme de séance ajouté.")
      }

      await load()
      resetProgramComposer()
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer le programme.")
    } finally {
      setBusy(false)
    }
  }

  const onDeleteProgram = async (programId: string) => {
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      await deleteTeacherClassProgram(db, programId)
      if (editingProgramId === programId) {
        resetProgramComposer()
      }
      await load()
      setSuccess("Programme supprimé.")
    } catch (e: any) {
      setError(e.message || "Impossible de supprimer ce programme.")
    } finally {
      setBusy(false)
    }
  }

  const onToggleArchive = async () => {
    if (!data) return
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      if (data.classItem.archivedAt) await unarchiveTeacherClass(db, data.classItem.id)
      else await archiveTeacherClass(db, data.classItem.id)
      await load()
    } catch (e: any) {
      setError(e.message || "Impossible de mettre à jour le statut de la classe.")
    } finally {
      setBusy(false)
    }
  }

  const onAddStudent = async () => {
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      await addClassRosterStudent(db, classId, {
        firstName,
        lastName,
        company,
        city,
      })
      setFirstName("")
      setLastName("")
      setCompany("")
      setCity("")
      await load()
      setSuccess("Élève ajouté à la liste.")
    } catch (e: any) {
      setError(e.message || "Impossible d'ajouter l'élève.")
    } finally {
      setBusy(false)
    }
  }

  const onRemoveStudent = async (rosterId: string) => {
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      await removeClassRosterStudent(db, rosterId)
      await load()
      setSuccess("Élève retiré de la liste.")
    } catch (e: any) {
      setError(e.message || "Impossible de retirer l'élève.")
    } finally {
      setBusy(false)
    }
  }

  const onImportClick = () => {
    fileInputRef.current?.click()
  }

  const onCsvSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const buffer = await file.arrayBuffer()
      let text = new TextDecoder("utf-8").decode(buffer)
      // If UTF-8 produces replacement characters, retry with Windows-1252 (common for Excel CSV)
      if (text.includes("\uFFFD")) {
        text = new TextDecoder("windows-1252").decode(buffer)
      }
      // Strip BOM if present
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      const parsedRows = parseRosterCsv(text)

      if (!parsedRows.length) {
        setError("Aucune ligne valide trouvée dans le CSV.")
        return
      }

      const inserted = await importClassRosterRows(db, classId, parsedRows)
      await load()
      setSuccess(`${inserted} lignes importées depuis le CSV.`)
    } catch (e: any) {
      setError(e.message || "Impossible d'importer la liste CSV.")
    } finally {
      setBusy(false)
    }
  }

  if (loading || !context || !data) {
    return <div className="font-sans text-sm text-text-mid">Chargement de la classe...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/teacher/classes" className="font-sans text-xs text-violet hover:underline">&larr; Retour aux classes</Link>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">{data.classItem.name}</h2>
          {data.classItem.academicYear && (
            <div className="font-sans text-[13px] text-text-mid mt-1">{data.classItem.academicYear}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LevelBadge level={data.classItem.level} colorClass={levelColor(data.classItem.level)} />
          <ElevateButton variant="outlineViolet" size="sm" icon={<Icons.Download />} onClick={onImportClick} disabled={busy}>
            Importer
          </ElevateButton>
          <ElevateButton variant={data.classItem.archivedAt ? "secondary" : "outline"} size="sm" onClick={onToggleArchive} disabled={busy}>
            {data.classItem.archivedAt ? "Restaurer" : "Archiver"}
          </ElevateButton>
          <ElevateButton variant="ghost" size="sm" icon={<Icons.Edit />} onClick={() => router.push("/teacher/classes")}>
            Modifier les infos
          </ElevateButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="bg-card rounded-2xl border border-gray-mid p-5 overflow-hidden">
          <h3 className="font-serif text-lg font-bold text-navy mb-4">Liste ({roster.length})</h3>

          <div className="hidden md:grid grid-cols-[40px_1.2fr_1.2fr_2fr_1fr_90px] gap-2 px-3 py-2 rounded-lg bg-gray-light border border-gray-mid font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
            <span>#</span>
            <span>Nom</span>
            <span>Prénom</span>
            <span>Entreprise</span>
            <span>Ville</span>
            <span>Actions</span>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {roster.map((student, idx) => (
              <div key={student.id} className="grid grid-cols-1 md:grid-cols-[40px_1.2fr_1.2fr_2fr_1fr_90px] gap-2 items-center rounded-xl border border-gray-light bg-off-white px-3 py-3">
                <span className="font-sans text-[12px] text-text-mid">{idx + 1}</span>
                <span className="font-sans text-sm font-semibold text-text-dark">{student.lastName}</span>
                <span className="font-sans text-sm text-text-dark">{student.firstName}</span>
                <span className="font-sans text-sm text-text-mid">{student.company || "—"}</span>
                <span className="font-sans text-sm text-text-mid">{student.city || "—"}</span>
                <ElevateButton variant="outline" size="sm" onClick={() => onRemoveStudent(student.id)} disabled={busy}>Retirer</ElevateButton>
              </div>
            ))}

            {!roster.length && (
              <div className="font-sans text-sm text-text-mid">Aucune entrée dans la liste pour le moment.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
          <h3 className="font-serif text-lg font-bold text-navy">Ajouter un élève à la liste</h3>
          <p className="font-sans text-[13px] text-text-mid">Ajoutez des élèves sans compte avec entreprise et ville.</p>

          <InputField label="Nom" placeholder="ex. DUPONT" icon={<Icons.User />} value={lastName} onChange={setLastName} />
          <InputField label="Prénom" placeholder="ex. Marie" icon={<Icons.User />} value={firstName} onChange={setFirstName} />
          <InputField label="Entreprise" placeholder="ex. Supermarché MATCH" icon={<Icons.Book />} value={company} onChange={setCompany} />
          <InputField label="Ville" placeholder="ex. THIONVILLE" icon={<Icons.Globe />} value={city} onChange={setCity} />

          <ElevateButton variant="primary" fullWidth icon={<Icons.Plus />} onClick={onAddStudent} disabled={busy}>
            Ajouter à la liste
          </ElevateButton>

          <div className="font-sans text-xs text-text-light">
            En-têtes CSV acceptés : <strong>Nom, Prénom, Entreprise, Ville</strong>.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6">
        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-bold text-navy">Programme de classe par date</h3>
              <p className="font-sans text-[13px] text-text-mid mt-1">
                Préparez la séance du jour: objectifs, textes et exercices à ouvrir par les élèves dans leur calendrier.
              </p>
            </div>
            <span className="rounded-md border border-gray-mid bg-off-white px-2.5 py-1 font-sans text-[11px] font-semibold text-text-mid">
              {sortedPrograms.length} programme(s)
            </span>
          </div>

          <div className="flex flex-col gap-2.5 max-h-[540px] overflow-auto pr-1">
            {sortedPrograms.map((program) => {
              const date = normalizeDateKey(program.dateKey)
              const dateValue = date
                ? (() => {
                    const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10))
                    return new Date(year, month - 1, day)
                  })()
                : null
              const dateLabel = dateValue
                ? dateValue.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : program.dateKey
              const isEditing = editingProgramId === program.id

              return (
                <article
                  key={program.id}
                  className={cn(
                    "rounded-xl border px-3.5 py-3",
                    isEditing ? "border-navy/45 bg-navy/8" : "border-gray-light bg-off-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-sans text-[11px] uppercase tracking-[0.06em] text-text-light">{dateLabel}</div>
                      <div className="font-serif text-[18px] font-bold text-navy leading-snug mt-0.5">{program.title}</div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <ElevateButton variant="outline" size="sm" onClick={() => onEditProgram(program.id)} disabled={busy}>
                        Modifier
                      </ElevateButton>
                      <ElevateButton variant="ghost" size="sm" onClick={() => onDeleteProgram(program.id)} disabled={busy}>
                        Supprimer
                      </ElevateButton>
                    </div>
                  </div>

                  {!!program.majorPoints && (
                    <div className="mt-2 rounded-lg border border-violet/30 bg-violet/10 px-2.5 py-2 font-sans text-[12px] text-text-dark whitespace-pre-wrap leading-relaxed">
                      {program.majorPoints}
                    </div>
                  )}

                  {!!program.notes && (
                    <div className="mt-2 rounded-lg border border-gray-mid bg-white px-2.5 py-2 font-sans text-[12px] text-text-mid whitespace-pre-wrap leading-relaxed">
                      {program.notes}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex rounded-md border border-navy/25 bg-navy/8 px-2 py-0.5 font-sans text-[10px] font-semibold text-navy">
                      {program.assignmentIds.length} exercice(s)
                    </span>
                    <span className="inline-flex rounded-md border border-violet/30 bg-violet/10 px-2 py-0.5 font-sans text-[10px] font-semibold text-violet">
                      {program.documentIds.length} texte(s)
                    </span>
                    <span className="inline-flex rounded-md border border-abricot/35 bg-abricot/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-abricot-dark">
                      {program.quickLinks.length} lien(s) rapide(s)
                    </span>
                  </div>
                </article>
              )
            })}

            {!sortedPrograms.length && (
              <div className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5 font-sans text-sm text-text-mid">
                Aucun programme défini pour cette classe.
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-navy">
              {editingProgramId ? "Modifier le programme" : "Nouveau programme"}
            </h3>
            <p className="font-sans text-[13px] text-text-mid mt-1">
              Ce programme sera visible par les élèves lorsqu'ils cliqueront sur la date dans leur calendrier.
            </p>
          </div>

          <InputField label="Date de la séance" type="date" value={programDate} onChange={setProgramDate} />
          <InputField
            label="Titre de séance"
            placeholder="ex. Atelier grammaire - Modaux"
            value={programTitle}
            onChange={setProgramTitle}
          />

          <div>
            <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
              Points majeurs à retenir
            </label>
            <textarea
              value={programMajorPoints}
              onChange={(event) => setProgramMajorPoints(event.target.value)}
              placeholder="Ex. 1) Utiliser can/could selon le contexte 2) Vérifier l'ordre des mots..."
              className="w-full min-h-[92px] rounded-[10px] border-2 border-gray-mid bg-card px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy"
            />
          </div>

          <div>
            <label className="block font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">
              Notes de séance
            </label>
            <textarea
              value={programNotes}
              onChange={(event) => setProgramNotes(event.target.value)}
              placeholder="Consignes complémentaires, ordre des activités, rappel devoir..."
              className="w-full min-h-[82px] rounded-[10px] border-2 border-gray-mid bg-card px-3 py-2.5 font-sans text-sm text-text-dark placeholder:text-text-light outline-none focus:border-navy"
            />
          </div>

          <div className="rounded-lg border border-gray-light bg-off-white p-2.5">
            <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Exercices à faire ce jour</div>
            <div className="flex flex-col gap-1.5 max-h-[146px] overflow-auto pr-1">
              {assignableAssignments.map((assignment) => {
                const checked = programAssignmentIds.includes(assignment.id)
                return (
                  <button
                    key={`program-assignment-${assignment.id}`}
                    type="button"
                    onClick={() => setProgramAssignmentIds((prev) => toggleStringValue(prev, assignment.id))}
                    className={cn(
                      "rounded-md border px-2.5 py-2 text-left transition-colors",
                      checked
                        ? "border-navy/40 bg-navy/8"
                        : "border-gray-mid bg-white hover:border-navy/25",
                    )}
                  >
                    <div className="font-sans text-[12px] font-semibold text-text-dark">{assignment.title}</div>
                    <div className="font-sans text-[10px] text-text-light mt-0.5">
                      {assignment.dueAt ? `Échéance ${new Date(assignment.dueAt).toLocaleDateString("fr-FR")}` : "Sans échéance"}
                    </div>
                  </button>
                )
              })}

              {!assignableAssignments.length && (
                <div className="font-sans text-xs text-text-light">Aucun exercice publié disponible.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-light bg-off-white p-2.5">
            <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Textes associés</div>
            <div className="flex flex-col gap-1.5 max-h-[132px] overflow-auto pr-1">
              {programData.documents.map((document) => {
                const checked = programDocumentIds.includes(document.id)
                return (
                  <button
                    key={`program-document-${document.id}`}
                    type="button"
                    onClick={() => setProgramDocumentIds((prev) => toggleStringValue(prev, document.id))}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left font-sans text-[12px] transition-colors",
                      checked
                        ? "border-violet/45 bg-violet/10 text-navy"
                        : "border-gray-mid bg-white text-text-dark hover:border-violet/35",
                    )}
                  >
                    {document.name}
                  </button>
                )
              })}

              {!programData.documents.length && (
                <div className="font-sans text-xs text-text-light">Aucun document partagé à cette classe.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-light bg-off-white p-2.5">
            <div className="font-sans text-[12px] font-semibold text-navy mb-1.5">Liens rapides à afficher</div>
            <div className="flex flex-col gap-1.5">
              {programQuickLinkOptions.map((option) => {
                const checked = programQuickLinks.includes(option.key)
                return (
                  <button
                    key={`quick-link-${option.key}`}
                    type="button"
                    onClick={() => setProgramQuickLinks((prev) => toggleQuickLinkValue(prev, option.key))}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      checked
                        ? "border-abricot/45 bg-abricot/16"
                        : "border-gray-mid bg-white hover:border-abricot/35",
                    )}
                  >
                    <div className="font-sans text-[12px] font-semibold text-text-dark">{option.label}</div>
                    <div className="font-sans text-[10px] text-text-light mt-0.5">{option.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <ElevateButton variant="primary" icon={<Icons.Plus />} onClick={onSaveProgram} disabled={busy}>
              {editingProgramId ? "Mettre à jour" : "Ajouter le programme"}
            </ElevateButton>
            <ElevateButton variant="outline" onClick={resetProgramComposer} disabled={busy}>
              Réinitialiser
            </ElevateButton>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain,application/octet-stream"
        className="hidden"
        onChange={onCsvSelected}
      />

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}
      {success && <div className="font-sans text-sm text-violet">{success}</div>}
    </div>
  )
}

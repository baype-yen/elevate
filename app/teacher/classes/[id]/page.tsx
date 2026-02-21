"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { createClient } from "@/lib/supabase/client"
import {
  addClassRosterStudent,
  archiveTeacherClass,
  fetchTeacherClassDetail,
  importClassRosterRows,
  removeClassRosterStudent,
  unarchiveTeacherClass,
} from "@/lib/supabase/client-data"
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

type ClassDetailState = {
  classItem: {
    id: string
    name: string
    level: string
    classCode: string | null
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const supabase = createClient()

  const load = async () => {
    if (!classId) return
    const result = await fetchTeacherClassDetail(supabase, classId)
    setData(result)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const roster = useMemo(() => {
    return [...(data?.roster || [])].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    })
  }, [data?.roster])

  const onToggleArchive = async () => {
    if (!data) return
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      if (data.classItem.archivedAt) await unarchiveTeacherClass(supabase, data.classItem.id)
      else await archiveTeacherClass(supabase, data.classItem.id)
      await load()
    } catch (e: any) {
      setError(e.message || "Could not update class status.")
    } finally {
      setBusy(false)
    }
  }

  const onAddStudent = async () => {
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      await addClassRosterStudent(supabase, classId, {
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
      setSuccess("Student added to roster.")
    } catch (e: any) {
      setError(e.message || "Could not add student.")
    } finally {
      setBusy(false)
    }
  }

  const onRemoveStudent = async (rosterId: string) => {
    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      await removeClassRosterStudent(supabase, rosterId)
      await load()
      setSuccess("Student removed from roster.")
    } catch (e: any) {
      setError(e.message || "Could not remove student.")
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

      const text = await file.text()
      const parsedRows = parseRosterCsv(text)

      if (!parsedRows.length) {
        setError("No valid roster rows found in CSV.")
        return
      }

      const inserted = await importClassRosterRows(supabase, classId, parsedRows)
      await load()
      setSuccess(`${inserted} roster rows imported from CSV.`)
    } catch (e: any) {
      setError(e.message || "Could not import CSV roster.")
    } finally {
      setBusy(false)
    }
  }

  if (loading || !context || !data) {
    return <div className="font-sans text-sm text-text-mid">Loading class...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/teacher/classes" className="font-sans text-xs text-violet hover:underline">&larr; Back to classes</Link>
          </div>
          <h2 className="font-serif text-2xl font-bold text-navy">{data.classItem.name}</h2>
          <div className="font-sans text-[13px] text-text-mid mt-1">
            Code: {data.classItem.classCode || "—"}
            {data.classItem.academicYear ? ` · ${data.classItem.academicYear}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LevelBadge level={data.classItem.level} colorClass={levelColor(data.classItem.level)} />
          <ElevateButton variant="outlineViolet" size="sm" icon={<Icons.Download />} onClick={onImportClick} disabled={busy}>
            Import
          </ElevateButton>
          <ElevateButton variant={data.classItem.archivedAt ? "secondary" : "outline"} size="sm" onClick={onToggleArchive} disabled={busy}>
            {data.classItem.archivedAt ? "Restore" : "Archive"}
          </ElevateButton>
          <ElevateButton variant="ghost" size="sm" icon={<Icons.Edit />} onClick={() => router.push("/teacher/classes")}>
            Edit Meta
          </ElevateButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="bg-card rounded-2xl border border-gray-mid p-5 overflow-hidden">
          <h3 className="font-serif text-lg font-bold text-navy mb-4">Roster ({roster.length})</h3>

          <div className="hidden md:grid grid-cols-[40px_1.2fr_1.2fr_2fr_1fr_90px] gap-2 px-3 py-2 rounded-lg bg-gray-light border border-gray-mid font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
            <span>#</span>
            <span>Nom</span>
            <span>Prenom</span>
            <span>Entreprise</span>
            <span>Ville</span>
            <span>Action</span>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {roster.map((student, idx) => (
              <div key={student.id} className="grid grid-cols-1 md:grid-cols-[40px_1.2fr_1.2fr_2fr_1fr_90px] gap-2 items-center rounded-xl border border-gray-light bg-off-white px-3 py-3">
                <span className="font-sans text-[12px] text-text-mid">{idx + 1}</span>
                <span className="font-sans text-sm font-semibold text-text-dark">{student.lastName}</span>
                <span className="font-sans text-sm text-text-dark">{student.firstName}</span>
                <span className="font-sans text-sm text-text-mid">{student.company || "—"}</span>
                <span className="font-sans text-sm text-text-mid">{student.city || "—"}</span>
                <ElevateButton variant="outline" size="sm" onClick={() => onRemoveStudent(student.id)} disabled={busy}>Remove</ElevateButton>
              </div>
            ))}

            {!roster.length && (
              <div className="font-sans text-sm text-text-mid">No roster entries yet.</div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-5 flex flex-col gap-3">
          <h3 className="font-serif text-lg font-bold text-navy">Add Roster Student</h3>
          <p className="font-sans text-[13px] text-text-mid">Add non-login roster records with company and city details.</p>

          <InputField label="Nom" placeholder="e.g. DUPONT" icon={<Icons.User />} value={lastName} onChange={setLastName} />
          <InputField label="Prenom" placeholder="e.g. Marie" icon={<Icons.User />} value={firstName} onChange={setFirstName} />
          <InputField label="Entreprise" placeholder="e.g. Supermarché MATCH" icon={<Icons.Book />} value={company} onChange={setCompany} />
          <InputField label="Ville" placeholder="e.g. THIONVILLE" icon={<Icons.Globe />} value={city} onChange={setCity} />

          <ElevateButton variant="primary" fullWidth icon={<Icons.Plus />} onClick={onAddStudent} disabled={busy}>
            Add to Roster
          </ElevateButton>

          <div className="font-sans text-xs text-text-light">
            CSV headers supported: <strong>Nom, Prenom, Entreprise, Ville</strong>.
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onCsvSelected}
      />

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}
      {success && <div className="font-sans text-sm text-violet">{success}</div>}
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherStudentsData } from "@/lib/supabase/client-data"

const avatarColors = ["bg-abricot", "bg-violet", "bg-watermelon", "bg-navy"]

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
  const [data, setData] = useState<{ className: string; students: any[]; classes: Array<{ id: string; name: string }> } | null>(null)
  const [enrollClassId, setEnrollClassId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [studentEmail, setStudentEmail] = useState("")
  const [studentPassword, setStudentPassword] = useState("")
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [bulkSyncBusy, setBulkSyncBusy] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null)
  const [emailDomain, setEmailDomain] = useState("btsmco.local")
  const [credentialHelperMessage, setCredentialHelperMessage] = useState<string | null>(null)
  const [rosterCandidates, setRosterCandidates] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])

  const loadStudents = async () => {
    if (!context) return
    const supabase = createClient()
    const nextData = await fetchTeacherStudentsData(
      supabase,
      context.userId,
      context.activeSchoolId,
      selectedClass === "all" ? null : String(selectedClass),
    )
    setData(nextData)
  }

  useEffect(() => {
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
    if (!context || !enrollClassId) {
      setRosterCandidates([])
      return
    }

    let active = true
    const supabase = createClient()

    async function loadRosterCandidates() {
      const { data: rosterRows } = await supabase
        .from("class_students")
        .select("id, first_name, last_name, sort_order")
        .eq("class_id", enrollClassId)
        .order("sort_order", { ascending: true })
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })

      if (!active) return

      setRosterCandidates(
        (rosterRows || []).map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
        })),
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
      const firstToken = sanitizeToken(student.firstName) || "eleve"
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
    const response = await fetch("/api/teacher/enroll-student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3 bg-gray-light font-sans text-[11px] font-semibold tracking-wider uppercase text-text-light">
            <span>Élève</span>
            <span>Niveau</span>
            <span>Score</span>
            <span>Dernière activité</span>
            <span>Actions</span>
          </div>
          {data.students.map((s, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_100px] px-5 py-3.5 items-center border-t border-gray-light gap-2 md:gap-0">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-[34px] h-[34px] rounded-[10px] flex items-center justify-center font-sans font-bold text-xs text-white shrink-0",
                  avatarColors[i % 4],
                )}>
                  {s.initials}
                </div>
                <div className="font-sans text-sm font-semibold text-text-dark">{s.name}</div>
              </div>
              <div>
                <LevelBadge level={s.level} colorClass={levelColorClass(s.level)} />
              </div>
              <div className="font-serif text-base font-bold text-navy">{s.score}%</div>
              <div className="font-sans text-[13px] text-text-light">{s.lastActive}</div>
              <div className="flex gap-1.5">
                <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                  <Icons.Eye />
                </button>
                <button className="w-[30px] h-[30px] rounded-lg bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors">
                  <Icons.BarChart />
                </button>
              </div>
            </div>
          ))}
          {!data.students.length && (
            <div className="px-5 py-6 font-sans text-sm text-text-mid">Aucun élève inscrit trouvé.</div>
          )}
        </div>
      </div>
    </div>
  )
}

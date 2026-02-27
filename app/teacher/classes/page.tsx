"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge, RadioCardChooser } from "@/components/elevate/shared"
import { createClient } from "@/lib/supabase/client"
import {
  archiveTeacherClass,
  createTeacherClass,
  fetchTeacherClassesData,
  type TeacherClassSummary,
  unarchiveTeacherClass,
  updateTeacherClass,
} from "@/lib/supabase/client-data"
import { useAppContext } from "@/hooks/use-app-context"

const levelColor: Record<string, string> = {
  A1: "violet",
  A2: "violet",
  B1: "abricot",
  B2: "watermelon",
  C1: "violet",
  C2: "navy",
}

export default function TeacherClassesPage() {
  const router = useRouter()
  const { context, loading } = useAppContext()
  const createSectionRef = useRef<HTMLDivElement | null>(null)

  const [classes, setClasses] = useState<TeacherClassSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<string | string[]>("active")
  const [newClassName, setNewClassName] = useState("")
  const [newClassLevel, setNewClassLevel] = useState("b1")
  const [newClassYear, setNewClassYear] = useState("")

  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [editingLevel, setEditingLevel] = useState("b1")
  const [editingYear, setEditingYear] = useState("")

  const supabase = createClient()

  const loadClasses = async () => {
    if (!context) return
    const rows = await fetchTeacherClassesData(supabase, context.userId, context.activeSchoolId, true)
    setClasses(rows)
  }

  useEffect(() => {
    loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.userId, context?.activeSchoolId])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.hash !== "#create-class") return

    const section = createSectionRef.current
    if (!section) return

    requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "start" })
      const firstInput = section.querySelector("input") as HTMLInputElement | null
      firstInput?.focus()
    })
  }, [])

  const visibleClasses = useMemo(() => {
    if (filter === "archived") return classes.filter((c) => !!c.archivedAt)
    if (filter === "all") return classes
    return classes.filter((c) => !c.archivedAt)
  }, [classes, filter])

  const onCreateClass = async () => {
    if (!context) return
    if (!context.activeSchoolId) {
      setError("Aucun établissement actif sélectionné pour créer une classe.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      const classId = await createTeacherClass(supabase, context.userId, context.activeSchoolId, {
        name: newClassName,
        level: newClassLevel,
        academicYear: newClassYear,
      })

      setNewClassName("")
      setNewClassYear("")
      await loadClasses()
      router.push(`/teacher/classes/${classId}`)
    } catch (e: any) {
      setError(e.message || "Échec de la création de la classe.")
    } finally {
      setBusy(false)
    }
  }

  const beginEdit = (classItem: TeacherClassSummary) => {
    setEditingClassId(classItem.id)
    setEditingName(classItem.name)
    setEditingLevel(classItem.level.toLowerCase())
    setEditingYear(classItem.academicYear || "")
    setError(null)
  }

  const saveEdit = async () => {
    if (!editingClassId) return
    try {
      setBusy(true)
      setError(null)
      await updateTeacherClass(supabase, editingClassId, {
        name: editingName,
        level: editingLevel,
        academicYear: editingYear,
      })
      setEditingClassId(null)
      await loadClasses()
    } catch (e: any) {
      setError(e.message || "Échec de la mise à jour de la classe.")
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async (classItem: TeacherClassSummary) => {
    try {
      setBusy(true)
      setError(null)
      if (classItem.archivedAt) {
        await unarchiveTeacherClass(supabase, classItem.id)
      } else {
        await archiveTeacherClass(supabase, classItem.id)
      }
      await loadClasses()
    } catch (e: any) {
      setError(e.message || "Échec de la mise à jour du statut d'archivage.")
    } finally {
      setBusy(false)
    }
  }

  if (loading || !context) {
    return <div className="font-sans text-sm text-text-mid">Chargement des classes...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card rounded-2xl border border-gray-mid p-6">
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy">Gestion des classes</h3>
            <p className="font-sans text-[13px] text-text-mid">Créez, modifiez, archivez les classes et gérez chaque liste d'élèves.</p>
          </div>
          <BadgeChooser
            selected={filter}
            onSelect={setFilter}
            options={[
              { value: "active", label: "Actives" },
              { value: "archived", label: "Archivées" },
              { value: "all", label: "Toutes" },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {visibleClasses.map((classItem) => (
            <div key={classItem.id} className="rounded-xl border border-gray-mid p-4 bg-off-white flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-serif text-[16px] font-bold text-navy">{classItem.name}</div>
                  <div className="font-sans text-xs text-text-light">
                    {classItem.students} élèves &middot; Moy. {classItem.avg}%
                  </div>
                  {classItem.academicYear && <div className="font-sans text-[11px] text-text-light mt-0.5">{classItem.academicYear}</div>}
                </div>
                <LevelBadge level={classItem.level} colorClass={levelColor[classItem.level] || "violet"} />
              </div>

              {classItem.archivedAt && (
                <div className="font-sans text-[11px] text-watermelon font-semibold">Archivée</div>
              )}

              <div className="flex gap-2 flex-wrap">
                <ElevateButton size="sm" variant="primary" icon={<Icons.Eye />} onClick={() => router.push(`/teacher/classes/${classItem.id}`)}>
                  Ouvrir
                </ElevateButton>
                <ElevateButton size="sm" variant="ghost" icon={<Icons.Edit />} onClick={() => beginEdit(classItem)}>
                  Modifier
                </ElevateButton>
                <ElevateButton
                  size="sm"
                  variant={classItem.archivedAt ? "secondary" : "outline"}
                  onClick={() => toggleArchive(classItem)}
                >
                  {classItem.archivedAt ? "Restaurer" : "Archiver"}
                </ElevateButton>
              </div>
            </div>
          ))}

          {!visibleClasses.length && (
            <div className="rounded-xl border border-dashed border-gray-mid p-5 font-sans text-sm text-text-mid bg-off-white">
              Aucune classe dans cette vue.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="create-class" ref={createSectionRef} className="bg-card rounded-2xl border border-gray-mid p-6 flex flex-col gap-3">
          <h4 className="font-serif text-lg font-bold text-navy">Créer une classe</h4>
          <InputField label="Nom de la classe" placeholder="ex. 10B - Anglais A2" icon={<Icons.Book />} value={newClassName} onChange={setNewClassName} />
          <InputField label="Année scolaire (optionnel)" placeholder="2026-2027" icon={<Icons.Calendar />} value={newClassYear} onChange={setNewClassYear} />
          <RadioCardChooser
            columns={6}
            selected={newClassLevel}
            onSelect={setNewClassLevel}
            options={[
              { value: "a1", label: "A1" },
              { value: "a2", label: "A2" },
              { value: "b1", label: "B1" },
              { value: "b2", label: "B2" },
              { value: "c1", label: "C1" },
              { value: "c2", label: "C2" },
            ]}
          />
          <ElevateButton variant="primary" icon={<Icons.Plus />} onClick={onCreateClass} disabled={busy}>Créer la classe</ElevateButton>
        </div>

        <div className="bg-card rounded-2xl border border-gray-mid p-6 flex flex-col gap-3">
          <h4 className="font-serif text-lg font-bold text-navy">Modifier la classe</h4>
          {editingClassId ? (
            <>
              <InputField label="Nom de la classe" icon={<Icons.Book />} value={editingName} onChange={setEditingName} />
              <InputField label="Année scolaire" icon={<Icons.Calendar />} value={editingYear} onChange={setEditingYear} />
              <RadioCardChooser
                columns={6}
                selected={editingLevel}
                onSelect={setEditingLevel}
                options={[
                  { value: "a1", label: "A1" },
                  { value: "a2", label: "A2" },
                  { value: "b1", label: "B1" },
                  { value: "b2", label: "B2" },
                  { value: "c1", label: "C1" },
                  { value: "c2", label: "C2" },
                ]}
              />
              <div className="flex gap-2">
                <ElevateButton variant="primary" icon={<Icons.Check />} onClick={saveEdit} disabled={busy}>Enregistrer</ElevateButton>
                <ElevateButton variant="ghost" onClick={() => setEditingClassId(null)} disabled={busy}>Annuler</ElevateButton>
              </div>
            </>
          ) : (
            <div className="font-sans text-sm text-text-mid">Sélectionnez une carte classe puis cliquez sur Modifier pour mettre à jour les détails.</div>
          )}
        </div>
      </div>

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}
    </div>
  )
}

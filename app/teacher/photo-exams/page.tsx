"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Icons } from "@/components/elevate/icons"
import { BadgeChooser, ElevateButton, InputField, LevelBadge } from "@/components/elevate/shared"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchTeacherClassesData, fetchTeacherStudentsData } from "@/lib/firebase/client-data"
import {
  analyzeExamMistakes,
  generateExercisesFromPhotoAnalysis,
  mistakeCategoryLabel,
  mistakeCategoryOrder,
  totalDetectedMistakes,
  type GeneratedPhotoExercise,
  type MistakeAnalysis,
} from "@/lib/exam-photo/mistake-analysis"
import { chooseBestOcrCandidate, normalizeOcrText, preprocessExamPhoto } from "@/lib/exam-photo/ocr-improve"

type ClassOption = {
  id: string
  name: string
  level: string
}

type StudentOption = {
  studentId: string
  name: string
  level: string
}

type AnalysisResult = {
  extractedText: string
  analysis: MistakeAnalysis
  exercises: GeneratedPhotoExercise[]
}

type OcrPageReport = {
  fileName: string
  selectedSource: "original" | "enhanced"
  confidence: number
}

type OcrRunReport = {
  averageConfidence: number
  pages: OcrPageReport[]
}

const MAX_FILES = 8
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

function levelColorClass(level: string) {
  if (level === "B2" || level === "C1" || level === "C2") return "watermelon"
  if (level === "B1") return "abricot"
  return "violet"
}

function fileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function buildAnalysisResult(params: { sourceText: string; examTitle: string; cefrLevel: string }): AnalysisResult {
  const cleanedText = normalizeOcrText(params.sourceText)

  if (cleanedText.length < 40) {
    throw new Error("OCR trop faible: texte insuffisant. Essayez des photos plus nettes et bien éclairées.")
  }

  const analysis = analyzeExamMistakes(cleanedText)
  const exercises = generateExercisesFromPhotoAnalysis({
    examTitle: params.examTitle.trim(),
    cefrLevel: params.cefrLevel,
    analysis,
  })

  return {
    extractedText: cleanedText,
    analysis,
    exercises,
  }
}

function averageConfidence(pages: OcrPageReport[]) {
  if (!pages.length) return 0
  return pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length
}

export default function TeacherPhotoExamsPage() {
  const { context, loading } = useAppContext()
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [students, setStudents] = useState<StudentOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState("")
  const [selectedStudentId, setSelectedStudentId] = useState("")
  const [examTitle, setExamTitle] = useState("English exam - BTS MCO")
  const [photos, setPhotos] = useState<File[]>([])
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [ocrDraftText, setOcrDraftText] = useState("")
  const [ocrReport, setOcrReport] = useState<OcrRunReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!context) return
    const teacherId = context.userId
    const activeSchoolId = context.activeSchoolId
    let active = true

    async function loadClasses() {
      const rows = await fetchTeacherClassesData(db, teacherId, activeSchoolId, false)
      if (!active) return

      const nextClasses = rows.map((row) => ({
        id: row.id,
        name: row.name,
        level: row.level,
      }))

      setClasses(nextClasses)
      setSelectedClassId((previous) => {
        if (previous && nextClasses.some((item) => item.id === previous)) return previous
        return nextClasses[0]?.id || ""
      })
    }

    loadClasses()

    return () => {
      active = false
    }
  }, [context?.userId, context?.activeSchoolId])

  useEffect(() => {
    if (!context || !selectedClassId) {
      setStudents([])
      setSelectedStudentId("")
      return
    }

    const teacherId = context.userId
    const activeSchoolId = context.activeSchoolId

    let active = true

    async function loadStudents() {
      const payload = await fetchTeacherStudentsData(db, teacherId, activeSchoolId, selectedClassId)
      if (!active) return

      const nextStudents = payload.students
        .filter((student) => student.canEditLevel && !!student.studentId)
        .map((student) => ({
          studentId: String(student.studentId),
          name: student.name,
          level: student.level,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))

      setStudents(nextStudents)
      setSelectedStudentId((previous) => {
        if (previous && nextStudents.some((student) => student.studentId === previous)) return previous
        return nextStudents[0]?.studentId || ""
      })
    }

    loadStudents()

    return () => {
      active = false
    }
  }, [context?.userId, context?.activeSchoolId, selectedClassId])

  const selectedStudent = useMemo(
    () => students.find((student) => student.studentId === selectedStudentId) || null,
    [students, selectedStudentId],
  )

  const selectedClass = useMemo(
    () => classes.find((classItem) => classItem.id === selectedClassId) || null,
    [classes, selectedClassId],
  )

  const detectedCount = useMemo(
    () => (analysisResult ? totalDetectedMistakes(analysisResult.analysis) : 0),
    [analysisResult],
  )

  const draftOutOfSync = useMemo(() => {
    if (!analysisResult) return false
    return normalizeOcrText(ocrDraftText) !== analysisResult.extractedText
  }, [analysisResult, ocrDraftText])

  const onPickPhotos = () => {
    setError(null)
    setSuccess(null)
    fileInputRef.current?.click()
  }

  const onPhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || [])
    event.target.value = ""

    if (!incoming.length) return

    let validationMessage: string | null = null

    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"))
    if (imageFiles.length !== incoming.length) {
      validationMessage = "Seules les images sont autorisees pour l'analyse OCR."
    }

    if (!imageFiles.length) {
      setError(validationMessage || "Aucune image exploitable n'a été sélectionnée.")
      return
    }

    const tooLarge = imageFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES)
    if (tooLarge) {
      setError(`Le fichier ${tooLarge.name} depasse 10 MB.`)
      return
    }

    setPhotos((previous) => {
      const byId = new Map(previous.map((file) => [fileIdentity(file), file]))
      for (const file of imageFiles) {
        byId.set(fileIdentity(file), file)
      }
      return Array.from(byId.values()).slice(0, MAX_FILES)
    })

    setAnalysisResult(null)
    setOcrDraftText("")
    setOcrReport(null)
    setError(validationMessage)
    setSuccess(null)
  }

  const removePhoto = (target: File) => {
    setPhotos((previous) => previous.filter((file) => fileIdentity(file) !== fileIdentity(target)))
    setAnalysisResult(null)
    setOcrDraftText("")
    setOcrReport(null)
  }

  const runPhotoAnalysis = async () => {
    if (!selectedClassId) {
      setError("Sélectionnez une classe avant de lancer l'analyse.")
      return
    }

    if (!selectedStudentId || !selectedStudent) {
      setError("Sélectionnez un élève avec accès actif.")
      return
    }

    if (!photos.length) {
      setError("Ajoutez au moins une photo de copie d'examen.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)
      setOcrStatus("Initialisation OCR...")

      const { createWorker } = await import("tesseract.js")
      let worker: Awaited<ReturnType<typeof createWorker>> | null = null
      const chunks: string[] = []
      const pageReports: OcrPageReport[] = []

      try {
        try {
          worker = await createWorker("eng+fra")
        } catch {
          worker = await createWorker("eng")
        }

        for (let index = 0; index < photos.length; index += 1) {
          const file = photos[index]
          setOcrStatus(`OCR original ${index + 1}/${photos.length} - ${file.name}`)
          const originalResult = await worker.recognize(file)

          setOcrStatus(`OCR optimisé ${index + 1}/${photos.length} - ${file.name}`)
          let enhancedResultText = ""
          let enhancedConfidence = 0

          try {
            const enhancedBlob = await preprocessExamPhoto(file)
            const enhancedResult = await worker.recognize(enhancedBlob)
            enhancedResultText = enhancedResult.data?.text || ""
            enhancedConfidence = Number(enhancedResult.data?.confidence || 0)
          } catch {
            enhancedResultText = ""
            enhancedConfidence = 0
          }

          const bestCandidate = chooseBestOcrCandidate([
            {
              source: "original",
              text: originalResult.data?.text || "",
              confidence: Number(originalResult.data?.confidence || 0),
            },
            {
              source: "enhanced",
              text: enhancedResultText,
              confidence: enhancedConfidence,
            },
          ])

          if (bestCandidate.text) {
            chunks.push(bestCandidate.text)
          }

          pageReports.push({
            fileName: file.name,
            selectedSource: bestCandidate.source,
            confidence: bestCandidate.confidence,
          })
        }
      } finally {
        if (worker) {
          await worker.terminate()
        }
      }

      const extractedText = normalizeOcrText(chunks.join("\n\n"))
      const nextAnalysisResult = buildAnalysisResult({
        sourceText: extractedText,
        examTitle,
        cefrLevel: selectedStudent.level || selectedClass?.level || "B1",
      })
      const nextReport = {
        averageConfidence: averageConfidence(pageReports),
        pages: pageReports,
      }

      setOcrDraftText(nextAnalysisResult.extractedText)
      setAnalysisResult(nextAnalysisResult)
      setOcrReport(nextReport)

      const lowConfidenceSuffix = nextReport.averageConfidence < 55
        ? " OCR faible: relisez et corrigez le texte extrait avant création."
        : ""

      setSuccess(`Analyse terminée. ${totalDetectedMistakes(nextAnalysisResult.analysis)} point(s) détecté(s).${lowConfidenceSuffix}`)
    } catch (analysisError: any) {
      setError(analysisError?.message || "Impossible d'analyser les photos de copie.")
    } finally {
      setBusy(false)
      setOcrStatus("")
    }
  }

  const recomputeFromDraftText = () => {
    if (!selectedStudent) return

    try {
      setError(null)
      const nextAnalysisResult = buildAnalysisResult({
        sourceText: ocrDraftText,
        examTitle,
        cefrLevel: selectedStudent.level || selectedClass?.level || "B1",
      })
      setAnalysisResult(nextAnalysisResult)
      setSuccess(`Analyse mise à jour depuis le texte corrigé. ${totalDetectedMistakes(nextAnalysisResult.analysis)} point(s) détecté(s).`)
    } catch (analysisError: any) {
      setError(analysisError?.message || "Impossible de recalculer l'analyse depuis le texte corrigé.")
    }
  }

  const createExercises = async () => {
    if (!context || !analysisResult || !selectedStudent || !selectedClass) return

    if (!context.activeSchoolId) {
      setError("Aucun établissement actif sélectionné.")
      return
    }

    try {
      setBusy(true)
      setError(null)
      setSuccess(null)

      const refreshedResult = buildAnalysisResult({
        sourceText: ocrDraftText || analysisResult.extractedText,
        examTitle,
        cefrLevel: selectedStudent.level || selectedClass.level || "B1",
      })

      setAnalysisResult(refreshedResult)
      setOcrDraftText(refreshedResult.extractedText)

      const { collection: col, addDoc, serverTimestamp } = await import("firebase/firestore")

      for (const exercise of refreshedResult.exercises) {
        await addDoc(col(db, "personalized_exercises"), {
          school_id: context.activeSchoolId,
          class_id: selectedClass.id,
          student_id: selectedStudent.studentId,
          created_by: context.userId,
          title: exercise.title,
          instructions: exercise.instructions,
          exercise_type: exercise.exerciseType,
          cefr_level: exercise.cefrLevel,
          is_completed: false,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
      }

      await addDoc(col(db, "activity_events"), {
        school_id: context.activeSchoolId,
        class_id: selectedClass.id,
        actor_id: context.userId,
        target_user_id: selectedStudent.studentId,
        event_type: "assignment_created",
        payload: {
          text: `Exercices personnalisés générés depuis une copie photo pour ${selectedStudent.name}.`,
        },
        created_at: serverTimestamp(),
      })

      setSuccess("Exercices personnalisés créés et envoyés à l'élève.")
      setPhotos([])
      setAnalysisResult(null)
      setOcrDraftText("")
      setOcrReport(null)
    } catch (insertError: any) {
      setError(insertError?.message || "Impossible de créer les exercices personnalisés.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement de l'outil photo...</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-card rounded-[20px] border border-gray-mid p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-serif text-xl font-bold text-navy mb-1">Générateur OCR depuis photo</h3>
            <p className="font-sans text-[13px] text-text-mid">
              Importez la copie d'examen d'un élève, détectez ses erreurs, puis créez automatiquement des exercices ciblés.
            </p>
          </div>
          {selectedStudent && <LevelBadge level={selectedStudent.level} colorClass={levelColorClass(selectedStudent.level)} />}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          <InputField
            label="Titre de session"
            placeholder="English exam - BTS MCO"
            icon={<Icons.Clipboard />}
            value={examTitle}
            onChange={setExamTitle}
            helper="Ce titre sera repris dans les exercices générés."
          />

          <div>
            <div className="font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-1.5">Élève cible</div>
            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value)
                setAnalysisResult(null)
                setOcrDraftText("")
                setOcrReport(null)
              }}
              className="w-full h-[50px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 font-sans text-[15px] text-text-dark outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)]"
            >
              {!students.length && <option value="">Aucun élève avec accès actif</option>}
              {students.map((student) => (
                <option key={student.studentId} value={student.studentId}>
                  {student.name} ({student.level})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <div className="font-sans text-[13px] font-semibold text-navy tracking-[0.02em] mb-2">Classe</div>
          <BadgeChooser
            selected={selectedClassId}
            onSelect={(value) => {
              setSelectedClassId(String(value))
              setAnalysisResult(null)
              setOcrDraftText("")
              setOcrReport(null)
            }}
            options={classes.map((classItem) => ({ value: classItem.id, label: classItem.name }))}
          />
        </div>

        <div className="mt-4 rounded-xl border border-gray-light bg-off-white p-4">
          <div className="font-sans text-[13px] font-semibold text-navy mb-2">Photos de copie ({photos.length}/{MAX_FILES})</div>

            <div className="mb-3 rounded-lg border border-gray-light bg-card px-3 py-2.5">
              <div className="font-sans text-xs font-semibold text-navy">Conseils photo pour OCR gratuit</div>
              <div className="font-sans text-xs text-text-light mt-1 leading-relaxed">
                Prendre la photo de face, lumière uniforme, texte net, feuille complète visible, pas de doigts sur le texte. Priorité au mode scan de votre smartphone.
              </div>
            </div>

          {photos.length ? (
            <div className="flex flex-col gap-2">
              {photos.map((file) => (
                <div key={fileIdentity(file)} className="rounded-lg border border-gray-light bg-card px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-sans text-sm text-text-dark truncate">{file.name}</div>
                    <div className="font-sans text-xs text-text-light">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                  </div>
                  <ElevateButton size="sm" variant="ghost" onClick={() => removePhoto(file)} disabled={busy}>
                    Retirer
                  </ElevateButton>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-sans text-sm text-text-mid">Aucune photo importée.</div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhotoSelected}
          />

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <ElevateButton variant="outline" size="sm" icon={<Icons.Plus />} onClick={onPickPhotos} disabled={busy || photos.length >= MAX_FILES}>
              Ajouter des photos
            </ElevateButton>
            <ElevateButton variant="primary" size="sm" icon={<Icons.Target />} onClick={runPhotoAnalysis} disabled={busy || !photos.length}>
              {busy ? "Analyse en cours..." : "Analyser la copie"}
            </ElevateButton>
          </div>

          {ocrStatus && <div className="font-sans text-xs text-text-light mt-2">{ocrStatus}</div>}
        </div>

        {error && <div className="font-sans text-sm text-watermelon mt-3">{error}</div>}
        {success && <div className="font-sans text-sm text-violet mt-3">{success}</div>}
      </div>

      {analysisResult && (
        <div className="bg-card rounded-[20px] border border-gray-mid p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="font-serif text-lg font-bold text-navy">Résultat de l'analyse OCR</h4>
              <p className="font-sans text-[13px] text-text-mid">
                {detectedCount} point(s) détecté(s). {analysisResult.exercises.length} exercice(s) prêt(s) à être créés.
              </p>
              {ocrReport && (
                <p className="font-sans text-xs text-text-light mt-1">
                  Confiance OCR moyenne: {Math.round(ocrReport.averageConfidence)}% ({ocrReport.averageConfidence < 55 ? "faible" : "correcte"}).
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <ElevateButton variant="primary" icon={<Icons.Check />} onClick={createExercises} disabled={busy}>
                Créer les exercices
              </ElevateButton>
              <ElevateButton
                variant="ghost"
                onClick={() => {
                  setAnalysisResult(null)
                  setOcrDraftText("")
                  setOcrReport(null)
                }}
                disabled={busy}
              >
                Effacer l'analyse
              </ElevateButton>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {mistakeCategoryOrder.map((category) => {
              const count = analysisResult.analysis[category]?.length || 0
              return (
                <div key={category} className="rounded-lg border border-gray-light bg-off-white px-3 py-2.5">
                  <div className="font-sans text-sm font-semibold text-text-dark">{mistakeCategoryLabel[category]}</div>
                  <div className="font-sans text-xs text-text-light">{count} élément(s) détecté(s)</div>
                </div>
              )
            })}
          </div>

          {!!ocrReport?.pages.length && (
            <div className="rounded-xl border border-gray-light bg-off-white p-4">
              <div className="font-sans text-[13px] font-semibold text-navy mb-2">Choix OCR par photo</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {ocrReport.pages.map((page) => (
                  <div key={page.fileName} className="rounded-lg border border-gray-light bg-card px-3 py-2">
                    <div className="font-sans text-xs font-semibold text-text-dark truncate">{page.fileName}</div>
                    <div className="font-sans text-[11px] text-text-light">
                      Source retenue: {page.selectedSource === "enhanced" ? "optimisée" : "originale"} &middot; confiance {Math.round(page.confidence)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-light bg-off-white p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div>
                <div className="font-sans text-[13px] font-semibold text-navy">Texte OCR à vérifier</div>
                <div className="font-sans text-[11px] text-text-light">
                  Corrigez le texte si besoin puis recalculez pour améliorer les exercices.
                </div>
              </div>
              <ElevateButton variant="outline" size="sm" onClick={recomputeFromDraftText} disabled={busy || !ocrDraftText.trim()}>
                Recalculer depuis le texte
              </ElevateButton>
            </div>
            <textarea
              value={ocrDraftText}
              onChange={(event) => setOcrDraftText(event.target.value)}
              disabled={busy}
              className="w-full min-h-[220px] rounded-[10px] border-2 border-gray-mid bg-card px-3.5 py-3 font-sans text-[14px] text-text-dark placeholder:text-text-light outline-none focus:border-navy focus:shadow-[0_0_0_3px_rgba(27,42,74,0.09)] disabled:opacity-70 disabled:cursor-not-allowed"
            />
            {draftOutOfSync && (
              <div className="font-sans text-xs text-abricot-dark mt-2">
                Le texte a été modifié. Cliquez sur "Recalculer depuis le texte" avant de créer les exercices.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {analysisResult.exercises.map((exercise) => (
              <div key={`${exercise.category}:${exercise.title}`} className="rounded-xl border border-gray-light bg-off-white p-4">
                <div className="font-sans text-sm font-semibold text-text-dark">{exercise.title}</div>
                <div className="font-sans text-xs text-text-light mt-0.5">
                  {mistakeCategoryLabel[exercise.category]} &middot; {exercise.exerciseType} &middot; Niveau {exercise.cefrLevel.toUpperCase()}
                </div>
                <div className="font-sans text-sm text-text-mid mt-2 whitespace-pre-wrap">{exercise.instructions}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

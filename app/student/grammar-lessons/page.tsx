"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Icons } from "@/components/elevate/icons"
import { cn } from "@/lib/utils"
import { db, storage } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import { fetchStudentGrammarLessonsData } from "@/lib/firebase/client-data"
import { ref, getDownloadURL } from "firebase/storage"
import {
  COURSE_TOPIC_OPTIONS,
  type CourseTopicKey,
} from "@/lib/course-content/config"

type StudentGrammarLessonRow = {
  id: string
  name: string
  filePath: string
  type: string
  size: string
  date: string
  sourceText: string
  visibilityMode: "student_visible" | "internal_teacher"
  topicKey: CourseTopicKey | null
  topicLabel: string
  targetClassNames: string[]
  sharedClassNames: string[]
}

export default function StudentGrammarLessonsPage() {
  const { context, loading } = useAppContext()
  const searchParams = useSearchParams()
  const highlightedDocumentId = (searchParams.get("document") || "").trim()

  const [lessons, setLessons] = useState<StudentGrammarLessonRow[]>([])
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return

    fetchStudentGrammarLessonsData(db, context.userId, context.activeSchoolId)
      .then((rows) => {
        setLessons(rows as StudentGrammarLessonRow[])
      })
      .catch((e: any) => {
        setError(e?.message || "Impossible de charger les leçons de grammaire.")
      })
  }, [context])

  const lessonsByTopic = useMemo(() => {
    const map = new Map<string, StudentGrammarLessonRow[]>()
    for (const topic of COURSE_TOPIC_OPTIONS) {
      map.set(topic.value, [])
    }
    map.set("other", [])

    for (const lesson of lessons) {
      const key = lesson.topicKey || "other"
      const rows = map.get(key) || []
      rows.push(lesson)
      map.set(key, rows)
    }

    return map
  }, [lessons])

  const openLesson = async (lesson: StudentGrammarLessonRow, download = false) => {
    if (!lesson.filePath) return

    try {
      setError(null)
      setBusyLessonId(lesson.id)

      const storageRef = ref(storage, lesson.filePath)
      const url = await getDownloadURL(storageRef)

      if (download) {
        const anchor = window.document.createElement("a")
        anchor.href = url
        anchor.download = lesson.name
        anchor.target = "_blank"
        anchor.rel = "noopener noreferrer"
        anchor.click()
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch (e: any) {
      setError(e?.message || "Impossible d'ouvrir cette lecon.")
    } finally {
      setBusyLessonId(null)
    }
  }

  if (loading) {
    return <div className="font-sans text-sm text-text-mid">Chargement des leçons...</div>
  }

  const renderLessonRow = (lesson: StudentGrammarLessonRow) => {
    const busy = busyLessonId === lesson.id
    const highlighted = !!highlightedDocumentId && lesson.id === highlightedDocumentId

    return (
      <div
        key={lesson.id}
        className={cn(
          "rounded-lg border bg-card px-3 py-3",
          highlighted ? "border-violet bg-violet/10" : "border-gray-light",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-sans text-[13px] font-semibold text-text-dark truncate">{lesson.name}</div>
            <div className="font-sans text-[11px] text-text-light mt-0.5">
              {lesson.type} &middot; {lesson.size} &middot; Ajoute le {lesson.date}
            </div>
            <div className="font-sans text-[11px] text-text-light mt-1">
              {lesson.visibilityMode === "internal_teacher"
                ? "Source interne du prof"
                : "Source visible en cours"}
            </div>
            {!!lesson.targetClassNames.length && (
              <div className="font-sans text-[11px] text-text-light mt-1 truncate">
                Classes cibles: {lesson.targetClassNames.join(", ")}
              </div>
            )}
          </div>

          {!!lesson.filePath && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => openLesson(lesson, true)}
                disabled={busy}
                className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Telecharger"
              >
                <Icons.Download />
              </button>
              <button
                onClick={() => openLesson(lesson, false)}
                disabled={busy}
                className="w-[30px] h-[30px] rounded-md bg-gray-light flex items-center justify-center text-navy cursor-pointer hover:bg-gray-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Apercu"
              >
                <Icons.Eye />
              </button>
            </div>
          )}
        </div>

        {!lesson.filePath && lesson.sourceText && (
          <div className="mt-2 rounded-md border border-gray-mid bg-off-white px-2.5 py-2 font-sans text-[12px] text-text-mid whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-auto">
            {lesson.sourceText}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card rounded-[20px] border border-gray-mid p-7 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy mb-1">Leçons de grammaire</h3>
          <p className="text-[13px] text-text-mid">
            Retrouve les bases de grammaire et de conjugaison liees a tes exercices, y compris les sources internes du professeur.
          </p>
        </div>
        <Link
          href="/student/course-exercises"
          className="inline-flex items-center justify-center rounded-[10px] bg-navy px-3.5 py-2 font-sans text-[13px] font-semibold text-white hover:bg-navy-mid transition-colors"
        >
          Retour aux exercices
        </Link>
      </div>

      {error && <div className="font-sans text-sm text-watermelon">{error}</div>}

      {COURSE_TOPIC_OPTIONS.map((topic) => {
        const rows = lessonsByTopic.get(topic.value) || []
        return (
          <section key={topic.value} className="rounded-xl border border-gray-light bg-off-white p-4">
            <h4 className="font-serif text-lg font-bold text-navy mb-3">{topic.label}</h4>
            <div className="flex flex-col gap-2.5">
              {rows.map(renderLessonRow)}
              {!rows.length && (
                <div className="font-sans text-xs text-text-light">Aucune lecon de grammaire pour ce topic.</div>
              )}
            </div>
          </section>
        )
      })}

      {!!(lessonsByTopic.get("other") || []).length && (
        <section className="rounded-xl border border-gray-light bg-off-white p-4">
          <h4 className="font-serif text-lg font-bold text-navy mb-3">Autres leçons</h4>
          <div className="flex flex-col gap-2.5">
            {(lessonsByTopic.get("other") || []).map(renderLessonRow)}
          </div>
        </section>
      )}

      {!lessons.length && (
        <div className="font-sans text-sm text-text-mid px-1 py-2">
          Aucune lecon de grammaire n'est disponible pour le moment.
        </div>
      )}
    </div>
  )
}

# AI Flashcard Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gemini Flash-powered flashcard generation from graded homework submissions, with a student review page.

**Architecture:** Teacher triggers flashcard generation during grading via a checkbox. A Next.js API route calls Gemini Flash with full submission context, validates the response with Zod, and batch-writes flashcards to Firestore. Students review cards on a dedicated `/student/flashcards` page with scroll-reveal UX.

**Tech Stack:** Next.js 16, React 19, Firebase/Firestore, `@google/generative-ai` SDK, Zod, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-14-ai-flashcards-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/flashcards/schema.ts` | Create | Zod schemas + TypeScript types for flashcards |
| `lib/flashcards/gemini.ts` | Create | Gemini Flash client: prompt building + API call + validation |
| `app/api/teacher/flashcards/generate/route.ts` | Create | API route: auth, fetch context, call Gemini, write to Firestore |
| `app/student/flashcards/page.tsx` | Create | Student flashcard list + review experience |
| `app/teacher/work/page.tsx` | Modify | Add flashcard generation checkbox + API call in saveGrade |
| `app/student/layout.tsx` | Modify | Add "Flashcards" nav item |
| `components/elevate/icons.tsx` | Modify | Add Layers icon for flashcards nav |
| `firestore.rules` | Modify | Add flashcards collection rules |
| `firestore.indexes.json` | Modify | Add flashcards composite indexes |
| `.env.example` | Modify | Add GEMINI_API_KEY |

---

## Chunk 1: Foundation — Schema, Gemini Client, API Route

### Task 1: Install Gemini SDK and add env var

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install the Gemini SDK**

Run: `npm install @google/generative-ai`

- [ ] **Step 2: Add GEMINI_API_KEY to .env.example**

Add after the existing Firebase admin vars (line 10 of `.env.example`):

```
GEMINI_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: add @google/generative-ai SDK and GEMINI_API_KEY env var"
```

---

### Task 2: Create Zod schema and TypeScript types

**Files:**
- Create: `lib/flashcards/schema.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// lib/flashcards/schema.ts
import { z } from "zod"

export const CARD_TYPES = ["error_correction", "error_correction_explained", "fill_in_blank", "explanation"] as const
export const CATEGORIES = ["grammar", "vocabulary", "spelling", "structure", "style", "punctuation"] as const

export const FlashcardContentSchema = z.object({
  card_type: z.enum(CARD_TYPES),
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().nullable(),
  category: z.enum(CATEGORIES),
})

export const GeminiResponseSchema = z.object({
  flashcards: z.array(FlashcardContentSchema).min(1).max(20),
})

export type FlashcardContent = z.infer<typeof FlashcardContentSchema>

export type Flashcard = FlashcardContent & {
  id: string
  student_id: string
  submission_id: string
  assignment_id: string
  class_id: string
  school_id: string
  generated_by: string
  cefr_level: string
  status: "learning" | "known"
  created_at: string
  reviewed_at: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/flashcards/schema.ts
git commit -m "feat: add flashcard Zod schemas and TypeScript types"
```

---

### Task 3: Create Gemini client module

**Files:**
- Create: `lib/flashcards/gemini.ts`

- [ ] **Step 1: Create the Gemini client**

```typescript
// lib/flashcards/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai"
import { GeminiResponseSchema, type FlashcardContent } from "./schema"

const SYSTEM_INSTRUCTION = `You are a language learning expert specializing in English as a foreign language.
Analyze the student's work and create flashcards targeting their specific mistakes.

Return a JSON object with a "flashcards" array. Each flashcard has:
- card_type: Choose the best format for each mistake:
  - "error_correction" — front: the mistake, back: corrected form
  - "error_correction_explained" — front: the mistake, back: correction + grammar/usage rule
  - "fill_in_blank" — front: sentence with a blank (___), back: correct word + brief explanation
  - "explanation" — front: concept question, back: rule/explanation
- front: string (the question/prompt side)
- back: string (the answer/explanation side)
- hint: string or null (optional hint, mainly for fill_in_blank)
- category: one of "grammar", "vocabulary", "spelling", "structure", "style", "punctuation"

Focus on the most impactful mistakes. Return 1-15 flashcards depending on how many mistakes you find.
Return ONLY valid JSON, no markdown fences, no extra text.`

type GenerateInput = {
  assignmentTitle: string
  assignmentDescription: string
  cefrLevel: string
  studentText: string
  teacherFeedback: string
  score: number
}

function buildUserPrompt(input: GenerateInput): string {
  return `## Assignment
Title: ${input.assignmentTitle}
Description: ${input.assignmentDescription}
CEFR Level: ${input.cefrLevel.toUpperCase()}

## Student's Submission (score: ${input.score}/100)
${input.studentText}

## Teacher's Feedback
${input.teacherFeedback}

Generate flashcards from the student's mistakes.`
}

export async function generateFlashcards(input: GenerateInput): Promise<FlashcardContent[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
    },
  })

  const prompt = buildUserPrompt(input)

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await model.generateContent(prompt)
    const text = result.response.text()

    try {
      const parsed = JSON.parse(text)
      const validated = GeminiResponseSchema.parse(parsed)
      return validated.flashcards
    } catch {
      if (attempt === 1) throw new Error("Gemini returned invalid flashcard data after retry")
    }
  }

  throw new Error("Unreachable")
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/flashcards/gemini.ts
git commit -m "feat: add Gemini Flash client for flashcard generation"
```

---

### Task 4: Create the API route

**Files:**
- Create: `app/api/teacher/flashcards/generate/route.ts`

Reference the existing API route pattern at `app/api/teacher/update-student-level/route.ts` for auth structure.

- [ ] **Step 1: Create the API route**

```typescript
// app/api/teacher/flashcards/generate/route.ts
import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { generateFlashcards } from "@/lib/flashcards/gemini"

async function getCallerUid(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7))
    return decoded.uid
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  // 1. Auth
  const callerUid = await getCallerUid(request)
  if (!callerUid) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
  }

  // 2. Verify teacher role
  const membershipSnap = await adminDb.collection("school_memberships")
    .where("user_id", "==", callerUid)
    .where("role", "in", ["teacher", "owner", "admin"])
    .limit(1)
    .get()

  if (membershipSnap.empty) {
    return NextResponse.json({ error: "Accès réservé aux enseignants." }, { status: 403 })
  }

  // 3. Parse body
  let body: { submission_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Charge utile invalide." }, { status: 400 })
  }

  const submissionId = (body.submission_id || "").trim()
  if (!submissionId) {
    return NextResponse.json({ error: "submission_id est obligatoire." }, { status: 400 })
  }

  // 4. Fetch submission
  const submissionSnap = await adminDb.collection("submissions").doc(submissionId).get()
  if (!submissionSnap.exists) {
    return NextResponse.json({ error: "Soumission introuvable." }, { status: 404 })
  }
  const submission = submissionSnap.data()!

  if (submission.status !== "graded") {
    return NextResponse.json({ error: "La soumission n'est pas encore corrigée." }, { status: 400 })
  }

  // 5. Verify teacher has access to the class
  if (submission.class_id) {
    const classSnap = await adminDb.collection("classes").doc(submission.class_id).get()
    const classData = classSnap.exists ? classSnap.data() : null
    if (!classData || classData.teacher_id !== callerUid) {
      return NextResponse.json({ error: "Accès refusé à cette classe." }, { status: 403 })
    }
  }

  // 6. Duplicate guard
  const existingSnap = await adminDb.collection("flashcards")
    .where("submission_id", "==", submissionId)
    .get()

  if (!existingSnap.empty) {
    const allCards = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ flashcards: allCards, count: allCards.length, existing: true })
  }

  // 8. Fetch assignment
  const assignmentSnap = await adminDb.collection("assignments").doc(submission.assignment_id).get()
  const assignment = assignmentSnap.exists ? assignmentSnap.data()! : {}

  // 9. Call Gemini
  let flashcardContents
  try {
    flashcardContents = await generateFlashcards({
      assignmentTitle: assignment.title || "",
      assignmentDescription: assignment.description || "",
      cefrLevel: assignment.cefr_level || "b1",
      studentText: submission.content?.text || "",
      teacherFeedback: submission.feedback || "",
      score: submission.score ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: "La génération a échoué, veuillez réessayer." },
      { status: 502 },
    )
  }

  // 10. Batch write to Firestore
  const batch = adminDb.batch()
  const now = new Date().toISOString()
  const createdCards: any[] = []

  for (const card of flashcardContents) {
    const docRef = adminDb.collection("flashcards").doc()
    const fullCard = {
      student_id: submission.student_id,
      submission_id: submissionId,
      assignment_id: submission.assignment_id,
      class_id: submission.class_id || null,
      school_id: submission.school_id || null,
      generated_by: callerUid,
      cefr_level: assignment.cefr_level || "b1",
      card_type: card.card_type,
      front: card.front,
      back: card.back,
      hint: card.hint,
      category: card.category,
      status: "learning",
      created_at: now,
      reviewed_at: null,
    }
    batch.set(docRef, fullCard)
    createdCards.push({ id: docRef.id, ...fullCard })
  }

  await batch.commit()

  return NextResponse.json({ flashcards: createdCards, count: createdCards.length })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/teacher/flashcards/generate/route.ts
git commit -m "feat: add POST /api/teacher/flashcards/generate API route"
```

---

### Task 5: Add Firestore rules and indexes for flashcards

**Files:**
- Modify: `firestore.rules` (add after line 77, the personalized_exercises block)
- Modify: `firestore.indexes.json` (add new indexes)

- [ ] **Step 1: Add flashcards rule to firestore.rules**

Add after the `personalized_exercises` block (after line 77):

```
    // Flashcards
    match /flashcards/{flashcardId} {
      allow read: if isSignedIn();
      allow update: if isSignedIn()
        && resource.data.student_id == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'reviewed_at']);
      // Creation and deletion handled server-side via Admin SDK
    }
```

This is intentionally stricter than other collections: students can only update their own cards' `status` and `reviewed_at` fields. Creation happens server-side via the API route (Admin SDK bypasses rules).

- [ ] **Step 2: Add composite indexes to firestore.indexes.json**

Add these two index entries to the `indexes` array:

```json
{
  "collectionGroup": "flashcards",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "student_id", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "flashcards",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "submission_id", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat: add flashcards Firestore rules and composite indexes"
```

---

## Chunk 2: Teacher Integration

### Task 6: Add flashcard checkbox and API call to teacher grading

**Files:**
- Modify: `app/teacher/work/page.tsx`

- [ ] **Step 1: Add state variable for flashcard checkbox**

Add after line 92 (`const [createPersonalized, setCreatePersonalized] = useState(true)`):

```typescript
const [createFlashcards, setCreateFlashcards] = useState(true)
```

- [ ] **Step 1b: Reset state when selecting a new submission**

Find the existing `useEffect` that resets `gradeScore`, `gradeFeedback`, and `createPersonalized` when `selectedWork` changes (around lines 140-151). Add `setCreateFlashcards(true)` alongside the existing `setCreatePersonalized(true)` call.

- [ ] **Step 2: Add flashcard generation logic in saveGrade**

Add after the `createPersonalized` block (after line 396, before `setSuccess`):

```typescript
      if (createFlashcards) {
        try {
          const idToken = await (await import("@/lib/firebase/client")).auth.currentUser?.getIdToken()
          const flashcardResponse = await fetch("/api/teacher/flashcards/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({ submission_id: selectedWork.id }),
          })
          const flashcardData = await flashcardResponse.json()
          if (flashcardResponse.ok) {
            setSuccess(
              flashcardData.existing
                ? "Correction enregistrée. Flashcards déjà générées."
                : `Correction enregistrée. ${flashcardData.count} flashcard(s) créée(s).`,
            )
          } else {
            setSuccess("Correction enregistrée. Erreur lors de la génération des flashcards.")
          }
        } catch {
          setSuccess("Correction enregistrée. Erreur lors de la génération des flashcards.")
        }
      }
```

Also update line 398 to only set success if flashcards weren't requested (since the flashcard block sets its own success message). Change:

```typescript
      setSuccess("Correction enregistrée.")
```

To:

```typescript
      if (!createFlashcards) {
        setSuccess("Correction enregistrée.")
      }
```

- [ ] **Step 3: Add flashcard checkbox to the UI**

Add after line 671 (after the existing personalized exercises checkbox `</label>`):

```tsx
            <label className="flex items-center gap-2 font-sans text-sm text-text-dark select-none">
              <input
                type="checkbox"
                checked={createFlashcards}
                onChange={(event) => setCreateFlashcards(event.target.checked)}
                className="w-[15px] h-[15px] accent-navy"
              />
              Générer des flashcards à partir des erreurs
            </label>
```

- [ ] **Step 4: Verify the teacher grading flow works**

Run: `npm run dev`

1. Log in as a teacher
2. Go to Work inbox, select a submitted work
3. Enter a score and feedback
4. Check the flashcard checkbox
5. Click "Enregistrer la correction"
6. Verify the success toast shows the flashcard count

- [ ] **Step 5: Commit**

```bash
git add app/teacher/work/page.tsx
git commit -m "feat: add flashcard generation checkbox to teacher grading flow"
```

---

## Chunk 3: Student Flashcard Page

### Task 7: Add Layers icon to icons component

**Files:**
- Modify: `components/elevate/icons.tsx`

- [ ] **Step 1: Add Layers icon**

Add before the closing `}` of the Icons object (before line 95):

```typescript
  Layers: ({ className }: { className?: string }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
  ),
```

- [ ] **Step 2: Add Flashcards nav item to student layout**

In `app/student/layout.tsx`, add after line 18 (the Progress nav item):

```typescript
  { href: "/student/flashcards", label: "Flashcards", icon: Icons.Layers },
```

- [ ] **Step 3: Commit**

```bash
git add components/elevate/icons.tsx app/student/layout.tsx
git commit -m "feat: add Flashcards nav item to student sidebar"
```

---

### Task 8: Create the student flashcard page

**Files:**
- Create: `app/student/flashcards/page.tsx`

- [ ] **Step 1: Create the flashcard page**

```tsx
// app/student/flashcards/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Icons } from "@/components/elevate/icons"
import { ElevateButton } from "@/components/elevate/shared"
import { cn } from "@/lib/utils"
import { db } from "@/lib/firebase/client"
import { useAppContext } from "@/hooks/use-app-context"
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import type { Flashcard } from "@/lib/flashcards/schema"

type FlashcardRow = Flashcard & { assignmentTitle?: string }

export default function FlashcardsPage() {
  const { context, loading } = useAppContext()
  const [cards, setCards] = useState<FlashcardRow[]>([])
  const [filter, setFilter] = useState<"learning" | "known">("learning")
  const [loadingCards, setLoadingCards] = useState(true)

  // Review mode state
  const [reviewing, setReviewing] = useState(false)
  const [reviewCards, setReviewCards] = useState<FlashcardRow[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewResults, setReviewResults] = useState<{ known: number; learning: number }>({ known: 0, learning: 0 })
  const [reviewDone, setReviewDone] = useState(false)

  useEffect(() => {
    if (!context) return
    loadCards()
  }, [context, filter])

  const loadCards = async () => {
    if (!context) return
    setLoadingCards(true)
    try {
      const q = query(
        collection(db, "flashcards"),
        where("student_id", "==", context.userId),
        where("status", "==", filter),
        orderBy("created_at", "desc"),
      )
      const snap = await getDocs(q)
      const rows: FlashcardRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FlashcardRow))

      // Fetch assignment titles for context
      const assignmentIds = [...new Set(rows.map((r) => r.assignment_id).filter(Boolean))]
      const titleMap: Record<string, string> = {}
      for (const aid of assignmentIds) {
        try {
          const aSnap = await getDoc(doc(db, "assignments", aid))
          if (aSnap.exists()) titleMap[aid] = aSnap.data().title || "Devoir"
        } catch { /* ignore */ }
      }
      for (const row of rows) {
        row.assignmentTitle = titleMap[row.assignment_id] || "Devoir"
      }

      setCards(rows)
    } finally {
      setLoadingCards(false)
    }
  }

  const learningCount = cards.length
  const startReview = () => {
    const toReview = cards.filter((c) => c.status === "learning")
    if (!toReview.length) return
    setReviewCards(toReview)
    setReviewIndex(0)
    setRevealed(false)
    setReviewResults({ known: 0, learning: 0 })
    setReviewDone(false)
    setReviewing(true)
  }

  const handleAssessment = async (status: "learning" | "known") => {
    const card = reviewCards[reviewIndex]
    const now = new Date().toISOString()

    // Update Firestore
    await updateDoc(doc(db, "flashcards", card.id), {
      status,
      reviewed_at: now,
    })

    // Update local state
    setReviewResults((prev) => ({
      known: prev.known + (status === "known" ? 1 : 0),
      learning: prev.learning + (status === "learning" ? 1 : 0),
    }))

    // Advance or finish
    if (reviewIndex + 1 < reviewCards.length) {
      setReviewIndex(reviewIndex + 1)
      setRevealed(false)
    } else {
      setReviewDone(true)
    }
  }

  const exitReview = () => {
    setReviewing(false)
    setFilter("learning")
    loadCards()
  }

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      grammar: "Grammaire",
      vocabulary: "Vocabulaire",
      spelling: "Orthographe",
      structure: "Structure",
      style: "Style",
      punctuation: "Ponctuation",
    }
    return labels[cat] || cat
  }

  if (loading || !context) {
    return <div className="font-sans text-sm text-text-mid">Chargement...</div>
  }

  // Review mode — full-screen card review
  if (reviewing) {
    if (reviewDone) {
      return (
        <div className="max-w-lg mx-auto py-12 text-center">
          <div className="text-4xl mb-4">&#127881;</div>
          <h2 className="font-serif text-2xl font-bold text-navy mb-4">Révision terminée !</h2>
          <div className="flex justify-center gap-6 mb-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{reviewResults.known}</div>
              <div className="font-sans text-sm text-text-mid">Maîtrisées</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{reviewResults.learning}</div>
              <div className="font-sans text-sm text-text-mid">À revoir</div>
            </div>
          </div>
          <ElevateButton variant="primary" onClick={exitReview}>
            Retour aux flashcards
          </ElevateButton>
        </div>
      )
    }

    const currentCard = reviewCards[reviewIndex]
    return (
      <div className="max-w-lg mx-auto py-6">
        {/* Progress */}
        <div className="flex justify-between items-center mb-3">
          <span className="font-sans text-sm text-text-mid">{reviewIndex + 1} / {reviewCards.length}</span>
          <span className="font-sans text-sm text-text-mid">{categoryLabel(currentCard.category)}</span>
        </div>
        <div className="h-1 bg-gray-200 rounded-full mb-6">
          <div
            className="h-1 bg-navy rounded-full transition-all"
            style={{ width: `${((reviewIndex + 1) / reviewCards.length) * 100}%` }}
          />
        </div>

        {/* Card */}
        <div
          className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm cursor-pointer"
          onClick={() => !revealed && setRevealed(true)}
        >
          {/* Front */}
          <div className={cn("p-8 text-center", revealed && "border-b border-dashed border-gray-200")}>
            <div className="uppercase text-xs tracking-widest text-text-light mb-3">
              {currentCard.card_type === "fill_in_blank" ? "Complétez" : "Trouvez l'erreur"}
            </div>
            <div className="font-sans text-lg font-medium text-navy">{currentCard.front}</div>
            {currentCard.hint && (
              <div className="font-sans text-sm text-text-mid mt-2">Indice : {currentCard.hint}</div>
            )}
            {!revealed && (
              <div className="font-sans text-sm text-text-light mt-4">Tap pour voir la réponse</div>
            )}
          </div>

          {/* Back — revealed */}
          {revealed && (
            <div className="p-8 bg-gray-50 text-center">
              <div className="uppercase text-xs tracking-widest text-text-light mb-3">Correction</div>
              <div className="font-sans text-lg font-medium text-green-700">{currentCard.back}</div>
            </div>
          )}
        </div>

        {/* Assessment buttons */}
        {revealed && (
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => handleAssessment("learning")}
              className="flex-1 bg-amber-50 text-amber-800 border-none py-3 rounded-lg font-sans text-sm font-medium cursor-pointer hover:bg-amber-100 transition-colors"
            >
              Encore à réviser
            </button>
            <button
              onClick={() => handleAssessment("known")}
              className="flex-1 bg-green-50 text-green-800 border-none py-3 rounded-lg font-sans text-sm font-medium cursor-pointer hover:bg-green-100 transition-colors"
            >
              Je sais
            </button>
          </div>
        )}

        {/* Exit */}
        <button
          onClick={exitReview}
          className="mt-4 w-full font-sans text-sm text-text-mid hover:text-navy cursor-pointer bg-transparent border-none py-2"
        >
          Quitter la révision
        </button>
      </div>
    )
  }

  // List mode — main flashcard page
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-navy">Mes Flashcards</h1>
        {cards.length > 0 && filter === "learning" && (
          <div className="flex gap-2">
            <span className="bg-amber-50 text-amber-800 px-3 py-1 rounded-full font-sans text-sm">
              {cards.length} à réviser
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setFilter("learning")}
          className={cn(
            "px-4 py-2 rounded-lg font-sans text-sm font-medium cursor-pointer border-none transition-colors",
            filter === "learning" ? "bg-navy text-white" : "bg-gray-100 text-text-mid hover:bg-gray-200",
          )}
        >
          À réviser
        </button>
        <button
          onClick={() => setFilter("known")}
          className={cn(
            "px-4 py-2 rounded-lg font-sans text-sm font-medium cursor-pointer border-none transition-colors",
            filter === "known" ? "bg-navy text-white" : "bg-gray-100 text-text-mid hover:bg-gray-200",
          )}
        >
          Maîtrisées
        </button>
      </div>

      {/* Start review button */}
      {filter === "learning" && cards.length > 0 && (
        <button
          onClick={startReview}
          className="w-full bg-navy text-white rounded-xl p-5 mb-6 cursor-pointer border-none hover:bg-navy-mid transition-colors"
        >
          <div className="font-sans text-base font-semibold">Commencer la révision</div>
          <div className="font-sans text-sm opacity-80 mt-1">{cards.length} carte(s) à réviser</div>
        </button>
      )}

      {/* Empty state */}
      {!loadingCards && cards.length === 0 && (
        <div className="text-center py-16">
          <Icons.Layers className="mx-auto mb-4 text-text-light" />
          <p className="font-sans text-sm text-text-mid">
            {filter === "learning"
              ? "Pas encore de flashcards. Tes enseignants peuvent en générer après avoir corrigé tes devoirs."
              : "Aucune carte maîtrisée pour le moment."}
          </p>
        </div>
      )}

      {/* Loading */}
      {loadingCards && (
        <div className="font-sans text-sm text-text-mid py-8 text-center">Chargement des flashcards...</div>
      )}

      {/* Card list */}
      {!loadingCards && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="font-sans text-sm font-medium text-navy truncate">{card.front}</div>
                <div className="font-sans text-xs text-text-mid mt-1">
                  {categoryLabel(card.category)} · {card.assignmentTitle || "Devoir"}
                </div>
              </div>
              <span
                className={cn(
                  "ml-3 px-2 py-0.5 rounded-full font-sans text-xs whitespace-nowrap",
                  card.status === "learning" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800",
                )}
              >
                {card.status === "learning" ? "À réviser" : "Maîtrisée"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run dev`

1. Log in as a student
2. Navigate to `/student/flashcards`
3. Verify the empty state message appears
4. Verify the "Flashcards" nav link is active

- [ ] **Step 3: Commit**

```bash
git add app/student/flashcards/page.tsx
git commit -m "feat: add student flashcard page with list and review experience"
```

---

## Chunk 4: End-to-End Verification

### Task 9: End-to-end manual test

- [ ] **Step 1: Set up GEMINI_API_KEY**

Add a valid Gemini API key to your `.env.local`:

```
GEMINI_API_KEY=your-key-here
```

- [ ] **Step 2: Full flow test**

Run: `npm run dev`

1. **Teacher:** Log in as teacher → Go to Work inbox → Select a submitted (ungraded) work
2. **Teacher:** Enter score (e.g., 65) and feedback (e.g., "Good effort but watch your tenses and vocabulary")
3. **Teacher:** Check both checkboxes (exercises + flashcards) → Click "Enregistrer la correction"
4. **Teacher:** Verify success toast shows flashcard count
5. **Student:** Log in as the same student → Go to `/student/flashcards`
6. **Student:** Verify flashcards appear in the list with correct categories
7. **Student:** Click "Commencer la révision" → verify scroll-reveal works
8. **Student:** Tap card to reveal answer → click "Je sais" or "Encore à réviser"
9. **Student:** Complete review → verify end screen shows results
10. **Student:** Return to list → verify card statuses updated correctly

- [ ] **Step 3: Test duplicate guard**

1. **Teacher:** Grade the same submission again with flashcard checkbox checked
2. Verify the toast says "Flashcards déjà générées" and no duplicates are created

- [ ] **Step 4: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during e2e flashcard testing"
```

---

### Task 10: Deploy Firestore indexes

- [ ] **Step 1: Deploy indexes to Firebase**

Run: `firebase deploy --only firestore:indexes`

This ensures the composite indexes for `flashcards` queries are created before users hit the page.

- [ ] **Step 2: Deploy Firestore rules**

Run: `firebase deploy --only firestore:rules`

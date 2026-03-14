# AI Flashcard Generation from Graded Homework

## Overview

Add AI-powered flashcard generation to Elevate. When a teacher grades a student's homework submission, they can trigger Gemini Flash to analyze the student's mistakes and generate targeted flashcards. Students review flashcards on a dedicated page with a scroll-reveal card experience.

## Context

- **Platform:** Next.js 16 + Firebase (Firestore, Auth, Cloud Storage)
- **Current state:** Teachers grade submissions with score (0-100) + freeform feedback. Personalized exercises can be auto-generated via templates. No AI/LLM integration exists. No flashcard or spaced repetition features exist.
- **AI provider:** Google Gemini Flash via `@google/generative-ai` SDK
- **Scope:** Graded homework submissions only (no photo-exam integration)

## Data Model

### New Firestore collection: `flashcards`

| Field | Type | Description |
|---|---|---|
| `id` | string (doc ID) | Auto-generated |
| `student_id` | string | Owner of the card |
| `submission_id` | string | Source graded submission |
| `assignment_id` | string | For context/grouping |
| `class_id` | string | For teacher queries |
| `school_id` | string | Multi-tenancy |
| `card_type` | `"error_correction"` \| `"error_correction_explained"` \| `"fill_in_blank"` \| `"explanation"` | Gemini-chosen format |
| `front` | string | Question/prompt side |
| `back` | string | Answer/explanation side |
| `hint` | string \| null | Optional hint (for fill-in-blank) |
| `category` | `"grammar"` \| `"vocabulary"` \| `"spelling"` \| `"structure"` \| `"style"` \| `"punctuation"` | Error category |
| `generated_by` | string | Teacher ID who triggered generation |
| `cefr_level` | string | From the assignment's `cefr_level` field |
| `status` | `"learning"` \| `"known"` | Student self-assessment |
| `created_at` | timestamp | When generated |
| `reviewed_at` | timestamp \| null | Last review time |

### Firestore indexes

- `student_id` + `status` + `created_at` — student flashcard page queries
- `submission_id` — fetch cards for a specific submission

## API Design

### `POST /api/teacher/flashcards/generate`

**Auth:** Bearer token from `Authorization` header (consistent with existing `/api/teacher/*` routes)

**Request body:**
```typescript
{
  submission_id: string
}
```

**Flow:**
1. Authenticate teacher via Bearer token in `Authorization` header (matching existing API route pattern)
2. Fetch submission from Firestore (validates it exists and is graded)
3. **Duplicate guard:** Query `flashcards` where `submission_id == request.submission_id`. If flashcards already exist, return them without calling Gemini (prevents duplicate generation on repeated clicks)
4. Fetch the parent assignment (title, description, type, cefr_level)
5. Build Gemini prompt with full context:
   - Assignment prompt/description
   - CEFR level (from assignment's `cefr_level` field)
   - Student's submitted text
   - Teacher's feedback
   - Score
6. Call Gemini Flash API (single prompt, batch generation)
7. Validate response with Zod schema (Gemini returns card content; server injects `student_id`, `submission_id`, `assignment_id`, `class_id`, `school_id`, `generated_by`, `cefr_level`, `status: "learning"`, timestamps)
8. Batch-write flashcards to Firestore using `WriteBatch` (atomic — all or nothing)
9. Return created flashcards array

**Error handling:**
- If Gemini returns invalid JSON or Zod validation fails, retry once with same prompt
- If still failing, return 502 error to teacher with message "La génération a échoué, veuillez réessayer" — no partial saves
- Standard HTTP error responses: 401 (unauthorized), 404 (submission not found), 400 (submission not graded), 502 (Gemini failure)

**Response:**
```typescript
{
  flashcards: Flashcard[]  // array of created flashcard documents
  count: number
}
```

## Gemini Integration

### SDK & Configuration

- **Package:** `@google/generative-ai` (official Google Generative AI SDK)
- **Model:** `gemini-2.0-flash` (or latest flash variant)
- **Environment variable:** `GEMINI_API_KEY`
- **Called server-side only** from the API route

### Prompt Structure

- **System instruction:** "You are a language learning expert specializing in English as a foreign language. Analyze the student's work and create flashcards targeting their specific mistakes."
- **User prompt:** Contains the full context (assignment, submission text, teacher feedback, score, CEFR level)
- **Output format:** JSON array of flashcard objects
- **Card type selection:** Gemini chooses the best format per mistake:
  - `error_correction` — Front: the mistake, Back: corrected form
  - `error_correction_explained` — Front: the mistake, Back: correction + grammar/usage rule
  - `fill_in_blank` — Front: sentence with blank, Back: correct word + explanation
  - `explanation` — Front: concept question, Back: rule/explanation

### Zod Validation Schema

```typescript
const FlashcardSchema = z.object({
  card_type: z.enum(["error_correction", "error_correction_explained", "fill_in_blank", "explanation"]),
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().nullable(),
  category: z.enum(["grammar", "vocabulary", "spelling", "structure", "style", "punctuation"]),
})

const GeminiResponseSchema = z.object({
  flashcards: z.array(FlashcardSchema).min(1).max(20),
})
```

## Teacher Grading Integration

### Location

Existing grading flow in `app/teacher/work/page.tsx` (lines ~307-405).

### Changes

- Add a new checkbox: **"Générer des flashcards à partir des erreurs"** — placed next to the existing "Générer automatiquement des exercices personnalisés" checkbox
- On grading submission (click "Envoyer la correction"):
  1. Save grade and feedback (existing flow)
  2. If flashcard checkbox is ticked, call `POST /api/flashcards/generate`
  3. Show toast notification: "X flashcards créées" on success, or error message on failure
- No teacher preview/edit of flashcards — they go directly to the student's deck

## Student Flashcard Page

### Route: `/student/flashcards`

### Navigation

New "Flashcards" link in student sidebar/nav, alongside Exercises, Progress, Calendar, Documents.

### Page Layout: Flat List + Review All

- **Header:** "Mes Flashcards" with badge counts — "X à réviser" (amber) and "X maîtrisées" (green)
- **Filter tabs:** "À réviser" (active by default) and "Maîtrisées"
- **Primary action:** Large "Commencer la révision" button showing count of cards to review
- **Card list:** Scrollable list of flashcard previews showing:
  - Front text (truncated)
  - Category badge (grammar, vocabulary, etc.)
  - Source assignment name
  - Status badge (learning/known)

### Review Experience: Scroll Reveal

When student taps "Commencer la révision":

1. **Progress bar** at top: "3 / 12" with category label
2. **Card display:**
   - Top section: question/prompt (front of card), initially shown alone
   - Bottom section: answer/explanation (back of card), revealed on tap — both visible together
   - Correction text highlighted (e.g., underlined corrected word)
3. **Self-assessment buttons:**
   - "😕 Encore à réviser" → keeps card as `status: "learning"`
   - "✓ Je sais" → updates card to `status: "known"`
4. **Auto-advance** to next card after selection
5. **End screen** after all cards reviewed: summary of results

### Empty State

When a student has no flashcards yet, show a friendly message: "Pas encore de flashcards. Tes enseignants peuvent en générer après avoir corrigé tes devoirs." with an illustration or icon.

### Data Fetching

- Query `flashcards` collection: `where student_id == currentUser AND status == selectedFilter`, ordered by `created_at`
- Status updates written to Firestore on each self-assessment button tap
- Update `reviewed_at` timestamp on each review

## Security

### Firestore Rules

```
match /flashcards/{flashcardId} {
  // Students can read and update status of their own flashcards
  allow read: if request.auth != null && resource.data.student_id == request.auth.uid;
  allow update: if request.auth != null
    && resource.data.student_id == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'reviewed_at']);

  // Only server (admin SDK) can create/delete flashcards
  // Creation happens via API route using Firebase Admin SDK
}
```

### API Route Auth

- Validate Bearer token from `Authorization` header via Firebase Admin SDK (consistent with existing `/api/teacher/*` routes)
- Verify user has teacher role
- Verify teacher has access to the submission's class (via `school_memberships`)

## Dependencies

### New npm package
- `@google/generative-ai` — Google Generative AI SDK for Gemini

### New environment variable
- `GEMINI_API_KEY` — API key for Gemini Flash

## Out of Scope

- Spaced repetition (SRS) scheduling — cards use simple "learning"/"known" status
- Photo-exam flashcard generation
- Teacher preview/editing of generated flashcards
- Flashcard sharing between students
- Manual flashcard creation by teachers or students
- Deck grouping by assignment (flat list only)
- Flashcard deletion or archiving
- Rate limiting on Gemini API calls
- Offline resilience for review sessions

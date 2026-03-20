import { z } from "zod"

export const CARD_TYPES = ["error_correction", "error_correction_explained", "fill_in_blank", "explanation"] as const
export const CATEGORIES = ["grammar", "vocabulary", "tense", "syntax", "structure"] as const

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
  submission_id: string | null
  assignment_id: string | null
  class_id: string | null
  school_id: string | null
  generated_by: string
  cefr_level: string
  status: "learning" | "known"
  created_at: string
  reviewed_at: string | null
  source_kind?: "teacher_correction" | "adaptive_level" | string
  skill_category?: "vocabulary" | "grammar" | "tense" | null
  difficulty_level?: string | null
  question_type?: "single_choice" | null
  options?: string[]
  correct_answer?: string | null
  attempt_count?: number
  last_result?: "correct" | "incorrect" | null
  last_selected_option?: string | null
}

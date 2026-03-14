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

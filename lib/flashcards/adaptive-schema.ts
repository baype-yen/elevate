import { z } from "zod"

export const ADAPTIVE_CATEGORIES = ["vocabulary", "grammar", "tense"] as const
export const CEFR_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"] as const

export type AdaptiveCategory = (typeof ADAPTIVE_CATEGORIES)[number]
export type CefrLevel = (typeof CEFR_LEVELS)[number]

export const AdaptiveFlashcardContentSchema = z.object({
  question: z.string().trim().min(6).max(240),
  options: z.array(z.string().trim().min(1).max(160)).min(3).max(4),
  correct_option: z.string().trim().min(1).max(160),
  explanation: z.string().trim().min(4).max(320),
  category: z.enum(ADAPTIVE_CATEGORIES).optional(),
  difficulty_level: z.enum(CEFR_LEVELS).optional(),
})

export const AdaptiveGeminiResponseSchema = z.object({
  flashcards: z.array(AdaptiveFlashcardContentSchema).min(1).max(8),
})

export type AdaptiveFlashcardContent = z.infer<typeof AdaptiveFlashcardContentSchema>

export function normalizeCefrLevel(value: unknown): CefrLevel {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "a1" || normalized === "a2" || normalized === "b1" || normalized === "b2" || normalized === "c1" || normalized === "c2") {
    return normalized
  }
  return "b1"
}

export function levelUp(level: CefrLevel): CefrLevel {
  const index = CEFR_LEVELS.indexOf(level)
  if (index === -1 || index >= CEFR_LEVELS.length - 1) return level
  return CEFR_LEVELS[index + 1]
}

export function isAdaptiveCategory(value: unknown): value is AdaptiveCategory {
  return value === "vocabulary" || value === "grammar" || value === "tense"
}

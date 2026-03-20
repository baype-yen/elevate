import { z } from "zod"

const COURSE_EXERCISE_TYPES = ["reading", "vocabulary", "conjugation", "grammar", "mixed"] as const
const COURSE_EXERCISE_QUESTION_TYPES = ["single_choice", "short_answer"] as const

export const CourseExerciseQuestionSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  prompt: z.string().trim().min(8).max(320),
  question_type: z.enum(COURSE_EXERCISE_QUESTION_TYPES),
  options: z.array(z.string().trim().min(1).max(180)).min(2).max(6).optional(),
})

export const CourseExerciseSchema = z.object({
  title: z.string().min(4).max(140),
  instructions: z.string().min(30).max(2800),
  exercise_type: z.enum(COURSE_EXERCISE_TYPES),
  questions: z.array(CourseExerciseQuestionSchema).min(3).max(8).optional(),
})

export const CourseExerciseGeminiResponseSchema = z.object({
  exercises: z.array(CourseExerciseSchema).min(3).max(8),
})

export type CourseExerciseContent = z.infer<typeof CourseExerciseSchema>
export type CourseExerciseQuestionContent = z.infer<typeof CourseExerciseQuestionSchema>

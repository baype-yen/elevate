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
    model: "gemini-2.5-flash",
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

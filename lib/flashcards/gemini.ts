import { GoogleGenerativeAI } from "@google/generative-ai"
import { GeminiResponseSchema, type FlashcardContent } from "./schema"

const SYSTEM_INSTRUCTION = `Tu es un expert en apprentissage des langues, spécialisé dans l'anglais langue étrangère pour des étudiants francophones.
Analyse le travail de l'étudiant et crée des flashcards ciblant ses erreurs spécifiques.

IMPORTANT : Les exemples en anglais (front) restent en anglais, mais toutes les explications, règles de grammaire et indices (back, hint) doivent être rédigés en français.

Retourne un objet JSON avec un tableau "flashcards". Chaque flashcard contient :
- card_type: Choisis le meilleur format pour chaque erreur :
  - "error_correction" — front: l'erreur en anglais, back: la forme corrigée en anglais + brève explication en français
  - "error_correction_explained" — front: l'erreur en anglais, back: correction en anglais + règle de grammaire expliquée en français
  - "fill_in_blank" — front: phrase en anglais avec un blanc (___), back: mot correct + explication en français
  - "explanation" — front: question conceptuelle en français, back: règle/explication en français avec exemples en anglais
- front: string (le côté question)
- back: string (le côté réponse/explication)
- hint: string ou null (indice optionnel en français, surtout pour fill_in_blank)
- category: une de "grammar", "vocabulary", "syntax", "structure"

Concentre-toi UNIQUEMENT sur les erreurs de grammaire, vocabulaire, syntaxe et structure. Ignore les erreurs de ponctuation, orthographe mineure ou style.
Retourne 1 à 15 flashcards selon le nombre d'erreurs trouvées.
Retourne UNIQUEMENT du JSON valide, pas de blocs markdown, pas de texte supplémentaire.`

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

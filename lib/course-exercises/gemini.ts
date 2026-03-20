import { GoogleGenerativeAI } from "@google/generative-ai"
import {
  CourseExerciseGeminiResponseSchema,
  type CourseExerciseContent,
  type CourseExerciseQuestionContent,
} from "./schema"

const SYSTEM_INSTRUCTION = `Tu es un enseignant d'anglais pour etudiants francophones.
Tu crees des exercices bases sur des documents de cours deja vus en classe.

Contraintes obligatoires:
- Les consignes doivent etre en francais.
- Chaque exercice doit inclure un melange de questions repondables tout de suite.
- Chaque exercice doit contenir 4 questions:
  - 2 questions "single_choice" (QCM a choix unique)
  - 2 questions "short_answer" (reponse courte redigee par l'eleve)
- Chaque question "single_choice" doit fournir 3 ou 4 options plausibles.
- N'ecris pas de correction ni de "bonne reponse" dans la sortie.
- Le contenu anglais doit rester simple, utile et coherent avec le sujet du document.
- Le niveau CECRL doit etre respecte strictement.
- Les exercices doivent porter uniquement sur ce qui est present dans le document.
- Evite les questions hors-sujet, trop abstraites ou qui demandent des connaissances externes.

Format de sortie JSON uniquement:
{
  "exercises": [
    {
      "title": "...",
      "instructions": "...",
      "exercise_type": "reading|vocabulary|grammar|mixed",
      "questions": [
        {
          "id": "q1",
          "prompt": "...",
          "question_type": "single_choice",
          "options": ["...", "...", "..."]
        },
        {
          "id": "q2",
          "prompt": "...",
          "question_type": "short_answer"
        }
      ]
    }
  ]
}

Genere entre 4 et 6 exercices.`

type NormalizedQuestion = {
  id: string
  prompt: string
  question_type: "single_choice" | "short_answer"
  options?: string[]
}

type GenerateCourseExercisesInput = {
  topicLabel: string
  materialTypeLabel: string
  cefrLevel: string
  documentName: string
  textContent?: string | null
  inlineFile?: {
    mimeType: string
    dataBase64: string
  }
}

function hasExplicitQuestions(instructions: string) {
  const normalized = (instructions || "").replace(/\r/g, "").trim()
  if (!normalized) return false

  const numberedOrBulletItems =
    normalized.match(/(?:^|\n)\s*(?:\d+[).:-]|[-*])\s+[^\n]+/g)?.length || 0
  if (numberedOrBulletItems >= 2) return true

  const questionMarks = normalized.match(/\?/g)?.length || 0
  if (questionMarks >= 2) return true

  return false
}

function referencesQuestionsWithoutDetails(instructions: string) {
  const normalized = (instructions || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  if (!normalized) return false

  return /(reponds?|repondez)[^\n]{0,60}questions?/.test(normalized)
    || /questions?\s+(suivantes?|ci-dessous|dessous)/.test(normalized)
}

function fallbackQuestionsForType(exerciseType: CourseExerciseContent["exercise_type"]) {
  if (exerciseType === "reading") {
    return [
      "Quelle est l'idee principale du document ?",
      "Citez deux informations precises du document pour justifier votre reponse.",
      "Expliquez en 3 a 4 phrases ce que vous retenez de ce document.",
    ]
  }

  if (exerciseType === "vocabulary") {
    return [
      "Relevez 5 mots ou expressions importants du document et donnez leur sens en francais.",
      "Ecrivez une phrase en anglais pour chaque mot ou expression releve(e).",
      "Choisissez 2 mots et expliquez le contexte dans lequel ils sont utilises dans le document.",
    ]
  }

  if (exerciseType === "grammar") {
    return [
      "Identifiez 4 phrases du document qui illustrent le point de grammaire travaille en classe.",
      "Reecrivez ces phrases en modifiant le temps ou la structure grammaticale.",
      "Expliquez brievement en francais la regle appliquee pour chaque transformation.",
    ]
  }

  return [
    "Resumez le document en 4 a 5 phrases claires.",
    "Relevez 4 mots importants et reutilisez-les dans de nouvelles phrases en anglais.",
    "Faites 2 transformations grammaticales correctes a partir d'exemples du document.",
  ]
}

function defaultInstructionsForType(exerciseType: CourseExerciseContent["exercise_type"]) {
  if (exerciseType === "reading") {
    return "Lisez le document puis repondez aux questions de comprehension ci-dessous."
  }
  if (exerciseType === "vocabulary") {
    return "Travaillez le vocabulaire du document puis repondez aux questions ci-dessous."
  }
  if (exerciseType === "grammar") {
    return "Appliquez les regles de grammaire vues en cours en repondant aux questions ci-dessous."
  }
  return "Repondez aux questions ci-dessous en vous appuyant sur le document de cours."
}

function ensureActionableInstructionText(exercise: CourseExerciseContent) {
  const instructions = (exercise.instructions || "").trim()
  if (!instructions) return defaultInstructionsForType(exercise.exercise_type)

  if (hasExplicitQuestions(instructions) || !referencesQuestionsWithoutDetails(instructions)) {
    return instructions
  }

  return `${instructions}\n\nRepondez directement aux questions ci-dessous.`
}

function buildFallbackStructuredQuestions(exerciseType: CourseExerciseContent["exercise_type"]): NormalizedQuestion[] {
  if (exerciseType === "reading") {
    return [
      {
        id: "q1",
        prompt: "Quelle proposition resume le mieux l'idee principale du document ?",
        question_type: "single_choice",
        options: [
          "Le document presente le theme central du cours.",
          "Le document raconte une histoire sans rapport avec le cours.",
          "Le document parle d'un sujet non etudie en classe.",
        ],
      },
      {
        id: "q2",
        prompt: "Explique en 2 a 3 phrases ce que tu as compris du document.",
        question_type: "short_answer",
      },
      {
        id: "q3",
        prompt: "Quelle information est bien presente dans le document ?",
        question_type: "single_choice",
        options: [
          "Une information precise vue pendant le cours.",
          "Une regle qui n'apparait pas dans le document.",
          "Un exemple totalement invente et hors contexte.",
        ],
      },
      {
        id: "q4",
        prompt: "Cite un detail du document et explique pourquoi il est important.",
        question_type: "short_answer",
      },
    ]
  }

  if (exerciseType === "vocabulary") {
    return [
      {
        id: "q1",
        prompt: "Quel item correspond a un mot-cle de vocabulaire du document ?",
        question_type: "single_choice",
        options: [
          "Un terme qui revient dans le texte de cours.",
          "Un mot sans lien avec le theme etudie.",
          "Une expression absente du document.",
        ],
      },
      {
        id: "q2",
        prompt: "Choisis un mot important du document et donne sa signification en francais.",
        question_type: "short_answer",
      },
      {
        id: "q3",
        prompt: "Quelle phrase reemploie le vocabulaire du document dans le bon contexte ?",
        question_type: "single_choice",
        options: [
          "Une phrase qui respecte le sens du mot dans le document.",
          "Une phrase qui change completement le sens du mot.",
          "Une phrase qui n'utilise pas le mot cible.",
        ],
      },
      {
        id: "q4",
        prompt: "Ecris une phrase simple en anglais avec un mot du document.",
        question_type: "short_answer",
      },
    ]
  }

  if (exerciseType === "grammar") {
    return [
      {
        id: "q1",
        prompt: "Quel choix respecte la regle de grammaire etudiee dans le document ?",
        question_type: "single_choice",
        options: [
          "La phrase applique correctement la structure etudiee.",
          "La phrase melange des temps sans logique.",
          "La phrase utilise une structure absente du cours.",
        ],
      },
      {
        id: "q2",
        prompt: "Reecris une phrase du document en appliquant la regle de grammaire ciblee.",
        question_type: "short_answer",
      },
      {
        id: "q3",
        prompt: "Quel exemple correspond le mieux au point de grammaire travaille ?",
        question_type: "single_choice",
        options: [
          "Un exemple conforme a la regle vue en classe.",
          "Un exemple qui ignore le point de grammaire.",
          "Un exemple qui introduit une regle non etudiee.",
        ],
      },
      {
        id: "q4",
        prompt: "Explique brievement la regle appliquee dans ta transformation.",
        question_type: "short_answer",
      },
    ]
  }

  return [
    {
      id: "q1",
      prompt: "Quelle proposition est la plus fidele au document de cours ?",
      question_type: "single_choice",
      options: [
        "Une proposition en lien direct avec le contenu vu en classe.",
        "Une proposition hors sujet.",
        "Une proposition qui contredit le document.",
      ],
    },
    {
      id: "q2",
      prompt: "Resume en 2 a 3 phrases ce que tu retiens du document.",
      question_type: "short_answer",
    },
    {
      id: "q3",
      prompt: "Quel choix utilise correctement un element linguistique du document ?",
      question_type: "single_choice",
      options: [
        "Le choix reutilise correctement un element du document.",
        "Le choix deforme l'element du document.",
        "Le choix ne contient aucun element du document.",
      ],
    },
    {
      id: "q4",
      prompt: "Donne un exemple personnel en anglais qui reprend une idee du document.",
      question_type: "short_answer",
    },
  ]
}

function uniqueOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []

  const seen = new Set<string>()
  const rows: string[] = []

  for (const item of options) {
    if (typeof item !== "string") continue
    const value = item.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(value)
  }

  return rows
}

function toNormalizedQuestion(
  question: CourseExerciseQuestionContent,
  index: number,
): NormalizedQuestion | null {
  const prompt = (question.prompt || "").trim()
  if (prompt.length < 8) return null

  if (question.question_type === "single_choice") {
    const options = uniqueOptions(question.options)
    if (options.length < 2) return null

    return {
      id: `q${index + 1}`,
      prompt,
      question_type: "single_choice",
      options: options.slice(0, 4),
    }
  }

  return {
    id: `q${index + 1}`,
    prompt,
    question_type: "short_answer",
  }
}

function ensureStructuredQuestions(exercise: CourseExerciseContent): NormalizedQuestion[] {
  const rawQuestions = Array.isArray(exercise.questions) ? exercise.questions : []
  const normalized = rawQuestions
    .map((question, index) => toNormalizedQuestion(question, index))
    .filter((question): question is NormalizedQuestion => !!question)

  const fallback = buildFallbackStructuredQuestions(exercise.exercise_type)

  const hasSingleChoice = normalized.some((question) => question.question_type === "single_choice")
  const hasShortAnswer = normalized.some((question) => question.question_type === "short_answer")

  if (!hasSingleChoice) {
    const row = fallback.find((question) => question.question_type === "single_choice")
    if (row) normalized.push(row)
  }

  if (!hasShortAnswer) {
    const row = fallback.find((question) => question.question_type === "short_answer")
    if (row) normalized.push(row)
  }

  let cursor = 0
  while (normalized.length < 4) {
    normalized.push(fallback[cursor % fallback.length])
    cursor += 1
  }

  const questions = normalized.slice(0, 6).map((question, index) => {
    if (question.question_type === "single_choice") {
      return {
        id: `q${index + 1}`,
        prompt: question.prompt,
        question_type: question.question_type,
        options: question.options?.slice(0, 4),
      }
    }

    return {
      id: `q${index + 1}`,
      prompt: question.prompt,
      question_type: question.question_type,
    }
  })

  const singleChoiceCount = questions.filter((question) => question.question_type === "single_choice").length
  const shortAnswerCount = questions.filter((question) => question.question_type === "short_answer").length

  if (!singleChoiceCount || !shortAnswerCount) {
    return buildFallbackStructuredQuestions(exercise.exercise_type)
  }

  return questions
}

function ensureActionableExercise(exercise: CourseExerciseContent): CourseExerciseContent {
  const instructions = ensureActionableInstructionText(exercise)
  const fallbackQuestions = fallbackQuestionsForType(exercise.exercise_type)

  return {
    ...exercise,
    instructions: instructions || fallbackQuestions.join(" "),
    questions: ensureStructuredQuestions(exercise),
  }
}

function buildPrompt(input: GenerateCourseExercisesInput): string {
  return [
    `Sujet: ${input.topicLabel}`,
    `Type de document: ${input.materialTypeLabel}`,
    `Niveau CECRL cible: ${input.cefrLevel.toUpperCase()}`,
    `Nom du document: ${input.documentName}`,
    "",
    "Tache:",
    "- Produis des exercices que les eleves peuvent realiser en ligne.",
    "- Donne des consignes claires et actionnables.",
    "- Dans chaque exercice, genere 4 questions melangees: 2 single_choice + 2 short_answer.",
    "- Pour chaque question single_choice, fournis 3 ou 4 options.",
    "- Equilibre comprehension, vocabulaire et grammaire selon le document.",
    "- Si le document est lexical, privilegie vocabulaire + reutilisation en phrase.",
    "- Si le document est grammatical, privilegie transformation/reformulation.",
    "",
    "Retourne uniquement du JSON valide, sans markdown.",
  ].join("\n")
}

function buildTextPayload(input: GenerateCourseExercisesInput) {
  const trimmedText = (input.textContent || "").trim()
  return `${buildPrompt(input)}\n\nContenu du document:\n${trimmedText.slice(0, 30000)}`
}

export async function generateCourseExercisesFromDocument(
  input: GenerateCourseExercisesInput,
): Promise<CourseExerciseContent[]> {
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

  const hasTextContent = !!(input.textContent || "").trim()
  if (!hasTextContent && !input.inlineFile?.dataBase64) {
    throw new Error("No document content available for AI generation")
  }

  const requestPayload = hasTextContent
    ? buildTextPayload(input)
    : [
        { text: buildPrompt(input) },
        {
          inlineData: {
            mimeType: input.inlineFile?.mimeType || "application/pdf",
            data: input.inlineFile?.dataBase64 || "",
          },
        },
      ]

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await model.generateContent(requestPayload as any)
    const text = result.response.text()

    try {
      const parsed = JSON.parse(text)
      const validated = CourseExerciseGeminiResponseSchema.parse(parsed)
      return validated.exercises.map(ensureActionableExercise)
    } catch {
      if (attempt === 1) {
        throw new Error("Gemini returned invalid course exercise data after retry")
      }
    }
  }

  throw new Error("Unreachable")
}

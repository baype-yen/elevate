import { GoogleGenerativeAI } from "@google/generative-ai"
import {
  AdaptiveGeminiResponseSchema,
  type AdaptiveCategory,
  type CefrLevel,
  type AdaptiveFlashcardContent,
  isAdaptiveCategory,
  normalizeCefrLevel,
} from "./adaptive-schema"

type GenerateAdaptiveFlashcardsInput = {
  category: AdaptiveCategory
  level: CefrLevel
  count: number
  weakTopic?: string | null
  wrongOption?: string | null
}

export type AdaptiveGeneratedCard = {
  question: string
  options: string[]
  correctOption: string
  explanation: string
  category: AdaptiveCategory
  difficultyLevel: CefrLevel
}

const SYSTEM_INSTRUCTION = `Tu es un professeur d'anglais specialise en remediations CECRL.
Tu dois creer des flashcards QCM (choix unique) adaptees au niveau de l'eleve.

Contraintes strictes:
- Ecris la consigne en francais.
- Les exemples/phrases en anglais sont autorises quand necessaire.
- Chaque flashcard doit etre un QCM a choix unique.
- Fournis 3 ou 4 options plausibles.
- "correct_option" doit etre exactement une des options.
- La difficulte doit correspondre strictement au niveau CECRL demande.
- Reste limite aux themes: vocabulary, grammar, tense.
- Donne une explication courte et utile en francais.

Retourne uniquement du JSON valide au format:
{
  "flashcards": [
    {
      "question": "...",
      "options": ["...", "...", "..."],
      "correct_option": "...",
      "explanation": "...",
      "category": "vocabulary|grammar|tense",
      "difficulty_level": "a1|a2|b1|b2|c1|c2"
    }
  ]
}`

function buildPrompt(input: GenerateAdaptiveFlashcardsInput) {
  const hints = [
    `Categorie cible: ${input.category}`,
    `Niveau CECRL cible: ${input.level.toUpperCase()}`,
    `Nombre de flashcards a generer: ${Math.max(1, Math.min(6, input.count))}`,
  ]

  if (input.weakTopic) {
    hints.push(`Point faible detecte: ${input.weakTopic}`)
  }

  if (input.wrongOption) {
    hints.push(`Mauvaise option choisie par l'eleve: ${input.wrongOption}`)
  }

  return [
    ...hints,
    "",
    "Genere des QCM a choix unique utiles pour faire progresser l'eleve.",
    "Chaque question doit etre repondable rapidement.",
    "Retourne uniquement du JSON valide, sans markdown.",
  ].join("\n")
}

function uniqueOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return []
  const rows: string[] = []
  const seen = new Set<string>()

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

function normalizeCard(
  row: AdaptiveFlashcardContent,
  input: GenerateAdaptiveFlashcardsInput,
): AdaptiveGeneratedCard | null {
  const question = (row.question || "").trim()
  const explanation = (row.explanation || "").trim()
  const correctOption = (row.correct_option || "").trim()
  if (!question || !explanation || !correctOption) return null

  const options = uniqueOptions(row.options)
  const hasCorrect = options.some((option) => option.toLowerCase() === correctOption.toLowerCase())
  let safeOptions = options

  if (!hasCorrect) {
    if (safeOptions.length < 4) {
      safeOptions = [...safeOptions, correctOption]
    } else {
      safeOptions = [correctOption, ...safeOptions.slice(0, 3)]
    }
  }

  if (safeOptions.length < 3) return null

  const normalizedCategory = isAdaptiveCategory(row.category) ? row.category : input.category
  const normalizedLevel = normalizeCefrLevel(row.difficulty_level || input.level)

  return {
    question,
    options: safeOptions.slice(0, 4),
    correctOption,
    explanation,
    category: normalizedCategory,
    difficultyLevel: normalizedLevel,
  }
}

const VOCAB_BANK: Record<CefrLevel, Array<{ question: string; options: string[]; answer: string; explanation: string }>> = {
  a1: [
    {
      question: "Choisis la bonne traduction de 'teacher'.",
      options: ["enseignant", "cuisine", "voiture", "montagne"],
      answer: "enseignant",
      explanation: "'Teacher' signifie 'enseignant'.",
    },
    {
      question: "Quel mot anglais correspond a 'pomme' ?",
      options: ["apple", "table", "window", "street"],
      answer: "apple",
      explanation: "Le mot 'apple' signifie 'pomme'.",
    },
  ],
  a2: [
    {
      question: "Choisis la meilleure traduction de 'usually'.",
      options: ["d'habitude", "hier", "jamais", "demain"],
      answer: "d'habitude",
      explanation: "'Usually' exprime une habitude.",
    },
    {
      question: "Quel mot veut dire 'trajet' ?",
      options: ["journey", "kitchen", "holiday", "window"],
      answer: "journey",
      explanation: "'Journey' veut dire 'trajet' ou 'voyage'.",
    },
  ],
  b1: [
    {
      question: "Quel mot signifie 'ameliorer' en anglais ?",
      options: ["improve", "arrive", "borrow", "forget"],
      answer: "improve",
      explanation: "'Improve' signifie ameliorer.",
    },
    {
      question: "Choisis le synonyme le plus proche de 'challenge'.",
      options: ["difficulty", "animal", "garden", "plate"],
      answer: "difficulty",
      explanation: "Dans ce contexte, 'challenge' est proche de 'difficulty'.",
    },
  ],
  b2: [
    {
      question: "Choisis la meilleure traduction de 'although'.",
      options: ["bien que", "parce que", "afin de", "depuis"],
      answer: "bien que",
      explanation: "'Although' introduit une concession: 'bien que'.",
    },
    {
      question: "Quel mot correspond a 'reussite' ?",
      options: ["achievement", "equipment", "warning", "opinion"],
      answer: "achievement",
      explanation: "'Achievement' designe une reussite obtenue.",
    },
  ],
  c1: [
    {
      question: "Quel mot est le plus proche de 'durable' ?",
      options: ["sustainable", "confusing", "narrow", "temporary"],
      answer: "sustainable",
      explanation: "'Sustainable' correspond a durable dans un contexte de long terme.",
    },
    {
      question: "Choisis la meilleure traduction de 'thorough'.",
      options: ["approfondi", "rapide", "fragile", "bruyant"],
      answer: "approfondi",
      explanation: "'Thorough' signifie complet et approfondi.",
    },
  ],
  c2: [
    {
      question: "Quel verbe correspond le mieux a 'transmettre une idee' ?",
      options: ["convey", "ignore", "delay", "regret"],
      answer: "convey",
      explanation: "'Convey' signifie transmettre une idee ou un message.",
    },
    {
      question: "Dans un debat, que signifie 'nuance' en anglais ?",
      options: ["nuance", "surface", "shortcut", "defect"],
      answer: "nuance",
      explanation: "Le mot est identique en anglais dans ce contexte academique.",
    },
  ],
}

const GRAMMAR_BANK: Record<CefrLevel, Array<{ question: string; options: string[]; answer: string; explanation: string }>> = {
  a1: [
    {
      question: "Choisis la phrase correcte.",
      options: ["She likes music.", "She like music.", "She liking music.", "She is like music."],
      answer: "She likes music.",
      explanation: "Avec he/she/it au present simple, on ajoute -s au verbe.",
    },
    {
      question: "Quelle phrase est correcte avec 'be' ?",
      options: ["They are happy.", "They is happy.", "They am happy.", "They be happy."],
      answer: "They are happy.",
      explanation: "Avec 'they', on utilise 'are'.",
    },
  ],
  a2: [
    {
      question: "Choisis la forme correcte.",
      options: ["I am watching TV now.", "I watch TV now every second.", "I watching TV now.", "I am watch TV now."],
      answer: "I am watching TV now.",
      explanation: "Le present continuous: be + verbe-ing pour une action en cours.",
    },
    {
      question: "Choisis la phrase correcte.",
      options: ["There are many students.", "There is many students.", "There many students are.", "There be many students."],
      answer: "There are many students.",
      explanation: "On utilise 'there are' avec un pluriel.",
    },
  ],
  b1: [
    {
      question: "Choisis la phrase grammaticalement correcte.",
      options: ["I have lived here for two years.", "I live here since two years.", "I am living here for two years ago.", "I have live here since two years."],
      answer: "I have lived here for two years.",
      explanation: "Avec 'for + duree', on emploie souvent le present perfect.",
    },
    {
      question: "Quelle phrase est correcte ?",
      options: ["If it rains, we will stay inside.", "If it will rain, we stay inside.", "If it rains, we stays inside.", "If rains, we will stay inside."],
      answer: "If it rains, we will stay inside.",
      explanation: "Premier conditionnel: if + present, will + base verb.",
    },
  ],
  b2: [
    {
      question: "Choisis la phrase correcte au conditionnel irreel.",
      options: ["If I were you, I would apply sooner.", "If I was you, I will apply sooner.", "If I am you, I would apply sooner.", "If I were you, I apply sooner."],
      answer: "If I were you, I would apply sooner.",
      explanation: "Dans un conseil hypothetique, on utilise souvent 'If I were...'.",
    },
    {
      question: "Choisis la reformulation correcte.",
      options: ["Hardly had I arrived when the meeting started.", "Hardly I had arrived when the meeting started.", "Hardly had I arrived when started the meeting.", "Hardly I arrived when the meeting had started."],
      answer: "Hardly had I arrived when the meeting started.",
      explanation: "Apres 'Hardly', inversion auxiliaire + sujet au style soutenu.",
    },
  ],
  c1: [
    {
      question: "Choisis la phrase correcte avec inversion formelle.",
      options: ["Rarely do we see such consistency.", "Rarely we do see such consistency.", "Rarely we see such consistency do.", "Rarely does we see such consistency."],
      answer: "Rarely do we see such consistency.",
      explanation: "Avec 'Rarely' en tete de phrase, on inverse auxiliaire et sujet.",
    },
    {
      question: "Quelle phrase est correcte ?",
      options: ["It is essential that she be informed immediately.", "It is essential that she is informed immediately.", "It is essential that she was informed immediately.", "It is essential that she being informed immediately."],
      answer: "It is essential that she be informed immediately.",
      explanation: "Le subjonctif anglais peut apparaitre apres certaines structures formelles.",
    },
  ],
  c2: [
    {
      question: "Choisis la phrase la plus precise et correcte.",
      options: ["Were it not for the data, the claim would remain speculative.", "If it was not for the data, the claim remain speculative.", "Were not it for the data, the claim would remain speculative.", "Were it not for the data, the claim remains speculative."],
      answer: "Were it not for the data, the claim would remain speculative.",
      explanation: "Forme inversive avancee pour exprimer une condition hypothetique.",
    },
    {
      question: "Quelle phrase respecte le registre academique ?",
      options: ["Seldom have findings been interpreted with such caution.", "Seldom findings have been interpreted with such caution.", "Seldom have findings interpreted with such caution.", "Seldom has findings been interpreted with such caution."],
      answer: "Seldom have findings been interpreted with such caution.",
      explanation: "Apres 'Seldom', l'inversion correcte est auxiliaire + sujet.",
    },
  ],
}

const TENSE_BANK: Record<CefrLevel, Array<{ question: string; options: string[]; answer: string; explanation: string }>> = {
  a1: [
    {
      question: "Complete: 'He ___ to school every day.'",
      options: ["goes", "go", "is go", "going"],
      answer: "goes",
      explanation: "Habitude au present simple avec he/she/it: verbe + s.",
    },
    {
      question: "Complete: 'Look! They ___ football now.'",
      options: ["are playing", "play", "played", "plays"],
      answer: "are playing",
      explanation: "'Now' indique une action en cours: present continuous.",
    },
  ],
  a2: [
    {
      question: "Complete: 'Yesterday, we ___ home late.'",
      options: ["got", "get", "are getting", "have got"],
      answer: "got",
      explanation: "'Yesterday' appelle en general le preterit.",
    },
    {
      question: "Choose the best tense: 'I ___ my keys. I can't find them.'",
      options: ["have lost", "lost", "am losing", "lose"],
      answer: "have lost",
      explanation: "Resultat present d'une action passee: present perfect.",
    },
  ],
  b1: [
    {
      question: "Choose the correct form: 'She ___ in Paris since 2021.'",
      options: ["has lived", "lived", "is living", "had lived"],
      answer: "has lived",
      explanation: "'Since + date' se combine souvent avec le present perfect.",
    },
    {
      question: "Complete: 'When I arrived, they ___ dinner.'",
      options: ["were having", "have", "had", "are having"],
      answer: "were having",
      explanation: "Action en cours dans le passe: past continuous.",
    },
  ],
  b2: [
    {
      question: "Choose the best option: By the time we got there, the film ___.",
      options: ["had started", "started", "has started", "was starting"],
      answer: "had started",
      explanation: "Action anterieure a une autre action passee: past perfect.",
    },
    {
      question: "Complete: 'This time next week, I ___ from Madrid.'",
      options: ["will be working", "work", "have worked", "worked"],
      answer: "will be working",
      explanation: "Future continuous pour une action en cours a un moment futur.",
    },
  ],
  c1: [
    {
      question: "Choose the best tense sequence.",
      options: ["By 2030, they will have reduced emissions significantly.", "By 2030, they reduce emissions significantly.", "By 2030, they had reduced emissions significantly.", "By 2030, they are reducing emissions significantly."],
      answer: "By 2030, they will have reduced emissions significantly.",
      explanation: "Future perfect: action accomplie avant un repere futur.",
    },
    {
      question: "Complete: 'I wish I ___ that earlier.'",
      options: ["had known", "know", "have known", "was knowing"],
      answer: "had known",
      explanation: "Avec 'I wish' sur un regret passe, on utilise le past perfect.",
    },
  ],
  c2: [
    {
      question: "Choose the most accurate tense combination.",
      options: ["No sooner had the report been published than analysts began debating it.", "No sooner the report had been published than analysts began debating it.", "No sooner had the report published than analysts began debating it.", "No sooner had the report been published than analysts have begun debating it."],
      answer: "No sooner had the report been published than analysts began debating it.",
      explanation: "Structure avancee avec inversion et concordance precise des temps.",
    },
    {
      question: "Select the best formal timeline.",
      options: ["Had the committee acted earlier, the issue might have been contained.", "If the committee acted earlier, the issue might have been contained.", "Had the committee acted earlier, the issue may contain.", "If the committee had acted earlier, the issue might be contained yesterday."],
      answer: "Had the committee acted earlier, the issue might have been contained.",
      explanation: "Conditionnel passe formel avec inversion correcte et resultat hypothetique.",
    },
  ],
}

function fallbackAdaptiveFlashcards(input: GenerateAdaptiveFlashcardsInput): AdaptiveGeneratedCard[] {
  const level = normalizeCefrLevel(input.level)

  const bank = input.category === "vocabulary"
    ? VOCAB_BANK[level]
    : input.category === "grammar"
    ? GRAMMAR_BANK[level]
    : TENSE_BANK[level]

  const rows: AdaptiveGeneratedCard[] = []
  const safeCount = Math.max(1, Math.min(6, input.count))

  for (let index = 0; index < safeCount; index += 1) {
    const source = bank[index % bank.length]
    rows.push({
      question: source.question,
      options: source.options,
      correctOption: source.answer,
      explanation: source.explanation,
      category: input.category,
      difficultyLevel: level,
    })
  }

  return rows
}

function dedupeByQuestion(rows: AdaptiveGeneratedCard[]) {
  const seen = new Set<string>()
  const result: AdaptiveGeneratedCard[] = []

  for (const row of rows) {
    const key = row.question.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }

  return result
}

export async function generateAdaptiveFlashcards(
  input: GenerateAdaptiveFlashcardsInput,
): Promise<AdaptiveGeneratedCard[]> {
  const safeInput = {
    ...input,
    level: normalizeCefrLevel(input.level),
    count: Math.max(1, Math.min(6, input.count)),
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return fallbackAdaptiveFlashcards(safeInput)
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
    },
  })

  const prompt = buildPrompt(safeInput)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await model.generateContent(prompt)
      const text = result.response.text()
      const parsed = JSON.parse(text)
      const validated = AdaptiveGeminiResponseSchema.parse(parsed)

      const normalized = dedupeByQuestion(
        validated.flashcards
          .map((row) => normalizeCard(row, safeInput))
          .filter((row): row is AdaptiveGeneratedCard => !!row),
      )

      if (normalized.length >= 1) {
        const rows = normalized.slice(0, safeInput.count)
        if (rows.length >= safeInput.count) return rows

        const fallbackRows = fallbackAdaptiveFlashcards({
          ...safeInput,
          count: safeInput.count - rows.length,
        })

        return [...rows, ...fallbackRows].slice(0, safeInput.count)
      }
    } catch {
      if (attempt === 1) break
    }
  }

  return fallbackAdaptiveFlashcards(safeInput)
}

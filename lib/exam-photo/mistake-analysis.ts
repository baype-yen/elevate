export type MistakeCategory = "vocabulary" | "grammar" | "tense" | "word_order" | "spelling" | "punctuation"

export type MistakeAnalysis = Record<MistakeCategory, string[]>

export type GeneratedPhotoExercise = {
  category: MistakeCategory
  title: string
  instructions: string
  exerciseType: "vocabulary" | "grammar" | "exercise"
  cefrLevel: "a1" | "a2" | "b1" | "b2" | "c1" | "c2"
}

export const mistakeCategoryOrder: MistakeCategory[] = [
  "vocabulary",
  "grammar",
  "tense",
  "word_order",
  "spelling",
  "punctuation",
]

export const mistakeCategoryLabel: Record<MistakeCategory, string> = {
  vocabulary: "Vocabulaire",
  grammar: "Grammaire",
  tense: "Temps verbaux",
  word_order: "Ordre des mots",
  spelling: "Orthographe",
  punctuation: "Ponctuation",
}

const categoryExerciseType: Record<MistakeCategory, "vocabulary" | "grammar" | "exercise"> = {
  vocabulary: "vocabulary",
  grammar: "grammar",
  tense: "grammar",
  word_order: "exercise",
  spelling: "exercise",
  punctuation: "grammar",
}

function normalizeLevel(level: string): "a1" | "a2" | "b1" | "b2" | "c1" | "c2" {
  const value = (level || "b1").trim().toLowerCase()
  if (value === "a1" || value === "a2" || value === "b1" || value === "b2" || value === "c1" || value === "c2") {
    return value
  }
  return "b1"
}

function withGlobalFlag(regex: RegExp) {
  return new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`)
}

function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function normalizeForSnippet(value: string) {
  const normalized = collapseWhitespace(value)
  if (normalized.length <= 96) return normalized
  return `${normalized.slice(0, 93)}...`
}

function collectRegexSnippets(source: string, regex: RegExp, limit = 3) {
  const snippets: string[] = []
  const worker = withGlobalFlag(regex)

  for (const match of source.matchAll(worker)) {
    const token = (match[0] || "").trim()
    if (!token) continue

    const start = Math.max(0, (match.index || 0) - 30)
    const end = Math.min(source.length, (match.index || 0) + token.length + 34)
    const context = normalizeForSnippet(source.slice(start, end))

    if (context && !snippets.includes(context)) {
      snippets.push(context)
    }

    if (snippets.length >= limit) break
  }

  return snippets
}

function uniqLimit(values: string[], limit = 3) {
  const uniq = Array.from(new Set(values.map(normalizeForSnippet).filter(Boolean)))
  return uniq.slice(0, limit)
}

const vocabularyPatterns = [
  /\b(gonna|wanna|gotta|kinda|sorta|stuff|things|kids|guys)\b/gi,
  /\b(informations|advices|equipments|furnitures|luggages|peoples|competences)\b/gi,
  /\b(a lot of thing|very very|good enough for me)\b/gi,
]

const grammarPatterns = [
  /\b(he|she|it)\s+don't\b/gi,
  /\b(he|she|it)\s+do\b/gi,
  /\b(he|she|it)\s+have\b/gi,
  /\bthere\s+is\s+(many|several|a lot of)\b/gi,
  /\bi\s+am\s+agree\b/gi,
  /\bmore\s+better\b/gi,
]

const tensePatterns = [
  /\byesterday\b[^.!?\n]{0,70}\b(go|come|write|send|make|take|meet|do)\b/gi,
  /\blast\s+(week|month|year|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.!?\n]{0,70}\b(is|are|go|come|do)\b/gi,
  /\b(i|we|they|he|she)\s+have\s+went\b/gi,
  /\b(i|we|they|he|she)\s+did\s+not\s+\w+ed\b/gi,
  /\bsince\s+\d+\s+(years|months|weeks)\b/gi,
]

const wordOrderPatterns = [
  /\bi\s+very\s+like\b/gi,
  /\bexplain\s+me\b/gi,
  /\baccording\s+to\s+me\b/gi,
  /\bhow\s+is\s+called\b/gi,
  /\bi\s+only\s+can\b/gi,
  /\bdiscuss\s+about\b/gi,
]

const spellingTokens = [
  "adress",
  "recieve",
  "wich",
  "becaus",
  "enviroment",
  "developpment",
  "succesful",
  "responsability",
  "seperate",
  "begining",
  "untill",
]

function detectCategoryFromPatterns(text: string, patterns: RegExp[]) {
  const chunks = patterns.flatMap((pattern) => collectRegexSnippets(text, pattern, 3))
  return uniqLimit(chunks)
}

function detectSpelling(text: string) {
  const fromList = spellingTokens.flatMap((token) => collectRegexSnippets(text, new RegExp(`\\b${token}\\b`, "gi"), 2))
  const repeatedChars = collectRegexSnippets(text, /\b[a-z]*([a-z])\1\1[a-z]*\b/gi, 2)
  return uniqLimit([...fromList, ...repeatedChars])
}

function detectPunctuation(rawText: string, compactText: string) {
  const punctuationIssues = [
    ...collectRegexSnippets(compactText, /\s+[,.!?;:]/g, 2),
    ...collectRegexSnippets(compactText, /[,.!?;:][A-Za-z]/g, 2),
    ...collectRegexSnippets(compactText, /[!?]{2,}/g, 2),
    ...collectRegexSnippets(compactText, /(^|[\s"'])i([\s"'.,!?;:]|$)/g, 2),
  ]

  const linesWithoutClosingMark = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 26 && !/[.!?]$/.test(line))
    .slice(0, 2)
    .map((line) => `Phrase sans ponctuation finale: ${normalizeForSnippet(line)}`)

  return uniqLimit([...punctuationIssues, ...linesWithoutClosingMark])
}

export function analyzeExamMistakes(rawText: string): MistakeAnalysis {
  const compactText = collapseWhitespace(rawText || "")

  if (!compactText) {
    return {
      vocabulary: [],
      grammar: [],
      tense: [],
      word_order: [],
      spelling: [],
      punctuation: [],
    }
  }

  return {
    vocabulary: detectCategoryFromPatterns(compactText, vocabularyPatterns),
    grammar: detectCategoryFromPatterns(compactText, grammarPatterns),
    tense: detectCategoryFromPatterns(compactText, tensePatterns),
    word_order: detectCategoryFromPatterns(compactText, wordOrderPatterns),
    spelling: detectSpelling(compactText),
    punctuation: detectPunctuation(rawText, compactText),
  }
}

function exerciseVolume(level: "a1" | "a2" | "b1" | "b2" | "c1" | "c2") {
  if (level === "a1" || level === "a2") return 4
  if (level === "b1" || level === "b2") return 6
  return 8
}

function evidenceBlock(category: MistakeCategory, evidence: string[]) {
  if (!evidence.length) {
    return `Aucune erreur claire n'a ete detectee par OCR pour ${mistakeCategoryLabel[category].toLowerCase()}. Fais un exercice de renforcement cible.`
  }

  return [
    "Erreurs reperees dans ta copie:",
    ...evidence.map((item) => `- ${item}`),
  ].join("\n")
}

function categoryTask(category: MistakeCategory, count: number) {
  if (category === "vocabulary") {
    return `Consigne: remplace les mots/expressions faibles par des formulations professionnelles puis redige ${Math.max(3, Math.round(count / 2))} phrases de reemploi.`
  }

  if (category === "grammar") {
    return `Consigne: corrige ${count} phrases ciblees (accord sujet-verbe, articles, structures) puis explique la regle utilisee pour 2 phrases.`
  }

  if (category === "tense") {
    return `Consigne: reecris ${count} phrases au temps correct (present, preterit, present perfect) avec les marqueurs temporels adaptes.`
  }

  if (category === "word_order") {
    return `Consigne: remets ${count} phrases dans le bon ordre des mots puis transforme 3 phrases en version formelle.`
  }

  if (category === "spelling") {
    return `Consigne: corrige ${count} mots/phrases mal orthographies, puis cree une mini-liste personnelle de 10 mots a memoriser.`
  }

  return `Consigne: corrige la ponctuation et la capitalisation dans ${count} phrases, puis ajoute la ponctuation finale adaptee.`
}

export function generateExercisesFromPhotoAnalysis(params: {
  examTitle: string
  cefrLevel: string
  analysis: MistakeAnalysis
}) {
  const level = normalizeLevel(params.cefrLevel)
  const volume = exerciseVolume(level)
  const safeTitle = (params.examTitle || "Copie d'examen").trim() || "Copie d'examen"

  return mistakeCategoryOrder.map((category): GeneratedPhotoExercise => {
    const evidence = (params.analysis[category] || []).slice(0, 3)

    return {
      category,
      title: `${mistakeCategoryLabel[category]} - ${safeTitle}`,
      instructions: `${evidenceBlock(category, evidence)}\n\n${categoryTask(category, volume)}`,
      exerciseType: categoryExerciseType[category],
      cefrLevel: level,
    }
  })
}

export function totalDetectedMistakes(analysis: MistakeAnalysis) {
  return mistakeCategoryOrder.reduce((sum, category) => sum + (analysis[category] || []).length, 0)
}

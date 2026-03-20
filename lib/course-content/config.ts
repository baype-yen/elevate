export const COURSE_TOPIC_OPTIONS = [
  { value: "malls", label: "Topic 1 : Malls" },
  { value: "workers_condition", label: "Topic 2 : Worker's condition" },
] as const

export type CourseTopicKey = (typeof COURSE_TOPIC_OPTIONS)[number]["value"]

const COURSE_TOPIC_LABELS: Record<CourseTopicKey, string> = {
  malls: "Topic 1 : Malls",
  workers_condition: "Topic 2 : Worker's condition",
}

export const COURSE_MATERIAL_TYPE_OPTIONS = [
  { value: "text", label: "Textes" },
  { value: "vocabulary", label: "Vocabulaire" },
  { value: "grammar", label: "Règles de grammaire" },
] as const

export type CourseMaterialTypeKey = (typeof COURSE_MATERIAL_TYPE_OPTIONS)[number]["value"]

const COURSE_MATERIAL_TYPE_LABELS: Record<CourseMaterialTypeKey, string> = {
  text: "Textes",
  vocabulary: "Vocabulaire",
  grammar: "Règles de grammaire",
}

type CourseMaterialTheme = {
  dotBg: string
  badgeBg: string
  badgeText: string
  panelBg: string
  panelBorder: string
  memoryLabel: string
  memoryHint: string
}

const COURSE_MATERIAL_THEMES: Record<CourseMaterialTypeKey, CourseMaterialTheme> = {
  text: {
    dotBg: "bg-navy",
    badgeBg: "bg-navy",
    badgeText: "text-white",
    panelBg: "bg-navy/10",
    panelBorder: "border-navy/45",
    memoryLabel: "Bleu",
    memoryHint: "Bleu = Textes",
  },
  vocabulary: {
    dotBg: "bg-abricot",
    badgeBg: "bg-abricot",
    badgeText: "text-navy",
    panelBg: "bg-abricot/20",
    panelBorder: "border-abricot/55",
    memoryLabel: "Orange",
    memoryHint: "Orange = Vocabulaire",
  },
  grammar: {
    dotBg: "bg-watermelon",
    badgeBg: "bg-watermelon",
    badgeText: "text-white",
    panelBg: "bg-watermelon/15",
    panelBorder: "border-watermelon/55",
    memoryLabel: "Rouge",
    memoryHint: "Rouge = Règles de grammaire",
  },
}

export function parseCourseTopic(value: unknown): CourseTopicKey | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return COURSE_TOPIC_OPTIONS.some((topic) => topic.value === normalized)
    ? (normalized as CourseTopicKey)
    : null
}

export function normalizeCourseTopic(value: unknown, fallback: CourseTopicKey = "malls"): CourseTopicKey {
  return parseCourseTopic(value) || fallback
}

export function courseTopicLabel(topic: CourseTopicKey): string {
  return COURSE_TOPIC_LABELS[topic]
}

export function parseCourseMaterialType(value: unknown): CourseMaterialTypeKey | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return COURSE_MATERIAL_TYPE_OPTIONS.some((materialType) => materialType.value === normalized)
    ? (normalized as CourseMaterialTypeKey)
    : null
}

export function normalizeCourseMaterialType(
  value: unknown,
  fallback: CourseMaterialTypeKey = "text",
): CourseMaterialTypeKey {
  return parseCourseMaterialType(value) || fallback
}

export function courseMaterialTypeLabel(materialType: CourseMaterialTypeKey): string {
  return COURSE_MATERIAL_TYPE_LABELS[materialType]
}

export function courseMaterialTheme(materialType: CourseMaterialTypeKey): CourseMaterialTheme {
  return COURSE_MATERIAL_THEMES[materialType]
}

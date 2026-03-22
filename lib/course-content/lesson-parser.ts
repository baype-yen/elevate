type LessonCalloutTone = "note" | "example" | "tip" | "warning"

export type LessonBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; tone: LessonCalloutTone; label: string; text: string }

export type LessonSection = {
  id: string
  title: string
  blocks: LessonBlock[]
  examples: string[]
}

export type ParsedLessonContent = {
  title: string
  sections: LessonSection[]
}

type RawSection = {
  title: string
  lines: string[]
}

const DEFAULT_SECTION_TITLE = "Essentiel"

function slugify(value: string, index: number) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  return normalized ? `${normalized}-${index + 1}` : `section-${index + 1}`
}

function normalizeLines(sourceText: string) {
  return sourceText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t+/g, " ").replace(/\s+/g, " ").trim())
}

function parseHeadingLine(line: string): string | null {
  if (!line) return null

  const markdownHeading = line.match(/^#{1,6}\s+(.+)$/)
  if (markdownHeading) {
    return markdownHeading[1].trim()
  }

  const chapterLike = line.match(/^(?:chapter|chapitre|lesson|lecon|leçon|topic|section|partie)\s+[a-z0-9]+\s*[:\-]?\s+(.+)$/i)
  if (chapterLike) {
    return chapterLike[1].trim()
  }

  const numberedHeading = line.match(/^(\d{1,3})\s*(?:\u2022|\-|:)\s+(.+)$/)
  if (numberedHeading && numberedHeading[2].trim().length >= 5) {
    return `${numberedHeading[1]} - ${numberedHeading[2].trim()}`
  }

  return null
}

function toCalloutTone(label: string): LessonCalloutTone {
  const normalized = label.toLowerCase()
  if (normalized.includes("exemple") || normalized.includes("example")) return "example"
  if (normalized.includes("warning") || normalized.includes("attention")) return "warning"
  if (normalized.includes("tip") || normalized.includes("astuce")) return "tip"
  return "note"
}

function parseCalloutLine(line: string): { label: string; text: string; tone: LessonCalloutTone } | null {
  const match = line.match(/^(remarque|note|fyi|attention|important|astuce|tip|exemple|example)\s*[:\-]\s*(.+)$/i)
  if (!match) return null

  const label = match[1].trim()
  const text = match[2].trim()
  if (!text) return null

  return {
    label,
    text,
    tone: toCalloutTone(label),
  }
}

function isListLine(line: string) {
  return /^(?:-|\*|\u2022)\s+.+$/.test(line) || /^\d+[.)]\s+.+$/.test(line)
}

function stripListPrefix(line: string) {
  return line.replace(/^(?:-|\*|\u2022)\s+/, "").replace(/^\d+[.)]\s+/, "").trim()
}

function parseTableCells(line: string): string[] | null {
  if (!line.includes("|")) return null

  let cells = line.split("|").map((cell) => cell.trim())
  if (cells[0] === "") cells = cells.slice(1)
  if (cells[cells.length - 1] === "") cells = cells.slice(0, -1)

  return cells.length >= 2 ? cells : null
}

function isTableSeparatorRow(cells: string[]) {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")))
}

function parseSections(lines: string[]): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection = { title: DEFAULT_SECTION_TITLE, lines: [] }

  for (const line of lines) {
    const heading = parseHeadingLine(line)
    if (heading) {
      if (current.lines.length) {
        sections.push(current)
      }
      current = { title: heading, lines: [] }
      continue
    }

    current.lines.push(line)
  }

  if (current.lines.length) {
    sections.push(current)
  }

  return sections.length ? sections : [{ title: DEFAULT_SECTION_TITLE, lines }]
}

function parseBlocks(lines: string[]): LessonBlock[] {
  const blocks: LessonBlock[] = []
  let index = 0

  const isSpecialStart = (line: string) => {
    return !!parseCalloutLine(line) || isListLine(line) || !!parseTableCells(line)
  }

  while (index < lines.length) {
    const rawLine = lines[index]
    const line = rawLine.trim()

    if (!line) {
      index += 1
      continue
    }

    const callout = parseCalloutLine(line)
    if (callout) {
      index += 1
      const continuation: string[] = []
      while (index < lines.length) {
        const next = lines[index].trim()
        if (!next) break
        if (isSpecialStart(next)) break
        continuation.push(next)
        index += 1
      }

      blocks.push({
        type: "callout",
        tone: callout.tone,
        label: callout.label,
        text: [callout.text, ...continuation].join("\n"),
      })
      continue
    }

    if (isListLine(line)) {
      const items: string[] = []
      while (index < lines.length) {
        const next = lines[index].trim()
        if (!next || !isListLine(next)) break
        const stripped = stripListPrefix(next)
        if (stripped) items.push(stripped)
        index += 1
      }

      if (items.length) {
        blocks.push({ type: "list", items })
      }
      continue
    }

    const tableCells = parseTableCells(line)
    if (tableCells) {
      const tableRows: string[][] = []
      while (index < lines.length) {
        const next = lines[index].trim()
        const cells = parseTableCells(next)
        if (!next || !cells) break
        tableRows.push(cells)
        index += 1
      }

      if (tableRows.length >= 2) {
        const [headerRow, ...bodyRows] = tableRows
        const cleanedBody = bodyRows.filter((row) => !isTableSeparatorRow(row))
        if (headerRow.length && cleanedBody.length) {
          blocks.push({
            type: "table",
            headers: headerRow,
            rows: cleanedBody,
          })
          continue
        }
      }

      const flattened = tableRows.map((row) => row.join(" | ")).join(" ")
      if (flattened.trim()) {
        blocks.push({ type: "paragraph", text: flattened.trim() })
      }
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index].trim()
      if (!next) break
      if (isSpecialStart(next)) break
      paragraphLines.push(next)
      index += 1
    }

    const paragraph = paragraphLines.join("\n").trim()
    if (paragraph) {
      blocks.push({ type: "paragraph", text: paragraph })
    }
  }

  return blocks
}

function sectionExamples(blocks: LessonBlock[]): string[] {
  const examples: string[] = []

  for (const block of blocks) {
    if (block.type === "callout" && block.tone === "example") {
      examples.push(block.text)
      continue
    }

    if (block.type === "list") {
      for (const item of block.items) {
        if (/(exemple|example|for instance|par exemple|->|=>)/i.test(item) || item.length > 36) {
          examples.push(item)
        }
      }
      continue
    }

    if (block.type === "paragraph" && /(exemple|example|par exemple|for instance)/i.test(block.text)) {
      examples.push(block.text)
      continue
    }

    if (block.type === "table") {
      for (const row of block.rows.slice(0, 3)) {
        const rowSummary = row
          .map((cell, index) => `${block.headers[index] || `Col ${index + 1}`}: ${cell}`)
          .join(" | ")
        examples.push(rowSummary)
      }
    }
  }

  const deduped = Array.from(new Set(examples.map((value) => value.trim()).filter(Boolean)))
  return deduped.slice(0, 6)
}

export function parseLessonContent(sourceText: string, fallbackTitle: string): ParsedLessonContent {
  const cleanFallback = (fallbackTitle || "Lecon").trim() || "Lecon"
  const lines = normalizeLines(sourceText)

  const titleHeading = parseHeadingLine(lines[0] || "")
  const title = titleHeading || cleanFallback
  const contentLines = titleHeading ? lines.slice(1) : lines
  const nonEmptyLines = contentLines.filter((line) => !!line)

  if (!nonEmptyLines.length) {
    return {
      title,
      sections: [
        {
          id: "section-1",
          title: DEFAULT_SECTION_TITLE,
          blocks: [
            {
              type: "callout",
              tone: "note",
              label: "Note",
              text: "Le contenu de cette leçon n'est pas encore disponible en mode interactif.",
            },
          ],
          examples: [],
        },
      ],
    }
  }

  const rawSections = parseSections(nonEmptyLines)
  const sections: LessonSection[] = rawSections
    .map((section, index) => {
      const blocks = parseBlocks(section.lines)
      if (!blocks.length) return null

      return {
        id: slugify(section.title, index),
        title: section.title,
        blocks,
        examples: sectionExamples(blocks),
      }
    })
    .filter((section): section is LessonSection => !!section)

  if (!sections.length) {
    return {
      title,
      sections: [
        {
          id: "section-1",
          title: DEFAULT_SECTION_TITLE,
          blocks: [{ type: "paragraph", text: nonEmptyLines.join(" ") }],
          examples: [],
        },
      ],
    }
  }

  return { title, sections }
}

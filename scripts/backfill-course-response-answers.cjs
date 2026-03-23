#!/usr/bin/env node

const { cert, getApps, initializeApp } = require("firebase-admin/app")
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore")

const PAGE_SIZE = 500
const BATCH_SIZE = 400

function parseArgs(argv) {
  const args = new Set(argv)
  const help = args.has("--help") || args.has("-h")
  const apply = args.has("--apply")

  const limitArg = argv.find((arg) => arg.startsWith("--limit="))
  let limit = null

  if (limitArg) {
    const value = Number.parseInt(limitArg.slice("--limit=".length), 10)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Invalid --limit value. Use a positive integer, for example --limit=200")
    }
    limit = value
  }

  return { help, apply, limit }
}

function printHelp() {
  console.log("Backfill response_answers for course exercises")
  console.log("")
  console.log("Usage:")
  console.log("  node scripts/backfill-course-response-answers.cjs")
  console.log("  node scripts/backfill-course-response-answers.cjs --apply")
  console.log("  node scripts/backfill-course-response-answers.cjs --limit=200")
  console.log("")
  console.log("Options:")
  console.log("  --apply       Write changes to Firestore (default is dry-run)")
  console.log("  --limit=N     Stop after finding N candidate updates")
  console.log("  --help, -h    Show this help")
  console.log("")
  console.log("Auth:")
  console.log("  Uses FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY when set,")
  console.log("  otherwise falls back to Application Default Credentials.")
}

function initAdminApp() {
  if (getApps().length) return getApps()[0]

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    })
  }

  if (projectId) {
    return initializeApp({ projectId })
  }

  return initializeApp()
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function parseExistingAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) return {}

  const parsed = {}
  for (const [key, value] of Object.entries(rawAnswers)) {
    if (typeof key !== "string" || typeof value !== "string") continue
    const normalizedKey = key.trim()
    const normalizedValue = value.trim()
    if (!normalizedKey || !normalizedValue) continue
    parsed[normalizedKey] = normalizedValue
  }

  return parsed
}

function parseQuestionIds(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return []

  const ids = []

  for (const question of rawQuestions) {
    if (!question || typeof question !== "object") continue

    const rawQuestionType = typeof question.question_type === "string"
      ? question.question_type
      : typeof question.questionType === "string"
      ? question.questionType
      : ""

    if (rawQuestionType !== "single_choice" && rawQuestionType !== "short_answer") continue

    const id = typeof question.id === "string" && question.id.trim()
      ? question.id.trim()
      : `q${ids.length + 1}`

    ids.push(id)
  }

  return ids
}

function extractAnswerFromBlock(block) {
  const lines = String(block || "").split("\n")

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const normalizedLine = normalizeForMatch(line)
    if (!/^(reponse|answer)\s*:/.test(normalizedLine)) continue

    const separatorIndex = line.indexOf(":")
    const inlineAnswer = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : ""
    const remainder = lines.slice(index + 1).join("\n").trim()

    return [inlineAnswer, remainder].filter(Boolean).join("\n").trim()
  }

  return ""
}

function parseAnswersFromResponseText(responseText) {
  const normalizedText = String(responseText || "").replace(/\r\n/g, "\n").trim()
  if (!normalizedText) return []

  const blocks = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks
    .map((block) => extractAnswerFromBlock(block))
    .filter((answer) => !!answer)
}

function isCourseExercise(row) {
  const sourceKind = typeof row.source_kind === "string" ? row.source_kind.trim().toLowerCase() : ""
  const sourceDocumentId = typeof row.source_document_id === "string" ? row.source_document_id.trim() : ""
  const sourceTopic = typeof row.source_topic === "string" ? row.source_topic.trim() : ""
  return sourceKind === "course_document" || !!sourceDocumentId || !!sourceTopic
}

async function collectCandidateUpdates(db, limit) {
  const stats = {
    scanned: 0,
    skippedNotCourse: 0,
    skippedHasAnswers: 0,
    skippedNoResponseText: 0,
    skippedNoQuestions: 0,
    skippedUnparsed: 0,
    candidates: 0,
  }

  const updates = []
  let lastDocId = null
  let stop = false

  while (!stop) {
    let query = db
      .collection("personalized_exercises")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE)

    if (lastDocId) {
      query = query.startAfter(lastDocId)
    }

    const snapshot = await query.get()
    if (snapshot.empty) break

    for (const rowDoc of snapshot.docs) {
      stats.scanned += 1
      const row = rowDoc.data() || {}

      if (!isCourseExercise(row)) {
        stats.skippedNotCourse += 1
        continue
      }

      const existingAnswers = parseExistingAnswers(row.response_answers)
      if (Object.keys(existingAnswers).length > 0) {
        stats.skippedHasAnswers += 1
        continue
      }

      const responseText = typeof row.response_text === "string" ? row.response_text : ""
      if (!responseText.trim()) {
        stats.skippedNoResponseText += 1
        continue
      }

      const questionIds = parseQuestionIds(row.questions)
      if (!questionIds.length) {
        stats.skippedNoQuestions += 1
        continue
      }

      const parsedAnswers = parseAnswersFromResponseText(responseText)
      if (!parsedAnswers.length) {
        stats.skippedUnparsed += 1
        continue
      }

      const responseAnswers = {}
      for (let index = 0; index < questionIds.length; index += 1) {
        const answer = (parsedAnswers[index] || "").trim()
        if (!answer) continue
        responseAnswers[questionIds[index]] = answer
      }

      if (!Object.keys(responseAnswers).length) {
        stats.skippedUnparsed += 1
        continue
      }

      updates.push({ id: rowDoc.id, responseAnswers })
      stats.candidates += 1

      if (limit && updates.length >= limit) {
        stop = true
        break
      }
    }

    lastDocId = snapshot.docs[snapshot.docs.length - 1].id
  }

  return { stats, updates }
}

async function applyUpdates(db, updates) {
  let updated = 0

  for (let index = 0; index < updates.length; index += BATCH_SIZE) {
    const chunk = updates.slice(index, index + BATCH_SIZE)
    const batch = db.batch()

    for (const row of chunk) {
      const ref = db.collection("personalized_exercises").doc(row.id)
      batch.update(ref, {
        response_answers: row.responseAnswers,
        updated_at: FieldValue.serverTimestamp(),
      })
    }

    await batch.commit()
    updated += chunk.length
    console.log(`[apply] Updated ${updated}/${updates.length}`)
  }

  return updated
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  initAdminApp()
  const db = getFirestore()

  console.log(options.apply ? "Mode: APPLY" : "Mode: DRY RUN")
  if (options.limit) {
    console.log(`Candidate limit: ${options.limit}`)
  }

  const { stats, updates } = await collectCandidateUpdates(db, options.limit)

  console.log("")
  console.log("Scan summary:")
  console.log(`- scanned: ${stats.scanned}`)
  console.log(`- skipped_not_course: ${stats.skippedNotCourse}`)
  console.log(`- skipped_has_answers: ${stats.skippedHasAnswers}`)
  console.log(`- skipped_no_response_text: ${stats.skippedNoResponseText}`)
  console.log(`- skipped_no_questions: ${stats.skippedNoQuestions}`)
  console.log(`- skipped_unparsed: ${stats.skippedUnparsed}`)
  console.log(`- candidates: ${stats.candidates}`)

  if (!updates.length) {
    console.log("")
    console.log("No updates needed.")
    return
  }

  console.log("")
  console.log("Sample candidate IDs:")
  for (const row of updates.slice(0, 10)) {
    const answerCount = Object.keys(row.responseAnswers).length
    console.log(`- ${row.id} (${answerCount} answer(s))`)
  }

  if (!options.apply) {
    console.log("")
    console.log("Dry-run complete. Re-run with --apply to write updates.")
    return
  }

  console.log("")
  const updated = await applyUpdates(db, updates)
  console.log(`Done. Updated ${updated} document(s).`)
}

main().catch((error) => {
  console.error("Backfill failed:", error)
  process.exit(1)
})

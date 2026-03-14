/**
 * One-time migration script: Supabase → Firebase
 *
 * Prerequisites:
 *   - Set environment variables for both Supabase and Firebase Admin
 *   - Run with: npx tsx scripts/migrate-to-firestore.ts
 *
 * Environment variables needed:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { initializeApp, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const FIREBASE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const firebaseApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  storageBucket: FIREBASE_BUCKET,
})

const adminAuth = getAuth(firebaseApp)
const adminDb = getFirestore(firebaseApp)
const bucket = getStorage(firebaseApp).bucket()

const BATCH_SIZE = 400

async function fetchAll(table: string) {
  const all: any[] = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(offset, offset + pageSize - 1)
    if (error) {
      if (error.message.includes("Could not find")) {
        console.log(`  Table ${table} does not exist, skipping`)
        return all
      }
      throw new Error(`Error fetching ${table}: ${error.message}`)
    }
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  console.log(`  Fetched ${all.length} rows from ${table}`)
  return all
}

async function writeBatch(collectionName: string, docs: Array<{ id?: string; data: any }>) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = adminDb.batch()
    const chunk = docs.slice(i, i + BATCH_SIZE)
    for (const { id, data } of chunk) {
      const ref = id
        ? adminDb.collection(collectionName).doc(id)
        : adminDb.collection(collectionName).doc()
      batch.set(ref, data, { merge: true })
    }
    await batch.commit()
    console.log(`  Wrote ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length} to ${collectionName}`)
  }
}

async function migrateAuth() {
  console.log("\n=== Migrating Auth Users ===")

  const perPage = 200
  let page = 1
  let totalImported = 0

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!data?.users?.length) break

    for (const user of data.users) {
      try {
        await adminAuth.createUser({
          uid: user.id,
          email: user.email,
          emailVerified: !!user.email_confirmed_at,
          displayName: user.user_metadata?.full_name || user.email,
          disabled: false,
        })

        const role = user.user_metadata?.role || "student"
        await adminAuth.setCustomUserClaims(user.id, { role })

        totalImported++
      } catch (e: any) {
        if (e.code === "auth/uid-already-exists" || e.code === "auth/email-already-exists") {
          console.log(`  Skipping existing user: ${user.email}`)
          totalImported++
        } else {
          console.error(`  Failed to import user ${user.email}: ${e.message}`)
        }
      }
    }

    if (data.users.length < perPage) break
    page++
  }

  console.log(`  Imported ${totalImported} auth users`)
}

async function migrateTable(table: string, options?: {
  idField?: string
  compositeId?: (row: any) => string
  transform?: (row: any) => any
}) {
  console.log(`\n=== Migrating ${table} ===`)
  const rows = await fetchAll(table)

  const docs = rows.map((row) => {
    const data = options?.transform ? options.transform(row) : { ...row }

    // Remove the original id from the data if using it as doc id
    const docId = options?.compositeId
      ? options.compositeId(row)
      : options?.idField
      ? row[options.idField]
      : row.id

    if (options?.idField && data[options.idField] !== undefined) {
      // Keep all fields in the document
    }

    return { id: docId, data }
  })

  await writeBatch(table, docs)
  console.log(`  Done: ${docs.length} documents`)
}

async function migrateStorage() {
  console.log("\n=== Migrating Storage Files ===")

  const { data: documents } = await supabase.from("documents").select("id, file_path, owner_id")
  if (!documents?.length) {
    console.log("  No documents to migrate")
    return
  }

  let migrated = 0
  let skipped = 0

  for (const doc of documents) {
    if (!doc.file_path) {
      skipped++
      continue
    }

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(doc.file_path)

      if (downloadError || !fileData) {
        console.error(`  Failed to download: ${doc.file_path}: ${downloadError?.message}`)
        skipped++
        continue
      }

      const newPath = `documents/${doc.owner_id}/${doc.file_path.split("/").pop()}`
      const buffer = Buffer.from(await fileData.arrayBuffer())

      await bucket.file(newPath).save(buffer, {
        contentType: fileData.type || "application/octet-stream",
      })

      // Update the file_path in Firestore
      await adminDb.collection("documents").doc(doc.id).update({
        file_path: newPath,
      })

      migrated++
      if (migrated % 10 === 0) console.log(`  Migrated ${migrated} files...`)
    } catch (e: any) {
      console.error(`  Error migrating ${doc.file_path}: ${e.message}`)
      skipped++
    }
  }

  console.log(`  Done: ${migrated} files migrated, ${skipped} skipped`)
}

async function main() {
  console.log("Starting Supabase → Firebase migration\n")

  // 1. Auth users
  await migrateAuth()

  // 2. Tables in dependency order
  await migrateTable("skills", { idField: "id" })
  await migrateTable("profiles", { idField: "id" })
  await migrateTable("schools", { idField: "id" })

  await migrateTable("school_memberships", {
    compositeId: (row) => `${row.school_id}_${row.user_id}`,
  })

  await migrateTable("classes", { idField: "id" })
  await migrateTable("class_enrollments", { idField: "id" })
  await migrateTable("class_students", { idField: "id" })
  await migrateTable("assignments", { idField: "id" })
  await migrateTable("submissions", { idField: "id" })
  await migrateTable("documents", { idField: "id" })
  await migrateTable("document_shares", { idField: "id" })
  await migrateTable("personalized_exercises", { idField: "id" })
  await migrateTable("student_skill_scores", { idField: "id" })
  await migrateTable("activity_events", { idField: "id" })
  await migrateTable("badges", { idField: "id" })
  await migrateTable("user_badges", { idField: "id" })
  await migrateTable("user_xp_events", { idField: "id" })
  await migrateTable("teacher_feedback", { idField: "id" })
  await migrateTable("score_history", { idField: "id" })
  await migrateTable("practice_daily", { idField: "id" })
  await migrateTable("lessons", { idField: "id" })

  // 3. Storage files
  await migrateStorage()

  console.log("\n=== Migration complete ===")
}

main().catch((error) => {
  console.error("Migration failed:", error)
  process.exit(1)
})

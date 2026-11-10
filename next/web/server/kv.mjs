// Small JSON documents the API used to keep as files beside server.js (toilet_config.json,
// pinkbook_config.json, inert_config.json, submit_inert.json, toilet_submissions.json, students.json).
// Serverless functions have no lasting disk, so each document is now one row of kv_store.
//
//   await kvGet("toilet_config", { rooms: [], problems: [] })   // parsed value, or the default
//   await kvSet("toilet_config", value)
//
// Reads can be cached in memory for a short time (opts.cacheMs). That is only used for documents that
// are large and rarely change (the student list), so a search does not download ~1 MB every time.
import { openDb } from "./db.mjs"

const db = () => openDb("app")
const cache = new Map() // key -> { at, value }
let tableReady = null

function ensureTable() {
    if (!tableReady) {
        tableReady = db()
            .exec("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)")
            .catch((e) => { tableReady = null; throw e })
    }
    return tableReady
}

export async function kvGet(key, defaultValue = null, opts = {}) {
    const hit = cache.get(key)
    if (hit && opts.cacheMs && Date.now() - hit.at < opts.cacheMs) return structuredClone(hit.value)
    await ensureTable()
    const row = await db().prepare("SELECT value FROM kv_store WHERE key = ?").get(key)
    if (!row) return defaultValue
    let value
    try { value = JSON.parse(row.value) } catch { return defaultValue }
    if (opts.cacheMs) cache.set(key, { at: Date.now(), value: structuredClone(value) })
    return value
}

export async function kvSet(key, value) {
    await ensureTable()
    await db()
        .prepare("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .run(key, JSON.stringify(value), Date.now())
    cache.delete(key)
}

// Database access for the API (server/api.mjs).
//
// The API was written against better-sqlite3 (a local SQLite file, synchronous calls). On serverless
// hosting there is no disk that survives between requests, so the same SQL now runs on Turso (hosted
// libSQL, SQLite-compatible) through @libsql/client. This module keeps better-sqlite3's shape so the
// API code reads the same, with one difference: every call that touches the database returns a
// Promise and must be awaited.
//
//   const row  = await db.prepare("SELECT * FROM t WHERE id = ?").get(id)    // row object | undefined
//   const rows = await db.prepare("SELECT * FROM t").all()                   // row objects
//   const info = await db.prepare("UPDATE t SET x = ?").run(x)               // { changes, lastInsertRowid }
//   await db.exec("CREATE TABLE ...; CREATE INDEX ...")
//   await db.transaction(async (a) => { ...awaited db calls... })(a)       // all-or-nothing
//
// Inside a transaction callback, calls on any handle of the same database run inside that
// transaction (tracked with AsyncLocalStorage), the way better-sqlite3 behaves on one connection.
//
// Where the data lives:
//   TURSO_DATABASE_URL + TURSO_AUTH_TOKEN  production: one Turso database holding every table
//                                           (building, photos, pinkbook and the app's JSON state).
//   DATABASE_URL_<NAME>                     optional per-handle override (e.g. DATABASE_URL_PHOTOS).
//   neither set                             local development: file:<NEXT9_DATA_DIR>/next9.db, the
//                                           same single-database layout as production
//                                           (NEXT9_DATA_DIR defaults to ../data-dev, see README).
import path from "node:path"
import fs from "node:fs"
import { AsyncLocalStorage } from "node:async_hooks"
import { createClient } from "@libsql/client"

const txStore = new AsyncLocalStorage()
const clients = new Map()

function localDataDir() {
    // Local development only (turbopackIgnore: keeps the build from tracing the whole project).
    const dir = process.env.NEXT9_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "data-dev")
    return path.resolve(/*turbopackIgnore: true*/ dir)
}

function urlFor(name) {
    const own = process.env[`DATABASE_URL_${name.toUpperCase()}`]
    if (own) return { url: own, authToken: process.env[`DATABASE_TOKEN_${name.toUpperCase()}`] || process.env.TURSO_AUTH_TOKEN }
    if (process.env.TURSO_DATABASE_URL) return { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    const dir = localDataDir()
    fs.mkdirSync(dir, { recursive: true })
    return { url: "file:" + path.join(dir, "next9.db") }
}

function clientFor(name) {
    const { url, authToken } = urlFor(name)
    // Handles that resolve to the same URL share one client (production: all of them).
    let c = clients.get(url)
    if (!c) {
        c = createClient({ url, authToken, intMode: "number" })
        clients.set(url, c)
    }
    return c
}

function normalizeArgs(args) {
    // better-sqlite3 accepts .run(a, b), .run([a, b]) and mixes of both.
    const flat = []
    for (const a of args) {
        if (Array.isArray(a)) flat.push(...a)
        else flat.push(a)
    }
    return flat.map((v) => {
        if (v === undefined) return null
        if (typeof v === "boolean") return v ? 1 : 0
        if (typeof v === "bigint") return Number(v)
        return v
    })
}

function toRow(columns, row) {
    const o = {}
    for (let i = 0; i < columns.length; i++) {
        let v = row[i]
        if (v instanceof ArrayBuffer) v = Buffer.from(v)
        o[columns[i]] = v
    }
    return o
}

class Statement {
    constructor(db, sql) {
        this.db = db
        this.sql = sql
    }
    async _exec(args) {
        return this.db._executor().execute({ sql: this.sql, args: normalizeArgs(args) })
    }
    async get(...args) {
        const r = await this._exec(args)
        return r.rows.length ? toRow(r.columns, r.rows[0]) : undefined
    }
    async all(...args) {
        const r = await this._exec(args)
        return r.rows.map((row) => toRow(r.columns, row))
    }
    async run(...args) {
        const r = await this._exec(args)
        return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? 0 : Number(r.lastInsertRowid) }
    }
}

class Database {
    constructor(name) {
        this.name = name
        this.client = clientFor(name)
    }
    _executor() {
        const tx = txStore.getStore()
        return tx && tx.client === this.client ? tx.tx : this.client
    }
    prepare(sql) {
        return new Statement(this, sql)
    }
    async exec(sql) {
        return this._executor().executeMultiple(sql)
    }
    async pragma(sql) {
        const r = await this._executor().execute("PRAGMA " + sql)
        return r.rows.map((row) => toRow(r.columns, row))
    }
    // Same calling convention as better-sqlite3: transaction(fn) returns a function that runs fn
    // inside BEGIN/COMMIT (ROLLBACK if it throws). Nested calls join the outer transaction.
    transaction(fn) {
        const self = this
        return async function (...args) {
            const current = txStore.getStore()
            if (current && current.client === self.client) return fn.apply(this, args)
            const tx = await self.client.transaction("write")
            try {
                const result = await txStore.run({ client: self.client, tx }, () => fn.apply(this, args))
                await tx.commit()
                return result
            } catch (e) {
                try { await tx.rollback() } catch {}
                throw e
            } finally {
                tx.close()
            }
        }
    }
    close() {}
}

const handles = new Map()
// One handle per logical database name ("photos", "building", "pinkbook", "app").
/** @param {string} name @returns {Database} */
export function openDb(name) {
    let h = handles.get(name)
    if (!h) {
        h = new Database(name)
        handles.set(name, h)
    }
    return h
}

export default openDb

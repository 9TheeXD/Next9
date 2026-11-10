// Database access (Turso / libSQL; was better-sqlite3 on a local file).
//
// Serverless hosting keeps no disk between requests, so the database is a hosted SQLite (Turso).
// This module keeps better-sqlite3's shape, except that every call that touches the database returns
// a Promise and must be awaited:
//   const row  = await db.prepare('SELECT ...').get(a, b);
//   const rows = await db.prepare('SELECT ...').all();
//   const info = await db.prepare('UPDATE ...').run(x);      // { changes, lastInsertRowid }
//   await db.transaction(async () => { ... })();             // all-or-nothing; inner calls join it
//
// TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in production. Without them (local development) the database
// is the file data/assess.db, as before.
//
// Times: the VPS ran in Asia/Bangkok and stored datetime('now', '+7 hours'). Turso runs in UTC, so
// the schema below uses datetime('now', '+7 hours') to keep the same Thai wall-clock values.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { createClient } = require('@libsql/client');

const SALT = 'sdh_council_assess_2024_salt_v1';

function hashPassword(password) {
  return crypto.createHash('sha256').update(SALT + password).digest('hex');
}

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS whitelist (
      prefix TEXT PRIMARY KEY,
      role TEXT DEFAULT 'teacher',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK(grade >= 1 AND grade <= 6),
      room INTEGER NOT NULL,
      zone TEXT NOT NULL,
      criterion INTEGER NOT NULL CHECK(criterion >= 1 AND criterion <= 5),
      score INTEGER NOT NULL DEFAULT 0 CHECK(score >= 0 AND score <= 5),
      date TEXT NOT NULL,
      evaluator_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(grade, room, zone, criterion, date, evaluator_id)
    );

    CREATE INDEX IF NOT EXISTS idx_evaluations_date ON evaluations(date);
    CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON evaluations(grade);
    CREATE INDEX IF NOT EXISTS idx_evaluations_lookup ON evaluations(grade, zone, date);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(action, user_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_logs_date ON system_logs(date);
    CREATE INDEX IF NOT EXISTS idx_logs_action ON system_logs(action);

    -- Every admin change to evaluations (edit / delete). detail keeps the removed or previous scores.
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      restored_at TEXT
    );

    -- School terms (see lib/terms.js). semester 1-3, year in Buddhist Era.
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester INTEGER NOT NULL,
      year INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      show_on_home INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(semester, year)
    );

    -- Admin accounts for the username/password form on /admin (see lib/adminAccounts.js), next to
    -- the one in .env.
    CREATE TABLE IF NOT EXISTS admin_accounts (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      last_login TEXT
    );

    -- Who gets which role at Google sign-in when the email is not in the whitelist (see lib/roles.js).
    -- Checked in position order; the first match wins.
    CREATE TABLE IF NOT EXISTS email_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_kind TEXT NOT NULL,
      local_value TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    -- data_version goes up on every change to evaluations or whitelist. lib/resultCache.js compares it
    -- (one row read) instead of scanning the evaluations, which Turso bills per row read.
    INSERT OR IGNORE INTO settings (key, value) VALUES ('data_version', '0');
    CREATE TRIGGER IF NOT EXISTS trg_dv_eval_ins AFTER INSERT ON evaluations BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
    CREATE TRIGGER IF NOT EXISTS trg_dv_eval_upd AFTER UPDATE ON evaluations BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
    CREATE TRIGGER IF NOT EXISTS trg_dv_eval_del AFTER DELETE ON evaluations BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
    CREATE TRIGGER IF NOT EXISTS trg_dv_wl_ins AFTER INSERT ON whitelist BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
    CREATE TRIGGER IF NOT EXISTS trg_dv_wl_upd AFTER UPDATE ON whitelist BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
    CREATE TRIGGER IF NOT EXISTS trg_dv_wl_del AFTER DELETE ON whitelist BEGIN UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'; END;
`;

const txStore = new AsyncLocalStorage();

function normalizeArgs(args) {
  const flat = [];
  for (const a of args) {
    if (Array.isArray(a)) flat.push(...a);
    else flat.push(a);
  }
  if (flat.length === 1 && flat[0] && typeof flat[0] === 'object' && !Buffer.isBuffer(flat[0]) && !(flat[0] instanceof Date)) {
    // Named parameters (@name / :name / $name): libSQL takes an object keyed by name.
    const named = {};
    for (const [k, v] of Object.entries(flat[0])) named[k] = v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
    return named;
  }
  return flat.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v));
}

function toRow(columns, row) {
  const o = {};
  for (let i = 0; i < columns.length; i++) {
    let v = row[i];
    if (v instanceof ArrayBuffer) v = Buffer.from(v);
    o[columns[i]] = v;
  }
  return o;
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }
  async _exec(args) {
    const ex = await this.db._executor();
    return ex.execute({ sql: this.sql, args: normalizeArgs(args) });
  }
  async get(...args) {
    const r = await this._exec(args);
    return r.rows.length ? toRow(r.columns, r.rows[0]) : undefined;
  }
  async all(...args) {
    const r = await this._exec(args);
    return r.rows.map((row) => toRow(r.columns, row));
  }
  async run(...args) {
    const r = await this._exec(args);
    return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? 0 : Number(r.lastInsertRowid) };
  }
}

class Database {
  constructor(client) {
    this.client = client;
    this.ready = null;
  }
  // Schema and seed rows, once per instance before the first query.
  _init() {
    if (!this.ready) {
      this.ready = initSchema(this.client).catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async _executor() {
    const tx = txStore.getStore();
    if (tx) return tx;
    await this._init();
    return this.client;
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  async exec(sql) {
    const ex = await this._executor();
    return ex.executeMultiple(sql);
  }
  transaction(fn) {
    const self = this;
    return async function (...args) {
      if (txStore.getStore()) return fn.apply(this, args);
      await self._init();
      const tx = await self.client.transaction('write');
      try {
        const result = await txStore.run(tx, () => fn.apply(this, args));
        await tx.commit();
        return result;
      } catch (e) {
        try { await tx.rollback(); } catch {}
        throw e;
      } finally {
        tx.close();
      }
    };
  }
  close() {}
}

async function initSchema(client) {
  const q = async (sql, args = []) => (await client.execute({ sql, args })).rows;
  // A stored version skips the whole setup after the first run (one cheap query per cold start).
  await client.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime(\'now\')))');
  const v = await q("SELECT value FROM settings WHERE key = 'schema_version'");
  if (v.length && Number(v[0].value) >= 2) return;
  await client.executeMultiple(SCHEMA_SQL);
  // Admins used to be stored by full email; everyone is stored by the part before @ now.
  for (const r of await q("SELECT prefix, role FROM whitelist WHERE prefix LIKE '%@sirin.ac.th'")) {
    await q('INSERT INTO whitelist (prefix, role) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET role = excluded.role', [String(r.prefix).replace(/@.*$/, ''), r.role]);
    await q('DELETE FROM whitelist WHERE prefix = ?', [r.prefix]);
  }
  // The two terms that used to be written in lib/terms.js. Ids 1 and 2 are kept: /v1 asks for them.
  if (!(await q('SELECT 1 FROM terms LIMIT 1')).length) {
    await q('INSERT INTO terms (id, semester, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)', [1, 1, 2569, '2026-05-16', '2026-10-10']);
    await q('INSERT INTO terms (id, semester, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)', [2, 2, 2569, '2026-10-26', '2027-03-31']);
  }
  // The rule sign-in always used: numeric email names are students, everyone else is a teacher.
  if (!(await q('SELECT 1 FROM email_rules LIMIT 1')).length && !(await q("SELECT 1 FROM settings WHERE key = 'email_rules_seeded'")).length) {
    await q('INSERT INTO email_rules (local_kind, domain, role, position) VALUES (?, ?, ?, ?)', ['digits', '', 'student', 1]);
    await q('INSERT INTO email_rules (local_kind, domain, role, position) VALUES (?, ?, ?, ?)', ['letters', '', 'teacher', 2]);
    await q("INSERT OR REPLACE INTO settings (key, value) VALUES ('email_rules_seeded', '1')");
  }
  // Databases made before restored_at existed.
  if (!(await q('PRAGMA table_info(admin_audit)')).some((c) => c.name === 'restored_at')) {
    await q('ALTER TABLE admin_audit ADD COLUMN restored_at TEXT');
  }
  // Seed default user if not exists
  if (!(await q('SELECT id FROM users WHERE student_id = ?', ['00000'])).length) {
    await q('INSERT INTO users (student_id, password_hash) VALUES (?, ?)', ['00000', hashPassword('sirin2026')]);
  }
  await q("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '2')");
}

let dbInstance = null;

/** @returns {Database} */
function getDb() {
  if (dbInstance) return dbInstance;
  let url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    url = 'file:' + path.join(dir, 'assess.db');
  }
  dbInstance = new Database(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' }));
  return dbInstance;
}

module.exports = { getDb, hashPassword, SCHEMA_SQL };

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(process.cwd(), 'data', 'assess.db');
const SALT = 'sdh_council_assess_2024_salt_v1';

let dbInstance = null;

function hashPassword(password) {
  return crypto.createHash('sha256').update(SALT + password).digest('hex');
}

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
      timestamp TEXT DEFAULT (datetime('now', 'localtime')),
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(semester, year)
    );

    -- Admin accounts for the username/password form on /admin (see lib/adminAccounts.js), next to
    -- the one in .env.
    CREATE TABLE IF NOT EXISTS admin_accounts (
      username TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
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
  `);
  // Admins used to be stored by full email; everyone is stored by the part before @ now.
  db.transaction(() => {
    const rows = db.prepare("SELECT prefix, role FROM whitelist WHERE prefix LIKE '%@sirin.ac.th'").all();
    for (const r of rows) {
      // The email entry was the one an admin added by hand, so its role wins over an existing name entry.
      db.prepare('INSERT INTO whitelist (prefix, role) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET role = excluded.role').run(r.prefix.replace(/@.*$/, ''), r.role);
      db.prepare('DELETE FROM whitelist WHERE prefix = ?').run(r.prefix);
    }
  })();
  // The two terms that used to be written in lib/terms.js. Ids 1 and 2 are kept: /v1 asks for them.
  if (!db.prepare('SELECT 1 FROM terms LIMIT 1').get()) {
    const add = db.prepare('INSERT INTO terms (id, semester, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)');
    add.run(1, 1, 2569, '2026-05-16', '2026-10-10');
    add.run(2, 2, 2569, '2026-10-26', '2027-03-31');
  }
  // The rule sign-in always used: numeric email names are students, everyone else is a teacher.
  if (!db.prepare('SELECT 1 FROM email_rules LIMIT 1').get() && !db.prepare("SELECT 1 FROM settings WHERE key = 'email_rules_seeded'").get()) {
    const add = db.prepare('INSERT INTO email_rules (local_kind, domain, role, position) VALUES (?, ?, ?, ?)');
    add.run('digits', '', 'student', 1);
    add.run('letters', '', 'teacher', 2);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('email_rules_seeded', '1')").run();
  }
  // Databases made before restored_at existed.
  if (!db.prepare('PRAGMA table_info(admin_audit)').all().some((c) => c.name === 'restored_at')) {
    db.exec('ALTER TABLE admin_audit ADD COLUMN restored_at TEXT');
  }

  // Seed default user if not exists
  const existingUser = db.prepare('SELECT id FROM users WHERE student_id = ?').get('00000');
  if (!existingUser) {
    const passwordHash = hashPassword('sirin2026');
    db.prepare('INSERT INTO users (student_id, password_hash) VALUES (?, ?)').run('00000', passwordHash);
  }

  dbInstance = db;
  
  // Initialize auto-backup (cron)
  try {
    const { initAutoBackup } = require('./backup');
    initAutoBackup();
  } catch (err) {
    console.error('Failed to initialize auto backup:', err);
  }

  return db;
}

module.exports = { getDb, hashPassword };

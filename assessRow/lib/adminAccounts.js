// Admin accounts for the username/password form on /admin. The account in .env (ADMIN_USERNAME /
// ADMIN_PASSWORD) always works too, so nobody is locked out by a mistake here.
const crypto = require('crypto');

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(String(password), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function listAccounts(db) {
  return db.prepare('SELECT username, display_name, created_at, last_login FROM admin_accounts ORDER BY username').all();
}

// Returns an error message, or null when the password may be used.
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว';
  if (password.length > 128) return 'รหัสผ่านยาวเกินไป';
  return null;
}

// Several wrong passwords in a row lock that username for a while.
const failures = new Map(); // username -> { count, until }
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
function isLockedOut(username) {
  const f = failures.get(username);
  return !!f && f.until > Date.now();
}
function noteFailure(username) {
  const f = failures.get(username) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) {
    f.until = Date.now() + LOCK_MS;
    f.count = 0;
  }
  failures.set(username, f);
}

// Checks a username/password against the accounts table. Returns the account or null.
function verifyAccount(db, username, password) {
  const row = db.prepare('SELECT username, display_name, password_hash FROM admin_accounts WHERE username = ?').get(username);
  if (!row || !checkPassword(password, row.password_hash)) return null;
  db.prepare("UPDATE admin_accounts SET last_login = datetime('now', 'localtime') WHERE username = ?").run(username);
  return { username: row.username, displayName: row.display_name };
}

module.exports = { USERNAME_RE, hashPassword, checkPassword, listAccounts, passwordProblem, isLockedOut, noteFailure, verifyAccount };

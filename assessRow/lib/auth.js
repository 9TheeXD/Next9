const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, hashPassword } = require('./db');

function verifyPassword(password, hash) {
  const computed = hashPassword(password);
  // Timing-safe comparison
  if (computed.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

async function createSession(userId) {
  const db = getDb();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
  return { sessionId, expiresAt };
}

async function validateSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const db = getDb();
  const session = await db.prepare(
    'SELECT s.id, s.user_id, s.expires_at, u.student_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ?'
  ).get(sessionId);

  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return { userId: session.user_id, studentId: session.student_id };
}

async function deleteSession(sessionId) {
  if (!sessionId) return;
  const db = getDb();
  await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

async function deleteAllUserSessions(userId) {
  const db = getDb();
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// TODO(security): Consider using OAuth providers for authentication
// TODO(security): Consider implementing MFA for stronger authentication
// TODO(security): Consider leaked password detection

function getSecret() {
  if (process.env.JWT_SECRET_KEY) {
    return process.env.JWT_SECRET_KEY;
  }
  const secretPath = path.join(process.cwd(), 'jwt_secret.txt');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }
  console.warn('WARNING: Generating ephemeral secret. Instance-isolated! Not suitable for multi-instance deployment.');
  const ephemeral = crypto.randomBytes(32).toString('hex');
  return ephemeral;
}

const SESSION_COOKIE_NAME = '__Secure-session';

module.exports = {
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  deleteAllUserSessions,
  getSecret,
  SESSION_COOKIE_NAME,
};

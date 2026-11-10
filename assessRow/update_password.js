const { getDb, hashPassword } = require('./lib/db.js');

const db = getDb();
const newHash = hashPassword('sirin2026');

db.prepare('UPDATE users SET password_hash = ? WHERE student_id = ?').run(newHash, '00000');
console.log('Password updated successfully.');

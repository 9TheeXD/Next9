const { getDb } = require('./db');

function getBangkokDateString() {
  const d = new Date();
  const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD
  return formatter.format(d);
}

function logAction(userId, role, action) {
  try {
    if (!userId || !role || !action) return;
    
    // Convert logic specific roles
    let displayRole = role;
    if (role === 'council') displayRole = 'สภานักเรียน';
    if (role === 'teacher') displayRole = 'ครู';
    if (role === 'admin') displayRole = 'แอดมิน';
    if (role === 'student') displayRole = 'นักเรียน';

    const db = getDb();
    const date = getBangkokDateString();
    
    // Insert or ignore if it already exists today for this action
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO system_logs (action, user_id, role, date) 
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(action, userId, displayRole, date);
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}

module.exports = { logAction };

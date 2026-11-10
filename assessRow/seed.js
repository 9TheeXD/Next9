const Database = require('better-sqlite3');
const path = require('path');
const db = new Database('/app/data/assess.db');

const grades = {
  1: 14,
  2: 14,
  3: 14,
  4: 16,
  5: 16,
  6: 16
};

// Target date: Today
const endDate = new Date('2026-05-29T12:00:00Z');
// Start date: 30 months ago
const startDate = new Date(endDate);
startDate.setMonth(startDate.getMonth() - 30);

const insert = db.prepare(`
  INSERT INTO evaluations (grade, room, zone, criterion, score, date, evaluator_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function randScore() {
  const roll = Math.random();
  if (roll < 0.05) return 1;
  if (roll < 0.15) return 2;
  if (roll < 0.4) return 3;
  if (roll < 0.7) return 4;
  return 5;
}

function formatDate(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

console.log('Clearing old data...');
db.exec('DELETE FROM evaluations');

console.log('Starting seed...');
db.exec('BEGIN TRANSACTION');

let currentDate = new Date(startDate);
let count = 0;

while (currentDate <= endDate) {
  const day = currentDate.getUTCDay();
  if (day >= 1 && day <= 5) { // Mon-Fri
    const dateStr = formatDate(currentDate);
    const createdAt = `${dateStr} 01:00:00`;
    
    for (let grade = 1; grade <= 6; grade++) {
      // 1. Overall (room = 0)
      const evalsOverall = ['teacher1', '10001', '10002'];
      for (const ev of evalsOverall) {
        for (let c = 1; c <= 5; c++) {
          insert.run(grade, 0, 'all', c, randScore(), dateStr, ev, createdAt);
          count++;
        }
      }
      
      // 2. Individual rooms
      const roomsCount = grades[grade];
      for (let room = 1; room <= roomsCount; room++) {
        const evalsRoom = ['teacher_r', '20001', '20002'];
        for (const ev of evalsRoom) {
          for (let c = 1; c <= 5; c++) {
            insert.run(grade, room, 'all', c, randScore(), dateStr, ev, createdAt);
            count++;
          }
        }
      }
    }
  }
  currentDate.setUTCDate(currentDate.getUTCDate() + 1);
}

db.exec('COMMIT');
console.log(`Successfully seeded ${count} records.`);

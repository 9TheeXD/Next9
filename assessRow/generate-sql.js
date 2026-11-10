const fs = require('fs');

const GRADE_CONFIG = {
  1: { totalRooms: 14 },
  2: { totalRooms: 14 },
  3: { totalRooms: 14 },
  4: { totalRooms: 16 },
  5: { totalRooms: 16 },
  6: { totalRooms: 16 },
};

const CRITERIA = [1, 2, 3, 4, 5];
// Realistic score distribution: mostly 4 and 5, some 3, very few 0
const SCORES = [0, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5];

let sql = "DELETE FROM evaluations;\n";

const endDate = new Date('2026-05-27');
const startDate = new Date('2026-05-27');
startDate.setMonth(endDate.getMonth() - 3);

let currentDate = new Date(startDate);
let count = 0;

sql += "BEGIN TRANSACTION;\n";

while (currentDate <= endDate) {
  const day = currentDate.getDay();
  if (day >= 1 && day <= 5) { // Monday = 1 to Friday = 5
    const dateStr = currentDate.toISOString().split('T')[0];
    
    for (let grade = 1; grade <= 6; grade++) {
      const totalRooms = GRADE_CONFIG[grade].totalRooms;
      for (let room = 1; room <= totalRooms; room++) {
        for (const criterion of CRITERIA) {
          const score = SCORES[Math.floor(Math.random() * SCORES.length)];
          sql += `INSERT INTO evaluations (grade, room, zone, criterion, score, date) VALUES (${grade}, ${room}, 'pool', ${criterion}, ${score}, '${dateStr}');\n`;
          count++;
        }
      }
    }
  }
  currentDate.setDate(currentDate.getDate() + 1);
}

sql += "COMMIT;\n";

fs.writeFileSync('seed.sql', sql);
console.log(`Generated SQL for ${count} rows.`);

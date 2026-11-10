const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'assess.db');
const db = new Database(DB_PATH);

console.log('Deleting zone = "building1" data...');
const info = db.prepare("DELETE FROM evaluations WHERE zone = 'building1'").run();
console.log(`Deleted ${info.changes} rows.`);

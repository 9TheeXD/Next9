import Database from 'better-sqlite3';

const query = process.argv[2];
if (!query) {
  console.error("Usage: node query_db.js 'SELECT * FROM building_inspections LIMIT 5'");
  process.exit(1);
}

try {
  const db = new Database('./data/building.db');
  
  if (query.trim().toUpperCase().startsWith('SELECT')) {
    const results = db.prepare(query).all();
    console.log(JSON.stringify(results, null, 2));
  } else {
    const info = db.prepare(query).run();
    console.log('Result:', info);
  }
  
  db.close();
} catch (error) {
  console.error('Database Error:', error.message);
  process.exit(1);
}

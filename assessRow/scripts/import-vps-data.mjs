// Copies the VPS database (data/assess.db) into a database with the serverless schema.
//
//   node scripts/import-vps-data.mjs [--from data/assess.db] [--out ./assess-turso.db]
//   turso db create assess --from-file ./assess-turso.db
// or straight to an existing Turso database:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/import-vps-data.mjs --turso
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';

const require = createRequire(import.meta.url);
const { SCHEMA_SQL } = require('../lib/db.js');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const FROM = path.resolve(opt('--from', 'data/assess.db'));
const OUT = path.resolve(opt('--out', 'assess-turso.db'));

if (!fs.existsSync(FROM)) throw new Error(`${FROM} not found`);
const dest = args.includes('--turso')
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: 'file:' + OUT });
const src = createClient({ url: 'file:' + FROM });

await dest.executeMultiple(SCHEMA_SQL);
try { await dest.execute('ALTER TABLE admin_audit ADD COLUMN restored_at TEXT'); } catch {}
const tables = (await src.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
for (const t of tables) {
  const destCols = new Set((await dest.execute(`PRAGMA table_info("${t}")`)).rows.map((r) => r.name));
  if (!destCols.size) { console.warn(`skip ${t} (not in the schema)`); continue; }
  let offset = 0;
  for (;;) {
    const page = await src.execute(`SELECT * FROM "${t}" LIMIT 1000 OFFSET ${offset}`);
    if (!page.rows.length) break;
    const cols = page.columns.filter((c) => destCols.has(c));
    const sql = `INSERT OR REPLACE INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    await dest.batch(page.rows.map((row) => ({ sql, args: cols.map((c) => row[c] ?? null) })), 'write');
    offset += page.rows.length;
  }
  console.log(`${t}: ${offset} rows`);
}
// Seed rows, triggers and the version marker, so the app skips its first-run setup.
await dest.executeMultiple(SCHEMA_SQL);
await dest.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '2')");
console.log(args.includes('--turso') ? 'done (Turso)' : `done: ${OUT}`);

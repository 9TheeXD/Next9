// In-memory cache for the evaluation summaries. A stored answer is reused only while a fingerprint of
// the evaluations (and of the whitelist, which decides council vs teacher weighting) is unchanged, so a
// new or edited score is picked up on the very next request.
const MAX_ENTRIES = 300;
const entries = new Map();

// data_version (lib/db.js) changes with every evaluation or whitelist change: one row read instead of a
// scan of the date range. The range is part of the cache key already.
async function fingerprint(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'data_version'").get();
  if (!row) throw new Error('no data_version');
  return String(row.value);
}

// Returns the JSON text for `key`, computing it with `compute()` (which returns a plain object) when
// nothing valid is stored.
async function cachedJson(db, key, startDate, endDate, compute) {
  let fp = null;
  try {
    fp = await fingerprint(db);
    const hit = entries.get(key);
    if (hit && hit.fp === fp) {
      entries.delete(key);
      entries.set(key, hit);
      return hit.json;
    }
  } catch {
    fp = null;
  }
  const json = JSON.stringify(await compute());
  if (fp) {
    entries.set(key, { fp, json });
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  }
  return json;
}

module.exports = { cachedJson };

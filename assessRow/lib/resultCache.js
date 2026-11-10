// In-memory cache for the evaluation summaries. A stored answer is reused only while a fingerprint of
// the evaluations in its date range (and of the whitelist, which decides council vs teacher
// weighting) is unchanged, so a new or edited score is picked up on the very next request. Taking the
// fingerprint scans the range once without grouping or joins, a fraction of what the summaries cost.
const MAX_ENTRIES = 300;
const entries = new Map();

function fingerprint(db, startDate, endDate) {
  const e = db
    .prepare('SELECT COUNT(*) AS n, TOTAL(score) AS s, TOTAL(id * score) AS w, MAX(id) AS m FROM evaluations WHERE date >= ? AND date <= ?')
    .get(startDate || '0000-00-00', endDate || '9999-12-31');
  const w = db.prepare("SELECT COUNT(*) AS n, GROUP_CONCAT(prefix || ':' || IFNULL(role, ''), ',') AS g FROM (SELECT prefix, role FROM whitelist ORDER BY prefix)").get();
  return [e.n, e.s, e.w, e.m, w.n, w.g].join('|');
}

// Returns the JSON text for `key`, computing it with `compute()` (which returns a plain object) when
// nothing valid is stored.
function cachedJson(db, key, startDate, endDate, compute) {
  let fp = null;
  try {
    fp = fingerprint(db, startDate, endDate);
    const hit = entries.get(key);
    if (hit && hit.fp === fp) {
      entries.delete(key);
      entries.set(key, hit);
      return hit.json;
    }
  } catch {
    fp = null;
  }
  const json = JSON.stringify(compute());
  if (fp) {
    entries.set(key, { fp, json });
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  }
  return json;
}

module.exports = { cachedJson };

// Decides the role of a Google account at sign-in (and again on every session check, so a change on
// /admin applies without signing out). Only @sirin.ac.th accounts are considered at all; Google
// sign-in is limited to the school's Workspace and the domain cannot be changed.
//
// 1. The whitelist, by the part before @ (`39814`, `somchai.s`), with the role teacher, council or
//    admin. A name entry is ignored for an email that a rule denies.
// 2. The email rules (table email_rules), in position order; the first one that matches wins.
// 3. No match: the account may not sign in.
const SCHOOL_DOMAIN = 'sirin.ac.th';
const ROLES = ['admin', 'teacher', 'council', 'student'];
const RULE_ROLES = ['teacher', 'council', 'student', 'deny'];
const LOCAL_KINDS = ['digits', 'letters', 'any', 'starts', 'contains'];

const ROLE_LABELS = { admin: 'แอดมิน', teacher: 'ครู', council: 'สภานักเรียน', student: 'นักเรียน', deny: 'ห้ามเข้าใช้' };

function splitEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return null;
  return { email: e, local: e.slice(0, at), domain: e.slice(at + 1) };
}

function ruleMatches(rule, local) {
  const v = (rule.local_value || '').toLowerCase();
  switch (rule.local_kind) {
    case 'digits':
      return /^\d+$/.test(local);
    case 'letters':
      return !/^\d+$/.test(local);
    case 'any':
      return true;
    case 'starts':
      return !!v && local.startsWith(v);
    case 'contains':
      return !!v && local.includes(v);
    default:
      return false;
  }
}

function getRules(db) {
  return db.prepare('SELECT id, local_kind, local_value, domain, role, position FROM email_rules ORDER BY position, id').all();
}

// Returns { role, prefix } or null when the account may not sign in. `prefix` (the part before @) is
// what evaluations are stored under.
function resolveRole(db, email) {
  const parts = splitEmail(email);
  if (!parts) return null;
  const { local, domain } = parts;
  if (domain !== SCHOOL_DOMAIN) return null;
  // The first rule that matches this email, if any.
  const rule = getRules(db).find((r) => ruleMatches(r, local));
  // A rule set to ห้ามเข้าใช้ wins over a whitelisted name.
  const byName = db.prepare('SELECT role FROM whitelist WHERE prefix = ?').get(local);
  if (byName && ROLES.includes(byName.role) && rule?.role !== 'deny') return { role: byName.role, prefix: local, source: 'whitelist' };
  if (rule && rule.role !== 'deny') return { role: rule.role, prefix: local, source: 'rule' };
  return null;
}

module.exports = { SCHOOL_DOMAIN, ROLES, RULE_ROLES, LOCAL_KINDS, ROLE_LABELS, splitEmail, ruleMatches, getRules, resolveRole };

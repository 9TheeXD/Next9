const crypto = require('crypto');

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function validateCsrfToken(token, storedToken) {
  if (!token || !storedToken) return false;
  if (typeof token !== 'string' || typeof storedToken !== 'string') return false;
  if (token.length !== storedToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(storedToken));
}

const CSRF_COOKIE_NAME = '__Secure-csrf';

module.exports = { generateCsrfToken, validateCsrfToken, CSRF_COOKIE_NAME };

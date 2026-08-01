/**
 * src/example/login.js
 * Real implementation for FEAT-001 (see EXAMPLE_WALKTHROUGH.md and
 * tests/unit/example/login.test.js). Written by 04-implementation against
 * the already-RED test file — this file did not exist when the tests were
 * written, satisfying the RED-before-GREEN rule.
 *
 * In-memory "user store" stands in for a real database — swap
 * findUserByEmail/verifyPassword for real persistence + hashing (e.g.
 * bcrypt/argon2) in a production system. Passwords are stored hashed here
 * even in this toy version specifically so this file can't be mistaken for
 * something to copy into production as-is.
 */
const crypto = require('crypto');

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Seed user matches the test fixtures in login.test.js.
const USERS = new Map([
  ['user@example.com', { hashedPassword: hashPassword('correct-horse-battery-staple') }],
]);

function findUserByEmail(email) {
  return USERS.get(email) || null;
}

function issueSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new AuthError('Invalid email or password');
  }
  const user = findUserByEmail(email);
  if (!user || user.hashedPassword !== hashPassword(password)) {
    throw new AuthError('Invalid email or password');
  }
  return { sessionToken: issueSessionToken() };
}

module.exports = { login, AuthError };

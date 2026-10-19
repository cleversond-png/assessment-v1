const crypto = require('crypto');

const DEFAULT_USERNAME = 'Admin.Assessment';
const COOKIE_NAME = 'bb_assessment_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const sessions = new Map();
const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function clientKey(req) {
  return req.ip || 'unknown';
}

function currentFailures(req) {
  const key = clientKey(req);
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    loginFailures.delete(key);
    return null;
  }
  return entry;
}

function loginLimited(req) {
  const entry = currentFailures(req);
  return Boolean(entry && entry.count >= FAILURE_LIMIT);
}

function recordLoginFailure(req) {
  const entry = currentFailures(req);
  if (!entry) {
    loginFailures.set(clientKey(req), { count: 1, resetAt: Date.now() + FAILURE_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clearLoginFailures(req) {
  loginFailures.delete(clientKey(req));
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return;
    cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '');
  });
  return cookies;
}

function cookieOptions(maxAgeMs = SESSION_TTL_MS) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieOptions().slice(1).join('; ')}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function getConfiguredUsername() {
  return process.env.PORTAL_ADMIN_USERNAME || DEFAULT_USERNAME;
}

function getConfiguredPasswordHash() {
  return process.env.PORTAL_ADMIN_PASSWORD_HASH || '';
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsRaw, salt, expectedHex] = String(storedHash || '').split(':');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !expectedHex) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;

  const actual = crypto.pbkdf2Sync(String(password || ''), salt, iterations, Buffer.from(expectedHex, 'hex').length, 'sha256');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function requirePortalAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  req.portalUser = { username: session.username };
  next();
}

function sessionHandler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { username: session.username } });
}

function loginHandler(req, res) {
  if (loginLimited(req)) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente mais tarde.' });
  }

  const { username, password } = req.body || {};
  const configuredUsername = getConfiguredUsername();
  const usernameOk = String(username || '') === configuredUsername;
  const passwordOk = verifyPassword(password, getConfiguredPasswordHash());

  if (!usernameOk || !passwordOk) {
    recordLoginFailure(req);
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }

  clearLoginFailures(req);

  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, {
    username: configuredUsername,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  setSessionCookie(res, token);
  res.json({ authenticated: true, user: { username: configuredUsername } });
}

function logoutHandler(req, res) {
  const session = getSession(req);
  if (session?.token) sessions.delete(session.token);
  clearSessionCookie(res);
  res.json({ authenticated: false });
}

module.exports = {
  requirePortalAuth,
  sessionHandler,
  loginHandler,
  logoutHandler,
};

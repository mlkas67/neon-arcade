/* ============================================================
   Legeniko Arcade — accounts
   scrypt password hashes, opaque session tokens in an httpOnly
   cookie that lasts a year, so a player signs in once per browser.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'legeniko_sid';
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,16}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const key = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(key, expected);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    const k = pair.slice(0, i).trim();
    if (!k) return;
    out[k] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function cookieHeader(token, secure) {
  // one year, httpOnly, SameSite=Lax: the browser keeps the player signed in
  // until the Log out button throws the token away
  const maxAge = Math.floor(db.SESSION_TTL / 1000);
  return COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge +
    (secure ? '; Secure' : '');
}

function clearCookieHeader(secure) {
  return COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (secure ? '; Secure' : '');
}

function tokenFrom(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE]) return cookies[COOKIE];
  const header = String(req.headers['x-arcade-token'] || '');
  if (header) return header;
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  // Keep the same token available to the API, the WebSocket upgrade and any
  // browser that refuses to store our cookie (in-app browsers, strict privacy
  // modes): the client mirrors it in local storage and appends it to /ws.
  try {
    const sid = new URL(req.url, 'http://localhost').searchParams.get('sid');
    if (sid) return sid;
  } catch (e) { /* malformed url */ }
  return null;
}

function currentUser(req) {
  const token = tokenFrom(req);
  const row = db.session(token);
  if (!row) return null;
  const user = db.userById(row.user_id);
  if (!user) return null;
  return { id: user.id, username: user.username };
}

function signIn(user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.createSession(token, user.id, db.SESSION_TTL);
  db.touch(user.id);
  return token;
}

function validateCredentials(username, password) {
  if (!USERNAME_RE.test(String(username || ''))) {
    return 'Username must be 3–16 characters: letters, numbers, dot, dash or underscore.';
  }
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD) return 'Password needs at least ' + MIN_PASSWORD + ' characters.';
  if (pw.length > MAX_PASSWORD) return 'Password is too long.';
  return null;
}

module.exports = {
  COOKIE,
  parseCookies,
  cookieHeader,
  clearCookieHeader,
  tokenFrom,
  currentUser,
  signIn,
  hashPassword,
  verifyPassword,
  validateCredentials
};

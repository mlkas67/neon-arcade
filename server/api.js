/* ============================================================
   Legeniko Arcade — HTTP API
   JSON in, JSON out, session cookie handled here.
   ============================================================ */
'use strict';

const db = require('./db');
const auth = require('./auth');
const rooms = require('./rooms');

const MAX_BODY = 4 * 1024;
/** ip -> { count, until } — a small brake on password guessing */
const attempts = new Map();

function json(res, status, body, extraHeaders) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extraHeaders || {}));
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too big'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (e) {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function isSecure(req) {
  return !!(req.socket && req.socket.encrypted) ||
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.until < now) return false;
  rec.count += 1;
  return rec.count > 12;
}

function noteFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, until: now + 10 * 60 * 1000 };
  rec.count += 1;
  if (rec.until < now) rec.until = now + 10 * 60 * 1000;
  attempts.set(key, rec);
}

function clearFailures(key) {
  attempts.delete(key);
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

function friendView(userId) {
  return db.friends(userId).map((f) => ({
    id: f.id,
    username: f.username,
    online: rooms.isOnline(f.id)
  }));
}

async function handle(req, res, pathname) {
  const method = req.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'DELETE' || method === 'PATCH';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': 'same-origin',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Arcade-Token'
    });
    return res.end();
  }

  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, online: rooms.onlineIds().length, users: 0 });
  }

  if (!isWrite) {
    // GET routes
    // Always 200: a signed-out visitor is a normal state, not an error, and a
    // 401 here makes every first visit log a scary console error.
    if (pathname === '/api/session') {
      const user = auth.currentUser(req);
      if (!user) return json(res, 200, { ok: true, user: null, friends: [] });
      return json(res, 200, { ok: true, user: publicUser(user), friends: friendView(user.id) });
    }
    if (pathname === '/api/me') {
      const user = auth.currentUser(req);
      if (!user) return json(res, 401, { ok: false, error: 'Not signed in.' });
      return json(res, 200, { ok: true, user: publicUser(user), friends: friendView(user.id) });
    }
    if (pathname === '/api/friends') {
      const user = auth.currentUser(req);
      if (!user) return json(res, 401, { ok: false, error: 'Not signed in.' });
      return json(res, 200, { ok: true, friends: friendView(user.id) });
    }
    if (pathname === '/api/users') {
      const user = auth.currentUser(req);
      if (!user) return json(res, 401, { ok: false, error: 'Not signed in.' });
      const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
      if (q.trim().length < 1) return json(res, 200, { ok: true, users: [] });
      const found = db.searchUsers(q.trim(), user.id).map((u) => ({
        id: u.id,
        username: u.username,
        friend: db.areFriends(user.id, u.id),
        online: rooms.isOnline(u.id)
      }));
      return json(res, 200, { ok: true, users: found });
    }
    return json(res, 404, { ok: false, error: 'Unknown endpoint.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: 'Could not read that request.' });
  }

  // ---- writing routes ----
  if (pathname === '/api/signup') {
    const ipKey = 'signup:' + clientIp(req);
    if (rateLimited(ipKey)) return json(res, 429, { ok: false, error: 'Too many attempts. Wait a few minutes.' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const problem = auth.validateCredentials(username, password);
    if (problem) {
      noteFailure(ipKey);
      return json(res, 400, { ok: false, error: problem });
    }
    if (db.userByUsername(username)) {
      noteFailure(ipKey);
      return json(res, 409, { ok: false, error: 'That username is taken.' });
    }
    const id = db.createUser(username, auth.hashPassword(password));
    const user = { id, username };
    const token = auth.signIn(user, req);
    clearFailures(ipKey);
    return json(res, 200, { ok: true, user, token }, { 'Set-Cookie': auth.cookieHeader(token, isSecure(req)) });
  }

  if (pathname === '/api/login') {
    const ipKey = 'login:' + clientIp(req);
    if (rateLimited(ipKey)) return json(res, 429, { ok: false, error: 'Too many attempts. Wait a few minutes.' });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const row = db.userByUsername(username);
    if (!row || !auth.verifyPassword(password, row.pass_hash)) {
      noteFailure(ipKey);
      return json(res, 401, { ok: false, error: 'Wrong username or password.' });
    }
    const token = auth.signIn({ id: row.id, username: row.username }, req);
    clearFailures(ipKey);
    return json(res, 200, { ok: true, user: { id: row.id, username: row.username }, token }, {
      'Set-Cookie': auth.cookieHeader(token, isSecure(req))
    });
  }

  if (pathname === '/api/logout') {
    const token = auth.tokenFrom(req);
    db.dropSession(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookieHeader(isSecure(req)) });
  }

  if (pathname === '/api/friends') {
    const user = auth.currentUser(req);
    if (!user) return json(res, 401, { ok: false, error: 'Sign in first.' });
    const target = db.userByUsername(String(body.username || '').trim());
    if (!target) return json(res, 404, { ok: false, error: 'No player with that username.' });
    if (target.id === user.id) return json(res, 400, { ok: false, error: 'That is you.' });
    if (db.areFriends(user.id, target.id)) return json(res, 409, { ok: false, error: 'Already friends.' });
    db.addFriend(user.id, target.id);
    rooms.sendTo(target.id, { t: 'friends', friends: friendView(target.id) });
    return json(res, 200, { ok: true, friends: friendView(user.id) });
  }

  if (pathname === '/api/friends/remove') {
    const user = auth.currentUser(req);
    if (!user) return json(res, 401, { ok: false, error: 'Sign in first.' });
    const target = db.userByUsername(String(body.username || '').trim()) ||
      (body.id ? db.userById(Number(body.id)) : null);
    if (!target) return json(res, 404, { ok: false, error: 'No player with that username.' });
    db.removeFriend(user.id, target.id);
    rooms.sendTo(target.id, { t: 'friends', friends: friendView(target.id) });
    return json(res, 200, { ok: true, friends: friendView(user.id) });
  }

  return json(res, 404, { ok: false, error: 'Unknown endpoint.' });
}

module.exports = { handle, json };

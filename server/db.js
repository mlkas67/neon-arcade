/* ============================================================
   Legeniko Arcade — storage
   One SQLite file (node:sqlite, built into Node 22+) holding users,
   sessions and the friend graph. Nothing here touches the games.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'arcade.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL,
    username_key  TEXT NOT NULL UNIQUE,
    pass_hash     TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );

  CREATE INDEX IF NOT EXISTS friends_by_user ON friends(user_id);
`);

const stmt = {
  insertUser: db.prepare('INSERT INTO users (username, username_key, pass_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)'),
  userByKey: db.prepare('SELECT * FROM users WHERE username_key = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  searchUsers: db.prepare('SELECT id, username FROM users WHERE username_key LIKE ? AND id <> ? ORDER BY username_key LIMIT 8'),
  touchUser: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),

  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  sessionByToken: db.prepare('SELECT * FROM sessions WHERE token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

  addFriend: db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)'),
  removeFriend: db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?'),
  areFriends: db.prepare('SELECT 1 AS ok FROM friends WHERE user_id = ? AND friend_id = ?'),
  listFriends: db.prepare(`
    SELECT u.id, u.username, u.last_seen, f.created_at
    FROM friends f JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
    ORDER BY u.username_key
  `)
};

const DAY = 24 * 60 * 60 * 1000;

module.exports = {
  DAY,
  SESSION_TTL: 365 * DAY,

  createUser(username, passHash) {
    const now = Date.now();
    const info = stmt.insertUser.run(username, username.toLowerCase(), passHash, now, now);
    return Number(info.lastInsertRowid);
  },
  userByUsername(username) {
    return stmt.userByKey.get(String(username || '').toLowerCase()) || null;
  },
  userById(id) {
    return stmt.userById.get(id) || null;
  },
  searchUsers(term, exceptId) {
    return stmt.searchUsers.all(String(term || '').toLowerCase() + '%', exceptId);
  },
  touch(id) {
    stmt.touchUser.run(Date.now(), id);
  },

  createSession(token, userId, ttl) {
    const now = Date.now();
    stmt.insertSession.run(token, userId, now, now + ttl);
  },
  session(token) {
    if (!token) return null;
    const row = stmt.sessionByToken.get(token);
    if (!row || row.expires_at < Date.now()) return null;
    return row;
  },
  dropSession(token) {
    if (token) stmt.deleteSession.run(token);
  },
  purgeSessions() {
    stmt.purgeSessions.run(Date.now());
  },

  addFriend(userId, friendId) {
    stmt.addFriend.run(userId, friendId, Date.now());
    // friendship is mutual: the other side gets you straight away, and
    // "Unfriend" on either side removes the pair in both directions
    stmt.addFriend.run(friendId, userId, Date.now());
  },
  removeFriend(userId, friendId) {
    stmt.removeFriend.run(userId, friendId);
    stmt.removeFriend.run(friendId, userId);
  },
  areFriends(a, b) {
    return !!stmt.areFriends.get(a, b);
  },
  friends(userId) {
    return stmt.listFriends.all(userId);
  },
  allFriendsOf(userId) {
    return stmt.listFriends.all(userId).map((f) => f.id);
  }
};

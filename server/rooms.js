/* ============================================================
   Legeniko Arcade — live layer
   A WebSocket per signed-in player carries presence, friend
   invites and one "race room" at a time. Games stay local; the
   room only syncs who is playing, their scores and who won.
   ============================================================ */
'use strict';

const { WebSocketServer } = require('ws');
const db = require('./db');

const MAX_ROOM_MS = 30 * 60 * 1000;

/** userId -> Set<WebSocket> */
const sockets = new Map();
/** roomId -> { id, game, host, guest, scores, done, startedAt, rematch, poses } */
const rooms = new Map();
/** userId -> roomId */
const inRoom = new Map();

function onlineIds() {
  return [...sockets.keys()];
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* socket died mid-write */ }
  }
}

function sendTo(userId, msg) {
  const set = sockets.get(userId);
  if (!set) return;
  set.forEach((ws) => send(ws, msg));
}

function friendIdsOf(userId) {
  return db.allFriendsOf(userId);
}

function broadcastPresence(userId) {
  friendIdsOf(userId).forEach((friendId) => {
    sendTo(friendId, { t: 'presence', user: userId, online: sockets.has(userId) });
  });
}

function roomFor(userId) {
  const id = inRoom.get(userId);
  return id ? rooms.get(id) : null;
}

function publicRoom(room) {
  const parts = [room.host, room.guest].filter(Boolean);
  return {
    id: room.id,
    game: room.game,
    host: room.host,
    guest: room.guest,
    players: parts,
    scores: room.scores,
    done: room.done,
    startedAt: room.startedAt,
    rematch: room.rematch || 0
  };
}

function pushRoom(room) {
  [room.host, room.guest].filter(Boolean).forEach((id) => sendTo(id, { t: 'room', room: publicRoom(room) }));
}

function closeRoom(room, reason) {
  [room.host, room.guest].filter(Boolean).forEach((id) => {
    inRoom.delete(id);
    sendTo(id, { t: 'roomEnd', reason: reason || 'left' });
  });
  rooms.delete(room.id);
}

/* A pose is a player's last known position, drawn as a ghost in the other
   player's view: flat, numeric, and small enough to relay at 10 Hz. */
const POSE_KEYS = 18;
function cleanPose(msg) {
  if (!msg || typeof msg.game !== 'string' || msg.game.length > 24) return null;
  const raw = msg.pose;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > POSE_KEYS) return null;
  const out = { game: msg.game, s: {} };
  for (const k of keys) {
    if (!/^[a-z]{1,4}$/i.test(k)) return null;
    const v = raw[k];
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      out.s[k] = Math.round(v * 100) / 100;
    } else if (typeof v === 'boolean') {
      out.s[k] = v;
    } else {
      return null;
    }
  }
  return JSON.stringify(out).length > 600 ? null : out;
}

function newRoomId() {
  // short, easy to read out loud, and hard to guess
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(out) ? newRoomId() : out;
}

function finishIfBothDone(room) {
  const players = [room.host, room.guest].filter(Boolean);
  const allDone = players.length === 2 && players.every((id) => room.done[id]);
  if (!allDone) return;
  const [a, b] = players;
  const sa = room.scores[a] || 0;
  const sb = room.scores[b] || 0;
  const winner = sa === sb ? null : (sa > sb ? a : b);
  [a, b].forEach((id) => sendTo(id, {
    t: 'result',
    room: publicRoom(room),
    winner,
    yours: room.scores[id] || 0,
    theirs: room.scores[id === a ? b : a] || 0
  }));
}

function handle(ws, msg, me) {
  switch (msg.t) {
    case 'hello': {
      send(ws, { t: 'hello', you: { id: me.id, username: me.username }, friends: friendIdsOf(me.id), online: onlineIds() });
      friendIdsOf(me.id).forEach((friendId) => sendTo(friendId, { t: 'presence', user: me.id, online: true }));
      break;
    }

    case 'invite': {
      const target = db.userByUsername(msg.username);
      if (!target) return send(ws, { t: 'error', message: 'No player called ' + msg.username + '.' });
      if (target.id === me.id) return send(ws, { t: 'error', message: 'You cannot invite yourself.' });
      if (!db.areFriends(me.id, target.id)) return send(ws, { t: 'error', message: 'Add them as a friend first.' });
      if (!sockets.has(target.id)) return send(ws, { t: 'error', message: target.username + ' is offline right now.' });

      const existing = roomFor(me.id);
      if (existing) return send(ws, { t: 'error', message: 'You are already in a match.' });
      if (roomFor(target.id)) return send(ws, { t: 'error', message: target.username + ' is already in a match.' });

      const room = {
        id: newRoomId(),
        game: String(msg.game || 'gd'),
        host: me.id,
        guest: target.id,
        scores: {},
        done: {},
        startedAt: 0,
        rematch: 0,
        poses: {},
        createdAt: Date.now()
      };
      rooms.set(room.id, room);
      inRoom.set(me.id, room.id);
      sendTo(me.id, { t: 'room', room: publicRoom(room), waiting: true });
      sendTo(target.id, {
        t: 'invite',
        from: { id: me.id, username: me.username },
        game: room.game,
        roomId: room.id
      });
      break;
    }

    case 'accept': {
      const room = rooms.get(String(msg.roomId || ''));
      if (!room || room.guest !== me.id) return send(ws, { t: 'error', message: 'That invite has expired.' });
      if (roomFor(me.id)) return send(ws, { t: 'error', message: 'You are already in a match.' });
      inRoom.set(me.id, room.id);
      // The guest joining *is* the start signal, so both clients get one
      // startedAt and arm their countdown together. Starting the room from a
      // client timer raced with this accept and produced a second countdown.
      room.scores = {};
      room.done = {};
      room.poses = {};
      room.rematch = 0;
      room.startedAt = Date.now();
      pushRoom(room);
      break;
    }

    case 'decline': {
      const room = rooms.get(String(msg.roomId || ''));
      if (!room || room.guest !== me.id) return;
      sendTo(room.host, { t: 'error', message: 'Invite declined.' });
      closeRoom(room, 'declined');
      break;
    }

    case 'leave': {
      const room = roomFor(me.id);
      if (room) closeRoom(room, 'left');
      break;
    }

    case 'start': {
      const room = roomFor(me.id);
      if (!room || room.host !== me.id || !room.guest) return;
      if (room.startedAt) return; // already racing; starting twice restarted the countdown
      if (inRoom.get(room.guest) !== room.id) return send(ws, { t: 'error', message: 'Waiting for your friend to accept.' });
      if (!sockets.has(room.guest)) return send(ws, { t: 'error', message: 'Your friend is not connected.' });
      room.startedAt = Date.now();
      room.scores = {};
      room.done = {};
      room.poses = {};
      room.rematch = 0;
      pushRoom(room);
      break;
    }

    case 'score': {
      const room = roomFor(me.id);
      if (!room || !room.startedAt) return;
      const value = Math.max(0, Math.min(1e9, Number(msg.value) || 0));
      if (room.done[me.id]) return;
      room.scores[me.id] = value;
      [room.host, room.guest].filter(Boolean).forEach((id) => sendTo(id, { t: 'score', user: me.id, value }));
      break;
    }

    case 'done': {
      const room = roomFor(me.id);
      if (!room || !room.startedAt || room.done[me.id]) return;
      room.done[me.id] = true;
      room.scores[me.id] = Math.max(0, Math.min(1e9, Number(msg.value) || room.scores[me.id] || 0));
      pushRoom(room);
      finishIfBothDone(room);
      break;
    }

    case 'rematch': {
      const room = roomFor(me.id);
      if (!room || !room.guest) return;
      // One Rematch press restarts the round for both players, and the new
      // startedAt is the single trigger their countdowns arm from.
      room.rematch = Number(msg.round) || (room.rematch + 1);
      room.scores = {};
      room.done = {};
      room.poses = {};
      room.startedAt = Date.now();
      pushRoom(room);
      break;
    }

    case 'pose': {
      const room = roomFor(me.id);
      if (!room || !room.startedAt) return;
      const pose = cleanPose(msg);
      if (!pose) return;
      // Ghost data is fire-and-forget: forwarded to the other player in the
      // room and never written anywhere else.
      room.poses[me.id] = pose;
      [room.host, room.guest].filter(Boolean).forEach((id) => {
        if (Number(id) === Number(me.id)) return;
        sendTo(id, { t: 'pose', user: me.id, username: me.username, game: msg.game, pose });
      });
      break;
    }

    case 'ping':
      send(ws, { t: 'pong' });
      break;

    default:
      send(ws, { t: 'error', message: 'Unknown message: ' + msg.t });
  }
}

function attach(server, pathname) {
  const wss = new WebSocketServer({ server, path: pathname, maxPayload: 8 * 1024 });

  wss.on('connection', (ws, req) => {
    const auth = require('./auth');
    const user = auth.currentUser(req);
    if (!user) {
      send(ws, { t: 'error', message: 'Sign in first.' });
      ws.close(4401, 'auth');
      return;
    }
    const me = { id: user.id, username: user.username };
    ws.me = me;
    ws.isAlive = true;
    if (!sockets.has(me.id)) sockets.set(me.id, new Set());
    sockets.get(me.id).add(ws);
    db.touch(me.id);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      try { handle(ws, msg, me); } catch (e) { send(ws, { t: 'error', message: 'Server could not do that.' }); }
    });

    ws.on('close', () => {
      const set = sockets.get(me.id);
      if (set) {
        set.delete(ws);
        if (!set.size) {
          sockets.delete(me.id);
          friendIdsOf(me.id).forEach((friendId) => sendTo(friendId, { t: 'presence', user: me.id, online: false }));
          const room = roomFor(me.id);
          if (room) closeRoom(room, 'disconnected');
        }
      }
    });

    send(ws, { t: 'ready' });
  });

  const beat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (e) { /* ignore */ }
    });
    // drop rooms nobody came back to
    rooms.forEach((room) => {
      if (Date.now() - room.createdAt > MAX_ROOM_MS) closeRoom(room, 'expired');
    });
  }, 30000);
  beat.unref();

  wss.on('close', () => clearInterval(beat));
  return wss;
}

module.exports = {
  attach,
  onlineIds,
  isOnline: (id) => sockets.has(id),
  sendTo
};

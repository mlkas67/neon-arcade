/* ============================================================
   Legeniko Arcade — network layer
   Talks to the arcade server: JSON API over fetch, one WebSocket
   for presence, invites and match rooms. If the site is opened
   without a server (the static GitHub Pages build) Net.server is
   false and every caller falls back to guest mode.
   ============================================================ */
'use strict';

(function () {
  const Net = {
    server: false,
    user: null,
    online: new Map(),
    ws: null,
    connected: false,
    listeners: new Map(),
    _retry: 0,
    _closedByUs: false
  };

  const TOKEN_KEY = 'legeniko.sid';
  // The static build can be pointed at a server on another origin.
  const BASE = String((typeof window !== 'undefined' && window.ARCADE_API) || '').replace(/\/+$/, '');
  Net.base = BASE;

  Net.token = function () {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  };

  Net.setToken = function (token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode: the cookie still works */ }
  };

  Net.api = async function (path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    opts.credentials = BASE ? 'omit' : 'same-origin';
    const token = Net.token();
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    const res = await fetch(BASE + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, ok: res.ok && data && data.ok !== false, data: data || {} };
  };

  Net.on = function (type, fn) {
    if (!Net.listeners.has(type)) Net.listeners.set(type, new Set());
    Net.listeners.get(type).add(fn);
    return fn;
  };

  Net.off = function (type, fn) {
    const set = Net.listeners.get(type);
    if (set) set.delete(fn);
  };

  Net.emit = function (type, payload) {
    const set = Net.listeners.get(type);
    if (set) set.forEach((fn) => { try { fn(payload); } catch (e) { /* listener bug */ } });
  };

  Net.send = function (msg) {
    if (Net.ws && Net.ws.readyState === 1) {
      Net.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  };

  Net.isOnline = function (id) {
    return !!Net.online.get(Number(id));
  };

  Net.connect = function () {
    if (!Net.server || !Net.user) return;
    let host = location.host;
    let secure = location.protocol === 'https:';
    if (BASE) {
      try {
        const u = new URL(BASE);
        host = u.host;
        secure = u.protocol === 'https:';
      } catch (e) { /* keep this origin */ }
    }
    const proto = secure ? 'wss:' : 'ws:';
    const token = Net.token();
    const url = proto + '//' + host + '/ws' + (token ? '?sid=' + encodeURIComponent(token) : '');
    Net._closedByUs = false;

    let ws;
    try { ws = new WebSocket(url); } catch (e) { return; }
    Net.ws = ws;

    ws.onopen = function () {
      Net.connected = true;
      Net._retry = 0;
      ws.send(JSON.stringify({ t: 'hello' }));
      Net.emit('open');
    };

    ws.onmessage = function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && msg.t === 'presence') Net.online.set(Number(msg.user), !!msg.online);
      if (msg && msg.t === 'hello' && Array.isArray(msg.online)) {
        Net.online.clear();
        msg.online.forEach((id) => Net.online.set(Number(id), true));
      }
      Net.emit('message', msg);
    };

    ws.onclose = function () {
      Net.connected = false;
      Net.emit('close');
      if (Net._closedByUs || !Net.user) return;
      Net._retry = Math.min(Net._retry + 1, 6);
      setTimeout(() => { if (!Net.connected) Net.connect(); }, 800 * Net._retry);
    };

    ws.onerror = function () { /* onclose handles the retry */ };
  };

  Net.disconnect = function () {
    Net._closedByUs = true;
    if (Net.ws) {
      try { Net.ws.close(); } catch (e) { /* already gone */ }
    }
    Net.ws = null;
    Net.connected = false;
    Net.online.clear();
  };

  window.Net = Net;
})();

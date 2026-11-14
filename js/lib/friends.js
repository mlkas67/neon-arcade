/* ============================================================
   Legeniko Arcade — friends
   The drawer behind the 👥 button: add by username, unfriend,
   and join/invite a friend into a race of whichever game you
   have open. Invites arrive as toasts with Join / Dismiss.
   ============================================================ */
'use strict';

(function () {
  const Friends = {
    list: [],
    gameId: null,
    open: false
  };

  const GAME_NAMES = {
    gd: 'Geometry Dash', flappy: 'Flappy Bird', break: 'Brick Breaker', snake: 'Neon Snake',
    p2048: '2048', rocks: 'Asteroid Drift', pong: 'Neon Pong', memory: 'Memory Grid',
    whack: 'Whack-a-Bot', vice: 'Neon Vice 3D', ridge: 'Neon Ridge', deck: 'Neon Deck'
  };

  const el = {};
  function $(id) { return document.getElementById(id); }

  function gameName(id) { return GAME_NAMES[id] || 'a game'; }

  function toast(text, actions, opts) {
    const node = document.createElement('div');
    node.className = 'toast' + (opts && opts.warn ? ' is-warn' : '');
    const p = document.createElement('p');
    p.textContent = text;
    node.appendChild(p);
    if (actions && actions.length) {
      const row = document.createElement('div');
      row.className = 'toast-actions';
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = a.primary ? 'primary-btn toast-btn' : 'ghost-btn toast-btn';
        b.textContent = a.label;
        b.addEventListener('click', () => {
          node.remove();
          if (a.run) a.run();
        });
        row.appendChild(b);
      });
      node.appendChild(row);
    }
    el.toasts.appendChild(node);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    const life = (opts && opts.sticky) ? 0 : 6000;
    if (life) setTimeout(() => node.remove(), life);
    return node;
  }

  function drawList() {
    if (!el.list) return;
    el.list.innerHTML = '';
    const target = Friends.gameId;
    Friends.list.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'fd-row';
      li.dataset.id = f.id;

      const who = document.createElement('div');
      who.className = 'fd-who';
      const dot = document.createElement('span');
      dot.className = 'fd-dot' + (Net.isOnline(f.id) ? ' is-on' : '');
      dot.title = Net.isOnline(f.id) ? 'Online' : 'Offline';
      const name = document.createElement('span');
      name.className = 'fd-name';
      name.textContent = f.username;
      who.appendChild(dot);
      who.appendChild(name);

      const actions = document.createElement('div');
      actions.className = 'fd-actions';

      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'ghost-btn fd-btn';
      joinBtn.textContent = 'Invite';
      joinBtn.title = target
        ? 'Invite ' + f.username + ' to ' + gameName(target)
        : 'Invite ' + f.username + ' to a race';
      joinBtn.addEventListener('click', () => {
        const game = Friends.gameId || (window.Arcade && Arcade.gameId) || 'gd';
        if (!Net.isOnline(f.id)) {
          toast(f.username + ' is offline right now — invites need them online.', null, { warn: true });
          return;
        }
        if (window.MP) window.MP.invite(f, game);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ghost-btn fd-btn fd-btn-quiet';
      delBtn.textContent = 'Unfriend';
      delBtn.addEventListener('click', () => removeFriend(f));

      actions.appendChild(joinBtn);
      actions.appendChild(delBtn);
      li.appendChild(who);
      li.appendChild(actions);
      el.list.appendChild(li);
    });

    el.empty.hidden = Friends.list.length > 0;
    el.badge.hidden = Friends.list.length === 0;
    el.badge.textContent = String(Friends.list.length);
    if (el.hint) {
      el.hint.textContent = Friends.gameId
        ? 'Invite a friend to ' + gameName(Friends.gameId) + ' — or add someone new.'
        : 'Pick a game, then invite a friend to race. Add someone by username below.';
    }
    if (el.foot) {
      const online = Friends.list.filter((f) => Net.isOnline(f.id)).length;
      el.foot.hidden = Friends.list.length === 0;
      el.foot.textContent = online + ' of ' + Friends.list.length + ' online';
    }
  }

  function setFriends(list) {
    Friends.list = Array.isArray(list) ? list : [];
    drawList();
  }

  async function addFriend(event) {
    if (event) event.preventDefault();
    const username = el.input.value.trim();
    if (!username) return;
    el.msg.hidden = false;
    el.msg.textContent = 'Adding ' + username + '…';
    const res = await Net.api('/api/friends', { method: 'POST', body: { username } }).catch(() => null);
    if (!res) {
      el.msg.textContent = 'Cannot reach the arcade server.';
      return;
    }
    if (!res.ok) {
      el.msg.textContent = (res.data && res.data.error) || 'Could not add that player.';
      return;
    }
    el.msg.textContent = 'Added ' + username + '. They are on your list now.';
    el.input.value = '';
    setFriends(res.data.friends || []);
    setTimeout(() => { el.msg.hidden = true; }, 4000);
  }

  async function removeFriend(friend) {
    const res = await Net.api('/api/friends/remove', { method: 'POST', body: { username: friend.username } }).catch(() => null);
    if (!res || !res.ok) {
      toast('Could not unfriend ' + friend.username + '.', null, { warn: true });
      return;
    }
    setFriends(res.data.friends || []);
    toast('Removed ' + friend.username + ' from your friends.');
  }

  function openDrawer(gameId) {
    if (gameId !== undefined) Friends.gameId = gameId;
    Friends.open = true;
    el.drawer.hidden = false;
    drawList();
    Net.emit('friends-open', Friends.gameId);
  }

  function closeDrawer() {
    Friends.open = false;
    el.drawer.hidden = true;
    Net.emit('friends-close', null);
  }

  function init() {
    el.drawer = $('friendsDrawer');
    el.list = $('friendList');
    el.empty = $('friendsEmpty');
    el.badge = $('friendBadge');
    el.hint = $('friendsHint');
    el.foot = $('friendsFoot');
    el.input = $('addFriendInput');
    el.msg = $('addFriendMsg');
    el.toasts = $('toasts');
    if (!el.drawer) return;

    $('friendsBtn').addEventListener('click', () => {
      if (!Auth.user) { Auth.openGate(); return; }
      if (Friends.open) closeDrawer();
      else openDrawer(Arcade.gameId || null);
    });
    $('friendsClose').addEventListener('click', closeDrawer);
    $('addFriendForm').addEventListener('submit', addFriend);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && Friends.open) closeDrawer();
    });

    // keep the online dots live
    Net.on('message', (msg) => {
      if (!msg) return;
      if (msg.t === 'presence') drawList();
      if (msg.t === 'friends') Auth.refresh().catch(() => {});
    });
    Net.on('close', drawList);
  }

  Friends.setFriends = setFriends;
  Friends.openDrawer = openDrawer;
  Friends.close = closeDrawer;
  Friends.toast = toast;
  Friends.gameName = gameName;
  Friends.isOpen = () => Friends.open;

  document.addEventListener('DOMContentLoaded', init);
  window.Friends = Friends;
})();

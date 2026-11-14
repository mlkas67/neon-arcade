/* ============================================================
   Legeniko Arcade — sign in
   Gate in front of the arcade. A session cookie lasting a year
   keeps players signed in across visits until they press Log out.
   ============================================================ */
'use strict';

(function () {
  const el = {};
  let mode = 'login';

  const Auth = {
    ready: false,
    guest: false,
    user: null
  };

  function $(id) { return document.getElementById(id); }

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    el.tabLogin.classList.toggle('is-active', !signup);
    el.tabSignup.classList.toggle('is-active', signup);
    el.tabLogin.setAttribute('aria-selected', String(!signup));
    el.tabSignup.setAttribute('aria-selected', String(signup));
    el.title.textContent = signup ? 'Make an account' : 'Welcome back';
    el.lede.textContent = signup
      ? 'Pick a username your friends can add. It takes ten seconds.'
      : 'Log in to keep your friends list and race them live.';
    el.submit.textContent = signup ? 'Create account' : 'Log in';
    el.pass.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    el.note.textContent = signup
      ? '3–16 characters: letters, numbers, dot, dash or underscore.'
      : 'You stay signed in on this device until you press Log out.';
    showError('');
    el.form.reset();
    el.user.focus();
  }

  function showError(message) {
    el.error.textContent = message || '';
    el.error.hidden = !message;
  }

  function openGate() {
    el.gate.hidden = false;
    document.body.classList.add('gated');
    setTimeout(() => el.user.focus(), 30);
  }

  function closeGate() {
    el.gate.hidden = true;
    document.body.classList.remove('gated');
  }

  function paintChip(user) {
    el.chip.hidden = !user;
    if (!user) return;
    el.avatar.textContent = user.username.slice(0, 1).toUpperCase();
    el.name.textContent = user.username;
    el.menuName.textContent = '@' + user.username;
  }

  async function afterLogin(user, friends) {
    Auth.user = user;
    Auth.guest = false;
    Net.user = user;
    Net.online.clear();
    (friends || []).forEach((f) => Net.online.set(Number(f.id), !!f.online));
    paintChip(user);
    closeGate();
    Net.connect();
    Net.emit('auth', user);
    if (window.Friends) window.Friends.setFriends(friends || []);
    if (window.MP) window.MP.sync();
  }

  async function submit(event) {
    event.preventDefault();
    const username = el.user.value.trim();
    const password = el.pass.value;
    if (!username || !password) return showError('Fill in both fields.');
    el.submit.disabled = true;
    el.submit.textContent = mode === 'signup' ? 'Creating…' : 'Logging in…';
    try {
      const res = await Net.api('/api/' + mode, { method: 'POST', body: { username, password } });
      if (!res.ok) {
        showError((res.data && res.data.error) || 'Could not sign in.');
        return;
      }
      if (res.data && res.data.token) Net.setToken(res.data.token);
      try { localStorage.setItem('legeniko.lastUser', res.data.user.username); } catch (e) { /* private mode */ }
      const me = await Net.api('/api/me');
      await afterLogin(res.data.user, (me.data && me.data.friends) || []);
    } catch (e) {
      showError('Cannot reach the arcade server.');
    } finally {
      el.submit.disabled = false;
      el.submit.textContent = mode === 'signup' ? 'Create account' : 'Log in';
    }
  }

  async function logout() {
    try { await Net.api('/api/logout', { method: 'POST' }); } catch (e) { /* offline */ }
    Net.setToken(null);
    Net.disconnect();
    Net.user = null;
    Auth.user = null;
    paintChip(null);
    el.menu.hidden = true;
    if (window.MP && window.MP.inMatch()) window.MP.leave();
    if (window.Friends) {
      window.Friends.setFriends([]);
      window.Friends.close();
    }
    if (window.Arcade && Arcade.state !== 'menu') Arcade.closeGame();
    openGate();
    setMode('login');
  }

  async function init() {
    el.gate = $('gate');
    el.title = $('gateTitle');
    el.lede = $('gateLede');
    el.tabLogin = $('tabLogin');
    el.tabSignup = $('tabSignup');
    el.form = $('gateForm');
    el.user = $('gateUser');
    el.pass = $('gatePass');
    el.submit = $('gateSubmit');
    el.error = $('gateError');
    el.note = $('gateNote');
    el.guestBtn = $('gateGuest');
    el.chip = $('userChip');
    el.avatar = $('userAvatar');
    el.name = $('userName');
    el.menu = $('userMenu');
    el.menuName = $('userMenuName');
    el.logout = $('logoutBtn');
    el.userBtn = $('userBtn');

    if (!el.gate) return;

    el.tabLogin.addEventListener('click', () => setMode('login'));
    el.tabSignup.addEventListener('click', () => setMode('signup'));
    el.form.addEventListener('submit', submit);
    el.logout.addEventListener('click', (e) => { e.stopPropagation(); logout(); });
    el.userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      el.menu.hidden = !el.menu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!el.menu.hidden && !el.menu.contains(e.target)) el.menu.hidden = true;
    });
    el.guestBtn.addEventListener('click', () => {
      Auth.guest = true;
      closeGate();
      Net.emit('auth', null);
    });

    const me = await Net.api('/api/session').catch(() => null);
    if (me && me.status === 200 && me.data && me.data.user) {
      Net.server = true;
      await afterLogin(me.data.user, me.data.friends || []);
    } else if (me && me.status === 200) {
      Net.server = true;
      Net.setToken(null);
      openGate();
      setMode('login');
      // a returning player only has to type their password, not their name
      let last = null;
      try { last = localStorage.getItem('legeniko.lastUser'); } catch (e) { last = null; }
      if (last) {
        el.user.value = last;
        el.title.textContent = 'Welcome back, ' + last;
        el.pass.focus();
      }
    } else {
      // static build (no server): keep the arcade playable as a guest
      Net.server = false;
      setMode('login');
      el.guestBtn.hidden = false;
      el.lede.textContent = 'Sign in needs the arcade server. You can still play every game as a guest.';
      el.note.textContent = 'This copy is running without the arcade server, so accounts and friends are off.';
      el.submit.disabled = true;
      el.submit.textContent = 'Server offline';
      openGate();
    }
    Auth.ready = true;
    Net.emit('ready', null);
  }

  Auth.logout = logout;
  Auth.openGate = openGate;
  Auth.closeGate = closeGate;
  Auth.setMode = setMode;
  Auth.refresh = async function () {
    const me = await Net.api('/api/me').catch(() => null);
    if (me && me.ok) await afterLogin(me.data.user, me.data.friends || []);
    return me;
  };

  document.addEventListener('DOMContentLoaded', init);
  window.Auth = Auth;
})();

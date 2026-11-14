/* ============================================================
   Legeniko Arcade — multiplayer races
   A match is a room: both players run the same game at the same
   moment and their live scores are mirrored in the bar above the
   canvas. First to die waits; highest score when both are done
   wins, then rematch. The games themselves are untouched — we
   read Arcade.score and only wrap the start/die moments.
   ============================================================ */
'use strict';

(function () {
  const MP = {
    room: null,
    you: null,
    them: null,
    countdownTimer: 0,
    waitingStart: false,
    reporting: 0,
    lastSent: -1,
    finished: false,
    resultOpen: false,
    countdownEl: null,
    countdownWatchdog: 0
  };

  const el = {};
  function $(id) { return document.getElementById(id); }

  function nameOf(id) {
    if (!MP.room) return 'Friend';
    if (Number(id) === Number(MP.you)) return 'You';
    const f = (window.Friends ? Friends.list : []).find((x) => Number(x.id) === Number(id));
    return f ? f.username : 'Friend';
  }

  function themId() {
    if (!MP.room) return null;
    return MP.room.players.find((p) => Number(p) !== Number(MP.you)) || null;
  }

  function showBar(text) {
    el.bar.hidden = false;
    el.state.textContent = text || 'Race';
    el.youScore.textContent = '0';
    el.themScore.textContent = '0';
    el.themName.textContent = nameOf(themId()) || 'Friend';
  }

  function hideBar() {
    el.bar.hidden = true;
  }

  function paintScores() {
    if (!MP.room) return;
    const mine = MP.room.scores[MP.you] || 0;
    const theirs = MP.room.scores[themId()] || 0;
    el.youScore.textContent = String(mine);
    el.themScore.textContent = String(theirs);
    el.themName.textContent = nameOf(themId());
  }

  function clearCountdown() {
    if (MP.countdownTimer) clearTimeout(MP.countdownTimer);
    MP.countdownTimer = 0;
    if (MP.countdownWatchdog) clearTimeout(MP.countdownWatchdog);
    MP.countdownWatchdog = 0;
    MP.waitingStart = false;
    if (MP.countdownEl && MP.countdownEl.parentNode) MP.countdownEl.parentNode.removeChild(MP.countdownEl);
    MP.countdownEl = null;
    // Belt and braces: any countdown left behind by an earlier round goes too,
    // otherwise it sits on screen for ever over a live race.
    Array.prototype.forEach.call(document.querySelectorAll('.mp-countdown'), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function toast(text, actions, opts) {
    if (window.Friends) return Friends.toast(text, actions, opts);
    return null;
  }

  /* ---------------- getting into a match ---------------- */

  MP.invite = function (friend, game) {
    if (!Net.server || !Auth.user) {
      toast('Multiplayer needs the arcade server.', null, { warn: true });
      return;
    }
    if (MP.room) {
      toast('You are already in a match — leave it first.', null, { warn: true });
      return;
    }
    const sent = Net.send({ t: 'invite', username: friend.username, game: game || 'gd' });
    if (!sent) {
      toast('Not connected yet — try again in a second.', null, { warn: true });
      return;
    }
    MP.pendingInvite = { friend: friend.username, game: game || 'gd' };
    toast('Invite sent to ' + friend.username + '.');
  };

  MP.accept = function (roomId) {
    Net.send({ t: 'accept', roomId });
  };

  MP.decline = function (roomId) {
    Net.send({ t: 'decline', roomId });
  };

  MP.leave = function () {
    if (MP.room) Net.send({ t: 'leave' });
    MP.teardown('left');
  };

  MP.inMatch = function () { return !!MP.room; };

  MP.teardown = function (reason) {
    clearCountdown();
    MP.room = null;
    MP.finished = false;
    MP.resultOpen = false;
    MP.lastSent = -1;
    hideBar();
    if (window.Arcade && Arcade.state !== 'menu' && reason !== 'keep') {
      Arcade.closeGame();
    }
  };

  /* ---------------- starting a race ---------------- */

  function armRace() {
    if (!MP.room || !MP.room.startedAt) return;
    if (MP.armedFor === MP.room.startedAt) return;
    MP.armedFor = MP.room.startedAt;
    MP.finished = false;
    MP.lastSent = -1;
    clearCountdown();

    const game = MP.room.game;
    showBar('Next: ' + (window.Friends ? Friends.gameName(game) : game));
    if (window.Friends) Friends.close();

    if (Arcade.state !== 'menu') Arcade.closeGame();
    if (!window.Games || !window.Games[game]) {
      toast('That game is not on this cabinet.', null, { warn: true });
      return;
    }
    MP.resultOpen = false;
    Arcade.openGame(game);
    const ov = $('overlay');
    if (ov) ov.classList.remove('is-visible');
    Arcade.inputLock = performance.now() + 4200;
    if (window.Friends) Friends.close();

    const countEl = document.createElement('div');
    countEl.className = 'mp-countdown';
    countEl.innerHTML = '<b>3</b><span>Race ' + (window.Friends ? Friends.gameName(game) : game) + '</span>';
    document.body.appendChild(countEl);
    MP.countdownEl = countEl;
    let n = 3;
    const finish = () => {
      clearCountdown();
      if (!MP.room) return;
      MP.waitingStart = false;
      if (Arcade.state === 'ready') Arcade.begin();
      else if (Arcade.state === 'paused') { Arcade.resume(); Arcade.begin(); }
      else if (Arcade.state !== 'playing') { Arcade.restart(); if (Arcade.state === 'ready') Arcade.begin(); }
      showBar('Racing');
    };
    const tick = () => {
      if (!MP.room) { clearCountdown(); return; }
      if (n > 0) {
        countEl.querySelector('b').textContent = String(n);
        n -= 1;
        MP.countdownTimer = setTimeout(tick, 800);
        return;
      }
      countEl.querySelector('b').textContent = 'GO';
      MP.countdownTimer = setTimeout(finish, 420);
    };
    tick();
    // If a timer is ever starved (a backgrounded tab, a dropped frame), the
    // race still starts instead of leaving the countdown on screen.
    MP.countdownWatchdog = setTimeout(finish, 6000);
  }

  /* ---------------- reporting ---------------- */

  function report(force) {
    if (!MP.room || !MP.room.startedAt || MP.finished) return;
    const value = Math.max(0, Math.floor(Arcade.score || 0));
    if (!force && value === MP.lastSent) return;
    const now = Date.now();
    if (!force && now - MP.reporting < 140) return;
    MP.reporting = now;
    MP.lastSent = value;
    Net.send({ t: 'score', value });
  }

  function finish() {
    if (!MP.room || MP.finished) return;
    MP.finished = true;
    const value = Math.max(0, Math.floor(Arcade.score || 0));
    Net.send({ t: 'done', value });
    if (!el.bar.hidden) el.state.textContent = 'Waiting for ' + nameOf(themId());
  }

  /* ---------------- server messages ---------------- */

  Net.on('message', (msg) => {
    if (!msg) return;
    switch (msg.t) {
      case 'hello': {
        MP.you = msg.you.id;
        break;
      }
      case 'room': {
        MP.room = msg.room;
        MP.you = MP.you || (Auth.user && Auth.user.id);
        MP.finished = !!msg.room.done[MP.you];
        if (msg.waiting) {
          showBar('Waiting for ' + nameOf(msg.room.guest));
        }
        if (msg.room.players.length === 2 && msg.room.startedAt) {
          paintScores();
          armRace();
        } else if (msg.room.players.length === 2 && Number(msg.room.host) === Number(MP.you)) {
          // The server starts the race the moment the guest accepts, so all we
          // do here is show that we are waiting — no client-side start timer,
          // which used to race the accept and start the room twice.
          showBar('Starting…');
        }
        break;
      }
      case 'invite': {
        const from = msg.from && msg.from.username ? msg.from.username : 'A friend';
        const gameName = window.Friends ? Friends.gameName(msg.game) : msg.game;
        toast(from + ' invites you to a ' + gameName + ' race.', [
          { label: 'Join', primary: true, run: () => MP.accept(msg.roomId) },
          { label: 'Not now', run: () => MP.decline(msg.roomId) }
        ], { sticky: true });
        break;
      }
      case 'score': {
        if (!MP.room) break;
        MP.room.scores[msg.user] = msg.value;
        paintScores();
        break;
      }
      case 'result': {
        if (!MP.room) MP.room = msg.room;
        const win = msg.winner && Number(msg.winner) === Number(MP.you);
        const draw = !msg.winner;
        const who = msg.winner ? nameOf(msg.winner) : null;
        const head = draw ? 'Dead heat' : (win ? 'You win!' : who + ' wins');
        const note = 'You ' + msg.yours + ' · ' + nameOf(themId()) + ' ' + msg.theirs;
        if (window.Arcade && Arcade.state !== 'menu') {
          clearCountdown();
          Arcade.state = 'dead';
          MP.resultOpen = true;
          Arcade.overlayToken = (Arcade.overlayToken || 0) + 1; // cancel any pending single-player overlay
          const ov = $('overlay');
          if (ov) {
            ov.classList.add('is-visible');
            ov.setAttribute('data-mode', 'dead');
            $('ovEyebrow').textContent = 'Race result';
            $('ovTitle').textContent = head;
            $('ovText').textContent = note;
            $('ovStats').hidden = true;
            $('ovBtn').textContent = 'Rematch';
            $('ovNote').textContent = 'Press Space for a rematch, or Leave in the bar below.';
          }
        }
        el.state.textContent = head;
        break;
      }
      case 'roomEnd': {
        const reason = msg.reason;
        if (MP.room) {
          toast(reason === 'disconnected' ? 'Your friend disconnected — match over.' : 'Match ended.');
        }
        MP.teardown(reason === 'disconnected' ? 'left' : 'left');
        break;
      }
      case 'error': {
        if (msg.message) toast(msg.message, null, { warn: true });
        if (MP.room && !MP.room.startedAt) {
          MP.teardown('keep');
        }
        break;
      }
      default:
        break;
    }
  });

  MP.rematch = function () {
    if (!MP.room) return;
    Net.send({ t: 'rematch', round: (MP.room.rematch || 0) + 1 });
  };

  // keeps the bar honest when the account layer re-syncs
  MP.sync = function () {
    if (!MP.room) return;
    showBar(MP.room.startedAt ? 'Racing' : 'Waiting');
    paintScores();
  };

  /* ---------------- hooks into the arcade ---------------- */

  function patchArcade() {
    if (!window.Arcade || Arcade.__mpPatched) return;
    Arcade.__mpPatched = true;

    const setScore = Arcade.setScore;
    Arcade.setScore = function (value) {
      setScore.call(this, value);
      if (MP.room && MP.room.startedAt && Arcade.state === 'playing') report(false);
    };

    const die = Arcade.die;
    Arcade.die = function (reason) {
      die.call(this, reason);
      if (MP.room && MP.room.startedAt) finish();
    };

    const restart = Arcade.restart;
    Arcade.restart = function () {
      if (MP.resultOpen && MP.room) { MP.rematch(); return; }
      restart.call(this);
    };

    const begin = Arcade.begin;
    Arcade.begin = function () {
      begin.call(this);
      if (MP.room && MP.room.startedAt) {
        MP.finished = false;
        MP.lastSent = -1;
        showBar('Racing');
      }
    };

    const close = Arcade.closeGame;
    Arcade.closeGame = function () {
      if (MP.room && MP.room.startedAt && !MP.finished && Arcade.state === 'playing') finish();
      close.call(this);
    };
  }

  function init() {
    el.bar = $('mpBar');
    el.state = $('mpState');
    el.youScore = $('mpYou');
    el.themScore = $('mpThem');
    el.themName = $('mpThemName');
    el.leave = $('mpLeave');
    el.mpBtn = $('mpBtn');
    if (!el.bar) return;

    patchArcade();

    if (el.leave) el.leave.addEventListener('click', () => MP.leave());
    if (el.mpBtn) {
      el.mpBtn.addEventListener('click', () => {
        if (!Auth.user) { Auth.openGate(); return; }
        if (MP.room) {
          toast('In a match with ' + nameOf(themId()) + '.', null);
          return;
        }
        if (window.Friends) Friends.openDrawer(Arcade.gameId || null);
      });
    }

    Net.on('auth', () => { patchArcade(); });
  }

  // allow attaching to games that start before the DOM is ready
  MP.patch = patchArcade;

  document.addEventListener('DOMContentLoaded', init);
  window.MP = MP;
})();

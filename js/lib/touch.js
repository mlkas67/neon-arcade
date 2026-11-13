/* ============================================================
   Legeniko Arcade — on-screen controls for phones and tablets
   Pads write into the same key codes the games already read, so
   there is exactly one input path to reason about.
   ============================================================ */
(function () {
  'use strict';

  const PADS = {
    // tap-anywhere games: the canvas frame already forwards a tap
    gd: { tap: 'TAP TO JUMP' },
    flappy: { tap: 'TAP TO FLAP' },
    rocks: { tap: 'HOLD TO FLY' },
    snake: { tap: 'DRAG TO TURN' },
    p2048: { tap: 'SWIPE TO SLIDE' },
    memory: { tap: 'TAP TO FLIP' },
    whack: { tap: 'TAP THE BOTS' },

    break: { hold: [['ArrowLeft', '\u25C0', 'left'], ['ArrowRight', '\u25B6', 'right']] },
    pong: { hold: [['ArrowUp', '\u25B2', 'left'], ['ArrowDown', '\u25BC', 'right']] },
    vice: {
      hold: [
        ['ArrowLeft', '\u25C0', 'left'],
        ['ArrowRight', '\u25B6', 'left'],
        ['ArrowUp', 'GAS', 'right'],
        ['ArrowDown', 'BRAKE', 'right'],
        ['Space', 'DRIFT', 'right']
      ]
    },
    ridge: {
      hold: [
        ['ArrowLeft', '\u25C0', 'left'],
        ['ArrowRight', '\u25B6', 'left'],
        ['ArrowUp', 'TUCK', 'right'],
        ['Space', 'JUMP', 'right']
      ]
    },
    deck: {
      hold: [
        ['ArrowLeft', '\u25C0', 'left'],
        ['ArrowRight', '\u25B6', 'left'],
        ['ArrowUp', 'PUSH', 'right'],
        ['Space', 'TRICK', 'right']
      ]
    }
  };

  // fullscreen works with a mouse too, so it is set up even without touch
  function initStageChrome() {
    /* ------------- fullscreen + landscape ------------- */
    const fsBtn = document.getElementById('fsBtn');
    const fsRoot = document.getElementById('stageScreen');
    const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

    function isFull() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function goFull() {
      const req = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
      if (!req) return;
      const p = req.call(fsRoot, { navigationUI: 'hide' });
      if (p && p.then) {
        p.then(function () {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function () { /* phones that refuse it */ });
          }
        }).catch(function () { /* user gesture rules, ignore */ });
      }
    }

    function exitFull() {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) ex.call(document);
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    }

    function syncFs() {
      if (!fsBtn) return;
      fsBtn.textContent = isFull() ? '\u2715' : '\u26F6';
      fsBtn.setAttribute('aria-label', isFull() ? 'Exit full screen' : 'Full screen');
      fsBtn.title = isFull() ? 'Exit full screen' : 'Full screen';
      document.documentElement.classList.toggle('is-fullscreen', isFull());
    }

    if (fsBtn && fsSupported) {
      fsBtn.hidden = false;
      fsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isFull()) exitFull(); else goFull();
      });
      document.addEventListener('fullscreenchange', syncFs);
      document.addEventListener('webkitfullscreenchange', syncFs);
      syncFs();
    }
  }

  const supportsTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  let forced = null;
  try { forced = new URLSearchParams(window.location.search).get('touch'); } catch (e) { /* old browser */ }
  const enabled = forced === '1' || (forced !== '0' && supportsTouch);
  if (enabled) document.documentElement.classList.add('touch');

  /* ------------- a key press the games can see ------------- */
  function fire(type, code) {
    let ev;
    try {
      ev = new KeyboardEvent(type, { code: code, key: code, bubbles: true, cancelable: true });
    } catch (e) {
      ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
      ev.code = code;
    }
    window.dispatchEvent(ev);
  }

  function hold(code) {
    if (window.Arcade && Arcade.state === 'playing') {
      fire('keydown', code);
      return true;
    }
    return false;
  }

  const stage = document.getElementById('stageScreen');
  const frame = document.getElementById('canvasFrame');
  if (!stage || !frame) return;

  /* ------------- the pad itself ------------- */
  const pad = document.createElement('div');
  pad.className = 'touchpad';
  pad.setAttribute('aria-hidden', 'true');
  const halves = {
    left: document.createElement('div'),
    right: document.createElement('div')
  };
  halves.left.className = 'touchpad-half touchpad-left';
  halves.right.className = 'touchpad-half touchpad-right';
  pad.appendChild(halves.left);
  pad.appendChild(halves.right);
  // dock the pads under the picture so they never cover the playfield
  frame.parentNode.insertBefore(pad, frame.nextSibling);

  const tapHint = document.createElement('div');
  tapHint.className = 'touch-tap-hint';
  frame.appendChild(tapHint);

  // each button owns the pointer that pressed it, so sliding a thumb off
  // releases the key instead of sticking
  const active = new Map();

  function releaseAll() {
    active.forEach(function (code, pointerId) { fire('keyup', code); active.delete(pointerId); });
  }

  function makeButton(code, label, side) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'touch-btn' + (label.length > 2 ? ' is-word' : '');
    b.textContent = label;
    b.dataset.code = code;

    b.addEventListener('pointerdown', function (e) {
      // keep the click out of the canvas frame: a tap there would also
      // trigger the game's primary action
      e.preventDefault();
      e.stopPropagation();
      if (active.has(e.pointerId)) return;
      if (!hold(code)) return;
      active.set(e.pointerId, code);
      b.classList.add('is-down');
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* no capture support */ }
    });

    function up(e) {
      const held = active.get(e.pointerId);
      if (held == null) return;
      active.delete(e.pointerId);
      b.classList.remove('is-down');
      fire('keyup', held);
    }
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }

  let current = null;

  function build(id) {
    current = id;
    const cfg = PADS[id] || {};
    halves.left.textContent = '';
    halves.right.textContent = '';
    pad.classList.toggle('is-empty', !cfg.hold);
    tapHint.textContent = cfg.tap || '';
    tapHint.classList.toggle('is-on', !!cfg.tap);
    if (!cfg.hold) return;
    cfg.hold.forEach(function (b) {
      halves[b[2]].appendChild(makeButton(b[0], b[1], b[2]));
    });
  }

  build(null);

  const openGame = window.Arcade && window.Arcade.openGame;
  if (openGame) {
    window.Arcade.openGame = function (id) {
      releaseAll();
      build(id);
      return openGame.apply(this, arguments);
    };
  }
  const closeGame = window.Arcade && window.Arcade.closeGame;
  if (closeGame) {
    window.Arcade.closeGame = function () {
      releaseAll();
      build(null);
      return closeGame.apply(this, arguments);
    };
  }

  // leaving the page or hiding the tab must not leave a key stuck down
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

  initStageChrome();
})();

/* ============================================================
   Neon Arcade — core engine
   Fixed-timestep loop, input, sound, effects, UI plumbing.
   Games implement: reset(), update(dt), draw(ctx, dt),
   action(), updateDeath(dt)  (optional)
   ============================================================ */
(function () {
  'use strict';

  const W = 960;
  const H = 540;
  const STEP = 1 / 120;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  /* ---------------- HiDPI backing store ---------------- */
  function fitCanvas() {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(W * dpr);
    const h = Math.round(H * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  /* ---------------- storage ---------------- */
  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('neon.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('neon.' + key, JSON.stringify(value));
      } catch (e) { /* private mode — scores just won't persist */ }
    }
  };

  /* ---------------- sound ---------------- */
  const Sound = {
    enabled: Store.get('sound', true) !== false,
    ctx: null,

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    tone(freq, dur, opts) {
      if (!this.enabled) return;
      const ac = this.ensure();
      if (!ac) return;
      const o = opts || {};
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
      const vol = o.vol == null ? 0.12 : o.vol;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },

    jump() { this.tone(360, 0.13, { type: 'square', to: 620, vol: 0.05 }); },
    flap() { this.tone(520, 0.09, { type: 'triangle', to: 760, vol: 0.07 }); },
    point() { this.tone(880, 0.09, { type: 'sine', vol: 0.09 }); this.tone(1320, 0.12, { type: 'sine', vol: 0.06 }); },
    hit() { this.tone(180, 0.28, { type: 'sawtooth', to: 48, vol: 0.1 }); },
    land() { this.tone(150, 0.07, { type: 'sine', vol: 0.05 }); },
    start() { this.tone(440, 0.08, { type: 'triangle', vol: 0.07 }); this.tone(660, 0.1, { type: 'triangle', vol: 0.06 }); },
    best() { [660, 880, 1100].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, { type: 'triangle', vol: 0.08 }), i * 90)); }
  };

  /* ---------------- particle + shake effects ---------------- */
  const Fx = {
    parts: [],
    shake: 0,
    shakeT: 0,

    burst(x, y, opts) {
      const o = opts || {};
      const n = o.count || 18;
      for (let i = 0; i < n; i++) {
        const a = o.angle == null ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread || Math.PI);
        const sp = (o.speed || 260) * (0.35 + Math.random() * 0.9);
        this.parts.push({
          x: x, y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.lift || 0),
          life: 0,
          max: (o.life || 0.7) * (0.65 + Math.random() * 0.6),
          size: (o.size || 5) * (0.6 + Math.random() * 0.8),
          color: Array.isArray(o.colors) ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#34e0ff'),
          gravity: o.gravity == null ? 900 : o.gravity,
          drag: o.drag == null ? 0.99 : o.drag,
          shape: o.shape || 'rect',
          spin: (Math.random() - 0.5) * 14,
          rot: Math.random() * Math.PI
        });
      }
      if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    },

    kick(mag) {
      this.shake = Math.max(this.shake, mag);
      this.shakeT = 0.3;
    },

    update(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life += dt;
        if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
      if (this.shake > 0) {
        this.shakeT -= dt;
        this.shake *= Math.pow(0.0015, dt);
        if (this.shakeT <= 0 || this.shake < 0.4) this.shake = 0;
      }
    },

    draw(c) {
      for (const p of this.parts) {
        const k = 1 - p.life / p.max;
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.color;
        if (p.shape === 'circle') {
          c.beginPath();
          c.arc(0, 0, p.size * k, 0, Math.PI * 2);
          c.fill();
        } else if (p.shape === 'spark') {
          c.fillRect(-p.size * 1.6 * k, -1, p.size * 3.2 * k, 2);
        } else {
          c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        c.restore();
      }
    },

    clear() { this.parts.length = 0; this.shake = 0; }
  };

  /* ---------------- DOM refs ---------------- */
  const el = {
    menu: document.getElementById('menuScreen'),
    stage: document.getElementById('stageScreen'),
    overlay: document.getElementById('overlay'),
    card: document.querySelector('.overlay-card'),
    ovEyebrow: document.getElementById('ovEyebrow'),
    ovTitle: document.getElementById('ovTitle'),
    ovText: document.getElementById('ovText'),
    ovStats: document.getElementById('ovStats'),
    ovScore: document.getElementById('ovScore'),
    ovBest: document.getElementById('ovBest'),
    ovBtn: document.getElementById('ovBtn'),
    ovNote: document.getElementById('ovNote'),
    stageTitle: document.getElementById('stageTitle'),
    hudScore: document.getElementById('hudScore'),
    hudBest: document.getElementById('hudBest'),
    hudHint: document.getElementById('hudHint'),
    pauseBtn: document.getElementById('pauseBtn'),
    backBtn: document.getElementById('backBtn'),
    cornerHint: document.getElementById('cornerHint'),
    soundBtn: document.getElementById('soundBtn')
  };

  /* ---------------- Arcade ---------------- */
  const Arcade = {
    W: W,
    H: H,
    canvas: canvas,
    ctx: ctx,
    fx: Fx,
    Sound: Sound,
    Store: Store,
    state: 'menu',
    gameId: null,
    game: null,
    score: 0,
    best: 0,
    inputLock: 0,
    overlayToken: 0
  };

  Arcade.say = function (msg) { if (el.ovNote) el.ovNote.textContent = msg || ''; };

  Arcade.setScore = function (value) {
    const v = Math.max(0, Math.floor(value));
    if (v === this.score) return;
    this.score = v;
    el.hudScore.textContent = v;
    if (v > this.best) {
      this.best = v;
      el.hudBest.textContent = v;
    }
  };

  Arcade.saveBest = function () {
    if (!this.gameId) return;
    const key = 'best.' + this.gameId;
    const prev = Store.get(key, 0) || 0;
    if (this.best > prev) Store.set(key, this.best);
    else this.best = prev;
  };

  /* ---------------- overlay ---------------- */
  function showOverlay(mode, data) {
    const d = data || {};
    el.overlay.classList.add('is-visible');
    el.overlay.setAttribute('data-mode', mode);
    el.card.classList.toggle('flappy-theme', Arcade.gameId === 'flappy');

    if (mode === 'start') {
      el.ovEyebrow.textContent = d.title || '';
      el.ovTitle.textContent = d.heading || 'Ready?';
      el.ovText.innerHTML = d.text || '';
      el.ovStats.hidden = true;
      el.ovBtn.textContent = d.button || 'Start';
      el.ovNote.textContent = d.note || '';
    } else if (mode === 'paused') {
      el.ovEyebrow.textContent = d.title || '';
      el.ovTitle.textContent = 'Paused';
      el.ovText.textContent = 'Take a breath. Your run is exactly where you left it.';
      el.ovStats.hidden = true;
      el.ovBtn.textContent = 'Resume';
      el.ovNote.textContent = 'Press P or Space to resume';
    } else if (mode === 'dead') {
      const isBest = d.isBest;
      el.ovEyebrow.textContent = d.title || '';
      el.ovTitle.textContent = d.heading || 'Wiped out';
      el.ovText.textContent = d.text || '';
      el.ovStats.hidden = false;
      el.ovScore.textContent = Arcade.score;
      el.ovBest.textContent = Arcade.best;
      el.ovBtn.textContent = 'Retry';
      el.ovNote.textContent = isBest ? '★ NEW BEST — nice.' : 'Best so far: ' + Arcade.best;
      if (isBest) Sound.best();
    }
    hideHint(false);
  }

  function hideOverlay() {
    el.overlay.classList.remove('is-visible');
    hideHint(true);
  }

  function hideHint(hide) {
    el.cornerHint.classList.toggle('is-hidden', !!hide);
  }

  /* ---------------- flow ---------------- */
  function blurActive() {
    const active = document.activeElement;
    if (active && active.blur && active !== document.body) active.blur();
  }

  Arcade.openGame = function (id) {
    if (this.state !== 'menu') return;
    const game = window.Games && window.Games[id];
    if (!game) return;
    blurActive();
    this.menuScroll = window.scrollY;
    this.gameId = id;
    this.game = game;
    this.score = 0;
    this.best = Store.get('best.' + id, 0) || 0;
    this.bestAtStart = this.best;
    Fx.clear();

    el.menu.classList.remove('is-active');
    el.stage.classList.add('is-active');
    el.stageTitle.textContent = game.title;
    el.pauseBtn.textContent = 'Pause';
    el.pauseBtn.hidden = false;
    el.hudScore.textContent = '0';
    el.hudBest.textContent = this.best;
    el.hudHint.textContent = game.tip || '';

    game.reset(this);
    this.state = 'ready';
    showOverlay('start', {
      title: game.title,
      heading: game.readyHeading || 'Ready?',
      text: game.readyText || 'Press <kbd>Space</kbd> or tap the arena to start.',
      button: 'Start',
      note: game.controlHint || ''
    });
    this.inputLock = 0;
    Sound.ensure();
  };

  Arcade.closeGame = function () {
    const leaving = this.game;
    this.state = 'menu';
    this.gameId = null;
    this.game = null;
    if (leaving && typeof leaving.destroy === 'function') leaving.destroy();
    Fx.clear();
    hideOverlay();
    el.stage.classList.remove('is-active');
    el.menu.classList.add('is-active');
    refreshMenuBests();
    window.scrollTo(0, this.menuScroll || 0);
  };

  Arcade.begin = function () {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.score = 0;
    el.hudScore.textContent = '0';
    hideOverlay();
    this.inputLock = performance.now() + 120;
    Sound.start();
    if (this.game.onStart) this.game.onStart();
  };

  Arcade.pause = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    el.pauseBtn.textContent = 'Resume';
    showOverlay('paused', { title: this.game.title });
    if (this.game.onPause) this.game.onPause();
  };

  Arcade.resume = function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    el.pauseBtn.textContent = 'Pause';
    hideOverlay();
    this.inputLock = performance.now() + 120;
  };

  Arcade.togglePause = function () {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  };

  Arcade.restart = function () {
    if (!this.game) return;
    this.saveBest();
    Fx.clear();
    this.score = 0;
    el.hudScore.textContent = '0';
    this.game.reset(this);
    this.best = Math.max(this.best, Store.get('best.' + this.gameId, 0) || 0);
    el.hudBest.textContent = this.best;
    this.state = 'ready';
    this.begin();
  };

  Arcade.die = function (reason) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    const isBest = this.score > (this.bestAtStart || 0) && this.score > 0;
    this.saveBest();
    if (this.game.onDeath) this.game.onDeath(reason);
    const token = ++this.overlayToken;
    const delay = this.game.overlayDelay == null ? 650 : this.game.overlayDelay;
    const self = this;
    setTimeout(function () {
      if (token !== self.overlayToken) return;
      if (self.state !== 'dead') return;
      showOverlay('dead', {
        title: self.game.title,
        heading: self.game.deadHeading || 'Wiped out',
        text: self.game.deadText || '',
        isBest: isBest
      });
    }, delay);
  };

  /* ---------------- input ---------------- */
  function primaryAction() {
    if (performance.now() < Arcade.inputLock) return;
    switch (Arcade.state) {
      case 'ready':
        Arcade.begin();
        break;
      case 'playing':
        if (Arcade.game && Arcade.game.action) Arcade.game.action();
        break;
      case 'paused':
        Arcade.resume();
        break;
      case 'dead':
        if (el.overlay.classList.contains('is-visible')) Arcade.restart();
        break;
    }
  }
  Arcade.primaryAction = primaryAction;

  window.addEventListener('keydown', function (e) {
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp')) {
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'Space':
        if (Arcade.state !== 'menu') {
          e.preventDefault();
          primaryAction();
        }
        break;
      case 'ArrowUp':
      case 'KeyW':
        if (Arcade.state !== 'menu') {
          e.preventDefault();
          // games that steer with the up arrow handle it themselves
          if (!(Arcade.game && Arcade.game.usesArrowUp)) primaryAction();
        }
        break;
      case 'Enter':
        if (Arcade.state === 'ready' || Arcade.state === 'dead' || Arcade.state === 'paused') {
          e.preventDefault();
          primaryAction();
        }
        break;
      case 'KeyP':
      case 'Escape':
        if (Arcade.state === 'playing' || Arcade.state === 'paused') {
          e.preventDefault();
          Arcade.togglePause();
        }
        break;
      case 'KeyR':
        if (Arcade.state === 'playing' || Arcade.state === 'paused' || Arcade.state === 'dead') {
          e.preventDefault();
          if (Arcade.state === 'dead') Arcade.restart();
          else Arcade.restart();
        }
        break;
    }
  });

  let pointerDown = false;
  const frame = document.getElementById('canvasFrame');
  frame.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    pointerDown = true;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    primaryAction();
    if (Arcade.game && Arcade.game.onHoldStart && Arcade.state === 'playing') Arcade.game.onHoldStart();
  });
  window.addEventListener('pointerup', function () {
    if (!pointerDown) return;
    pointerDown = false;
    if (Arcade.game && Arcade.game.onHoldEnd) Arcade.game.onHoldEnd();
  });
  window.addEventListener('pointercancel', function () {
    pointerDown = false;
    if (Arcade.game && Arcade.game.onHoldEnd) Arcade.game.onHoldEnd();
  });
  frame.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------------- overlay button ---------------- */
  el.ovBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (Arcade.state === 'paused') Arcade.resume();
    else if (Arcade.state === 'dead') Arcade.restart();
    else primaryAction();
    blurActive();
  });

  el.pauseBtn.addEventListener('click', function () {
    if (Arcade.state === 'playing') Arcade.pause();
    else if (Arcade.state === 'paused') Arcade.resume();
    blurActive();
  });

  el.backBtn.addEventListener('click', function () { Arcade.closeGame(); });
  document.getElementById('brandLink').addEventListener('click', function (e) {
    e.preventDefault();
    Arcade.closeGame();
  });

  /* ---------------- sound toggle ---------------- */
  function paintSoundBtn() {
    el.soundBtn.classList.toggle('is-off', !Sound.enabled);
    el.soundBtn.title = Sound.enabled ? 'Sound on' : 'Sound off';
    el.soundBtn.firstElementChild.textContent = Sound.enabled ? '🔊' : '🔇';
  }
  el.soundBtn.addEventListener('click', function () {
    Sound.enabled = !Sound.enabled;
    Store.set('sound', Sound.enabled);
    paintSoundBtn();
    if (Sound.enabled) Sound.tone(660, 0.1, { type: 'triangle', vol: 0.08 });
  });
  paintSoundBtn();

  /* ---------------- menu bests ---------------- */
  function refreshMenuBests() {
    document.querySelectorAll('[data-best]').forEach(function (node) {
      const key = node.getAttribute('data-best');
      node.textContent = Store.get('best.' + key, 0) || 0;
    });
  }
  Arcade.refreshMenuBests = refreshMenuBests;
  refreshMenuBests();

  /* ---------------- loop ---------------- */
  let lastTime = 0;
  let accum = 0;

  function tick(t) {
    if (!lastTime) lastTime = t;
    let dt = (t - lastTime) / 1000;
    lastTime = t;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;

    const game = Arcade.game;
    if (game) {
      if (Arcade.state === 'playing') {
        accum += dt;
        let guard = 0;
        while (accum >= STEP && guard++ < 16) {
          game.update(STEP);
          accum -= STEP;
          if (Arcade.state !== 'playing') break;
        }
        if (Arcade.state !== 'playing') accum = 0;
        Fx.update(dt);
      } else if (Arcade.state === 'dead') {
        if (game.updateDeath) game.updateDeath(dt);
        Fx.update(dt);
      }
    } else {
      Fx.update(dt);
    }

    // draw
    ctx.save();
    if (Fx.shake > 0.4 && Arcade.state !== 'paused') {
      const m = Fx.shake;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    if (game) game.draw(ctx, dt);
    else drawIdle();
    ctx.restore();
    Fx.draw(ctx);

    requestAnimationFrame(tick);
  }

  function drawIdle() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#080812');
    g.addColorStop(1, '#0f0f22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- visibility ---------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && Arcade.state === 'playing') Arcade.pause();
  });
  window.addEventListener('blur', function () {
    if (Arcade.state === 'playing') Arcade.pause();
  });

  window.Arcade = Arcade;
  window.Games = window.Games || {};

  /* ---------------- shared drawing helpers ---------------- */
  Arcade.util = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    },
    shadow(c, color, blur) {
      c.shadowColor = color;
      c.shadowBlur = blur;
    },
    noShadow(c) {
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
    },
    // pointer position in the 960x540 game space, whatever the canvas is scaled to
    eventPoint(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (W / r.width),
        y: (e.clientY - r.top) * (H / r.height)
      };
    }
  };

  requestAnimationFrame(tick);
})();

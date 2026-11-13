/* ============================================================
   Neon Arcade — Memory Grid
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const COLS = 4, ROWS = 4;
  const CARD = 104, GAP = 16;
  const GRID_W = COLS * CARD + (COLS - 1) * GAP;
  const GRID_H = ROWS * CARD + (ROWS - 1) * GAP;
  const GX = (W - GRID_W) / 2;
  const GY = (H - GRID_H) / 2 + 12;

  const GLYPHS = ['⚡', '🚀', '💎', '🎧', '🍄', '⭐', '🔥', '🐙'];

  const game = {
    title: 'Memory Grid',
    readyHeading: 'Find every pair',
    readyText: 'Click or tap two cards. Match all eight pairs in as few moves as you can.',
    controlHint: 'Fewer moves, higher score',
    tip: 'Click / tap cards · match all 8 pairs',
    deadHeading: 'Grid cleared',
    deadText: '',
    overlayDelay: 650,

    reset() {
      const deck = [];
      for (const g of GLYPHS) { deck.push(g); deck.push(g); }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = U.randInt(0, i);
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      this.cards = deck.map((g, i) => ({
        g,
        x: GX + (i % COLS) * (CARD + GAP),
        y: GY + Math.floor(i / COLS) * (CARD + GAP),
        up: false,
        done: false,
        wob: 0
      }));
      this.open = [];
      this.wait = 0;
      this.moves = 0;
      this.matched = 0;
      this.points = 0;
      this.bindOnce();
      A.setScore(0);
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      A.canvas.addEventListener('pointerdown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'memory') return;
        const p = U.eventPoint(e);
        this.pick(p.x, p.y);
      });
    },

    action() {},

    pick(x, y) {
      if (this.wait > 0) return;
      for (const c of this.cards) {
        if (c.done || c.up) continue;
        if (x >= c.x && x <= c.x + CARD && y >= c.y && y <= c.y + CARD) {
          c.up = true;
          c.wob = 1;
          A.Sound.tone(520 + this.open.length * 130, 0.07, { type: 'triangle', vol: 0.05 });
          this.open.push(c);
          if (this.open.length === 2) this.resolve();
          return;
        }
      }
    },

    resolve() {
      if (this.open.length < 2) return;
      this.moves++;
      const [a, b] = this.open;
      if (a.g === b.g) {
        a.done = b.done = true;
        this.matched++;
        this.open = [];
        this.points = (this.points || 0) + 40;
        A.setScore(this.points);
        A.Sound.point();
        A.fx.burst(a.x + CARD / 2, a.y + CARD / 2, { count: 12, colors: ['#4ade80', '#ffffff'], speed: 200, life: 0.5, size: 4 });
        A.fx.burst(b.x + CARD / 2, b.y + CARD / 2, { count: 12, colors: ['#4ade80', '#ffffff'], speed: 200, life: 0.5, size: 4 });
        if (this.matched === GLYPHS.length) {
          const bonus = Math.max(0, 300 - this.moves * 12);
          this.points += bonus;
          A.setScore(this.points);
          this.deadText = 'Cleared in ' + this.moves + ' moves. Move bonus +' + bonus + '.';
          setTimeout(() => A.die('cleared'), 450);
        }
      } else {
        this.wait = 0.65;
        A.Sound.tone(180, 0.12, { type: 'sawtooth', vol: 0.04 });
      }
    },

    update(dt) {
      for (const c of this.cards) if (c.wob > 0) c.wob = Math.max(0, c.wob - dt * 4);
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0) {
          for (const c of this.open) c.up = false;
          this.open = [];
        }
      }
    },

    onDeath() {
      A.Sound.best();
    },

    draw(c) {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0a0714');
      g.addColorStop(1, '#101a24');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      for (const card of this.cards) {
        const scale = 1 + card.wob * 0.06;
        const size = CARD * scale;
        const off = (CARD - size) / 2;

        c.save();
        c.translate(card.x + CARD / 2, card.y + CARD / 2);
        c.translate(-CARD / 2, -CARD / 2);

        if (card.done) {
          c.fillStyle = 'rgba(74,222,128,0.14)';
          c.strokeStyle = 'rgba(74,222,128,0.65)';
          c.lineWidth = 2;
          c.shadowColor = 'rgba(74,222,128,0.6)';
          c.shadowBlur = 18;
        } else if (card.up) {
          c.fillStyle = 'rgba(52,224,255,0.14)';
          c.strokeStyle = 'rgba(52,224,255,0.8)';
          c.lineWidth = 2;
          c.shadowColor = 'rgba(52,224,255,0.6)';
          c.shadowBlur = 18;
        } else {
          c.fillStyle = 'rgba(255,255,255,0.05)';
          c.strokeStyle = 'rgba(255,255,255,0.14)';
          c.lineWidth = 1.5;
        }
        U.roundRect(c, off, off, size, size, 14);
        c.fill();
        c.stroke();
        U.noShadow(c);

        if (card.up || card.done) {
          c.font = Math.round(size * 0.46) + 'px "Segoe UI Emoji", system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.globalAlpha = card.done ? 0.75 : 1;
          c.fillText(card.g, CARD / 2, CARD / 2 + 2);
        } else {
          c.fillStyle = 'rgba(139,92,246,0.45)';
          c.font = 'bold 22px ui-monospace, monospace';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('?', CARD / 2, CARD / 2 + 1);
        }
        c.restore();
      }

      c.save();
      c.font = 'bold 14px ui-monospace, monospace';
      c.fillStyle = 'rgba(242,243,255,0.7)';
      c.textAlign = 'left';
      c.fillText('MOVES ' + this.moves, GX, GY - 22);
      c.textAlign = 'right';
      c.fillText('PAIRS ' + this.matched + ' / ' + GLYPHS.length, GX + GRID_W, GY - 22);
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.memory = game;
})();

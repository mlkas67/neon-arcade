/* ============================================================
   Neon Arcade — Whack-a-Bot
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const ROUND = 40;
  const COLS = 3, ROWS = 3;
  const HOLE_W = 190, HOLE_H = 118, GAP = 26;
  const GW = COLS * HOLE_W + (COLS - 1) * GAP;
  const GH = ROWS * HOLE_H + (ROWS - 1) * GAP;
  const GX = (W - GW) / 2;
  const GY = 96;

  const game = {
    title: 'Whack-a-Bot',
    readyHeading: '40 seconds. Go.',
    readyText: 'Click or tap the bots before they duck away. Gold bots are worth triple.',
    controlHint: 'Chain hits for a combo multiplier',
    tip: 'Click / tap the bots · chain hits for combos',
    deadHeading: "Time's up",
    deadText: 'The bots survive to beep another day.',
    overlayDelay: 700,

    reset() {
      this.holes = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          this.holes.push({
            x: GX + c * (HOLE_W + GAP),
            y: GY + r * (HOLE_H + GAP),
            up: 0,       // 0 hidden, otherwise 0..1 rise amount
            kind: 'bot',
            timer: 0,
            hit: 0
          });
        }
      }
      this.time = ROUND;
      this.points = 0;
      this.combo = 1;
      this.hits = 0;
      this.spawnTimer = 0.35;
      this.flash = 0;
      this.bindOnce();
      A.setScore(0);
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      A.canvas.addEventListener('pointerdown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'whack') return;
        const p = U.eventPoint(e);
        this.strike(p.x, p.y);
      });
    },

    action() {},

    strike(x, y) {
      for (const h of this.holes) {
        if (h.up <= 0.25) continue;
        if (x >= h.x && x <= h.x + HOLE_W && y >= h.y && y <= h.y + HOLE_H) {
          if (h.hit > 0) return;
          const worth = h.kind === 'gold' ? 30 : 10;
          this.points += worth * this.combo;
          this.hits++;
          this.combo = Math.min(5, this.combo + (h.kind === 'gold' ? 2 : 1));
          h.hit = 0.35;
          h.timer = Math.min(h.timer, 0.12);
          A.setScore(this.points);
          A.Sound.tone(h.kind === 'gold' ? 900 : 620, 0.08, { type: 'square', to: 320, vol: 0.06 });
          A.fx.burst(x, y, {
            count: 14,
            colors: h.kind === 'gold' ? ['#ffd166', '#ffffff'] : ['#ff4d9d', '#34e0ff'],
            speed: 260, life: 0.5, size: 4
          });
          return;
        }
      }
      // a swing and a miss costs a combo step
      this.combo = 1;
      A.Sound.tone(120, 0.08, { type: 'sine', vol: 0.03 });
    },

    update(dt) {
      this.time -= dt;
      if (this.flash > 0) this.flash -= dt;

      if (this.time <= 0) {
        this.time = 0;
        this.deadText = this.hits + ' bots whacked · best combo x' + this.combo;
        A.die('time');
        return;
      }

      // spawn
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const free = this.holes.filter((h) => h.timer <= 0 && h.up <= 0);
        if (free.length) {
          const h = free[U.randInt(0, free.length - 1)];
          h.kind = Math.random() < 0.16 ? 'gold' : 'bot';
          h.timer = U.rand(0.95, 1.55);
          h.hit = 0;
        }
        // the pace tightens as the clock runs down
        const t = 1 - this.time / ROUND;
        this.spawnTimer = U.rand(0.55, 0.95) - t * 0.22;
      }

      for (const h of this.holes) {
        if (h.timer > 0) {
          h.timer -= dt;
          h.up = Math.min(1, h.up + dt * 7);
          if (h.timer <= 0 && h.hit <= 0) {
            // ducked away before being hit
            if (h.up > 0.6) this.combo = 1;
          }
        } else {
          h.up = Math.max(0, h.up - dt * 6);
          if (h.hit > 0) h.hit -= dt;
        }
      }
    },

    onDeath() {
      A.Sound.hit();
      A.fx.kick(6);
    },

    drawBot(c, x, y, up, kind, hit) {
      const cx = x + HOLE_W / 2;
      const baseY = y + HOLE_H - 14;
      const rise = up * (HOLE_H - 54);
      const cy = baseY - rise;
      const color = kind === 'gold' ? '#ffd166' : '#34e0ff';

      c.save();
      c.translate(cx, cy);
      if (hit > 0) c.globalAlpha = Math.max(0, hit / 0.35);

      // body
      c.fillStyle = kind === 'gold' ? 'rgba(255,209,102,0.25)' : 'rgba(52,224,255,0.2)';
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.shadowColor = color;
      c.shadowBlur = 20;
      U.roundRect(c, -46, -44, 92, 84, 16);
      c.fill();
      c.stroke();
      U.noShadow(c);

      // eyes
      c.fillStyle = color;
      const blink = Math.sin(performance.now() / 220) > 0.93 ? 2 : 9;
      c.beginPath();
      c.arc(-18, -10, 11, 0, Math.PI * 2);
      c.arc(18, -10, 11, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#06070f';
      c.beginPath();
      c.arc(-18, -10, blink, 0, Math.PI * 2);
      c.arc(18, -10, blink, 0, Math.PI * 2);
      c.fill();

      // mouth
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 12, 16, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      c.restore();
    },

    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0b0718');
      g.addColorStop(1, '#150c22');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      for (const h of this.holes) {
        // socket
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.strokeStyle = 'rgba(139,92,246,0.35)';
        c.lineWidth = 2;
        U.roundRect(c, h.x, h.y, HOLE_W, HOLE_H, 18);
        c.fill();
        c.stroke();
        c.restore();

        if (h.up > 0) {
          c.save();
          U.roundRect(c, h.x, h.y, HOLE_W, HOLE_H, 18);
          c.clip();
          this.drawBot(c, h.x, h.y, h.up, h.kind, h.hit);
          c.restore();
        }
      }

      // combo
      if (this.combo > 1) {
        c.save();
        c.font = '900 26px ui-monospace, monospace';
        c.fillStyle = '#ffd166';
        c.shadowColor = '#ffd166';
        c.shadowBlur = 20;
        c.textAlign = 'right';
        c.fillText('x' + this.combo, GX + GW, GY - 22);
        c.restore();
      }

      // timer bar
      const k = Math.max(0, this.time / ROUND);
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.08)';
      U.roundRect(c, GX, 42, GW, 14, 7);
      c.fill();
      c.fillStyle = k < 0.25 ? '#ff4d9d' : '#34e0ff';
      c.shadowColor = c.fillStyle;
      c.shadowBlur = 16;
      U.roundRect(c, GX, 42, Math.max(3, GW * k), 14, 7);
      c.fill();
      U.noShadow(c);
      c.font = 'bold 15px ui-monospace, monospace';
      c.textAlign = 'left';
      c.fillStyle = 'rgba(242,243,255,0.8)';
      c.fillText(Math.ceil(this.time) + 's', GX, 30);
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.whack = game;
})();

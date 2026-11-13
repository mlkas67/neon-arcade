/* ============================================================
   Neon Arcade — Brick Breaker
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const PAD_W = 120, PAD_H = 14, PAD_Y = 486;
  const BALL_R = 9;
  const COLS = 11, ROWS = 5;
  const BRICK_GAP = 6;
  const FIELD_X = 60, FIELD_W = W - 120;
  const BRICK_W = (FIELD_W - BRICK_GAP * (COLS - 1)) / COLS;
  const BRICK_H = 26;
  const ROW_COLORS = ['#ff4d9d', '#8b5cf6', '#34e0ff', '#4ade80', '#ffd166'];

  const game = {
    title: 'Brick Breaker',
    readyHeading: 'Smash every brick',
    readyText: 'Mouse or <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Space</kbd> to launch.',
    controlHint: 'Keep the ball alive — clear the wall to level up',
    tip: 'Mouse / ← → move · Space launches · 3 lives',
    deadHeading: 'Out of balls',
    deadText: 'The wall won this time.',
    overlayDelay: 800,

    reset() {
      this.level = 1;
      this.lives = 3;
      this.total = 0;
      this.paddle = { x: W / 2, w: PAD_W };
      this.keys = { left: false, right: false };
      this.bricks = [];
      this.buildWall(1);
      this.ball = { x: W / 2, y: PAD_Y - 30, vx: 0, vy: 0, r: BALL_R, stuck: true };
      this.trail = [];
      this.flash = 0;
      this.bindOnce();
      A.setScore(0);
    },

    buildWall(level) {
      this.bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          // later levels drop a few bricks so the wall gets holes
          if (level > 1 && Math.random() < 0.12 + (level - 1) * 0.05) continue;
          this.bricks.push({
            x: FIELD_X + c * (BRICK_W + BRICK_GAP),
            y: 96 + r * (BRICK_H + BRICK_GAP),
            w: BRICK_W,
            h: BRICK_H,
            color: ROW_COLORS[r % ROW_COLORS.length],
            hits: level >= 3 && r < 2 ? 2 : 1,
            sh: 0
          });
        }
      }
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener('keydown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'break') return;
        if (e.code.indexOf('Arrow') === 0) e.preventDefault();
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = true;
      });
      window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      });
      A.canvas.addEventListener('pointermove', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'break') return;
        const p = U.eventPoint(e);
        this.paddle.x = p.x;
      });
      A.canvas.addEventListener('pointerdown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'break') return;
        const p = U.eventPoint(e);
        this.paddle.x = p.x;
      });
    },

    onStart() {
      this.serve();
    },

    serve() {
      this.ball.stuck = true;
      this.ball.x = this.paddle.x;
      this.ball.y = PAD_Y - this.ball.r - 2;
      this.ball.vx = 0;
      this.ball.vy = 0;
    },

    launch() {
      if (!this.ball.stuck) return;
      this.ball.stuck = false;
      const speed = 430 + (this.level - 1) * 40;
      const angle = U.rand(-0.55, 0.55) - Math.PI / 2;
      this.ball.vx = Math.cos(angle) * speed;
      this.ball.vy = Math.sin(angle) * speed;
      A.Sound.tone(520, 0.1, { type: 'square', to: 760, vol: 0.05 });
    },

    action() {
      this.launch();
    },

    onDeath() {
      A.fx.burst(this.ball.x, this.ball.y, { count: 26, colors: ['#ff4d9d', '#ffffff'], speed: 330, life: 0.8 });
      A.Sound.hit();
      A.fx.kick(8);
    },

    update(dt) {
      const pad = this.paddle;
      const speed = 760;
      if (this.keys.left) pad.x -= speed * dt;
      if (this.keys.right) pad.x += speed * dt;
      pad.x = U.clamp(pad.x, FIELD_X + pad.w / 2, FIELD_X + FIELD_W - pad.w / 2);

      const b = this.ball;
      if (b.stuck) {
        b.x = pad.x;
        b.y = PAD_Y - b.r - 2;
        return;
      }

      // sub-step so a fast ball cannot tunnel through a brick
      const steps = Math.max(1, Math.ceil((Math.abs(b.vx) + Math.abs(b.vy)) * dt / 6));
      for (let s = 0; s < steps; s++) this.step(dt / steps);
    },

    step(dt) {
      const b = this.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // walls
      if (b.x - b.r < FIELD_X) { b.x = FIELD_X + b.r; b.vx = Math.abs(b.vx); this.blip(); }
      if (b.x + b.r > FIELD_X + FIELD_W) { b.x = FIELD_X + FIELD_W - b.r; b.vx = -Math.abs(b.vx); this.blip(); }
      if (b.y - b.r < 60) { b.y = 60 + b.r; b.vy = Math.abs(b.vy); this.blip(); }

      // paddle
      const pad = this.paddle;
      if (b.vy > 0 && b.y + b.r >= PAD_Y && b.y - b.r <= PAD_Y + PAD_H &&
          b.x >= pad.x - pad.w / 2 - b.r && b.x <= pad.x + pad.w / 2 + b.r) {
        b.y = PAD_Y - b.r;
        const off = U.clamp((b.x - pad.x) / (pad.w / 2), -1, 1);
        const sp = Math.min(760, Math.hypot(b.vx, b.vy) * 1.015);
        const angle = -Math.PI / 2 + off * 1.05;
        b.vx = Math.cos(angle) * sp;
        b.vy = Math.sin(angle) * sp;
        A.Sound.tone(300, 0.06, { type: 'square', vol: 0.05 });
        A.fx.burst(b.x, b.y, { count: 6, colors: ['#34e0ff'], speed: 150, life: 0.3, gravity: 0 });
      }

      // bricks
      for (let i = this.bricks.length - 1; i >= 0; i--) {
        const k = this.bricks[i];
        if (b.x + b.r < k.x || b.x - b.r > k.x + k.w || b.y + b.r < k.y || b.y - b.r > k.y + k.h) continue;

        const overlapX = Math.min(b.x + b.r - k.x, k.x + k.w - (b.x - b.r));
        const overlapY = Math.min(b.y + b.r - k.y, k.y + k.h - (b.y - b.r));
        if (overlapX < overlapY) {
          b.vx = -b.vx;
          b.x += b.vx > 0 ? overlapX : -overlapX;
        } else {
          b.vy = -b.vy;
          b.y += b.vy > 0 ? overlapY : -overlapY;
        }

        k.hits--;
        if (k.hits <= 0) {
          this.bricks.splice(i, 1);
          this.total += 10 * this.level;
          A.setScore(this.total);
          A.fx.burst(k.x + k.w / 2, k.y + k.h / 2, {
            count: 12, colors: [k.color, '#ffffff'], speed: 240, life: 0.5, size: 4
          });
          A.Sound.tone(660 + this.bricks.length * 3, 0.06, { type: 'triangle', vol: 0.05 });
        } else {
          k.sh = 0.18;
          A.fx.burst(k.x + k.w / 2, k.y + k.h / 2, { count: 4, colors: [k.color], speed: 140, life: 0.3, size: 3 });
        }
        break;
      }

      // floor
      if (b.y - b.r > H + 20) this.loseLife();

      if (this.bricks.length === 0) this.nextLevel();
    },

    blip() {
      A.Sound.tone(240, 0.04, { type: 'square', vol: 0.035 });
    },

    loseLife() {
      this.lives--;
      A.Sound.hit();
      A.fx.kick(10);
      A.fx.burst(this.ball.x, H - 10, { count: 20, colors: ['#ff4d9d', '#ffd166'], speed: 300, life: 0.7 });
      if (this.lives <= 0) {
        A.die('lives');
        return;
      }
      this.serve();
    },

    nextLevel() {
      this.total += 250;
      A.setScore(this.total);
      A.Sound.best();
      this.flash = 0.5;
      this.level++;
      const kept = this.ball;
      this.buildWall(this.level);
      this.serve();
      this.ball.stuck = false;
      const speed = 430 + (this.level - 1) * 40;
      const angle = U.rand(-0.5, 0.5) - Math.PI / 2;
      this.ball.vx = Math.cos(angle) * speed;
      this.ball.vy = Math.sin(angle) * speed;
      this.ball.r = kept.r;
    },

    draw(c, dt) {
      // backdrop
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070711');
      g.addColorStop(1, '#120b22');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // arena frame
      c.strokeStyle = 'rgba(52,224,255,0.16)';
      c.lineWidth = 2;
      c.strokeRect(FIELD_X - 1, 58, FIELD_W + 2, H - 58);
      c.shadowColor = 'rgba(52,224,255,0.25)';
      c.shadowBlur = 18;
      c.strokeRect(FIELD_X - 1, 58, FIELD_W + 2, H - 58);
      U.noShadow(c);

      // bricks
      for (const k of this.bricks) {
        if (k.sh > 0) k.sh = Math.max(0, k.sh - dt);
        c.save();
        c.globalAlpha = 0.9;
        c.fillStyle = k.color;
        c.shadowColor = k.color;
        c.shadowBlur = 14 + (k.sh > 0 ? 16 : 0);
        U.roundRect(c, k.x, k.y, k.w, k.h, 6);
        c.fill();
        U.noShadow(c);
        c.globalAlpha = 0.35;
        c.fillStyle = '#ffffff';
        U.roundRect(c, k.x + 3, k.y + 3, k.w - 6, 5, 3);
        c.fill();
        if (k.hits > 1) {
          c.globalAlpha = 1;
          c.fillStyle = 'rgba(10,10,20,0.8)';
          c.font = 'bold 11px ui-monospace, monospace';
          c.textAlign = 'center';
          c.fillText('II', k.x + k.w / 2, k.y + k.h / 2 + 4);
        }
        c.restore();
      }

      // paddle
      const pad = this.paddle;
      c.save();
      c.fillStyle = '#34e0ff';
      c.shadowColor = '#34e0ff';
      c.shadowBlur = 22;
      U.roundRect(c, pad.x - pad.w / 2, PAD_Y, pad.w, PAD_H, 7);
      c.fill();
      c.globalAlpha = 0.5;
      c.fillStyle = '#ffffff';
      U.roundRect(c, pad.x - pad.w / 2 + 4, PAD_Y + 3, pad.w - 8, 3, 2);
      c.fill();
      c.restore();

      // ball
      const b = this.ball;
      c.save();
      c.fillStyle = '#ffffff';
      c.shadowColor = '#ff4d9d';
      c.shadowBlur = 24;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // hud
      c.save();
      c.font = 'bold 15px ui-monospace, monospace';
      c.textAlign = 'left';
      c.fillStyle = 'rgba(242,243,255,0.75)';
      c.fillText('LEVEL ' + this.level, FIELD_X, 44);
      c.textAlign = 'right';
      c.fillText('LIVES ' + '●'.repeat(Math.max(0, this.lives)), FIELD_X + FIELD_W, 44);
      c.restore();

      if (this.ball.stuck && A.state === 'playing') {
        c.save();
        c.textAlign = 'center';
        c.fillStyle = 'rgba(242,243,255,0.5)';
        c.font = 'bold 14px ui-monospace, monospace';
        c.fillText('SPACE / CLICK TO SERVE', W / 2, PAD_Y - 62);
        c.restore();
      }
    }
  };

  window.Games = window.Games || {};
  window.Games.break = game;
})();

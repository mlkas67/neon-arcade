/* ============================================================
   Legeniko Arcade — Neon Pong
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const PAD_W = 14, PAD_H = 92;
  const MARGIN = 40;
  const WIN = 7;

  const game = {
    title: 'Neon Pong',
    readyHeading: 'First to 7',
    readyText: 'Move with the mouse, touch or <kbd>W</kbd> <kbd>S</kbd>. <kbd>Space</kbd> serves.',
    controlHint: 'The CPU learns nothing. It is simply relentless.',
    tip: 'Mouse / W S move · Space serves · first to 7',
    deadHeading: 'CPU wins',
    deadText: 'The machine takes it. Rematch?',
    overlayDelay: 750,

    reset() {
      this.p = { y: H / 2, vy: 0 };
      this.cpu = { y: H / 2, vy: 0 };
      this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 11, live: false };
      this.ps = 0;
      this.cs = 0;
      this.rally = 0;
      this.trail = [];
      this.keys = {};
      this.serveDelay = 0;
      this.bindOnce();
      A.setScore(0);
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener('keydown', (e) => {
        if (A.gameId !== 'pong') return;
        this.keys[e.code] = true;
      });
      window.addEventListener('keyup', (e) => {
        if (A.gameId !== 'pong') return;
        this.keys[e.code] = false;
      });
      const move = (e) => {
        if (A.state !== 'playing' || A.gameId !== 'pong') return;
        const p = U.eventPoint(e);
        this.targetY = p.y;
        this.usePointer = true;
      };
      A.canvas.addEventListener('pointermove', move);
      A.canvas.addEventListener('pointerdown', move);
    },

    action() {
      if (A.state === 'playing') this.serve();
    },

    onStart() {
      this.serveDelay = 0.7;
    },

    serve() {
      if (this.ball.live || this.serveDelay > 0) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const ang = U.rand(-0.45, 0.45);
      const speed = 420;
      this.ball.vx = Math.cos(ang) * speed * dir;
      this.ball.vy = Math.sin(ang) * speed;
      this.ball.live = true;
      this.rally = 0;
      A.Sound.tone(520, 0.08, { type: 'square', vol: 0.05 });
    },

    onDeath() {
      A.Sound.hit();
      A.fx.kick(9);
    },

    update(dt) {
      if (this.serveDelay > 0) {
        this.serveDelay -= dt;
        if (this.serveDelay <= 0) this.serve();
      }

      // player paddle
      const speed = 620;
      if (this.keys.KeyW || this.keys.ArrowUp) { this.p.y -= speed * dt; this.usePointer = false; }
      if (this.keys.KeyS || this.keys.ArrowDown) { this.p.y += speed * dt; this.usePointer = false; }
      if (this.usePointer && this.targetY != null) {
        this.p.y += (this.targetY - this.p.y) * Math.min(1, dt * 18);
      }
      this.p.y = U.clamp(this.p.y, PAD_H / 2, H - PAD_H / 2);

      // cpu tracks the ball, with a reaction ceiling so it can be beaten
      if (this.ball.live && this.ball.vx > 0) {
        const aim = this.ball.y + U.clamp(this.ball.vy * 0.12, -60, 60);
        const diff = aim - this.cpu.y;
        this.cpu.y += U.clamp(diff, -1, 1) * 330 * dt;
      } else {
        this.cpu.y += (H / 2 - this.cpu.y) * Math.min(1, dt * 2);
      }
      this.cpu.y = U.clamp(this.cpu.y, PAD_H / 2, H - PAD_H / 2);

      const b = this.ball;
      if (!b.live) return;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 14) this.trail.shift();

      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); this.bounce(); }
      if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy); this.bounce(); }

      // player paddle
      if (b.vx < 0 && b.x - b.r < MARGIN + PAD_W && b.x > MARGIN - 20 &&
          Math.abs(b.y - this.p.y) < PAD_H / 2 + b.r) {
        this.hitPaddle(true);
      }
      // cpu paddle
      if (b.vx > 0 && b.x + b.r > W - MARGIN - PAD_W && b.x < W - MARGIN + 20 &&
          Math.abs(b.y - this.cpu.y) < PAD_H / 2 + b.r) {
        this.hitPaddle(false);
      }

      if (b.x < -30) this.point(false);
      if (b.x > W + 30) this.point(true);
    },

    bounce() {
      A.Sound.tone(300, 0.05, { type: 'square', vol: 0.04 });
    },

    hitPaddle(isPlayer) {
      const b = this.ball;
      const paddle = isPlayer ? this.p : this.cpu;
      const off = U.clamp((b.y - paddle.y) / (PAD_H / 2), -1, 1);
      this.rally++;
      const speed = Math.min(900, 420 + this.rally * 26);
      const ang = off * 1.0;
      b.vx = Math.cos(ang) * speed * (isPlayer ? 1 : -1);
      b.vy = Math.sin(ang) * speed;
      b.x = isPlayer ? MARGIN + PAD_W + b.r + 1 : W - MARGIN - PAD_W - b.r - 1;
      A.Sound.tone(isPlayer ? 440 : 330, 0.07, { type: 'square', vol: 0.06 });
      A.fx.burst(b.x, b.y, { count: 8, colors: [isPlayer ? '#34e0ff' : '#ff4d9d'], speed: 200, life: 0.35, size: 4 });
    },

    point(playerScored) {
      const b = this.ball;
      A.fx.burst(playerScored ? W - 20 : 20, b.y, { count: 22, colors: ['#ffffff'], speed: 300, life: 0.6 });
      A.Sound.tone(playerScored ? 720 : 240, 0.2, { type: 'triangle', to: playerScored ? 980 : 150, vol: 0.07 });
      b.live = false;
      b.x = W / 2; b.y = H / 2; b.vx = b.vy = 0;
      this.trail.length = 0;
      this.rally = 0;

      if (playerScored) {
        this.ps++;
        A.setScore(this.ps * 10);
      } else {
        this.cs++;
      }

      if (this.ps >= WIN) {
        this.deadHeading = 'Champion';
        this.deadText = 'You took the set ' + this.ps + '–' + this.cs + '.';
        A.die('win');
        return;
      }
      if (this.cs >= WIN) {
        this.deadHeading = 'CPU wins';
        this.deadText = 'Final score ' + this.ps + '–' + this.cs + '.';
        A.die('lose');
        return;
      }
      this.serveDelay = 0.9;
    },

    mpPose() {
      return { y: this.p.y };
    },

    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#06070f');
      g.addColorStop(1, '#0a0f1d');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // net
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.lineWidth = 3;
      c.setLineDash([12, 16]);
      c.beginPath();
      c.moveTo(W / 2, 10);
      c.lineTo(W / 2, H - 10);
      c.stroke();
      c.restore();

      // big score ghost
      c.save();
      c.font = '900 120px ui-monospace, monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillText(this.ps, W / 2 - 110, H / 2);
      c.fillText(this.cs, W / 2 + 110, H / 2);
      c.restore();

      // paddles
      const drawPad = (x, y, color) => {
        c.save();
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 24;
        U.roundRect(c, x, y - PAD_H / 2, PAD_W, PAD_H, 7);
        c.fill();
        c.restore();
      };
      drawPad(MARGIN, this.p.y, '#34e0ff');
      drawPad(W - MARGIN - PAD_W, this.cpu.y, '#ff4d9d');

      // your friend's paddle, on the far side of the net
      if (window.Arcade && Arcade.rivals && Arcade.state === 'playing') {
        const rivals = Arcade.rivals('pong');
        for (let i = 0; i < rivals.length; i++) {
          const r = rivals[i];
          if (r.age > 4000) continue;
          const ry = typeof r.s.y === 'number' ? r.s.y : H / 2;
          const col = Arcade.rivalColor(i);
          const gx = W - MARGIN - PAD_W - 26;
          c.save();
          c.globalAlpha = 0.35;
          c.strokeStyle = col;
          c.lineWidth = 2;
          U.roundRect(c, gx, ry - PAD_H / 2, PAD_W, PAD_H, 7);
          c.stroke();
          c.restore();
          c.save();
          c.globalAlpha = 0.8;
          Arcade.ghostTag(c, gx + PAD_W / 2, ry - PAD_H / 2 - 16, r.username, col);
          c.restore();
        }
      }

      // ball trail
      c.save();
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const k = i / this.trail.length;
        c.globalAlpha = k * 0.5;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(t.x, t.y, this.ball.r * k, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      c.fillStyle = '#ffffff';
      c.shadowColor = '#ffffff';
      c.shadowBlur = 22;
      c.beginPath();
      c.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
      c.fill();
      c.restore();

      if (!this.ball.live && this.serveDelay <= 0 && A.state === 'playing') {
        c.save();
        c.font = 'bold 14px ui-monospace, monospace';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(242,243,255,0.55)';
        c.fillText('SPACE / CLICK TO SERVE', W / 2, H / 2 + 60);
        c.restore();
      }
    }
  };

  window.Games = window.Games || {};
  window.Games.pong = game;
})();

/* ============================================================
   Flappy Bird — neon edition
   ============================================================ */
(function () {
  'use strict';

  const U = window.Arcade.util;
  const W = 960;
  const H = 540;
  const GROUND_Y = 470;
  const BIRD_X = 286;
  const R = 17;
  const GRAV = 1650;
  const FLAP_V = -470;
  const PIPE_W = 86;

  const Flappy = {
    title: 'Flappy Bird',
    readyHeading: 'Hold your nerve',
    readyText: 'Press <kbd>Space</kbd> or tap to flap through the gap.',
    controlHint: 'ONE BUTTON · TAP TO FLAP',
    tip: 'Tap to flap · thread the gap · each pipe = 1 point',
    deadHeading: 'Splat',
    deadText: 'Gravity always wins in the end.',
    overlayDelay: 800,

    reset(Arcade) {
      this.arcade = Arcade;
      this.time = 0;
      this.animTime = 0;
      this.scrollX = 0;
      this.speed = 225;
      this.pipes = [];
      this.nextPipeX = W + 220;
      this.bird = { y: H * 0.44, vy: 0, rot: 0, dead: false, wing: 0 };
      this.passed = 0;
      this.gap = 178;
      this.flapLock = 0;
      this.bindInput();
    },

    bindInput() {
      if (this.bound) return;
      this.bound = true;
      const self = this;
      window.addEventListener('keydown', function (e) {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          if (Arcade.state === 'playing' && performance.now() >= Arcade.inputLock) self.flap();
        }
      });
    },

    onStart() {
      this.flap();
    },

    onPause() {},

    flap() {
      if (this.bird.dead) return;
      this.bird.vy = FLAP_V;
      this.bird.wing = 1;
      Arcade.Sound.flap();
      Arcade.fx.burst(BIRD_X - 8, this.bird.y + 6, {
        count: 4, speed: 90, angle: Math.PI * 0.75, spread: 0.9,
        life: 0.35, size: 3, colors: ['rgba(255,255,255,0.8)', '#ffd166'],
        gravity: 120, drag: 0.94
      });
    },

    action() { this.flap(); },

    /* ---------------- spawn ---------------- */
    spawnPipe() {
      const margin = 92;
      const gap = this.gap;
      const minCenter = margin + gap / 2;
      const maxCenter = GROUND_Y - margin - gap / 2;
      const gapCenter = U.rand(minCenter, maxCenter);
      this.pipes.push({
        x: this.nextPipeX,
        gapCenter: gapCenter,
        gap: gap,
        scored: false
      });
      this.nextPipeX += Math.max(300, 360 - this.passed * 2.2);
    },

    /* ---------------- physics ---------------- */
    update(dt) {
      const b = this.bird;
      if (b.dead) return;

      this.time += dt;
      this.speed = 225 + Math.min(85, this.passed * 3.5);
      this.scrollX += this.speed * dt;
      this.gap = Math.max(146, 178 - this.passed * 1.6);

      while (this.nextPipeX < this.scrollX + W + 260) this.spawnPipe();
      while (this.pipes.length && this.pipes[0].x + PIPE_W < this.scrollX - 120) this.pipes.shift();

      // bird
      b.vy += GRAV * dt;
      if (b.vy > 980) b.vy = 980;
      b.y += b.vy * dt;
      b.rot = U.clamp(b.vy / 620, -0.55, 1.5);
      if (b.wing > 0) b.wing = Math.max(0, b.wing - dt * 5.5);

      if (b.y - R <= 0) {
        b.y = R;
        b.vy = Math.max(0, b.vy);
      }

      // scoring + collisions
      for (const pipe of this.pipes) {
        const px = pipe.x - this.scrollX;
        if (!pipe.scored && px + PIPE_W < BIRD_X - R) {
          pipe.scored = true;
          this.passed++;
          this.arcade.setScore(this.passed);
          Arcade.Sound.point();
          Arcade.fx.burst(BIRD_X + 10, b.y, {
            count: 6, speed: 120, life: 0.45, size: 3.5, gravity: -60,
            colors: ['#ffd166', '#ffffff', '#4ade80'], shape: 'circle'
          });
        }
      }

      // ground
      if (b.y + R >= GROUND_Y) {
        b.y = GROUND_Y - R;
        return this.kill('ground');
      }

      const hit = { x: BIRD_X - R + 4, y: b.y - R + 3, w: (R - 4) * 2, h: (R - 3) * 2 };
      for (const pipe of this.pipes) {
        const px = pipe.x - this.scrollX;
        if (px > hit.x + hit.w || px + PIPE_W < hit.x) continue;
        const topH = pipe.gapCenter - pipe.gap / 2;
        const botY = pipe.gapCenter + pipe.gap / 2;
        if (hit.y < topH || hit.y + hit.h > botY) return this.kill('pipe');
      }
    },

    kill(reason) {
      if (this.bird.dead) return;
      this.bird.dead = true;
      this.bird.hitGround = reason === 'ground';
      Arcade.Sound.hit();
      Arcade.fx.kick(reason === 'pipe' ? 12 : 8);
      Arcade.fx.burst(BIRD_X, this.bird.y, {
        count: 22, speed: 300, life: 0.7, size: 6, gravity: 1000,
        colors: ['#ffd166', '#ffe9a8', '#ffffff', '#ff8a3d'], shape: 'rect'
      });
      Arcade.die(reason);
    },

    updateDeath(dt) {
      const b = this.bird;
      this.animTime += dt;
      if (b.hitGround) return;
      b.vy += GRAV * dt;
      b.y += b.vy * dt;
      b.rot = Math.min(1.6, b.rot + dt * 4.2);
      if (b.y + R >= GROUND_Y) {
        b.y = GROUND_Y - R;
        b.hitGround = true;
        b.vy = 0;
        Arcade.fx.burst(BIRD_X, GROUND_Y, {
          count: 10, speed: 160, life: 0.4, size: 4, gravity: 900,
          colors: ['#ffd166', '#ffffff'], shape: 'circle'
        });
      }
    },

    /* ---------------- drawing ---------------- */
    draw(c, dt) {
      if (this.arcade.state !== 'paused') this.animTime += (dt || 0) * 0.85;

      const t = this.animTime;

      // sky
      const sky = c.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#041b2e');
      sky.addColorStop(0.45, '#0b4a63');
      sky.addColorStop(0.8, '#1d7f8c');
      sky.addColorStop(1, '#2aa79b');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);

      // sun / moon glow
      const sun = c.createRadialGradient(W * 0.76, 128, 10, W * 0.76, 128, 220);
      sun.addColorStop(0, 'rgba(255,226,150,0.55)');
      sun.addColorStop(0.35, 'rgba(255,190,120,0.18)');
      sun.addColorStop(1, 'rgba(255,190,120,0)');
      c.fillStyle = sun;
      c.fillRect(0, 0, W, GROUND_Y);
      c.fillStyle = 'rgba(255,236,190,0.9)';
      c.beginPath();
      c.arc(W * 0.76, 128, 34, 0, Math.PI * 2);
      c.fill();

      this.drawClouds(c, t, 0.18, 0.16, 92);
      this.drawSkyline(c);
      this.drawClouds(c, t, 0.42, 0.22, 58);
      this.drawPipes(c);
      this.drawGround(c, t);
      this.drawBird(c, t);

      // vignette
      const vg = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);

      c.save();
      c.globalAlpha = 0.55;
      c.font = '600 15px ui-monospace, Menlo, monospace';
      c.fillStyle = '#ffffff';
      c.textAlign = 'right';
      c.fillText(this.passed + (this.passed === 1 ? ' pipe' : ' pipes'), W - 22, 32);
      c.restore();
    },

    drawClouds(c, t, speedMul, alpha, baseY) {
      c.save();
      c.globalAlpha = alpha + 0.1;
      c.fillStyle = '#dff6ff';
      for (let i = 0; i < 7; i++) {
        const span = W + 380;
        const x = ((i * 173 - this.scrollX * speedMul - t * 8) % span + span) % span - 190;
        const y = baseY + (i * 41) % 120;
        const s = 0.7 + ((i * 0.19) % 0.6);
        c.beginPath();
        c.arc(x, y, 26 * s, 0, Math.PI * 2);
        c.arc(x + 26 * s, y + 6 * s, 20 * s, 0, Math.PI * 2);
        c.arc(x - 26 * s, y + 8 * s, 17 * s, 0, Math.PI * 2);
        c.arc(x + 4 * s, y - 14 * s, 18 * s, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    },

    drawSkyline(c) {
      c.save();
      c.globalAlpha = 0.55;
      c.fillStyle = '#062033';
      const off = (this.scrollX * 0.25) % 200;
      for (let i = -1; i < 7; i++) {
        const bx = i * 200 - off;
        const bh = 90 + ((i * 53 + 40) % 70);
        c.fillRect(bx, GROUND_Y - bh, 130, bh);
        c.fillRect(bx + 26, GROUND_Y - bh - 26, 62, 26);
        c.fillStyle = 'rgba(255,214,140,0.35)';
        for (let wY = GROUND_Y - bh + 14; wY < GROUND_Y - 14; wY += 22) {
          for (let wX = bx + 12; wX < bx + 118; wX += 26) {
            if ((wX + wY) % 3 !== 0) c.fillRect(wX, wY, 8, 10);
          }
        }
        c.fillStyle = '#062033';
      }
      c.restore();
    },

    drawPipes(c) {
      for (const pipe of this.pipes) {
        const x = pipe.x - this.scrollX;
        if (x > W + 120 || x + PIPE_W < -120) continue;
        const topH = pipe.gapCenter - pipe.gap / 2;
        const botY = pipe.gapCenter + pipe.gap / 2;
        this.pipeBody(c, x, -40, PIPE_W, topH + 40, true);
        this.pipeBody(c, x, botY, PIPE_W, GROUND_Y - botY + 10, false);
        this.pipeCap(c, x - 6, topH - 26, PIPE_W + 12, 26);
        this.pipeCap(c, x - 6, botY, PIPE_W + 12, 26);
      }
    },

    pipeBody(c, x, y, w, h, isTop) {
      const grad = c.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#14653a');
      grad.addColorStop(0.22, '#3fc275');
      grad.addColorStop(0.5, '#7ef0aa');
      grad.addColorStop(0.78, '#2f9c5c');
      grad.addColorStop(1, '#0f5230');
      c.fillStyle = grad;
      c.fillRect(x, y, w, h);

      c.save();
      c.strokeStyle = 'rgba(4,20,12,0.55)';
      c.lineWidth = 3;
      c.strokeRect(x + 1.5, y + (isTop ? 0 : 0), w - 3, h);
      c.restore();

      c.save();
      c.globalAlpha = 0.22;
      c.fillStyle = '#ffffff';
      c.fillRect(x + w * 0.3, y, 6, h);
      c.restore();
    },

    pipeCap(c, x, y, w, h) {
      const grad = c.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#1a7a45');
      grad.addColorStop(0.25, '#59dd92');
      grad.addColorStop(0.55, '#9bf7c3');
      grad.addColorStop(0.85, '#2f9c5c');
      grad.addColorStop(1, '#125c36');
      c.save();
      c.fillStyle = grad;
      U.roundRect(c, x, y, w, h, 6);
      c.fill();
      c.strokeStyle = 'rgba(4,20,12,0.5)';
      c.lineWidth = 2.5;
      U.roundRect(c, x, y, w, h, 6);
      c.stroke();
      c.restore();
    },

    drawGround(c, t) {
      const g = c.createLinearGradient(0, GROUND_Y, 0, H);
      g.addColorStop(0, '#0b2a20');
      g.addColorStop(1, '#04120d');
      c.fillStyle = g;
      c.fillRect(0, GROUND_Y, W, H - GROUND_Y);

      c.save();
      c.strokeStyle = '#ffd166';
      c.lineWidth = 3;
      c.shadowColor = '#ffd166';
      c.shadowBlur = 16;
      c.beginPath();
      c.moveTo(0, GROUND_Y + 1);
      c.lineTo(W, GROUND_Y + 1);
      c.stroke();
      c.restore();

      c.save();
      c.globalAlpha = 0.3;
      c.strokeStyle = '#8ef0c0';
      c.lineWidth = 1;
      const off = this.scrollX % 44;
      for (let x = -off; x < W + 44; x += 44) {
        c.beginPath();
        c.moveTo(x, GROUND_Y + 6);
        c.lineTo(x - 26, H);
        c.stroke();
      }
      c.restore();
    },

    drawBird(c, t) {
      const b = this.bird;
      let y = b.y;
      const idle = this.arcade.state === 'ready';
      if (idle) y += Math.sin(t * 3.2) * 7;

      const rot = idle ? Math.sin(t * 3.2) * 0.09 : b.rot;

      c.save();
      c.translate(BIRD_X, y);

      // ground shadow
      const hK = U.clamp(1 - (GROUND_Y - y) / 420, 0.12, 1);
      c.save();
      c.globalAlpha = 0.28 * hK;
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(0, GROUND_Y - y, 22 * hK, 5 * hK, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      c.rotate(rot);

      // glow
      c.save();
      c.shadowColor = 'rgba(255,209,102,0.9)';
      c.shadowBlur = 26;

      // body
      const grad = c.createLinearGradient(0, -R, 0, R);
      grad.addColorStop(0, '#fff0a8');
      grad.addColorStop(0.45, '#ffd166');
      grad.addColorStop(1, '#f0a91b');
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(0, 0, R + 3, R - 1, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // belly highlight
      c.save();
      c.globalAlpha = 0.55;
      c.fillStyle = '#fff6cc';
      c.beginPath();
      c.ellipse(-2, 6, R - 4, R - 8, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // wing
      const wingLift = idle ? Math.sin(t * 8) * 0.4 : -b.wing * 0.9 + 0.25;
      c.save();
      c.translate(-4, 1);
      c.rotate(wingLift);
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.92;
      c.beginPath();
      c.ellipse(-5, 0, 12, 7, -0.2, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();

      // eye
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(9, -6, 6.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#10202c';
      c.beginPath();
      c.arc(11, -6, 3, 0, Math.PI * 2);
      c.fill();

      // beak
      c.fillStyle = '#ff8a3d';
      c.beginPath();
      c.moveTo(R + 1, 1);
      c.lineTo(R + 14, 5);
      c.lineTo(R + 1, 9);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(120,45,0,0.35)';
      c.lineWidth = 1.2;
      c.stroke();

      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.flappy = Flappy;
})();

/* ============================================================
   Geometry Dash — one-button neon runner
   ============================================================ */
(function () {
  'use strict';

  const U = window.Arcade.util;
  const W = 960;
  const H = 540;
  const GY = 448;            // ground surface
  const SIZE = 40;           // cube size
  const PX = 190;            // cube screen x
  const GRAV = 2900;
  const JUMP_V = -1000;
  const AIRTIME = (2 * -JUMP_V) / GRAV;   // ~0.690s
  const BASE_SPEED = 420;
  const MAX_SPEED = 640;

  const PALETTES = [
    { sky1: '#080d24', sky2: '#17205c', accent: '#34e0ff', glow: 'rgba(52,224,255,0.55)', spike: '#ff4d9d', block: '#2a3f8f' },
    { sky1: '#150726', sky2: '#3d1150', accent: '#c084fc', glow: 'rgba(192,132,252,0.55)', spike: '#ff7a45', block: '#4b2170' },
    { sky1: '#04201f', sky2: '#0b4c42', accent: '#4ade80', glow: 'rgba(74,222,128,0.5)', spike: '#ffd166', block: '#14564a' },
    { sky1: '#1c0710', sky2: '#4d0f27', accent: '#ff6b9d', glow: 'rgba(255,107,157,0.5)', spike: '#7dd3fc', block: '#5c1531' }
  ];

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(U.lerp(A[0], B[0], t)) + ',' +
      Math.round(U.lerp(A[1], B[1], t)) + ',' +
      Math.round(U.lerp(A[2], B[2], t)) + ')';
  }

  const GD = {
    title: 'Geometry Dash',
    readyHeading: 'Cube online',
    readyText: 'Press <kbd>Space</kbd> or tap to launch. Hold to auto-jump on landing.',
    controlHint: 'SPACE / CLICK / TAP',
    tip: 'Hold jump to bounce · land on blocks · avoid spikes',
    deadHeading: 'Wiped out',
    deadText: 'The spikes send their regards.',
    overlayDelay: 700,

    reset(Arcade) {
      this.arcade = Arcade;
      this.time = 0;
      this.speed = BASE_SPEED;
      this.distance = 0;
      this.scrollX = 0;
      this.nextSpawn = 0;
      this.obstacles = [];
      this.trail = [];
      this.trailTimer = 0;
      this.hold = false;
      this.wantJump = false;
      this.player = { y: GY, vy: 0, rot: 0, onGround: true, dead: false };
      this.landSquash = 0;
      this.spawnFirst();
      this.bindInput();
    },

    bindInput() {
      if (this.bound) return;
      this.bound = true;
      const self = this;
      window.addEventListener('keydown', function (e) {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          if (Arcade.state === 'playing') {
            self.hold = true;
            if (performance.now() >= Arcade.inputLock) self.jump();
          }
        }
      });
      window.addEventListener('keyup', function (e) {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') self.hold = false;
      });
    },

    onHoldStart() { this.hold = true; this.jump(); },
    onHoldEnd() { this.hold = false; },

    onStart() {
      this.hold = false;
      this.trail.length = 0;
    },

    onPause() { this.hold = false; },

    jump() {
      const p = this.player;
      if (!p.onGround || p.dead) return;
      if (performance.now() < Arcade.inputLock) return;
      p.vy = JUMP_V;
      p.onGround = false;
      this.wantJump = false;
      Arcade.Sound.jump();
      Arcade.fx.burst(PX + SIZE / 2, p.y, {
        count: 7, speed: 130, angle: -Math.PI / 2, spread: Math.PI * 0.9,
        life: 0.32, size: 4, colors: ['#9fe9ff', '#ffffff', '#34e0ff'],
        gravity: 500, lift: 40
      });
    },

    action() { this.jump(); },

    /* ---------------- obstacles ---------------- */
    spawnFirst() {
      this.nextSpawn = 900;
      this.pushObstacle('spike', 900, 44);
      this.nextSpawn = 900 + 44 + 320;
    },

    addSpike(x, h) {
      this.obstacles.push({ type: 'spike', x: x, w: 44, h: h || 44, y: GY });
      return 44;
    },

    addBlock(x, h, w) {
      this.obstacles.push({ type: 'block', x: x, w: w || 76, h: h, y: GY - h });
      return w || 76;
    },

    pushObstacle(kind, x, arg) {
      if (kind === 'spike') return this.addSpike(x, arg);
      if (kind === 'block') return this.addBlock(x, arg);
    },

    spawnNext() {
      const d = Math.min(1, this.distance / 7000);
      const s = this.speed;
      const roll = Math.random();
      let x = this.nextSpawn;
      let width = 0;

      if (roll < 0.22) {
        width = this.addBlock(x, 76, 76);
      } else if (roll < 0.5) {
        width = this.addSpike(x, 44);
      } else if (roll < 0.72) {
        this.addSpike(x, 44);
        this.addSpike(x + 46, 44);
        width = 90;
      } else if (roll < 0.86 && d > 0.22) {
        this.addSpike(x, 44);
        this.addSpike(x + 46, 44);
        this.addSpike(x + 92, 44);
        width = 136;
      } else if (roll < 0.95 && d > 0.15) {
        width = this.addBlock(x, 76, 76);
        this.addSpike(x + 76 + 130, 44);
        width += 130 + 44;
      } else {
        width = this.addBlock(x, 116, 76);
      }

      // gap sized in jump-lengths, tightens as the run goes on
      const gap = s * (U.lerp(0.72, 0.44, d) + Math.random() * 0.34) + 70;
      this.nextSpawn = x + width + gap;
    },

    /* ---------------- physics ---------------- */
    update(dt) {
      if (this.player.dead) return;
      const p = this.player;

      this.time += dt;
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.time * 8.5);
      this.distance += this.speed * dt;
      this.scrollX += this.speed * dt;
      this.arcade.setScore(this.distance / 12);

      // generate ahead
      let guard = 0;
      while (this.nextSpawn < this.scrollX + W + 700 && guard++ < 6) this.spawnNext();
      while (this.obstacles.length && this.obstacles[0].x + this.obstacles[0].w < this.scrollX - 260) {
        this.obstacles.shift();
      }

      // horizontal is fixed; world x of the cube
      const px = this.scrollX + PX;
      const prevY = p.y;

      // jump request from held input
      if (p.onGround && (this.hold || this.wantJump)) {
        this.jump();
      }
      this.wantJump = false;

      // gravity
      p.vy += GRAV * dt;
      if (p.vy > 2400) p.vy = 2400;
      p.y += p.vy * dt;

      let landed = false;

      if (p.y >= GY) {
        p.y = GY;
        p.vy = 0;
        landed = true;
      }

      // land on block tops
      for (const o of this.obstacles) {
        if (o.type !== 'block') continue;
        const overlapX = px + SIZE > o.x + 3 && px < o.x + o.w - 3;
        if (!overlapX) continue;
        if (p.vy >= 0 && prevY <= o.y + 3 && p.y >= o.y) {
          p.y = o.y;
          p.vy = 0;
          landed = true;
        }
      }

      if (landed && !p.onGround) {
        this.landSquash = 1;
        Arcade.Sound.land();
        Arcade.fx.burst(PX + SIZE / 2, p.y, {
          count: 6, speed: 110, angle: -Math.PI / 2, spread: Math.PI,
          life: 0.3, size: 3.5, colors: ['rgba(255,255,255,0.9)', '#34e0ff'],
          gravity: 400
        });
      }
      p.onGround = landed;
      if (landed) p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
      else p.rot += 4.6 * dt;

      if (this.landSquash > 0) this.landSquash = Math.max(0, this.landSquash - dt * 5);

      // trail
      this.trailTimer += dt;
      if (this.trailTimer > 0.022) {
        this.trailTimer = 0;
        this.trail.push({ y: p.y, rot: p.rot, life: 0.26, rgb: this.palette().accent });
        if (this.trail.length > 26) this.trail.shift();
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }

      // collisions
      const box = { x: px + 6, y: p.y - SIZE + 6, w: SIZE - 12, h: SIZE - 12 };

      for (const o of this.obstacles) {
        if (o.type === 'spike') {
          const hb = { x: o.x + 11, y: o.y - o.h + 12, w: o.w - 22, h: o.h - 12 };
          if (box.x < hb.x + hb.w && box.x + box.w > hb.x && box.y < hb.y + hb.h && box.y + box.h > hb.y) {
            return this.kill('spike');
          }
        } else {
          const overlapX = box.x + box.w > o.x && box.x < o.x + o.w;
          if (!overlapX) continue;
          const overlapY = box.y + box.h > o.y + 2 && box.y < o.y + o.h;
          if (overlapY) return this.kill('block');
        }
      }
    },

    kill() {
      const p = this.player;
      p.dead = true;
      this.hold = false;
      Arcade.Sound.hit();
      Arcade.fx.kick(14);
      Arcade.fx.burst(PX + SIZE / 2, p.y - SIZE / 2, {
        count: 34, speed: 420, life: 0.85, size: 7, gravity: 1100,
        shape: 'rect',
        colors: ['#6ff0ff', '#34e0ff', '#ffffff', '#8b5cf6', '#ff4d9d']
      });
      Arcade.fx.burst(PX + SIZE / 2, p.y - SIZE / 2, {
        count: 14, speed: 620, life: 0.5, size: 4, gravity: 300,
        shape: 'spark', colors: ['#ffffff', '#9fe9ff']
      });
      Arcade.die('spike');
    },

    updateDeath() { /* particles are handled by the shared FX layer */ },

    palette() {
      const zone = Math.floor(this.distance / 900);
      const next = (zone + 1) % PALETTES.length;
      const t = U.clamp((this.distance % 900) / 900 - 0.75, 0, 1) * 4;
      const a = PALETTES[zone % PALETTES.length];
      const b = PALETTES[next];
      const k = Math.min(1, t);
      return {
        sky1: mix(a.sky1, b.sky1, k),
        sky2: mix(a.sky2, b.sky2, k),
        accent: mix(a.accent, b.accent, k),
        spike: mix(a.spike, b.spike, k),
        block: mix(a.block, b.block, k),
        zone: zone
      };
    },

    /* ---------------- drawing ---------------- */
    draw(c) {
      const pal = this.palette();
      const p = this.player;

      // sky
      const sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, pal.sky1);
      sky.addColorStop(1, pal.sky2);
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);

      this.drawParallax(c, pal);
      this.drawGround(c, pal);
      this.drawObstacles(c, pal);
      this.drawTrail(c);
      if (!p.dead) this.drawPlayer(c, pal);
      this.drawSpeedLines(c, pal);

      // vignette
      const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.02);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);

      // distance marker
      c.save();
      c.globalAlpha = 0.5;
      c.font = '600 15px ui-monospace, Menlo, monospace';
      c.fillStyle = '#ffffff';
      c.textAlign = 'right';
      c.fillText(Math.floor(this.distance / 12) + ' m', W - 22, 32);
      c.restore();
    },

    drawParallax(c, pal) {
      const layers = [
        { k: 0.12, count: 5, size: 220, alpha: 0.09 },
        { k: 0.26, count: 7, size: 130, alpha: 0.13 },
        { k: 0.42, count: 9, size: 74, alpha: 0.17 }
      ];
      for (const L of layers) {
        c.save();
        c.fillStyle = pal.accent;
        c.globalAlpha = L.alpha;
        for (let i = 0; i < L.count; i++) {
          const span = W + 420;
          const x = ((i * (span / L.count) - this.scrollX * L.k) % span + span) % span - 160;
          const y = GY - 40 - ((i * 67) % 240);
          const rot = this.time * 0.12 + i;
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          c.beginPath();
          c.moveTo(0, -L.size / 2);
          c.lineTo(L.size / 2, L.size / 2);
          c.lineTo(-L.size / 2, L.size / 2);
          c.closePath();
          c.fill();
          c.restore();
        }
        c.restore();
      }

      // stars
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 34; i++) {
        const x = ((i * 137 - this.scrollX * 0.06) % (W + 60) + W + 60) % (W + 60) - 30;
        const y = (i * 73) % (GY - 60) + 20;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 1.5 + i));
        c.globalAlpha = 0.15 + tw * 0.35;
        c.fillRect(x, y, 2, 2);
      }
      c.restore();
    },

    drawGround(c, pal) {
      const g = c.createLinearGradient(0, GY, 0, H);
      g.addColorStop(0, 'rgba(6,8,22,0.96)');
      g.addColorStop(1, 'rgba(2,3,10,1)');
      c.fillStyle = g;
      c.fillRect(0, GY, W, H - GY);

      // scrolling grid
      c.save();
      c.strokeStyle = pal.accent;
      c.globalAlpha = 0.16;
      c.lineWidth = 1;
      const off = this.scrollX % 48;
      for (let x = -off; x < W + 48; x += 48) {
        c.beginPath();
        c.moveTo(x, GY);
        c.lineTo(x - 40, H);
        c.stroke();
      }
      for (let y = GY + 24; y < H; y += 24) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
      c.restore();

      // neon lip
      c.save();
      c.strokeStyle = pal.accent;
      c.lineWidth = 3;
      c.shadowColor = pal.accent;
      c.shadowBlur = 18;
      c.beginPath();
      c.moveTo(0, GY + 1);
      c.lineTo(W, GY + 1);
      c.stroke();
      c.restore();
    },

    drawObstacles(c, pal) {
      for (const o of this.obstacles) {
        const x = o.x - this.scrollX;
        if (x > W + 120 || x + o.w < -120) continue;

        if (o.type === 'spike') {
          c.save();
          c.translate(x, o.y);
          const grad = c.createLinearGradient(0, -o.h, 0, 0);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, pal.spike);
          grad.addColorStop(1, 'rgba(0,0,0,0.55)');
          c.fillStyle = grad;
          c.shadowColor = pal.spike;
          c.shadowBlur = 16;
          c.beginPath();
          c.moveTo(o.w / 2, -o.h);
          c.lineTo(o.w + 2, 0);
          c.lineTo(-2, 0);
          c.closePath();
          c.fill();
          c.shadowBlur = 0;
          c.strokeStyle = 'rgba(255,255,255,0.5)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(o.w / 2, -o.h + 3);
          c.lineTo(o.w / 2 + 5, -6);
          c.stroke();
          c.restore();
        } else {
          c.save();
          const grad = c.createLinearGradient(x, o.y, x, o.y + o.h);
          grad.addColorStop(0, 'rgba(255,255,255,0.22)');
          grad.addColorStop(1, 'rgba(0,0,0,0.55)');
          c.fillStyle = pal.block;
          U.roundRect(c, x, o.y, o.w, o.h, 7);
          c.fill();
          c.fillStyle = grad;
          c.fill();
          c.strokeStyle = pal.accent;
          c.lineWidth = 2.5;
          c.shadowColor = pal.accent;
          c.shadowBlur = 14;
          U.roundRect(c, x, o.y, o.w, o.h, 7);
          c.stroke();
          c.restore();

          // inner detail
          c.save();
          c.strokeStyle = 'rgba(255,255,255,0.18)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x + 12, o.y + 16);
          c.lineTo(x + o.w - 12, o.y + 16);
          c.moveTo(x + o.w / 2, o.y + 16);
          c.lineTo(x + o.w / 2, o.y + o.h - 12);
          c.stroke();
          c.restore();
        }
      }
    },

    drawTrail(c) {
      for (const t of this.trail) {
        const k = t.life / 0.26;
        c.save();
        c.globalAlpha = k * 0.22;
        c.translate(PX + SIZE / 2, t.y - SIZE / 2);
        c.rotate(t.rot);
        c.fillStyle = t.rgb;
        U.roundRect(c, -SIZE / 2, -SIZE / 2, SIZE, SIZE, 7);
        c.fill();
        c.restore();
      }
    },

    drawPlayer(c, pal) {
      const p = this.player;
      const squash = 1 - this.landSquash * 0.16;
      const stretch = 1 + this.landSquash * 0.12;

      c.save();
      c.translate(PX + SIZE / 2, p.y - SIZE / 2);

      // ground shadow
      const distToGround = Math.min(1, Math.max(0, (GY - p.y) / 200));
      c.save();
      c.globalAlpha = 0.35 * (1 - distToGround * 0.7);
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(0, GY - (p.y - SIZE / 2) - 2, SIZE * 0.52, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      c.rotate(p.rot);
      c.scale(squash, stretch);

      const grad = c.createLinearGradient(-SIZE / 2, -SIZE / 2, SIZE / 2, SIZE / 2);
      grad.addColorStop(0, '#a9f4ff');
      grad.addColorStop(0.5, pal.accent);
      grad.addColorStop(1, '#0f7bd6');
      c.fillStyle = grad;
      c.shadowColor = pal.accent;
      c.shadowBlur = 26;
      U.roundRect(c, -SIZE / 2, -SIZE / 2, SIZE, SIZE, 8);
      c.fill();
      c.shadowBlur = 0;

      c.fillStyle = 'rgba(6,10,26,0.82)';
      U.roundRect(c, -SIZE / 2 + 10, -SIZE / 2 + 10, SIZE - 20, SIZE - 20, 3);
      c.fill();

      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(-SIZE / 2 + 14, -SIZE / 2 + 13, 4, 4);
      c.fillRect(SIZE / 2 - 18, -SIZE / 2 + 13, 4, 4);

      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 1.5;
      U.roundRect(c, -SIZE / 2 + 1, -SIZE / 2 + 1, SIZE - 2, SIZE - 2, 8);
      c.stroke();
      c.restore();
    },

    drawSpeedLines(c, pal) {
      c.save();
      c.globalAlpha = 0.10;
      c.strokeStyle = pal.accent;
      c.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = ((i * 97 + this.time * 40) % (GY - 60)) + 30;
        const len = 40 + ((i * 53) % 90);
        const x = ((i * 211 - this.scrollX * 1.4) % (W + 300) + W + 300) % (W + 300) - 150;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + len, y);
        c.stroke();
      }
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.gd = GD;
})();

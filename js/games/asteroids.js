/* ============================================================
   Legeniko Arcade — Asteroid Drift
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const SHIP_R = 16;

  const game = {
    title: 'Asteroid Drift',
    readyHeading: 'Drift and destroy',
    readyText: '<kbd>←</kbd> <kbd>→</kbd> to turn, <kbd>↑</kbd> to thrust, <kbd>Space</kbd> to fire.',
    controlHint: 'Asteroids split when hit — watch your back',
    tip: '← → turn · ↑ thrust · Space fires · 3 ships',
    deadHeading: 'Ship lost',
    deadText: 'The belt swallowed you whole.',
    overlayDelay: 900,
    usesArrowUp: true,

    reset() {
      this.ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, alive: true, inv: 2 };
      this.rocks = [];
      this.bullets = [];
      this.stars = [];
      this.lives = 3;
      this.nextShot = 0;
      this.pointerThrust = false;
      this.aim = null;
      this.total = 0;
      this.level = 1;
      this.respawn = 0;
      for (let i = 0; i < 90; i++) {
        this.stars.push({ x: Math.random() * W, y: Math.random() * H, z: U.rand(0.3, 1) });
      }
      this.spawnWave(4);
      this.bindOnce();
      A.setScore(0);
    },

    spawnWave(n) {
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do {
          x = U.rand(0, W);
          y = U.rand(0, H);
          tries++;
        } while (tries < 20 && Math.hypot(x - W / 2, y - H / 2) < 190);
        this.rocks.push(this.makeRock(x, y, U.rand(38, 62)));
      }
    },

    makeRock(x, y, r) {
      const n = U.randInt(8, 12);
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(U.rand(0.72, 1.15));
      const speed = U.rand(28, 62) + this.level * 6;
      const dir = U.rand(0, Math.PI * 2);
      return {
        x, y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        r,
        pts,
        spin: U.rand(-1.1, 1.1),
        rot: U.rand(0, Math.PI * 2),
        hit: 0
      };
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      this.keys = {};
      window.addEventListener('keydown', (e) => {
        if (A.gameId !== 'rocks') return;
        this.keys[e.code] = true;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        if (A.gameId !== 'rocks') return;
        this.keys[e.code] = false;
      });
      A.canvas.addEventListener('pointermove', (e) => {
        if (A.gameId !== 'rocks') return;
        this.aim = U.eventPoint(e);
      });
    },

    // touch and mouse: hold anywhere to fly at the pointer and keep firing
    onHoldStart() {
      this.pointerThrust = true;
      this.shoot();
    },

    onHoldEnd() {
      this.pointerThrust = false;
    },

    action() {
      if (A.state !== 'playing') return;
      this.shoot();
    },

    shoot() {
      const now = performance.now();
      if (now < this.nextShot) return;
      if (!this.ship.alive) return;
      this.nextShot = now + 190;
      const s = this.ship;
      const speed = 660;
      this.bullets.push({
        x: s.x + Math.cos(s.a) * (SHIP_R + 6),
        y: s.y + Math.sin(s.a) * (SHIP_R + 6),
        vx: Math.cos(s.a) * speed + s.vx * 0.35,
        vy: Math.sin(s.a) * speed + s.vy * 0.35,
        life: 1.15
      });
      A.Sound.tone(880, 0.06, { type: 'square', to: 320, vol: 0.045 });
      A.fx.burst(s.x + Math.cos(s.a) * SHIP_R, s.y + Math.sin(s.a) * SHIP_R, {
        count: 3, colors: ['#34e0ff'], speed: 120, life: 0.18, gravity: 0
      });
    },

    onDeath() {
      A.Sound.hit();
      A.fx.kick(14);
    },

    update(dt) {
      const s = this.ship;
      const k = this.keys;

      if (s.alive) {
        if (k.ArrowLeft || k.KeyA) s.a -= 4.2 * dt;
        if (k.ArrowRight || k.KeyD) s.a += 4.2 * dt;
        if (this.pointerThrust && this.aim) {
          const want = Math.atan2(this.aim.y - s.y, this.aim.x - s.x);
          let d = ((want - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          s.a += U.clamp(d, -4.2 * dt, 4.2 * dt);
        }
        if (k.ArrowUp || k.KeyW || this.pointerThrust) {
          s.vx += Math.cos(s.a) * 340 * dt;
          s.vy += Math.sin(s.a) * 340 * dt;
          if (this.pointerThrust) this.shoot();
          if (Math.random() < 0.55) {
            A.fx.burst(
              s.x - Math.cos(s.a) * SHIP_R, s.y - Math.sin(s.a) * SHIP_R,
              { count: 1, colors: ['#ffd166', '#ff7a5c'], speed: 90, life: 0.35, gravity: 0, size: 4 }
            );
          }
        }
        s.vx *= Math.pow(0.62, dt);
        s.vy *= Math.pow(0.62, dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        this.wrap(s);
        if (s.inv > 0) s.inv -= dt;
      } else {
        this.respawn -= dt;
        if (this.respawn <= 0) {
          if (this.lives <= 0) {
            A.die('dead');
            return;
          }
          s.alive = true;
          s.x = W / 2; s.y = H / 2;
          s.vx = s.vy = 0;
          s.a = -Math.PI / 2;
          s.inv = 2.2;
        }
      }

      // bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        this.wrap(b);
        if (b.life <= 0) this.bullets.splice(i, 1);
      }

      // rocks
      for (const r of this.rocks) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rot += r.spin * dt;
        if (r.hit > 0) r.hit -= dt;
        this.wrap(r);
      }

      // bullet -> rock
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const r = this.rocks[i];
        for (let j = this.bullets.length - 1; j >= 0; j--) {
          const b = this.bullets[j];
          if (Math.hypot(b.x - r.x, b.y - r.y) > r.r) continue;
          this.bullets.splice(j, 1);
          this.rocks.splice(i, 1);
          this.total += Math.round(60 - r.r);
          A.setScore(this.total);
          A.fx.burst(r.x, r.y, { count: 16, colors: ['#8b5cf6', '#34e0ff', '#ffffff'], speed: 240, life: 0.6, size: 4 });
          A.Sound.tone(320, 0.12, { type: 'sawtooth', to: 120, vol: 0.05 });
          if (r.r > 30) {
            for (let n = 0; n < 2; n++) {
              const nr = this.makeRock(r.x + U.rand(-12, 12), r.y + U.rand(-12, 12), r.r * 0.55);
              nr.vx += r.vx * 0.4;
              nr.vy += r.vy * 0.4;
              this.rocks.push(nr);
            }
          }
          break;
        }
      }

      // rock -> ship
      if (s.alive && s.inv <= 0) {
        for (const r of this.rocks) {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r + SHIP_R * 0.8) {
            this.killShip();
            break;
          }
        }
      }

      // wave cleared
      if (this.rocks.length === 0) {
        this.level++;
        this.total += 200;
        A.setScore(this.total);
        A.Sound.best();
        this.spawnWave(3 + this.level);
      }
    },

    wrap(o) {
      if (o.x < -40) o.x = W + 40;
      if (o.x > W + 40) o.x = -40;
      if (o.y < -40) o.y = H + 40;
      if (o.y > H + 40) o.y = -40;
    },

    killShip() {
      const s = this.ship;
      s.alive = false;
      this.lives--;
      this.respawn = 1.5;
      A.fx.burst(s.x, s.y, { count: 30, colors: ['#34e0ff', '#ffffff', '#ff4d9d'], speed: 330, life: 0.9, size: 5 });
      A.fx.kick(16);
      A.Sound.hit();
      if (this.lives <= 0) {
        A.die('dead');
      }
    },

    mpPose() {
      return { x: this.ship.x, y: this.ship.y, a: this.ship.a, lv: this.ship.alive ? 1 : 0 };
    },

    draw(c, dt) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#04040c');
      g.addColorStop(1, '#0b0a1d');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      for (const st of this.stars) {
        c.globalAlpha = 0.18 + st.z * 0.6;
        c.fillStyle = '#cfd6ff';
        c.fillRect(st.x, st.y, st.z * 2, st.z * 2);
      }
      c.globalAlpha = 1;

      // rocks
      for (const r of this.rocks) {
        c.save();
        c.translate(r.x, r.y);
        c.rotate(r.rot);
        c.beginPath();
        for (let i = 0; i < r.pts.length; i++) {
          const a = (i / r.pts.length) * Math.PI * 2;
          const rr = r.r * r.pts[i];
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
        c.fillStyle = r.hit > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(120,110,190,0.22)';
        c.fill();
        c.strokeStyle = r.hit > 0 ? '#ffffff' : '#8b5cf6';
        c.lineWidth = 2;
        c.shadowColor = '#8b5cf6';
        c.shadowBlur = 14;
        c.stroke();
        c.restore();
      }

      // bullets
      c.save();
      c.fillStyle = '#34e0ff';
      c.shadowColor = '#34e0ff';
      c.shadowBlur = 16;
      for (const b of this.bullets) {
        c.beginPath();
        c.arc(b.x, b.y, 3, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();

      // ship
      const s = this.ship;
      if (s.alive && (s.inv <= 0 || Math.floor(performance.now() / 110) % 2 === 0)) {
        c.save();
        c.translate(s.x, s.y);
        c.rotate(s.a + Math.PI / 2);
        c.beginPath();
        c.moveTo(0, -SHIP_R - 3);
        c.lineTo(SHIP_R * 0.85, SHIP_R * 0.75);
        c.lineTo(0, SHIP_R * 0.35);
        c.lineTo(-SHIP_R * 0.85, SHIP_R * 0.75);
        c.closePath();
        c.fillStyle = '#0b1020';
        c.fill();
        c.strokeStyle = '#34e0ff';
        c.lineWidth = 2.4;
        c.shadowColor = '#34e0ff';
        c.shadowBlur = 18;
        c.stroke();
        c.restore();
      }
      U.noShadow(c);

      // rival ships (multiplayer ghosts)
      if (window.Arcade && Arcade.rivals && Arcade.state === 'playing') {
        const rivals = Arcade.rivals('rocks');
        for (let i = 0; i < rivals.length; i++) {
          const r = rivals[i];
          const q = r.s || {};
          if (r.age > 4000 || q.lv === 0) continue;
          const col = Arcade.rivalColor(i);
          c.save();
          c.globalAlpha = 0.45;
          c.translate(q.x || W / 2, q.y || H / 2);
          c.rotate((q.a || 0) + Math.PI / 2);
          c.beginPath();
          c.moveTo(0, -SHIP_R - 3);
          c.lineTo(SHIP_R * 0.85, SHIP_R * 0.75);
          c.lineTo(0, SHIP_R * 0.35);
          c.lineTo(-SHIP_R * 0.85, SHIP_R * 0.75);
          c.closePath();
          c.strokeStyle = col;
          c.lineWidth = 2;
          c.stroke();
          c.restore();
          c.save();
          c.globalAlpha = 0.75;
          Arcade.ghostTag(c, q.x || W / 2, (q.y || H / 2) - SHIP_R - 18, r.username, col);
          c.restore();
        }
      }

      // hud
      c.save();
      c.font = 'bold 14px ui-monospace, monospace';
      c.fillStyle = 'rgba(242,243,255,0.72)';
      c.textAlign = 'left';
      c.fillText('WAVE ' + this.level, 24, 34);
      c.textAlign = 'right';
      c.fillText('SHIPS ' + '▲'.repeat(Math.max(0, this.lives)), W - 24, 34);
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.rocks = game;
})();

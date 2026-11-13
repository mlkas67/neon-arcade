/* ============================================================
   Neon Arcade — Neon Vice
   A top-down open-city driving sandbox: steal the night, run
   deliveries, collect cash, and lose the cops you annoy.
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const COLS = 5, ROWS = 4, BLOCK = 350, ROAD = 130;
  const PITCH = BLOCK + ROAD;
  const WORLD_W = COLS * PITCH + ROAD;
  const WORLD_H = ROWS * PITCH + ROAD;
  const roadLine = (i) => ROAD / 2 + i * PITCH;

  const CAR_L = 44, CAR_W = 22, CAR_R = 15;
  const CAR_ACCEL = 380, CAR_MAX = 440, CAR_REV = 150, CAR_BRAKE = 620;
  const CAR_DRAG = 165, CAR_TURN = 2.6;
  const COP_MAX = 452, COP_ACCEL = 350;
  const FOOT_SPEED = 150;

  const BUILDING_TINTS = [
    ['#141a33', '#2b3566', '#4d5ea8'],
    ['#1a1230', '#38245e', '#7c5cc4'],
    ['#131f2c', '#1f4055', '#3d8ba6'],
    ['#261224', '#4d1f43', '#a83b7d']
  ];

  // small deterministic PRNG so the city looks the same every run
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const game = {
    title: 'Neon Vice',
    readyHeading: 'Welcome to the night shift',
    readyText: 'Drive with <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. ' +
      '<kbd>Space</kbd> handbrake, <kbd>E</kbd> get out / back in.',
    controlHint: 'Deliver the package to the pink marker. Mind the pedestrians.',
    tip: 'Drive to the pink marker · Space handbrake · E on foot · avoid the cops',
    deadHeading: 'Wasted',
    deadText: 'The night always wins. Go again?',
    overlayDelay: 900,
    usesArrowUp: true,

    reset() {
      this.city = this.buildCity();
      this.keys = {};
      this.time = 0;
      this.cash = 0;
      this.health = 100;
      this.wanted = 0;
      this.heat = 0;
      this.heatCooldown = 0;
      this.onFoot = false;
      this.handbrake = false;
      this.copTimer = 0;
      this.bustedTimer = 0;
      this.flash = 0;
      this.trail = [];

      this.car = {
        x: roadLine(1),
        y: roadLine(2),
        a: 0,
        v: 0
      };
      this.foot = { x: this.car.x - 40, y: this.car.y, a: 0 };

      this.cam = { x: this.car.x - W / 2, y: this.car.y - H / 2 };
      this.cam.x = U.clamp(this.cam.x, 0, WORLD_W - W);
      this.cam.y = U.clamp(this.cam.y, 0, WORLD_H - H);

      this.cops = [];
      this.peds = this.spawnPeds();
      this.marker = this.newMarker();
      this.bindOnce();
      A.setScore(0);
    },

    buildCity() {
      const cells = [];
      let n = 0;
      for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
          const rnd = seeded(17 + i * 733 + j * 9173);
          const inset = 8 + rnd() * 16;
          const x = roadLine(i) + ROAD / 2 + inset;
          const y = roadLine(j) + ROAD / 2 + inset;
          const w = BLOCK - inset * 2;
          const h = BLOCK - inset * 2;
          const tint = BUILDING_TINTS[Math.floor(rnd() * BUILDING_TINTS.length)];
          cells.push({
            x, y, w, h, tint,
            radius: 10 + rnd() * 12,
            cols: Math.max(2, Math.round(w / 46)),
            rows: Math.max(2, Math.round(h / 46)),
            seed: rnd() * 1000,
            sign: rnd() < 0.35 ? (n++ % 2 ? '#ff4d9d' : '#34e0ff') : null
          });
        }
      }
      return cells;
    },

    spawnPeds() {
      const peds = [];
      for (let k = 0; k < 30; k++) {
        const vertical = Math.random() < 0.5;
        const lane = U.randInt(0, COLS);
        const t = Math.random() * (vertical ? WORLD_H : WORLD_W);
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = side * (ROAD / 2 - 12);
        peds.push({
          x: vertical ? roadLine(lane) + off : t,
          y: vertical ? t : roadLine(lane) + off,
          a: Math.random() * Math.PI * 2,
          speed: U.rand(26, 58),
          alive: true,
          cool: 0,
          shirt: Math.random() < 0.5 ? '#ffd166' : '#7ce7ff'
        });
      }
      return peds;
    },

    newMarker() {
      for (let tries = 0; tries < 60; tries++) {
        const x = roadLine(U.randInt(0, COLS)) + U.rand(-20, 20);
        const y = roadLine(U.randInt(0, ROWS)) + U.rand(-20, 20);
        const d = Math.hypot(x - this.car.x, y - this.car.y);
        if (d > 620) return { x, y, pulse: 0 };
      }
      return { x: roadLine(COLS), y: roadLine(ROWS), pulse: 0 };
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener('keydown', (e) => {
        if (A.gameId !== 'vice') return;
        this.keys[e.code] = true;
        if (e.code === 'KeyE' && A.state === 'playing') this.toggleCar();
      });
      window.addEventListener('keyup', (e) => {
        if (A.gameId !== 'vice') return;
        this.keys[e.code] = false;
      });
    },

    // Space / tap: get in or out when it makes sense, otherwise yank the handbrake
    action() {
      if (A.state !== 'playing') return;
      if (this.onFoot && this.nearCar()) {
        this.toggleCar();
        return;
      }
      this.handbrake = true;
      A.Sound.tone(240, 0.05, { type: 'square', vol: 0.03, to: 150 });
      setTimeout(() => { this.handbrake = false; }, 260);
    },

    nearCar() {
      return Math.hypot(this.foot.x - this.car.x, this.foot.y - this.car.y) < 72;
    },

    toggleCar() {
      if (!this.onFoot) {
        if (Math.abs(this.car.v) > 95) return;
        this.onFoot = true;
        this.foot.x = this.car.x + Math.cos(this.car.a + Math.PI / 2) * 30;
        this.foot.y = this.car.y + Math.sin(this.car.a + Math.PI / 2) * 30;
        this.foot.a = this.car.a;
        A.Sound.tone(320, 0.07, { type: 'triangle', vol: 0.04, to: 220 });
      } else if (this.nearCar()) {
        this.onFoot = false;
        this.car.v = 0;
        A.Sound.tone(440, 0.07, { type: 'triangle', vol: 0.04 });
      }
    },

    onStart() {
      this.keys = {};
    },

    onDeath(reason) {
      A.Sound.hit();
      A.fx.kick(14);
      if (reason === 'busted') {
        this.deadHeading = 'Busted';
        this.deadText = 'The cops boxed you in. Bail is steep, the night is short.';
      } else {
        this.deadHeading = 'Wasted';
        this.deadText = 'The night always wins. Go again?';
      }
    },

    /* ---------------- simulation ---------------- */
    update(dt) {
      this.time += dt;
      this.flash = Math.max(0, this.flash - dt * 3);
      if (this.marker) this.marker.pulse += dt;

      if (this.onFoot) this.updateFoot(dt);
      else this.updateCar(dt);

      this.updatePeds(dt);
      this.updateCops(dt);
      this.updateHeat(dt);
      this.updateCamera(dt);
      this.updateMarker(dt);

      if (this.health <= 0) A.die('wasted');
    },

    throttleInput() {
      const k = this.keys;
      return (k.ArrowUp || k.KeyW ? 1 : 0);
    },

    brakeInput() {
      const k = this.keys;
      return (k.ArrowDown || k.KeyS ? 1 : 0);
    },

    steerInput() {
      const k = this.keys;
      return (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    },

    updateCar(dt) {
      const c = this.car;
      const throttle = this.throttleInput();
      const brake = this.brakeInput();
      const steer = this.steerInput();
      const hb = this.handbrake || this.keys.Space;

      if (throttle) c.v += CAR_ACCEL * dt;
      else if (brake) {
        if (c.v > 12) c.v -= CAR_BRAKE * dt;
        else c.v -= CAR_ACCEL * 0.62 * dt;
      } else {
        c.v -= Math.sign(c.v) * CAR_DRAG * dt;
        if (Math.abs(c.v) < CAR_DRAG * dt) c.v = 0;
      }
      if (hb) c.v -= Math.sign(c.v) * CAR_BRAKE * 0.85 * dt;

      c.v = U.clamp(c.v, -CAR_REV, CAR_MAX);
      if (Math.abs(c.v) < 1 && !throttle) c.v = 0;

      const grip = 0.35 + 0.65 * Math.min(1, Math.abs(c.v) / 190);
      c.a += steer * CAR_TURN * dt * grip * (c.v < 0 ? -1 : 1);

      c.x += Math.cos(c.a) * c.v * dt;
      c.y += Math.sin(c.a) * c.v * dt;

      this.resolveBlockCollision(c, CAR_R);
      c.x = U.clamp(c.x, CAR_R, WORLD_W - CAR_R);
      c.y = U.clamp(c.y, CAR_R, WORLD_H - CAR_R);

      if (Math.abs(c.v) > 60) {
        this.trail.push({ x: c.x, y: c.y, a: c.a, life: 0.5 });
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }

      // run people over: the fastest way to earn stars
      if (Math.abs(c.v) > 130) {
        for (const p of this.peds) {
          if (!p.alive || p.cool > 0) continue;
          if (Math.hypot(p.x - c.x, p.y - c.y) < 30) {
            p.alive = false;
            p.cool = 99;
            this.addWanted(1);
            this.flash = 1;
            A.fx.burst(p.x, p.y, {
              count: 14, colors: [p.shirt, '#ff4d9d', '#ffffff'],
              speed: 190, life: 0.6, size: 4
            });
            A.Sound.tone(160, 0.16, { type: 'sawtooth', vol: 0.05, to: 70 });
            setTimeout(() => {
              p.alive = true;
              p.cool = 0;
              p.x = roadLine(U.randInt(0, COLS)) + U.rand(-50, 50);
              p.y = roadLine(U.randInt(0, ROWS)) + U.rand(-50, 50);
            }, 4000);
          }
        }
      }
    },

    updateFoot(dt) {
      const f = this.foot;
      const k = this.keys;
      let mx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      let my = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
      if (mx || my) {
        const len = Math.hypot(mx, my) || 1;
        mx /= len;
        my /= len;
        f.x += mx * FOOT_SPEED * dt;
        f.y += my * FOOT_SPEED * dt;
        f.a = Math.atan2(my, mx);
        this.footStep = (this.footStep || 0) + dt * 9;
      }
      this.resolveBlockCollision(f, 9);
      f.x = U.clamp(f.x, 8, WORLD_W - 8);
      f.y = U.clamp(f.y, 8, WORLD_H - 8);
    },

    resolveBlockCollision(obj, radius) {
      for (const b of this.city) {
        if (obj.x + radius < b.x || obj.x - radius > b.x + b.w ||
            obj.y + radius < b.y || obj.y - radius > b.y + b.h) continue;
        // push out along the shallowest axis
        const left = obj.x + radius - b.x;
        const right = b.x + b.w - (obj.x - radius);
        const top = obj.y + radius - b.y;
        const bottom = b.y + b.h - (obj.y - radius);
        const m = Math.min(left, right, top, bottom);
        if (m === left) obj.x = b.x - radius;
        else if (m === right) obj.x = b.x + b.w + radius;
        else if (m === top) obj.y = b.y - radius;
        else obj.y = b.y + b.h + radius;

        if (obj === this.car && Math.abs(obj.v) > 90) {
          const impact = Math.abs(obj.v);
          obj.v *= -0.22;
          this.health -= Math.min(14, impact * 0.02);
          A.fx.burst(obj.x, obj.y, {
            count: 8, colors: ['#ffd166', '#ffffff'], speed: 150, life: 0.4, size: 3
          });
          A.Sound.tone(120, 0.1, { type: 'square', vol: 0.045, to: 60 });
        } else if (obj === this.car) {
          obj.v = 0;
        }
      }
    },

    updatePeds(dt) {
      const c = this.car;
      for (const p of this.peds) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < 190) {
          // scatter away from the car
          const away = Math.atan2(p.y - c.y, p.x - c.x);
          p.a += Math.atan2(Math.sin(away - p.a), Math.cos(away - p.a)) * Math.min(1, dt * 6);
          p.x += Math.cos(p.a) * p.speed * 1.8 * dt;
          p.y += Math.sin(p.a) * p.speed * 1.8 * dt;
        } else {
          p.a += (Math.random() - 0.5) * dt * 3;
          p.x += Math.cos(p.a) * p.speed * dt;
          p.y += Math.sin(p.a) * p.speed * dt;
        }
        this.resolveBlockCollision(p, 7);
        p.x = U.clamp(p.x, 6, WORLD_W - 6);
        p.y = U.clamp(p.y, 6, WORLD_H - 6);
      }
    },

    updateCops(dt) {
      const target = this.onFoot ? this.foot : this.car;
      const want = Math.min(4, this.wanted);

      if (this.cops.length < want) {
        this.copTimer -= dt;
        if (this.copTimer <= 0) {
          this.copTimer = 1.1;
          this.spawnCop(target);
        }
      }
      while (this.cops.length > want) this.cops.pop();

      for (const cop of this.cops) {
        const dx = target.x - cop.x;
        const dy = target.y - cop.y;
        const dist = Math.hypot(dx, dy) || 1;
        let desired = Math.atan2(dy, dx);
        let wantSpeed = U.clamp(dist * 1.4, 0, COP_MAX);

        // look down the road: a wall ahead means turn onto the cross street
        if (this.blockedAt(cop.x + Math.cos(cop.a) * 64, cop.y + Math.sin(cop.a) * 64)) {
          const left = cop.a - Math.PI / 2;
          const right = cop.a + Math.PI / 2;
          const leftFree = !this.blockedAt(cop.x + Math.cos(left) * 78, cop.y + Math.sin(left) * 78);
          const rightFree = !this.blockedAt(cop.x + Math.cos(right) * 78, cop.y + Math.sin(right) * 78);
          const side = leftFree && !rightFree ? left : rightFree ? right : left;
          desired = side;
          wantSpeed = Math.min(wantSpeed, 235);
        }

        const diff = Math.atan2(Math.sin(desired - cop.a), Math.cos(desired - cop.a));
        cop.a += U.clamp(diff, -1, 1) * 3.3 * dt;
        cop.v += U.clamp(wantSpeed - cop.v, -COP_ACCEL * dt, COP_ACCEL * dt);
        cop.x += Math.cos(cop.a) * cop.v * dt;
        cop.y += Math.sin(cop.a) * cop.v * dt;
        const before = { x: cop.x, y: cop.y };
        this.resolveBlockCollision(cop, 15);
        if (before.x !== cop.x || before.y !== cop.y) cop.v *= 0.45;
        cop.x = U.clamp(cop.x, CAR_R, WORLD_W - CAR_R);
        cop.y = U.clamp(cop.y, CAR_R, WORLD_H - CAR_R);

        const hit = Math.hypot(cop.x - target.x, cop.y - target.y);
        if (hit < 34 && cop.v > 150) {
          if (!this.onFoot) {
            this.health -= 6;
            this.car.v *= 0.4;
            this.flash = 1;
          } else {
            this.bustedTimer += dt * 2;
          }
          A.fx.burst(cop.x, cop.y, {
            count: 10, colors: ['#ff5d5d', '#34e0ff', '#ffffff'],
            speed: 200, life: 0.4, size: 3
          });
        }
        // slow police cruiser next to a parked player means cuffs
        if (!this.onFoot && hit < 46 && Math.abs(this.car.v) < 70) this.bustedTimer += dt;
        if (this.onFoot && hit < 40) this.bustedTimer += dt;
      }

      if (this.bustedTimer > 2.2) {
        this.bustedTimer = 0;
        A.die('busted');
      } else {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt * 0.6);
      }
    },

    spawnCop(target) {
      for (let tries = 0; tries < 40; tries++) {
        const vertical = Math.random() < 0.5;
        const lane = U.randInt(0, vertical ? COLS : ROWS);
        const along = Math.random() * (vertical ? WORLD_H : WORLD_W);
        const x = vertical ? roadLine(lane) : along;
        const y = vertical ? along : roadLine(lane);
        const d = Math.hypot(x - target.x, y - target.y);
        if (d > 380 && d < 900) {
          this.cops.push({ x, y, a: Math.atan2(target.y - y, target.x - x), v: 120, siren: Math.random() * 6 });
          return;
        }
      }
    },

    blockedAt(x, y) {
      for (const b of this.city) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
      }
      return false;
    },

    addWanted(n) {
      this.wanted = Math.min(5, this.wanted + n);
      this.heat = 12;
      this.heatCooldown = 12;
    },

    updateHeat(dt) {
      if (this.wanted <= 0) return;
      if (this.heatCooldown > 0) {
        this.heatCooldown -= dt;
        return;
      }
      this.heat -= dt;
      if (this.heat <= 0) {
        this.wanted = Math.max(0, this.wanted - 1);
        this.heat = 9;
      }
    },

    updateMarker(dt) {
      const m = this.marker;
      if (!m) return;
      const who = this.onFoot ? this.foot : this.car;
      if (Math.hypot(who.x - m.x, who.y - m.y) < 52) {
        this.cash += 200;
        A.setScore(this.cash);
        this.health = Math.min(100, this.health + 8);
        A.Sound.tone(660, 0.09, { type: 'triangle', vol: 0.05, to: 990 });
        A.fx.burst(m.x, m.y, {
          count: 22, colors: ['#ff4d9d', '#ffd166', '#ffffff'],
          speed: 240, life: 0.7, size: 4
        });
        this.marker = this.newMarker();
      }
    },

    updateCamera(dt) {
      const who = this.onFoot ? this.foot : this.car;
      const lead = this.onFoot ? 0 : 0.5;
      const tx = U.clamp(who.x + Math.cos(this.car.a) * 90 * lead - W / 2, 0, WORLD_W - W);
      const ty = U.clamp(who.y + Math.sin(this.car.a) * 90 * lead - H / 2, 0, WORLD_H - H);
      this.cam.x = U.lerp(this.cam.x, tx, Math.min(1, dt * 5.5));
      this.cam.y = U.lerp(this.cam.y, ty, Math.min(1, dt * 5.5));
      this.cam.x = U.clamp(this.cam.x, 0, WORLD_W - W);
      this.cam.y = U.clamp(this.cam.y, 0, WORLD_H - H);
    },

    /* ---------------- drawing ---------------- */
    draw(c) {
      const cam = this.cam;
      c.fillStyle = '#05060f';
      c.fillRect(0, 0, W, H);
      c.save();
      c.translate(-cam.x, -cam.y);

      this.drawRoads(c);
      this.drawBlocks(c, cam);
      this.drawMarker(c);

      for (const p of this.peds) {
        if (!p.alive) continue;
        if (p.x < cam.x - 20 || p.x > cam.x + W + 20 || p.y < cam.y - 20 || p.y > cam.y + H + 20) continue;
        c.fillStyle = p.shirt;
        U.shadow(c, p.shirt, 8);
        c.beginPath();
        c.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
        c.fill();
        U.noShadow(c);
      }

      for (const cop of this.cops) this.drawCop(c, cop);
      if (this.onFoot) this.drawFoot(c);
      else this.drawCar(c);

      c.restore();
      this.drawHUD(c);

      if (this.flash > 0) {
        c.fillStyle = 'rgba(255, 77, 157, ' + (this.flash * 0.16).toFixed(3) + ')';
        c.fillRect(0, 0, W, H);
      }
    },

    drawRoads(c) {
      c.fillStyle = '#0b0e1e';
      for (let i = 0; i <= COLS; i++) {
        c.fillRect(roadLine(i) - ROAD / 2, 0, ROAD, WORLD_H);
      }
      for (let j = 0; j <= ROWS; j++) {
        c.fillRect(0, roadLine(j) - ROAD / 2, WORLD_W, ROAD);
      }
      // lane dashes
      c.strokeStyle = 'rgba(120, 150, 255, 0.22)';
      c.lineWidth = 2;
      c.setLineDash([26, 26]);
      c.beginPath();
      for (let i = 0; i <= COLS; i++) {
        c.moveTo(roadLine(i), 0);
        c.lineTo(roadLine(i), WORLD_H);
      }
      for (let j = 0; j <= ROWS; j++) {
        c.moveTo(0, roadLine(j));
        c.lineTo(WORLD_W, roadLine(j));
      }
      c.stroke();
      c.setLineDash([]);
    },

    drawBlocks(c, cam) {
      for (const b of this.city) {
        if (b.x + b.w < cam.x - 40 || b.x > cam.x + W + 40 ||
            b.y + b.h < cam.y - 40 || b.y > cam.y + H + 40) continue;
        const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        g.addColorStop(0, b.tint[0]);
        g.addColorStop(1, b.tint[1]);
        c.fillStyle = g;
        U.roundRect(c, b.x, b.y, b.w, b.h, b.radius);
        c.fill();

        c.strokeStyle = 'rgba(140, 170, 255, 0.20)';
        c.lineWidth = 1.5;
        c.stroke();

        // lit windows, deterministic per cell so they never flicker
        const stepX = b.w / b.cols;
        const stepY = b.h / b.rows;
        c.fillStyle = b.tint[2];
        for (let i = 0; i < b.cols; i++) {
          for (let j = 0; j < b.rows; j++) {
            const h = (i * 37 + j * 91 + Math.floor(b.seed)) % 11;
            if (h > 3) continue;
            c.globalAlpha = 0.18 + (h / 11) * 0.5;
            c.fillRect(b.x + i * stepX + stepX * 0.28, b.y + j * stepY + stepY * 0.3,
              stepX * 0.34, stepY * 0.3);
          }
        }
        c.globalAlpha = 1;

        if (b.sign) {
          c.fillStyle = b.sign;
          U.shadow(c, b.sign, 16);
          U.roundRect(c, b.x + 16, b.y + 14, Math.min(56, b.w * 0.3), 7, 4);
          c.fill();
          U.noShadow(c);
        }
      }
    },

    drawMarker(c) {
      const m = this.marker;
      if (!m) return;
      const pulse = 0.6 + Math.sin(m.pulse * 3.2) * 0.4;
      c.strokeStyle = 'rgba(255, 77, 157, ' + (0.35 + pulse * 0.4).toFixed(3) + ')';
      c.lineWidth = 3;
      U.shadow(c, '#ff4d9d', 22);
      c.beginPath();
      c.arc(m.x, m.y, 30 + pulse * 12, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(m.x, m.y, 12, 0, Math.PI * 2);
      c.stroke();
      U.noShadow(c);
      c.fillStyle = '#ff4d9d';
      c.globalAlpha = 0.25 + pulse * 0.3;
      c.beginPath();
      c.arc(m.x, m.y, 12, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    },

    carBody(c, x, y, a, fill, glow, len) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      U.shadow(c, glow, 18);
      c.fillStyle = fill;
      U.roundRect(c, -len / 2, -CAR_W / 2, len, CAR_W, 6);
      c.fill();
      U.noShadow(c);
      c.fillStyle = 'rgba(6, 8, 18, 0.85)';
      U.roundRect(c, -len * 0.1, -CAR_W / 2 + 3, len * 0.38, CAR_W - 6, 3);
      c.fill();
      c.fillStyle = 'rgba(210, 240, 255, 0.55)';
      U.roundRect(c, len * 0.34, -CAR_W / 2 + 5, 5, CAR_W - 10, 2);
      c.fill();
      c.restore();
    },

    drawCar(c) {
      const car = this.car;
      // headlights
      if (car.v !== 0) {
        c.save();
        c.translate(car.x, car.y);
        c.rotate(car.a);
        const spread = Math.min(1, Math.abs(car.v) / CAR_MAX);
        const grad = c.createLinearGradient(20, 0, 200, 0);
        grad.addColorStop(0, 'rgba(140, 220, 255, ' + (0.18 * spread).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(140, 220, 255, 0)');
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(18, -7);
        c.lineTo(190, -70 * (0.5 + spread));
        c.lineTo(190, 70 * (0.5 + spread));
        c.lineTo(18, 7);
        c.closePath();
        c.fill();
        c.restore();
      }
      // skid trail
      for (const t of this.trail) {
        c.globalAlpha = t.life * 0.35;
        c.fillStyle = '#34e0ff';
        c.beginPath();
        c.arc(t.x, t.y, 4, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;

      this.carBody(c, car.x, car.y, car.a, '#34e0ff', '#34e0ff', CAR_L);
      c.save();
      c.translate(car.x, car.y);
      c.rotate(car.a);
      c.fillStyle = '#ff4d9d';
      U.shadow(c, '#ff4d9d', 14);
      c.fillRect(-CAR_L / 2, -CAR_W / 2 + 3, 4, CAR_W - 6);
      c.restore();
      U.noShadow(c);
    },

    drawFoot(c) {
      const f = this.foot;
      const wobble = Math.sin(this.footStep || 0) * 1.6;
      c.save();
      c.translate(f.x, f.y);
      c.rotate(f.a);
      U.shadow(c, '#7ce7ff', 14);
      c.fillStyle = '#1b2340';
      U.roundRect(c, -6, -5, 13, 10, 4);
      c.fill();
      c.fillStyle = '#7ce7ff';
      c.beginPath();
      c.arc(wobble, 0, 4, 0, Math.PI * 2);
      c.fill();
      U.noShadow(c);
      c.restore();
    },

    drawCop(c, cop) {
      this.carBody(c, cop.x, cop.y, cop.a, '#e8ecff', '#9fb4ff', CAR_L);
      const phase = Math.sin(this.time * 12 + cop.siren) > 0;
      c.save();
      c.translate(cop.x, cop.y);
      c.rotate(cop.a);
      U.shadow(c, phase ? '#ff3355' : '#3355ff', 18);
      c.fillStyle = phase ? '#ff3355' : '#3355ff';
      c.fillRect(-CAR_L / 2 + 6, -CAR_W / 2 - 3, 16, 6);
      c.restore();
      U.noShadow(c);
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      c.lineWidth = 1;
      c.strokeRect(cop.x - CAR_L / 2, cop.y - CAR_W / 2, CAR_L, CAR_W);
    },

    drawHUD(c) {
      c.save();
      // cash
      c.font = 'bold 22px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.textAlign = 'left';
      c.fillStyle = 'rgba(12, 16, 32, 0.72)';
      U.roundRect(c, 18, 16, 150, 42, 12);
      c.fill();
      c.fillStyle = '#8ef7c0';
      c.fillText('$' + this.cash, 32, 45);

      // health
      c.fillStyle = 'rgba(12, 16, 32, 0.72)';
      U.roundRect(c, 18, 66, 150, 12, 6);
      c.fill();
      c.fillStyle = this.health > 40 ? '#34e0ff' : '#ff4d9d';
      U.roundRect(c, 18, 66, Math.max(0, 150 * (this.health / 100)), 12, 6);
      c.fill();

      // wanted stars
      c.textAlign = 'right';
      c.font = '18px ui-sans-serif, system-ui, sans-serif';
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i < this.wanted ? '#ff4d9d' : 'rgba(255, 255, 255, 0.14)';
        if (i < this.wanted) U.shadow(c, '#ff4d9d', 12);
        c.fillText('★', W - 22 - i * 24, 42);
        U.noShadow(c);
      }

      // speed
      const kph = Math.round(Math.abs(this.car.v) * 0.42);
      c.textAlign = 'left';
      c.font = 'bold 26px ui-monospace, monospace';
      c.fillStyle = this.onFoot ? 'rgba(255, 255, 255, 0.28)' : '#dbe6ff';
      c.fillText(kph + '', 24, H - 28);
      c.font = '12px ui-monospace, monospace';
      c.fillStyle = 'rgba(255, 255, 255, 0.4)';
      c.fillText('KM/H', 24 + c.measureText(kph + '').width + 34, H - 30);
      if (this.onFoot) {
        c.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
        c.fillStyle = '#7ce7ff';
        c.fillText(this.nearCar() ? 'Press SPACE / E to drive' : 'On foot', 24, H - 52);
      }

      this.drawMinimap(c);
      c.restore();
    },

    drawMinimap(c) {
      const mw = 150, mh = 118, mx = W - mw - 20, my = H - mh - 20;
      const sx = mw / WORLD_W, sy = mh / WORLD_H;
      c.fillStyle = 'rgba(8, 11, 24, 0.78)';
      U.roundRect(c, mx, my, mw, mh, 10);
      c.fill();
      c.strokeStyle = 'rgba(120, 150, 255, 0.22)';
      c.lineWidth = 1;
      c.stroke();

      c.fillStyle = 'rgba(120, 150, 255, 0.16)';
      for (const b of this.city) {
        c.fillRect(mx + b.x * sx, my + b.y * sy, b.w * sx, b.h * sy);
      }
      if (this.marker) {
        c.fillStyle = '#ff4d9d';
        c.beginPath();
        c.arc(mx + this.marker.x * sx, my + this.marker.y * sy, 3, 0, Math.PI * 2);
        c.fill();
      }
      for (const cop of this.cops) {
        c.fillStyle = '#ff5d5d';
        c.beginPath();
        c.arc(mx + cop.x * sx, my + cop.y * sy, 2.4, 0, Math.PI * 2);
        c.fill();
      }
      const who = this.onFoot ? this.foot : this.car;
      c.fillStyle = '#34e0ff';
      U.shadow(c, '#34e0ff', 8);
      c.beginPath();
      c.arc(mx + who.x * sx, my + who.y * sy, 3.2, 0, Math.PI * 2);
      c.fill();
      U.noShadow(c);
    }
  };

  window.Games = window.Games || {};
  window.Games.vice = game;
})();

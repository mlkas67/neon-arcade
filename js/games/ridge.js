/* Neon Ridge — a downhill extreme-sports run down a neon-lit mountain:
   carve the piste, pop off the banks, spin for points, thread the gates.
   An original three.js game in the spirit of downhill racers. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined' || !window.Stage3D) {
    console.warn('Neon Ridge needs three.js (vendor/three.min.js).');
    return;
  }

  const FINISH = 4200;
  const HALF_WIDTH = 78;
  const GRAVITY = 58;
  const JUMP_V = 25;
  const RIDE_MAX = 122;
  const SEGMENTS = 230;
  const SEG_LEN = FINISH / SEGMENTS;

  const NEON = { pink: 0xff4d9d, cyan: 0x34e0ff, mint: 0x4ade80, gold: 0xffd166 };

  const clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------------- course maths ---------------- */
  function centre(z) {
    return 92 * Math.sin(z * 0.00155) + 38 * Math.sin(z * 0.0034 + 1.7);
  }
  function centreSlope(z) {
    return 92 * 0.00155 * Math.cos(z * 0.00155) + 38 * 0.0034 * Math.cos(z * 0.0034 + 1.7);
  }
  /* The drop, plus long rollers so the run breathes. */
  function baseY(z) {
    return -z * 0.155 + 9 * Math.sin(z * 0.0052) + 4 * Math.sin(z * 0.013 + 2.1);
  }
  /* Snow banks curl up towards the edges of the piste. */
  function bank(o) {
    const t = clamp(Math.abs(o) / HALF_WIDTH, 0, 1);
    return 7.5 * t * t;
  }
  function surfaceY(z, o) { return baseY(z) + bank(o); }
  function worldPos(z, o, extraY) {
    return new THREE.Vector3(centre(z) + o, surfaceY(z, o) + (extraY || 0), z);
  }
  function tangent(z) {
    const s = centreSlope(z);
    return new THREE.Vector3(s, 0, 1).normalize();
  }
  function heading(z) { return Math.atan2(centreSlope(z), 1); }

  /* ---------------- stage ---------------- */
  const stage = Stage3D.create({
    canvasClass: 's3d-canvas',
    hudClass: 's3d-hud ridge',
    bg: 0x0b1633,
    fog: { color: 0x0b1633, near: 240, far: 1500 },
    fov: 66,
    near: 0.5,
    far: 3600,
    hudHTML:
      '<div class="s3d-top">' +
        '<div><div class="s3d-big s3d-speed">0 <small>KM/H</small></div></div>' +
        '<div class="s3d-chip s3d-gates">0 GATES</div>' +
      '</div>' +
      '<div class="s3d-mid s3d-trick"><span class="s3d-trick-text"></span><small>trick</small></div>' +
      '<div class="s3d-bars">' +
        '<div class="s3d-hint s3d-hint-a"></div>' +
        '<div class="s3d-combo s3d-combo-a"></div>' +
      '</div>' +
      '<div class="s3d-flash"></div>'
  });

  const scene = stage.scene;
  const camera = stage.camera;
  const hud = stage.hud;
  const speedEl = hud.querySelector('.s3d-speed');
  const gatesEl = hud.querySelector('.s3d-gates');
  const trickEl = hud.querySelector('.s3d-trick');
  const trickText = hud.querySelector('.s3d-trick-text');
  const hintEl = hud.querySelector('.s3d-hint-a');
  const comboEl = hud.querySelector('.s3d-combo-a');
  const flashEl = hud.querySelector('.s3d-flash');

  scene.background = new THREE.Color(0x0b1633);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(-260, 420, 180);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x1b2742, 1.05));
  scene.add(new THREE.AmbientLight(0x2b3a60, 0.42));

  /* ---------------- terrain ribbon ---------------- */
  const LANES = [-HALF_WIDTH, -HALF_WIDTH * 0.45, 0, HALF_WIDTH * 0.45, HALF_WIDTH];
  const LANE_COLOURS = [0xa8c2e6, 0xe8f2ff, 0xf6faff, 0xe8f2ff, 0xa8c2e6];

  function buildTerrain() {
    const cols = LANES.length;
    const positions = [];
    const colours = [];
    const indices = [];
    const c = new THREE.Color();

    for (let i = 0; i <= SEGMENTS; i++) {
      const z = i * SEG_LEN;
      for (let j = 0; j < cols; j++) {
        const o = LANES[j];
        positions.push(centre(z) + o, surfaceY(z, o), z);
        c.setHex(LANE_COLOURS[j]);
        const shade = 0.86 + 0.14 * Math.sin(z * 0.02 + j); // soft ripples in the snow
        colours.push(c.r * shade, c.g * shade, c.b * shade);
      }
    }
    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    return mesh;
  }
  /* ---------------- roadside scenery ---------------- */
  const coneGeo = new THREE.ConeGeometry(3.4, 12, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.55, 0.7, 3.4, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d5c4a, roughness: 0.85 });
  const treeDark = new THREE.MeshStandardMaterial({ color: 0x14483c, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.9 });
  const rockGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7a92, roughness: 0.75, flatShading: true });

  const world = new THREE.Group();
  scene.add(world);

  let rider = null;
  let obstacles = [];
  let gates = [];
  let mountains = null;

  function buildMountains() {
    if (mountains) return;
    mountains = new THREE.Group();
    const geo = new THREE.ConeGeometry(520, 420, 5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x23395f, roughness: 1, flatShading: true });
    const rnd = seeded(77113);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(-1200 + i * 300 + rnd() * 120, -180 + rnd() * 60, 1500 + rnd() * 700);
      m.rotation.y = rnd() * Math.PI;
      m.scale.setScalar(0.7 + rnd() * 0.9);
      mountains.add(m);
    }
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xdff0ff })
    );
    moon.position.set(-520, 520, 2200);
    mountains.add(moon);
    scene.add(mountains);
  }

  function addTree(x, y, z, scale, dark) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.7;
    g.add(trunk);
    const top = new THREE.Mesh(coneGeo, dark ? treeDark : treeMat);
    top.position.y = 8.2;
    g.add(top);
    const top2 = new THREE.Mesh(coneGeo, dark ? treeDark : treeMat);
    top2.position.y = 12.6;
    top2.scale.setScalar(0.7);
    g.add(top2);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    world.add(g);
  }

  function addRock(x, y, z, scale) {
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.position.set(x, y + 0.8, z);
    m.scale.set(scale, scale * 0.75, scale);
    m.rotation.set(Math.random(), Math.random() * 3, Math.random());
    world.add(m);
  }

  function addGate(z, o, finish) {
    const colour = finish ? NEON.gold : NEON.pink;
    const g = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.8, 0.9, 26, 8);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x1b2740, emissive: colour, emissiveIntensity: 0.55, roughness: 0.4
    });
    const half = finish ? 46 : 26;
    [-half, half].forEach(function (dx) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(dx, 12, 0);
      g.add(post);
    });
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(half, 1.5, 8, 26, Math.PI),
      new THREE.MeshBasicMaterial({ color: colour })
    );
    arch.position.y = 26;
    arch.rotation.z = Math.PI;
    g.add(arch);

    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 1.8, 3),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    band.position.y = 16;
    g.add(band);

    const base = addGlowRing(half, colour);
    g.add(base);

    g.position.set(centre(z) + o, surfaceY(z, o), z);
    g.rotation.y = heading(z);
    world.add(g);
    return g;
  }

  function addGlowRing(half, colour) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(half * 0.86, half, 26, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    return ring;
  }

  function buildRider() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0xff4d9d, roughness: 0.5, emissive: 0x7a0030, emissiveIntensity: 0.35 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x1b2740, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.75 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x34e0ff, emissive: 0x0d5a72, emissiveIntensity: 0.5, roughness: 0.4 });

    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 9.5), deckMat);
    board.position.y = 0.3;
    g.add(board);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 3.4, 8), jacket);
    torso.position.set(0, 2.9, 0.2);
    torso.rotation.x = 0.24;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 10), skin);
    head.position.set(0, 4.9, 0.6);
    g.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.35, metalness: 0.2 })
    );
    helmet.position.copy(head.position);
    g.add(helmet);

    [[-1.1, -0.9], [1.1, -0.9]].forEach(function (leg) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 2.1, 6), pants);
      l.position.set(leg[0], 1.35, leg[1]);
      l.rotation.x = 0.18;
      g.add(l);
    });
    [[-1.35, 2.1], [1.35, 2.1]].forEach(function (arm) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 2.4, 6), jacket);
      a.position.set(arm[0], 3.35, 0.35);
      a.rotation.z = arm[0] > 0 ? -0.55 : 0.55;
      g.add(a);
    });

    return g;
  }

  /* ---------------- world build (once per page) ---------------- */
  let built = false;

  function buildWorld() {
    if (built) return;
    built = true;

    world.add(buildTerrain());
    buildMountains();

    const rnd = seeded(424242);
    obstacles = [];
    gates = [];

    for (let z = 60; z < FINISH - 40; z += 26) {
      const side = rnd() < 0.5 ? -1 : 1;
      const o = side * (HALF_WIDTH - 2 - rnd() * 26);
      const x = centre(z) + o;
      const y = surfaceY(z, o);
      if (rnd() < 0.55) {
        addTree(x, y - 1, z, 0.9 + rnd() * 0.7, rnd() < 0.4);
        obstacles.push({ z: z, o: o, r: 4.2 });
      } else if (rnd() < 0.7) {
        addRock(x, y, z, 0.8 + rnd() * 0.9);
        obstacles.push({ z: z, o: o, r: 3.4 });
      }
    }

    /* A handful of obstacles sit inside the piste, so carving matters. */
    for (let z = 340; z < FINISH - 200; z += 150) {
      const o = (rnd() - 0.5) * HALF_WIDTH * 1.1;
      addRock(centre(z) + o, surfaceY(z, o), z, 1.1 + rnd() * 0.5);
      obstacles.push({ z: z, o: o, r: 4.0 });
    }

    for (let z = 320; z < FINISH - 80; z += 300) {
      const o = (rnd() - 0.5) * 58;
      addGate(z, o, false);
      gates.push({ z: z, o: o, half: 26, hit: false });
    }
    addGate(FINISH - 30, 0, true);
    gates.push({ z: FINISH - 30, o: 0, half: 46, hit: false, finish: true });

    rider = buildRider();
    scene.add(rider);
  }

  /* ---------------- input ---------------- */
  const TRACKED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];

  window.addEventListener('keydown', function (e) {
    if (Arcade.gameId !== 'ridge') return;
    const g = window.Games.ridge;
    if (!g || !g.keys) return;
    if (TRACKED.indexOf(e.code) >= 0 && Arcade.state === 'playing') e.preventDefault();
    g.keys[e.code] = true;
  });
  window.addEventListener('keyup', function (e) {
    if (Arcade.gameId !== 'ridge') return;
    const g = window.Games.ridge;
    if (!g || !g.keys) return;
    g.keys[e.code] = false;
  });
  window.addEventListener('blur', function () {
    const g = window.Games.ridge;
    if (g && g.keys) g.keys = {};
  });

  /* ---------------- game ---------------- */
  const game = {
    title: 'Neon Ridge',
    tip: 'Downhill run: carve the piste, thread the gates, spin off the banks and land it.',
    readyHeading: 'Neon Ridge',
    readyText: 'Four kilometres of neon snow. Press <kbd>Space</kbd> or tap to drop in.',
    deadHeading: 'Wiped out',
    deadText: 'The mountain won that one. Go again?',
    overlayDelay: 520,
    controlHint: '<kbd>←</kbd><kbd>→</kbd> carve · <kbd>↑</kbd> tuck · <kbd>↓</kbd> brake · <kbd>Space</kbd> jump, spin in the air',

    onDeath: function (reason) {
      if (reason === 'finish') {
        this.deadHeading = 'Run complete';
        this.deadText = 'Gate run in ' + this.time.toFixed(1) + 's — ' + Math.round(this.score) + ' points. Again?';
      } else {
        this.deadHeading = 'Wiped out';
        this.deadText = 'The mountain won that one. Go again?';
      }
    },

    reset: function (A) {
      this.A = A;
      this.keys = {};
      this.time = 0;
      this.z = 0;
      this.o = 0;
      this.h = 0;
      this.vy = 0;
      this.speed = 38;
      this.spin = 0;
      this.spinVel = 0;
      this.airborne = false;
      this.grab = false;
      this.score = 0;
      this.gatesPassed = 0;
      this.runs = 0;
      this.trickTimer = 0;
      this.flash = 0;
      this.lean = 0;
      this.camLook = worldPos(0, 0, 2);
      this.lastZ = 0;
      this.dead = false;

      buildWorld();
      gates.forEach(function (g) { g.hit = false; });

      const pos = worldPos(this.z, this.o, this.h);
      rider.position.copy(pos);
      rider.rotation.set(0, heading(this.z), 0);

      this.placeCamera(1);
      stage.show();
      A.setScore(0);
      this.updateHud();
    },

    placeCamera: function (k) {
      const pos = worldPos(this.z, this.o, this.h);
      const tan = tangent(this.z);
      const want = pos.clone().addScaledVector(tan, -19 - Math.min(6, this.speed / 26));
      want.y += 10.5;
      const look = pos.clone().addScaledVector(tan, 22);
      look.y += 4.5;
      if (k >= 1) {
        camera.position.copy(want);
        this.camLook.copy(look);
      } else {
        const e = 1 - Math.exp(-14 * k);
        camera.position.lerp(want, e);
        this.camLook.lerp(look, e);
      }
      camera.lookAt(this.camLook);
    },

    action: function () {
      if (!this.airborne) {
        this.airborne = true;
        this.vy = JUMP_V * (0.72 + Math.min(0.55, this.speed / 190));
        this.spin = 0;
        this.spinVel = 0;
        this.grab = false;
        if (this.A && this.A.Sound) this.A.Sound.jump();
      }
    },

    update: function (dt) {
      const keys = this.keys || {};
      this.time += dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
      if (this.trickTimer > 0) this.trickTimer = Math.max(0, this.trickTimer - dt);

      const tuck = keys.ArrowUp || keys.KeyW;
      const brake = keys.ArrowDown || keys.KeyS;
      const steer = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);

      /* speed: gravity pulls, tuck helps, brake scrubs */
      let accel = 19 + (tuck ? 15 : 0) - (brake ? 40 : 0);
      accel -= this.speed * 0.1;
      if (this.airborne) accel = -this.speed * 0.03;
      this.speed = clamp(this.speed + accel * dt, brake ? 9 : 18, RIDE_MAX);

      const prevZ = this.z;
      this.z += this.speed * dt;

      /* carving */
      this.lean = lerp(this.lean, steer * (this.airborne ? 0.12 : 0.32), 1 - Math.exp(-8 * dt));
      if (this.airborne) {
        const target = steer * 7.2;
        this.spinVel = lerp(this.spinVel, target, 1 - Math.exp(-9 * dt));
        this.spin += this.spinVel * dt;
        this.grab = !!(keys.ArrowDown || keys.KeyS);
      } else {
        this.o += steer * (15 + this.speed * 0.24) * dt;
        if (Math.abs(this.o) > HALF_WIDTH - 2.5) {
          this.o = clamp(this.o, -(HALF_WIDTH - 2.5), HALF_WIDTH - 2.5);
          this.speed *= 0.985;
          this.spin = 0;
        }
      }

      /* height above the snow */
      const ground = 0;
      if (this.airborne) {
        this.vy -= GRAVITY * dt;
        this.h += this.vy * dt;
        if (this.h <= ground) {
          this.h = 0;
          this.vy = 0;
          this.airborne = false;
          this.land();
        }
      } else {
        /* small pops off the banked edges */
        if (Math.abs(this.o) > HALF_WIDTH * 0.78 && this.speed > 62) {
          this.airborne = true;
          this.vy = 9 + (this.speed - 62) * 0.1;
        }
      }

      /* gates */
      const self = this;
      gates.forEach(function (g) {
        if (g.hit) return;
        if (prevZ < g.z && self.z >= g.z) {
          const reach = g.finish ? g.half * 0.9 : g.half * 0.86;
          if (Math.abs(self.o - g.o) <= reach) {
            g.hit = true;
            self.gatesPassed++;
            self.score += g.finish ? 900 : 220;
            self.speed += g.finish ? 0 : 5;
            self.flash = Math.max(self.flash, 0.5);
            if (self.A && self.A.Sound) self.A.Sound.point();
          }
        }
      });

      /* rocks and trees */
      for (let i = 0; i < obstacles.length; i++) {
        const ob = obstacles[i];
        if (Math.abs(ob.z - this.z) > ob.r + 2) continue;
        if (Math.abs(ob.o - this.o) < ob.r + 1.4) {
          this.crash();
          return;
        }
      }

      this.score += this.speed * dt * 1.4;
      if (this.z >= FINISH) {
        this.score += 1500;
        this.A.setScore(Math.round(this.score));
        this.A.die('finish');
        return;
      }

      this.A.setScore(Math.round(this.score));
      this.placeCamera(dt);
      this.poseRider();
      this.updateHud();
    },

    land: function () {
      const turns = Math.abs(this.spin) / (Math.PI * 2);
      const whole = Math.floor(turns + 0.16);
      const off = turns - whole;

      if (whole >= 1) {
        const base = whole >= 3 ? 260 : whole === 2 ? 200 : 140;
        const pts = base + (this.grab ? 70 : 0) + (this.speed > 88 ? 60 : 0);
        this.score += pts;
        this.showTrick((whole * 360) + (this.grab ? ' GRAB' : ''));
        this.flash = Math.max(this.flash, 0.35);
        if (this.A && this.A.Sound) this.A.Sound.point();
        this.speed = Math.min(RIDE_MAX, this.speed + 4);
      } else if (off > 0.2 || this.spinVel !== 0) {
        this.speed *= 0.78;
        this.showTrick('SKETCHY');
      } else if (this.A && this.A.Sound) {
        this.A.Sound.land();
      }

      this.spin = 0;
      this.spinVel = 0;
      this.grab = false;
    },

    showTrick: function (word) {
      trickText.textContent = word;
      trickEl.classList.add('is-on');
      this.trickTimer = 1.1;
    },

    crash: function () {
      if (this.dead) return;
      this.dead = true;
      this.speed = 0;
      this.vy = 0;
      this.airborne = false;
      this.h = 0;
      this.flash = 1;
      if (this.A && this.A.Sound) this.A.Sound.hit();
      this.poseRider();
      this.updateHud();
      this.A.die('wipeout');
    },

    poseRider: function () {
      if (!rider) return;
      rider.position.copy(worldPos(this.z, this.o, this.h));
      const lean = clamp(this.lean, -1, 1);
      rider.rotation.set(this.airborne ? -0.12 : 0, heading(this.z) + this.spin, -lean * 0.5);
      /* crouch when tucking */
      const crouch = (this.keys.ArrowUp || this.keys.KeyW) ? -0.55 : 0;
      rider.position.y += this.airborne ? 0 : crouch * 0.25;
    },

    updateHud: function () {
      speedEl.innerHTML = Math.round(this.speed * 1.9) + ' <small>KM/H</small>';
      gatesEl.textContent = this.gatesPassed + ' GATES';
      if (this.trickTimer <= 0) trickEl.classList.remove('is-on');
      hintEl.textContent = this.airborne
        ? (this.grab ? 'GRAB — let go before landing' : 'SPIN — land straight')
        : 'SPACE — jump';
      comboEl.classList.toggle('is-on', this.speed > 95);
      comboEl.textContent = this.speed > 95 ? 'TUCKED OUT' : '';
      flashEl.style.opacity = (this.flash * 0.5).toFixed(2);
    },

    draw: function () {
      stage.renderer.render(scene, camera);
    },

    destroy: function () {
      this.keys = {};
      if (rider) rider.visible = true;
      stage.hide();
    }
  };

  window.Games = window.Games || {};
  window.Games.ridge = game;
  window.Ridge = { game: game, stage: stage };
})();

/* Neon Deck — a neon skate plaza: push, pop, flip, grind the rails and
   chain tricks into a combo before you bail. Original three.js skate homage. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined' || !window.Stage3D) {
    console.warn('Neon Deck needs three.js (vendor/three.min.js).');
    return;
  }

  const HALF_X = 104;
  const HALF_Z = 86;
  const GRAVITY = 30;
  const JUMP_V = 11.5;
  const PUSH_MAX = 27;
  const PLATFORM_Y = 5.5;

  const PALETTE = {
    deck: 0x141a2c,
    line: 0x34e0ff,
    pink: 0xff4d9d,
    violet: 0x8b5cf6,
    gold: 0xffd166,
    concrete: 0x232a3d,
    rail: 0xd7e4ff
  };

  const clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------------- stage ---------------- */
  const stage = Stage3D.create({
    canvasClass: 's3d-canvas',
    hudClass: 's3d-hud deck',
    bg: 0x0a0f22,
    fog: { color: 0x0a0f22, near: 180, far: 620 },
    fov: 64,
    near: 0.4,
    far: 2200,
    hudHTML:
      '<div class="s3d-top">' +
        '<div><div class="s3d-big s3d-points">0</div></div>' +
        '<div class="s3d-chip s3d-speed">0 KM/H</div>' +
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
  const pointsEl = hud.querySelector('.s3d-points');
  const speedEl = hud.querySelector('.s3d-speed');
  const trickEl = hud.querySelector('.s3d-trick');
  const trickText = hud.querySelector('.s3d-trick-text');
  const hintEl = hud.querySelector('.s3d-hint-a');
  const comboEl = hud.querySelector('.s3d-combo-a');
  const flashEl = hud.querySelector('.s3d-flash');

  scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x101728, 1.0));
  scene.add(new THREE.AmbientLight(0x36406b, 0.5));

  const key = new THREE.DirectionalLight(0xfff0d6, 1.15);
  key.position.set(-70, 120, 60);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff4d9d, 0.75);
  rim.position.set(120, 60, -140);
  scene.add(rim);

  /* ---------------- procedural concrete texture ---------------- */
  function deckTexture() {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    c.fillStyle = '#1b2236';
    c.fillRect(0, 0, size, size);
    const rnd = seeded(991);
    for (let i = 0; i < 2600; i++) {
      const a = 0.03 + rnd() * 0.07;
      c.fillStyle = rnd() < 0.5
        ? 'rgba(255,255,255,' + a.toFixed(3) + ')'
        : 'rgba(0,0,0,' + a.toFixed(3) + ')';
      c.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    c.strokeStyle = 'rgba(52, 224, 255, 0.30)';
    c.lineWidth = 2;
    c.strokeRect(0, 0, size, size);
    c.strokeStyle = 'rgba(52, 224, 255, 0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(size / 2, 0); c.lineTo(size / 2, size);
    c.moveTo(0, size / 2); c.lineTo(size, size / 2);
    c.stroke();

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 22);
    tex.anisotropy = 4;
    return tex;
  }

  /* ---------------- plaza geometry ---------------- */
  const world = new THREE.Group();
  scene.add(world);
  const shared = [];

  function mat(colour, opts) {
    const o = opts || {};
    return new THREE.MeshStandardMaterial({
      color: colour,
      roughness: o.roughness == null ? 0.6 : o.roughness,
      metalness: o.metalness == null ? 0.08 : o.metalness,
      emissive: o.emissive == null ? 0x000000 : o.emissive,
      emissiveIntensity: o.emissiveIntensity == null ? 0 : o.emissiveIntensity,
      transparent: !!o.transparent,
      opacity: o.opacity == null ? 1 : o.opacity,
      side: o.side || THREE.FrontSide
    });
  }

  function neonEdge(w, h, d, colour) {
    const g = new THREE.Group();
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: colour })
    );
    g.add(strip);
    return g;
  }

  const plaza = { ledges: [], rails: [], ramps: [] };

  function buildPlaza() {
    const floorGeo = new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2);
    const floorMat = mat(0x1b2236, { roughness: 0.85 });
    floorMat.map = deckTexture();
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    world.add(floor);

    const kerbMat = mat(PALETTE.concrete, { roughness: 0.75 });
    const edges = [
      [0, -HALF_Z, HALF_X * 2, 1.4],
      [0, HALF_Z, HALF_X * 2, 1.4],
      [-HALF_X, 0, 1.4, HALF_Z * 2],
      [HALF_X, 0, 1.4, HALF_Z * 2]
    ];
    edges.forEach(function (e) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(e[2], 6, e[3]), kerbMat);
      wall.position.set(e[0], 3, e[1]);
      world.add(wall);
      const glow = neonEdge(e[2], 0.3, 0.3, PALETTE.line);
      glow.position.set(e[0], 6.1, e[1]);
      world.add(glow);
    });

    /* raised ledge with steps on both sides */
    function addLedge(x, z, w, d, h) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kerbMat);
      base.position.set(x, h / 2, z);
      world.add(base);

      const lip = neonEdge(w, 0.22, d, PALETTE.violet);
      lip.position.set(x, h + 0.11, z);
      lip.scale.set(1, 1, 1);
      world.add(lip);
      const edgeGlow = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.5, 0.24),
        new THREE.MeshBasicMaterial({ color: PALETTE.violet })
      );
      edgeGlow.position.set(x, h * 0.55, z + d / 2 + 0.08);
      world.add(edgeGlow);

      /* stairs at both ends */
      for (let i = 1; i <= 3; i++) {
        const stepH = (h / 4) * i;
        const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, stepH, d), mat(0x2a3350, { roughness: 0.8 }));
        step.position.set(x - w / 2 - 1.4 - (3 - i) * 0 - (3 - i) * 0, stepH / 2, z);
        step.position.x = x - w / 2 - 2.1 * i;
        step.scale.x = 1;
        world.add(step);
        const step2 = step.clone();
        step2.position.x = x + w / 2 + 2.1 * i;
        world.add(step2);
      }

      plaza.ledges.push({ x: x, z: z, w: w, d: d, h: h });
    }

    addLedge(-46, -26, 44, 22, PLATFORM_Y);

    /* long flat bank to ollie off */
    const bank = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 16), kerbMat);
    bank.position.set(30, 1.5, -48);
    world.add(bank);
    const bankGlow = neonEdge(60, 0.18, 16, PALETTE.line);
    bankGlow.position.set(30, 3.05, -48);
    world.add(bankGlow);
    plaza.ledges.push({ x: 30, z: -48, w: 60, d: 16, h: 3 });

    /* funbox */
    const funbox = new THREE.Mesh(new THREE.BoxGeometry(26, 3.6, 26), kerbMat);
    funbox.position.set(-62, 1.8, 40);
    world.add(funbox);
    const funGlow = neonEdge(26, 0.18, 26, PALETTE.pink);
    funGlow.position.set(-62, 3.7, 40);
    world.add(funGlow);
    plaza.ledges.push({ x: -62, z: 40, w: 26, d: 26, h: 3.6 });

    /* rail: pos, length, axis */
    function addRail(x, z, length, axis, height) {
      const h = height == null ? 2.3 : height;
      const barGeo = new THREE.CylinderGeometry(0.28, 0.28, length, 10);
      const bar = new THREE.Mesh(barGeo, mat(PALETTE.rail, { metalness: 0.85, roughness: 0.22 }));
      bar.position.set(x, h, z);
      if (axis === 'x') bar.rotation.z = Math.PI / 2;
      else bar.rotation.x = Math.PI / 2;
      world.add(bar);

      const glowBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, length, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.28 })
      );
      glowBar.position.copy(bar.position);
      glowBar.rotation.copy(bar.rotation);
      world.add(glowBar);

      const postGeo = new THREE.CylinderGeometry(0.2, 0.2, h, 8);
      const postMat = mat(0x2c3552, { metalness: 0.6, roughness: 0.4 });
      [-length / 2 + 0.6, length / 2 - 0.6].forEach(function (off) {
        const p = new THREE.Mesh(postGeo, postMat);
        if (axis === 'x') p.position.set(x + off, h / 2, z);
        else p.position.set(x, h / 2, z + off);
        world.add(p);
      });

      plaza.rails.push({ x: x, z: z, len: length, axis: axis, h: h });
    }

    addRail(18, 8, 34, 'z');
    addRail(46, -18, 26, 'x');
    addRail(-14, 58, 30, 'x');

    /* quarter-pipe / kicker */
    function addKicker(x, z, face) {
      const g = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(11, 0);
      shape.quadraticCurveTo(6, 5.4, 4.4, 7.4);
      shape.lineTo(0, 7.4);
      shape.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 22, bevelEnabled: false, curveSegments: 14 });
      const m = new THREE.Mesh(geo, mat(PALETTE.concrete, { roughness: 0.7 }));
      m.position.set(-2, 0, -11);
      g.add(m);

      const lipCurve = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 21),
        new THREE.MeshBasicMaterial({ color: PALETTE.line })
      );
      lipCurve.position.set(4.4, 7.5, 0);
      g.add(lipCurve);

      g.position.set(x, 0, z);
      g.rotation.y = face;
      world.add(g);
      plaza.ramps.push({ x: x, z: z, face: face });
    }

    addKicker(72, 52, Math.PI);
    addKicker(-70, -60, 0);

    /* street lamps for glow */
    const lampGeo = new THREE.CylinderGeometry(0.3, 0.42, 26, 8);
    const lampMat = mat(0x222b42, { metalness: 0.7, roughness: 0.35 });
    const bulbGeo = new THREE.SphereGeometry(1.1, 10, 8);
    [[-96, -74], [96, -74], [-96, 74], [96, 74], [0, -78]].forEach(function (p, i) {
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(p[0], 13, p[1]);
      world.add(pole);
      const colour = [PALETTE.pink, PALETTE.line, PALETTE.violet, PALETTE.gold, PALETTE.line][i % 5];
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: colour }));
      bulb.position.set(p[0], 26, p[1]);
      world.add(bulb);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18 })
      );
      glow.position.copy(bulb.position);
      world.add(glow);
    });

    /* skyline backdrop */
    const bMat = mat(0x121a30, { roughness: 0.9 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x2b6f9a });
    const rnd = seeded(20234);
    for (let i = 0; i < 26; i++) {
      const w = 14 + rnd() * 20;
      const h = 30 + rnd() * 110;
      const d = 14 + rnd() * 20;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
      const side = i % 4;
      const dist = 150 + rnd() * 90;
      const along = -180 + rnd() * 360;
      if (side === 0) b.position.set(along, h / 2, -dist);
      else if (side === 1) b.position.set(along, h / 2, dist);
      else if (side === 2) b.position.set(-dist, h / 2, along);
      else b.position.set(dist, h / 2, along);
      world.add(b);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.5, 0.3), winMat);
      strip.position.set(b.position.x, h * 0.72, b.position.z + (b.position.z < 0 ? d / 2 : -d / 2));
      if (side >= 2) {
        strip.position.set(b.position.x + (b.position.x < 0 ? w / 2 : -w / 2), h * 0.72, b.position.z);
        strip.rotation.y = Math.PI / 2;
      }
      world.add(strip);
    }
  }
  /* ---------------- skater ---------------- */
  let skater = null;
  let board = null;
  let deckPivotRef = null;
  let riderBody = null;

  function buildSkater() {
    const g = new THREE.Group();

    const deckShape = new THREE.BoxGeometry(3.4, 0.26, 9.6);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x1c2338, roughness: 0.55, metalness: 0.15,
      emissive: 0x0a4a63, emissiveIntensity: 0.45
    });
    const deckPivot = new THREE.Group();
    deckPivot.position.y = 1.0;
    g.add(deckPivot);
    deckPivotRef = deckPivot;

    const deck = new THREE.Mesh(deckShape, deckMat);
    deckPivot.add(deck);

    const gripMat = new THREE.MeshStandardMaterial({ color: 0x0e1422, roughness: 0.95 });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 9.2), gripMat);
    grip.position.y = 0.15;
    deckPivot.add(grip);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.4 });
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
    [[-1.05, 3.1], [1.05, 3.1], [-1.05, -3.1], [1.05, -3.1]].forEach(function (w) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(w[0], -0.45, w[1]);
      wheel.rotation.z = Math.PI / 2;
      deckPivot.add(wheel);
    });

    const jacket = new THREE.MeshStandardMaterial({
      color: 0x34e0ff, roughness: 0.45, emissive: 0x063a4a, emissiveIntensity: 0.5
    });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b3350, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c39a, roughness: 0.75 });

    const body = new THREE.Group();
    body.position.y = 0.2;

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.02, 3.2, 8), jacket);
    torso.position.set(0, 3.4, 0);
    torso.rotation.x = 0.18;
    body.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.74, 12, 10), skin);
    head.position.set(0, 5.3, 0.2);
    body.add(head);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xff4d9d, roughness: 0.5 })
    );
    cap.position.copy(head.position);
    body.add(cap);

    [[-1.0], [1.0]].forEach(function (side) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 2.2, 6), pants);
      leg.position.set(side[0], 1.9, side[0] > 0 ? 1.1 : -1.1);
      leg.rotation.x = side[0] > 0 ? -0.25 : 0.25;
      body.add(leg);
    });

    [[-1.3], [1.3]].forEach(function (side) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 2.3, 6), jacket);
      arm.position.set(side[0], 3.7, 0.1);
      arm.rotation.z = side[0] > 0 ? -0.75 : 0.75;
      body.add(arm);
    });

    g.add(body);
    board = g;
    riderBody = body;
    return g;
  }

  /* ---------------- spark pool ---------------- */
  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const sparkMats = [0xffd166, 0xff9f43, 0xfff3c4].map(function (c) {
    return new THREE.MeshBasicMaterial({ color: c, transparent: true });
  });

  function initSparks() {
    if (sparks.length) return;
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMats[i % sparkMats.length].clone());
      m.visible = false;
      const sp = { mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0 };
      sparks.push(sp);
      scene.add(m);
    }
  }

  function emitSparks(pos, n, power) {
    initSparks();
    for (let i = 0; i < sparks.length && n > 0; i++) {
      const sp = sparks[i];
      if (sp.life > 0) continue;
      sp.life = 0.34 + Math.random() * 0.25;
      sp.max = sp.life;
      sp.mesh.visible = true;
      sp.mesh.position.copy(pos);
      sp.vx = (Math.random() - 0.5) * power;
      sp.vy = Math.random() * power * 0.7;
      sp.vz = (Math.random() - 0.5) * power;
      sp.mesh.scale.setScalar(0.6 + Math.random());
      n--;
    }
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      if (sp.life <= 0) continue;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.mesh.visible = false;
        continue;
      }
      sp.vy -= 26 * dt;
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y += sp.vy * dt;
      sp.mesh.position.z += sp.vz * dt;
      sp.mesh.material.opacity = Math.max(0, sp.life / sp.max);
    }
  }

  /* ---------------- plaza queries ---------------- */
  function groundHeightAt(x, z) {
    let h = 0;
    const ledges = plaza.ledges;
    for (let i = 0; i < ledges.length; i++) {
      const L = ledges[i];
      if (Math.abs(x - L.x) < L.w / 2 - 0.6 && Math.abs(z - L.z) < L.d / 2 - 0.6) {
        if (L.h > h) h = L.h;
      }
    }
    return h;
  }

  function findRail(x, z, y) {
    const rails = plaza.rails;
    for (let i = 0; i < rails.length; i++) {
      const r = rails[i];
      const along = r.axis === 'x' ? x - r.x : z - r.z;
      const lateral = r.axis === 'x' ? z - r.z : x - r.x;
      if (Math.abs(along) > r.len / 2 + 2) continue;
      if (Math.abs(lateral) > 2.6) continue;
      if (y < r.h - 0.9 || y > r.h + 5.5) continue;
      return r;
    }
    return null;
  }

  function rampLaunch(x, z, speed) {
    for (let i = 0; i < plaza.ramps.length; i++) {
      const r = plaza.ramps[i];
      const dx = x - r.x;
      const dz = z - r.z;
      const c = Math.cos(r.face);
      const s = Math.sin(r.face);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (lx > -4 && lx < 8 && Math.abs(lz) < 10.5 && speed > 8) return r;
    }
    return null;
  }

  /* ---------------- input ---------------- */
  const TRACKED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  window.addEventListener('keydown', function (e) {
    if (Arcade.gameId !== 'deck') return;
    const g = window.Games.deck;
    if (!g || !g.keys) return;
    if (TRACKED.indexOf(e.code) >= 0 && Arcade.state === 'playing') e.preventDefault();
    g.keys[e.code] = true;
  });
  window.addEventListener('keyup', function (e) {
    if (Arcade.gameId !== 'deck') return;
    const g = window.Games.deck;
    if (!g || !g.keys) return;
    g.keys[e.code] = false;
  });
  window.addEventListener('blur', function () {
    const g = window.Games.deck;
    if (g && g.keys) g.keys = {};
  });

  /* ---------------- game ---------------- */
  const game = {
    title: 'Neon Deck',
    tip: 'Skate plaza: push, pop, flip and grind the rails. Chain tricks, keep the combo alive.',
    readyHeading: 'Neon Deck',
    readyText: 'A neon plaza, three rails and no rules. Press <kbd>Space</kbd> or tap to drop in.',
    deadHeading: 'Bailed',
    deadText: 'Sketchy landing. Shake it off and run it back?',
    overlayDelay: 480,
    controlHint: '<kbd>W</kbd> push · <kbd>A</kbd><kbd>D</kbd> carve / flip in the air · <kbd>Space</kbd> ollie · <kbd>S</kbd> brake',

    onDeath: function () {
      this.deadHeading = 'Bailed';
      this.deadText = 'You banked ' + Math.round(this.score) + ' points. Run it back?';
    },

    reset: function (A) {
      this.A = A;
      this.keys = {};
      this.time = 0;
      this.pos = new THREE.Vector3(0, 0, 62);
      this.a = Math.PI;
      this.speed = 0;
      this.vy = 0;
      this.grounded = true;
      this.flip = 0;
      this.flipVel = 0;
      this.shove = 0;
      this.shoveVel = 0;
      this.grind = null;
      this.grindDir = 1;
      this.grindCool = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.score = 0;
      this.trickTimer = 0;
      this.flash = 0;
      this.bailed = false;
      this.sparkTick = 0;
      this.pushPhase = 0;
      /* the overlay button's click also bubbles a pointerdown into the frame,
         so swallow any action fired on the very first frame */
      this.startLock = true;
      this.camPos = new THREE.Vector3();
      this.camLook = new THREE.Vector3();

      initSparks();
      for (let i = 0; i < sparks.length; i++) {
        sparks[i].life = 0;
        sparks[i].mesh.visible = false;
      }

      if (!skater) {
        buildPlaza();
        skater = buildSkater();
        scene.add(skater);
      }

      this.poseSkater();
      this.placeCamera(1);
      stage.show();
      A.setScore(0);
      this.updateHud();
    },

    fwd: function () {
      return { x: Math.sin(this.a), z: Math.cos(this.a) };
    },

    placeCamera: function (k) {
      const f = this.fwd();
      const want = new THREE.Vector3(
        this.pos.x - f.x * 14,
        this.pos.y + 7.4,
        this.pos.z - f.z * 14
      );
      const look = new THREE.Vector3(
        this.pos.x + f.x * 9,
        this.pos.y + 2.4,
        this.pos.z + f.z * 9
      );
      if (k >= 1) {
        this.camPos.copy(want);
        this.camLook.copy(look);
      } else {
        const e = 1 - Math.exp(-9 * k);
        this.camPos.lerp(want, e);
        this.camLook.lerp(look, e);
      }
      camera.position.copy(this.camPos);
      camera.lookAt(this.camLook);
    },

    action: function () {
      if (this.startLock) return;
      if (this.grind) {
        this.grind = null;
        this.grindCool = 0.4;
        this.vy = 8.2;
        this.pos.y += 0.2;
        this.grounded = false;
        this.addTrick('POP OUT', 45);
        if (this.A && this.A.Sound) this.A.Sound.jump();
        return;
      }
      if (this.grounded) {
        this.grounded = false;
        this.vy = JUMP_V * (0.85 + Math.min(0.4, this.speed / 60));
        this.flip = 0;
        this.flipVel = 0;
        this.shove = 0;
        this.shoveVel = 0;
        if (this.A && this.A.Sound) this.A.Sound.jump();
      }
    },

    addTrick: function (name, base) {
      this.combo += 1;
      this.comboTimer = 3.4;
      const pts = Math.round(base * (1 + (this.combo - 1) * 0.5));
      this.score += pts;
      trickText.textContent = name + (this.combo > 1 ? '  x' + this.combo : '');
      trickEl.classList.add('is-on');
      this.trickTimer = 1.3;
      this.flash = Math.max(this.flash, 0.28);
      if (this.A && this.A.Sound) this.A.Sound.point();
      return pts;
    },

    update: function (dt) {
      const keys = this.keys || {};
      this.time += dt;
      updateSparks(dt);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
      if (this.trickTimer > 0) this.trickTimer = Math.max(0, this.trickTimer - dt);
      if (this.grindCool > 0) this.grindCool = Math.max(0, this.grindCool - dt);

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      const push = keys.KeyW || keys.ArrowUp;
      const brake = keys.KeyS || keys.ArrowDown;
      const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);

      if (this.grind) {
        this.updateGrind(dt, steer);
      } else {
        /* rolling */
        if (this.grounded) {
          if (push) {
            this.speed = Math.min(PUSH_MAX, this.speed + 16 * dt);
            this.pushPhase += dt * 7;
          } else {
            this.speed *= Math.pow(0.78, dt);
          }
          if (brake) this.speed = Math.max(0, this.speed - 30 * dt);
          this.a += steer * (1.85 - Math.min(1.05, this.speed / 26)) * dt;
        } else {
          this.a += steer * 0.55 * dt;
        }

        const f = this.fwd();
        const nextX = this.pos.x + f.x * this.speed * dt;
        const nextZ = this.pos.z + f.z * this.speed * dt;
        const nextGround = groundHeightAt(nextX, nextZ);
        if (this.grounded && nextGround - this.pos.y > 1.2) {
          /* ran into the side of a ledge */
          this.speed *= 0.25;
        } else {
          this.pos.x = nextX;
          this.pos.z = nextZ;
        }

        if (this.pos.x < -HALF_X + 3) { this.pos.x = -HALF_X + 3; this.speed *= 0.7; }
        if (this.pos.x > HALF_X - 3) { this.pos.x = HALF_X - 3; this.speed *= 0.7; }
        if (this.pos.z < -HALF_Z + 3) { this.pos.z = -HALF_Z + 3; this.speed *= 0.7; }
        if (this.pos.z > HALF_Z - 3) { this.pos.z = HALF_Z - 3; this.speed *= 0.7; }

        const ground = groundHeightAt(this.pos.x, this.pos.z);
        if (this.grounded) {
          if (this.pos.y > ground + 0.35) {
            this.grounded = false;
            this.vy = 0;
          } else {
            this.pos.y = ground;
          }
        }

        if (!this.grounded) {
          this.vy -= GRAVITY * dt;
          this.pos.y += this.vy * dt;

          /* tricks in the air */
          const spin = steer;
          this.flipVel = lerp(this.flipVel, spin * 11.5, 1 - Math.exp(-14 * dt));
          this.flip += this.flipVel * dt;
          this.shoveVel = lerp(this.shoveVel, (brake ? 1 : 0) * 5.2, 1 - Math.exp(-8 * dt));
          this.shove += this.shoveVel * dt;

          /* kickers throw you */
          const ramp = rampLaunch(this.pos.x, this.pos.z, this.speed);
          if (ramp && this.vy < 4) {
            this.vy = 9 + this.speed * 0.42;
            this.speed = Math.min(PUSH_MAX + 6, this.speed * 1.12);
            this.pos.y = Math.max(this.pos.y, 1.5);
          }

          /* rails */
          if (!this.grind && this.grindCool <= 0 && this.vy < 2.5) {
            const rail = findRail(this.pos.x, this.pos.z, this.pos.y);
            if (rail) this.lockGrind(rail);
          }

          if (this.pos.y <= ground) {
            this.pos.y = ground;
            this.land();
          }
        } else {
          /* ollie off the lip of a ramp, even without pressing jump */
          const ramp = rampLaunch(this.pos.x, this.pos.z, this.speed);
          if (ramp && this.speed > 14) {
            this.grounded = false;
            this.vy = 7 + this.speed * 0.3;
            this.pos.y += 0.2;
          }
        }
      }

      this.score += Math.max(0, this.speed) * dt * 0.55;
      this.A.setScore(Math.round(this.score));
      this.poseSkater();
      this.placeCamera(dt);
      this.updateHud();
      this.startLock = false;
      this.speed = clamp(this.speed, 0, 42);
    },

    lockGrind: function (rail) {
      this.grind = rail;
      this.grindDir = 1;
      this.pos.y = rail.h - 0.55;
      this.vy = 0;
      this.grounded = false;
      this.flip = 0;
      this.flipVel = 0;
      this.shove = 0;
      this.shoveVel = 0;

      if (rail.axis === 'x') {
        this.pos.z = rail.z;
        this.a = this.speed >= 0 ? (Math.sin(this.a) >= 0 ? Math.PI / 2 : -Math.PI / 2) : this.a;
      } else {
        this.pos.x = rail.x;
        this.a = Math.cos(this.a) >= 0 ? 0 : Math.PI;
      }
      this.addTrick('GRIND', 70);
    },

    updateGrind: function (dt, steer) {
      const r = this.grind;
      this.speed = Math.max(4, this.speed * Math.pow(0.965, dt * 60 / 60));
      this.speed = Math.max(4, this.speed - 1.4 * dt);

      const axisFree = r.len / 2 - 1;
      if (r.axis === 'x') {
        this.pos.x += this.speed * dt;
        this.pos.x = clamp(this.pos.x, r.x - axisFree, r.x + axisFree);
        this.pos.z = r.z;
      } else {
        this.pos.z += this.speed * dt;
        this.pos.z = clamp(this.pos.z, r.z - axisFree, r.z + axisFree);
        this.pos.x = r.x;
      }
      this.pos.y = r.h - 0.55;
      this.a = r.axis === 'x' ? Math.PI / 2 : 0;

      this.score += (110 + this.combo * 24) * dt;
      this.sparkTick += dt;
      if (this.sparkTick > 0.05) {
        this.sparkTick = 0;
        emitSparks(new THREE.Vector3(this.pos.x, r.h - 0.4, this.pos.z), 2, 6);
      }

      if (Math.abs(this.pos.x - r.x) >= axisFree - 0.05 || Math.abs(this.pos.z - r.z) >= axisFree - 0.05) {
        this.grind = null;
        this.grindCool = 0.4;
        this.grounded = false;
        this.vy = 3.5;
        this.addTrick('GRIND OUT', 35);
      }
      if (steer !== 0 && Math.random() < 0.02) this.a += steer * 0.1;
    },

    land: function () {
      const tau = Math.PI * 2;
      const rot = Math.abs(this.flip);
      const whole = Math.floor(rot / tau + 0.12);
      const stray = rot - whole * tau;

      /* a small lean is fine; a half-finished rotation is a bail */
      if (whole >= 1 || rot > 1.2) {
        if (stray > 0.75 && stray < tau - 0.75) {
          this.bail();
          return;
        }
      }
      if (whole >= 1) {
        this.addTrick((whole * 360) + ' FLIP', 90 * whole);
        this.speed = Math.min(PUSH_MAX, this.speed + 1.4);
      } else if (Math.abs(this.shove) > 1.5) {
        this.addTrick('SHOVE-IT', 55);
      } else if (this.A && this.A.Sound) {
        this.A.Sound.land();
      }

      this.flip = 0;
      this.flipVel = 0;
      this.shove = 0;
      this.shoveVel = 0;
      this.grounded = true;
      this.vy = 0;
      this.grindCool = 0.25;
    },

    bail: function () {
      if (this.bailed) return;
      this.bailed = true;
      this.flash = 1;
      this.grind = null;
      this.grounded = true;
      this.speed = 0;
      this.vy = 0;
      emitSparks(new THREE.Vector3(this.pos.x, this.pos.y + 0.6, this.pos.z), 10, 9);
      if (this.A && this.A.Sound) this.A.Sound.hit();
      this.poseSkater();
      this.updateHud();
      this.A.die('bail');
    },

    poseSkater: function () {
      if (!skater) return;
      skater.position.set(this.pos.x, this.pos.y, this.pos.z);
      skater.rotation.set(0, this.a, 0);

      if (deckPivotRef) {
        deckPivotRef.rotation.z = this.flip;
        deckPivotRef.rotation.y = this.shove;
      }
      if (riderBody) {
        const crouch = this.grounded ? (this.grind ? 0.85 : 1) : 0.7;
        riderBody.position.y = 0.2 - (1 - crouch) * 0.35;
        riderBody.rotation.z = this.grind ? -0.16 : -clamp(this.flipVel * 0.04, -0.3, 0.3);
        riderBody.rotation.x = this.grounded ? 0.06 : -0.12;
      }
    },

    updateHud: function () {
      pointsEl.textContent = Math.round(this.score);
      speedEl.textContent = Math.round(this.speed * 3.1) + ' KM/H';
      if (this.trickTimer <= 0) trickEl.classList.remove('is-on');
      hintEl.textContent = this.grind
        ? 'GRINDING — Space to pop'
        : this.grounded
          ? (this.speed < 1 ? 'W to push' : 'Space to ollie')
          : 'A / D to flip';
      comboEl.classList.toggle('is-on', this.combo > 1 && this.comboTimer > 0);
      comboEl.textContent = this.combo > 1 ? 'COMBO x' + this.combo : '';
      flashEl.style.opacity = (this.flash * 0.45).toFixed(2);
    },

    draw: function () {
      stage.renderer.render(scene, camera);
    },

    destroy: function () {
      this.keys = {};
      this.grind = null;
      stage.hide();
    }
  };

  window.Games = window.Games || {};
  window.Games.deck = game;
  window.Deck = { game: game, stage: stage, plaza: plaza };
})();

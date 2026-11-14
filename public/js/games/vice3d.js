/* Neon Vice 3D — third-person open-city driving sandbox.
   Same grid and rules as the flat version, rebuilt in three.js so the city,
   the car and the chase camera live in perspective. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    // Nothing to do without the library; leave the arcade untouched.
    console.warn('Neon Vice 3D needs three.js (vendor/three.min.js).');
    return;
  }

  const U = (window.Arcade && Arcade.util) || {};

  const COLS = 5;
  const ROWS = 4;
  const BLOCK = 350;
  const ROAD = 130;
  const PITCH = BLOCK + ROAD;
  const WORLD_W = COLS * BLOCK + (COLS + 1) * ROAD;
  const WORLD_H = ROWS * BLOCK + (ROWS + 1) * ROAD;

  const CAR_ACCEL = 380;
  const CAR_MAX = 440;
  const CAR_REV = 150;
  const CAR_BRAKE = 620;
  const CAR_DRAG = 165;
  const CAR_TURN = 2.5;
  const CAR_HALF = 15;
  const COP_MAX = 430;
  const COP_ACCEL = 340;
  const FOOT_SPEED = 150;
  const PED_COUNT = 34;

  const NEON = [0x34e0ff, 0xff4d9d, 0x8b5cf6, 0x4ade80, 0xffd166];
  const BLOCK_TINTS = [
    { wall: 0x2b3f63, edge: 0x34e0ff, glow: 0x9fe8ff },
    { wall: 0x3b2b55, edge: 0xb07dff, glow: 0xd9c3ff },
    { wall: 0x27484b, edge: 0x2ee6a8, glow: 0xb6ffe4 },
    { wall: 0x4a2637, edge: 0xff6ea8, glow: 0xffc2da }
  ];

  function roadLine(i) { return ROAD / 2 + i * PITCH; }
  function toX(wx) { return wx - WORLD_W / 2; }
  function toZ(wy) { return wy - WORLD_H / 2; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* A tiny deterministic PRNG keeps the same city on every reload. */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------------- three.js scaffolding ---------------- */
  const frame = document.querySelector('.canvas-frame');
  const canvas2d = document.getElementById('game');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(960, 540, false);
  renderer.domElement.className = 'vice3d-canvas';
  if (frame) {
    frame.insertBefore(renderer.domElement, canvas2d);
  } else {
    document.body.appendChild(renderer.domElement);
  }

  const KIT = window.Kit3D || null;
  if (KIT) {
    KIT.quality(renderer);
    renderer.toneMappingExposure = 1.16;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1024);
  scene.fog = new THREE.Fog(0x0a1024, 340, 1500);
  if (KIT) {
    KIT.sky(scene, { top: 0x050a1c, bottom: 0x1d2a4d, sunColor: 0xffd9f2, sunPower: 0.35, sunDir: new THREE.Vector3(-0.5, 0.28, -0.8) });
    scene.environment = KIT.environment(renderer, { top: '#28406e', mid: '#16233d', bottom: '#070a12' });
  }

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 1, 4000);

  scene.add(new THREE.HemisphereLight(0x8fb0ff, 0x121a2e, 1.35));
  scene.add(new THREE.AmbientLight(0x33406b, 0.55));
  const moon = new THREE.DirectionalLight(0xd7e4ff, 1.9);
  moon.position.set(-420, 620, 260);
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0xff4d9d, 0.8);
  rim.position.set(380, 240, -520);
  scene.add(rim);

  if (KIT) {
    KIT.keyLight(scene, { color: 0xcfdcff, intensity: 1.5, x: -320, y: 520, z: 300, shadowSize: 460, shadowFar: 2200 });
  }

  function resize3d() {
    if (!frame) return;
    const w = Math.min(frame.clientWidth || 960, 1440);
    const h = Math.round(w * 9 / 16);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize3d);
  resize3d();

  /* Ground with painted streets: one canvas texture for the whole map. */
  function buildGroundTexture() {
    const px = 1024;
    const py = Math.round(px * WORLD_H / WORLD_W);
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = py;
    const g = cv.getContext('2d');
    const sx = px / WORLD_W;
    const sy = py / WORLD_H;

    g.fillStyle = '#1b2436';
    g.fillRect(0, 0, px, py);

    // sidewalks framing every block
    g.fillStyle = '#2c3850';
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const x = roadLine(i) + ROAD / 2;
        const y = roadLine(j) + ROAD / 2;
        g.fillRect(x * sx, y * sy, BLOCK * sx, BLOCK * sy);
      }
    }

    // asphalt + centre dashes
    g.fillStyle = '#141b2b';
    for (let i = 0; i <= COLS; i++) {
      const c = roadLine(i);
      g.fillRect((c - ROAD / 2) * sx, 0, ROAD * sx, py);
    }
    for (let j = 0; j <= ROWS; j++) {
      const c = roadLine(j);
      g.fillRect(0, (c - ROAD / 2) * sy, px, ROAD * sy);
    }

    g.strokeStyle = 'rgba(150, 195, 255, 0.55)';
    g.lineWidth = Math.max(1, 2 * sx);
    g.setLineDash([18 * sx, 16 * sx]);
    g.beginPath();
    for (let i = 0; i <= COLS; i++) {
      g.moveTo(roadLine(i) * sx, 0);
      g.lineTo(roadLine(i) * sx, py);
    }
    for (let j = 0; j <= ROWS; j++) {
      g.moveTo(0, roadLine(j) * sy);
      g.lineTo(px, roadLine(j) * sy);
    }
    g.stroke();
    g.setLineDash([]);

    // pawnshop pink + cyan shop fronts along the kerbs, purely decorative
    const glow = seeded(99);
    for (let i = 0; i < 70; i++) {
      const horizontal = glow() > 0.5;
      g.globalAlpha = 0.10 + glow() * 0.22;
      g.fillStyle = glow() > 0.6 ? '#34e0ff' : '#ff4d9d';
      if (horizontal) {
        g.fillRect(glow() * px, glow() * py, 26 * sx, 3 * sy);
      } else {
        g.fillRect(glow() * px, glow() * py, 3 * sx, 26 * sy);
      }
    }
    g.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  const groundTex = buildGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.62, metalness: 0.28 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* Window texture shared by all towers of one palette. */
  function buildWindowTexture(tint) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#141c2c';
    g.fillRect(0, 0, 64, 128);
    const r = seeded(tint.edge & 0xffff);
    for (let y = 6; y < 122; y += 10) {
      for (let x = 6; x < 58; x += 12) {
        const lit = r();
        if (lit < 0.45) continue;
        g.globalAlpha = 0.55 + lit * 0.45;
        g.fillStyle = lit > 0.78 ? '#ffe9b0' : '#' + tint.glow.toString(16).padStart(6, '0');
        g.fillRect(x, y, 7, 5);
      }
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  const windowTex = BLOCK_TINTS.map(buildWindowTexture);

  /* ---------------- shared geometry ---------------- */
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.1, 10);

  const ENV = scene.environment || null;

  function makeCar(bodyColor, cabinColor, emissive) {
    if (KIT) {
      // Real car silhouette: extruded body, glass, rims/flex, headlight wash.
      const model = KIT.car({
        color: bodyColor, length: 9.6, width: 4.2, height: 1.7,
        rimColor: 0xd7e2ef, envMap: ENV
      });
      model.scale.setScalar(1);
      return model;
    }
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, roughness: 0.35, metalness: 0.55, emissive: emissive, emissiveIntensity: 0.12
    });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(4.4, 1.1, 9);
    body.position.y = 1.15;
    group.add(body);

    const cabin = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
      color: cabinColor, roughness: 0.18, metalness: 0.35, emissive: emissive, emissiveIntensity: 0.28
    }));
    cabin.scale.set(3.5, 0.95, 4.4);
    cabin.position.set(0, 2.05, -0.4);
    group.add(cabin);

    const glass = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
      color: 0x0a1626, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.72
    }));
    glass.scale.set(3.3, 0.62, 3.6);
    glass.position.set(0, 2.2, -0.4);
    group.add(glass);

    for (const sx of [-1.75, 1.75]) {
      for (const sz of [-3.1, 3.1]) {
        const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({
          color: 0x0b0d14, roughness: 0.9
        }));
        wheel.rotation.z = Math.PI / 2;
        wheel.scale.set(1, 0.55, 1);
        wheel.position.set(sx, 0.85, sz);
        group.add(wheel);
      }
    }

    const headMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff });
    for (const sx of [-1.35, 1.35]) {
      const lamp = new THREE.Mesh(boxGeo, headMat);
      lamp.scale.set(0.7, 0.32, 0.12);
      lamp.position.set(sx, 1.3, 4.55);
      group.add(lamp);
    }

    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2f5e });
    for (const sx of [-1.35, 1.35]) {
      const lamp = new THREE.Mesh(boxGeo, tailMat);
      lamp.scale.set(0.7, 0.3, 0.12);
      lamp.position.set(sx, 1.3, -4.55);
      group.add(lamp);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    shadow.scale.set(1, 1.45, 1);
    group.add(shadow);

    return group;
  }

  function makePed(color) {
    if (KIT) {
      const p = KIT.person({ suit: color, accent: color, skin: 0xd9ab86, envMap: ENV });
      p.scale.setScalar(0.115);
      return p;
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 1.5, 4, 8),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.55, emissive: color, emissiveIntensity: 0.25 })
    );
    body.position.y = 1.5;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2dcc8, roughness: 0.7 })
    );
    head.position.y = 2.7;
    g.add(head);
    return g;
  }

  /* ---------------- game object ---------------- */
  const game = {
    title: 'Neon Vice 3D',
    tip: 'Drive the city, run deliveries, keep the police busy. E gets you out of the car.',
    readyHeading: 'Neon Vice',
    readyText: 'Third-person, night-time, no rules. Press <kbd>Space</kbd> or tap to pull away.',
    deadHeading: 'Wasted',
    deadText: 'The night always wins. Go again?',
    onDeath: function (reason) {
      if (reason === 'busted') {
        this.deadHeading = 'Busted';
        this.deadText = 'The cops boxed you in. Go again?';
      } else {
        this.deadHeading = 'Wasted';
        this.deadText = 'The night always wins. Go again?';
      }
    },
    controlHint: '<kbd>↑</kbd> gas · <kbd>↓</kbd> brake · <kbd>←</kbd><kbd>→</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>E</kbd> get out',

    /* filled by reset() */
    city: [],
    cops: [],
    peds: [],
    buildings: null,
    tracers: [],
    trail: []
  };

  let buildingsGroup = null;
  let propGroup = null;
  const hud = document.createElement('div');
  hud.className = 'vice3d-hud';
  hud.innerHTML =
    '<div class="v3-row v3-top"><span class="v3-cash">$0</span><span class="v3-stars"></span></div>' +
    '<div class="v3-row v3-bottom"><span class="v3-speed">0 <i>KM/H</i></span><span class="v3-hint"></span></div>' +
    '<div class="v3-flash"></div>';
  if (frame) frame.appendChild(hud);

  window.Vice3D = { game: game, renderer: renderer, hud: hud };

  function clearGroup(group) {
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse(function (o) {
        if (o.geometry && o.geometry !== boxGeo && o.geometry !== wheelGeo) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { m.dispose(); });
        }
      });
    }
    scene.remove(group);
  }

  function addWanted(self, n) {
    self.wanted = Math.min(5, self.wanted + n);
    self.heat = 12;
    self.heatCooldown = 12;
  }

  function newMarker(self) {
    for (let tries = 0; tries < 40; tries++) {
      const x = rand(roadLine(0), roadLine(COLS));
      const y = rand(roadLine(0), roadLine(ROWS));
      if (Math.hypot(x - self.car.x, y - self.car.y) < 420) continue;
      return { x: x, y: y, pulse: Math.random() * 6 };
    }
    return { x: roadLine(COLS), y: roadLine(ROWS), pulse: 0 };
  }

  function markerMesh() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.5, 0.7, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xff4d9d })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    g.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 5.6, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff4d9d, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    beam.position.y = 13;
    g.add(beam);
    g.userData.ring = ring;
    g.userData.beam = beam;
    return g;
  }

  game.clearActors = function () {
    const strip = function (mesh) {
      if (!mesh) return;
      scene.remove(mesh);
      mesh.traverse(function (o) {
        if (o.geometry && o.geometry !== boxGeo && o.geometry !== wheelGeo) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { m.dispose(); });
        }
      });
    };
    strip(this.carMesh);
    strip(this.footMesh);
    strip(this.markerMesh);
    (this.peds || []).forEach(function (p) { strip(p.mesh); });
    (this.cops || []).forEach(function (c) { strip(c.mesh); });
    this.carMesh = null;
    this.footMesh = null;
    this.markerMesh = null;
    this.peds = [];
    this.cops = [];
  };

  game.reset = function (A) {
    this.A = A;
    if (canvas2d) canvas2d.style.visibility = 'hidden';
    renderer.domElement.style.display = 'block';
    hud.style.display = 'block';
    resize3d();
    this.clearActors();

    clearGroup(buildingsGroup);
    clearGroup(propGroup);
    this.city = [];
    this.cops = [];
    this.peds = [];
    this.trail = [];

    buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);
    propGroup = new THREE.Group();
    scene.add(propGroup);

    const rnd = seeded(20261113);
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const w = BLOCK - 40 - rnd() * 70;
        const d = BLOCK - 40 - rnd() * 70;
        const cx = roadLine(i) + ROAD / 2 + BLOCK / 2 + (rnd() - 0.5) * (BLOCK - w - 30);
        const cy = roadLine(j) + ROAD / 2 + BLOCK / 2 + (rnd() - 0.5) * (BLOCK - d - 30);
        const tint = BLOCK_TINTS[Math.floor(rnd() * BLOCK_TINTS.length)];
        const h = 26 + rnd() * rnd() * 120;
        this.city.push({
          x: cx - w / 2, y: cy - d / 2, w: w, h: h, d: d,
          cx: cx, cy: cy, tint: tint, index: i * ROWS + j
        });
      }
    }

    this.city.forEach(function (b, idx) {
      const tex = windowTex[idx % windowTex.length].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(b.w / 26)), Math.max(1, Math.round(b.h / 26)));
      const mat = new THREE.MeshStandardMaterial({
        color: b.tint.wall,
        roughness: 0.82,
        metalness: 0.28,
        emissive: 0xffffff,
        map: tex,
        emissiveMap: tex,
        emissiveIntensity: 1.15
      });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(toX(b.cx), b.h / 2, toZ(b.cy));
      buildingsGroup.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: b.tint.edge, transparent: true, opacity: 0.5 })
      );
      edges.scale.copy(mesh.scale);
      edges.position.copy(mesh.position);
      buildingsGroup.add(edges);

      if (b.h > 84) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff4d9d })
        );
        beacon.position.set(toX(b.cx), b.h + 2, toZ(b.cy));
        buildingsGroup.add(beacon);
        b.beacon = beacon;
      }
    });

    // curbs and lamp posts: the street reads as a real avenue, not a plane
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x8b8f99, roughness: 0.85, metalness: 0.05 });
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const bw = BLOCK - 26, bd = BLOCK - 26;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 2.4, bd), curbMat);
        slab.position.set(toX(roadLine(i) + ROAD / 2 + BLOCK / 2), 1.2, toZ(roadLine(j) + ROAD / 2 + BLOCK / 2));
        slab.receiveShadow = true;
        propGroup.add(slab);
      }
    }
    for (let i = 0; i <= COLS; i++) {
      for (let j = 0; j <= ROWS; j++) {
        if (KIT) {
          const lamp = KIT.streetLamp({ color: j % 2 ? 0xffd9a0 : 0xbfe6ff });
          lamp.scale.setScalar(0.55);
          lamp.position.set(toX(roadLine(i) + ROAD / 2 - 12), 0, toZ(roadLine(j) + ROAD / 2 - 12));
          propGroup.add(lamp);
        } else {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.5, 12, 6),
            new THREE.MeshStandardMaterial({ color: 0x2b344a, roughness: 0.7 })
          );
          post.position.set(toX(roadLine(i) + ROAD / 2 - 12), 6, toZ(roadLine(j) + ROAD / 2 - 12));
          propGroup.add(post);
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
          );
          bulb.position.set(post.position.x, 12.6, post.position.z);
          propGroup.add(bulb);
        }
      }
    }

    const start = { x: roadLine(1), y: roadLine(2) };
    this.car = { x: start.x, y: start.y, a: 0, v: 0 };
    this.foot = { x: start.x - 34, y: start.y, a: 0 };
    this.onFoot = false;

    this.carMesh = makeCar(0x34e0ff, 0x0d2233, 0x34e0ff);
    scene.add(this.carMesh);
    this.footMesh = makePed(0x7ce7ff);
    this.footMesh.visible = false;
    scene.add(this.footMesh);

    const rp = seeded(7);
    for (let n = 0; n < PED_COUNT; n++) {
      const ped = {
        x: rand(roadLine(0), roadLine(COLS)),
        y: rand(roadLine(0), roadLine(ROWS)),
        a: rp() * Math.PI * 2,
        speed: 26 + rp() * 34,
        alive: true,
        cool: 0,
        phase: rp() * 6,
        mesh: makePed(NEON[Math.floor(rp() * NEON.length)])
      };
      scene.add(ped.mesh);
      this.peds.push(ped);
    }

    this.cash = 0;
    this.health = 100;
    this.wanted = 0;
    this.heat = 0;
    this.heatCooldown = 8;
    this.copTimer = 1;
    this.time = 0;
    this.flash = 0;
    this.trailTick = 0;
    this.marker = newMarker(this);
    this.markerMesh = markerMesh();
    scene.add(this.markerMesh);

    this.camPos = new THREE.Vector3(toX(this.car.x) - 0, 10, toZ(this.car.y) - 16);
    this.camLook = new THREE.Vector3(toX(this.car.x), 1.5, toZ(this.car.y));
    this.keys = {};
    this.syncScene();
    A.setScore(0);
  };

  game.destroy = function () {
    if (canvas2d) canvas2d.style.visibility = '';
    renderer.domElement.style.display = 'none';
    hud.style.display = 'none';
    this.clearActors();
    clearGroup(buildingsGroup);
    clearGroup(propGroup);
    buildingsGroup = null;
    propGroup = null;
    this.city = [];
  };

  /* ---------------- physics ---------------- */
  game.blockedAt = function (x, y) {
    for (let i = 0; i < this.city.length; i++) {
      const b = this.city[i];
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.d) return true;
    }
    return false;
  };

  game.pushOut = function (body, radius, isCar) {
    for (let i = 0; i < this.city.length; i++) {
      const b = this.city[i];
      const cx = clamp(body.x, b.x, b.x + b.w);
      const cy = clamp(body.y, b.y, b.y + b.d);
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d;
      const ny = dy / d;
      const push = radius - d;
      body.x += nx * push;
      body.y += ny * push;
      if (isCar) {
        const impact = Math.abs(body.v);
        if (impact > 240) {
          this.health -= (impact - 240) * 0.05;
          this.flash = 1;
          this.A.Sound.tone(90, 0.12, { type: 'sawtooth', vol: 0.05 });
        }
        body.v *= -0.12;
      } else {
        body.v *= 0.2;
      }
    }
  };

  game.updateCar = function (dt) {
    const k = this.keys;
    const car = this.car;
    const gas = (k.ArrowUp || k.KeyW) ? 1 : 0;
    const brake = (k.ArrowDown || k.KeyS) ? 1 : 0;
    const steer = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
    const hand = !!k.Space;

    if (gas) car.v += CAR_ACCEL * dt;
    else if (brake) car.v -= (car.v > 12 ? CAR_BRAKE : CAR_ACCEL * 0.75) * dt;
    else car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), CAR_DRAG * dt);
    if (hand) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), CAR_BRAKE * 1.5 * dt);
    car.v = clamp(car.v, -CAR_REV, CAR_MAX);

    const dir = car.v >= 0 ? 1 : -1;
    const grip = clamp(Math.abs(car.v) / 110, 0, 1);
    car.a += steer * CAR_TURN * grip * dt * dir * (hand ? 1.45 : 1);

    car.x += Math.cos(car.a) * car.v * dt;
    car.y += Math.sin(car.a) * car.v * dt;

    this.pushOut(car, CAR_HALF, true);
    const fx = car.x + Math.cos(car.a) * 16;
    const fy = car.y + Math.sin(car.a) * 16;
    const probe = { x: fx, y: fy, v: 0 };
    this.pushOut(probe, 12, false);
    const pdx = probe.x - fx;
    const pdy = probe.y - fy;
    if (pdx || pdy) {
      car.x += pdx;
      car.y += pdy;
      if (Math.abs(car.v) > 240) {
        this.health -= (Math.abs(car.v) - 240) * 0.05;
        this.flash = 1;
        this.A.Sound.tone(90, 0.12, { type: 'sawtooth', vol: 0.05 });
      }
      car.v *= -0.12;
    }
    car.x = clamp(car.x, CAR_HALF, WORLD_W - CAR_HALF);
    car.y = clamp(car.y, CAR_HALF, WORLD_H - CAR_HALF);

    if (hand && Math.abs(car.v) > 120) this.wanted = this.wanted;
  };

  game.updateFoot = function (dt) {
    const k = this.keys;
    const f = this.foot;
    let dx = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
    let dy = ((k.ArrowDown || k.KeyS) ? 1 : 0) - ((k.ArrowUp || k.KeyW) ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      f.a = Math.atan2(dy, dx);
      f.x += dx * FOOT_SPEED * dt;
      f.y += dy * FOOT_SPEED * dt;
      this.footStep = (this.footStep || 0) + dt * 12;
    }
    f.v = 0;
    this.pushOut(f, 9, false);
    f.x = clamp(f.x, 6, WORLD_W - 6);
    f.y = clamp(f.y, 6, WORLD_H - 6);
  };

  game.nearCar = function () {
    return Math.hypot(this.foot.x - this.car.x, this.foot.y - this.car.y) < 72;
  };

  game.toggleCar = function () {
    if (this.onFoot) {
      if (!this.nearCar()) return false;
      this.onFoot = false;
      this.footMesh.visible = false;
      this.carMesh.visible = true;
      this.A.Sound.tone(320, 0.08, { type: 'triangle', vol: 0.05, to: 520 });
      return true;
    }
    if (Math.abs(this.car.v) > 60) return false;
    this.onFoot = true;
    this.car.v = 0;
    const side = this.car.a + Math.PI / 2;
    this.foot.x = clamp(this.car.x + Math.cos(side) * 26, 6, WORLD_W - 6);
    this.foot.y = clamp(this.car.y + Math.sin(side) * 26, 6, WORLD_H - 6);
    this.foot.a = this.car.a;
    this.footMesh.visible = true;
    this.A.Sound.tone(520, 0.08, { type: 'triangle', vol: 0.05, to: 300 });
    return true;
  };

  game.updatePeds = function (dt) {
    const car = this.car;
    for (const p of this.peds) {
      if (!p.alive) {
        p.cool -= dt;
        if (p.cool <= 0) {
          p.alive = true;
          p.x = rand(roadLine(0), roadLine(COLS));
          p.y = rand(roadLine(0), roadLine(ROWS));
          p.mesh.visible = true;
        }
        continue;
      }
      p.phase += dt * 3;
      p.x += Math.cos(p.a) * p.speed * dt;
      p.y += Math.sin(p.a) * p.speed * dt;
      if (this.blockedAt(p.x, p.y) || p.x < 8 || p.x > WORLD_W - 8 || p.y < 8 || p.y > WORLD_H - 8) {
        p.x -= Math.cos(p.a) * p.speed * dt * 1.2;
        p.y -= Math.sin(p.a) * p.speed * dt * 1.2;
        p.a += Math.PI * (0.5 + Math.random());
      }
      if (!this.onFoot && Math.abs(car.v) > 70 && Math.hypot(car.x - p.x, car.y - p.y) < 24) {
        p.alive = false;
        p.cool = 7;
        p.mesh.visible = false;
        addWanted(this, 1);
        this.flash = 0.6;
        this.A.Sound.tone(140, 0.1, { type: 'square', vol: 0.04 });
      }
    }
  };

  game.spawnCop = function () {
    for (let tries = 0; tries < 30; tries++) {
      const x = roadLine(Math.floor(Math.random() * (COLS + 1)));
      const y = roadLine(Math.floor(Math.random() * (ROWS + 1)));
      if (Math.hypot(x - this.car.x, y - this.car.y) < 620) continue;
      const mesh = makeCar(0xe9eeff, 0x101528, 0x9fb4ff);
      const bar = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({ color: 0xff3355 })
      );
      bar.scale.set(2.6, 0.5, 0.9);
      bar.position.set(0, 2.75, -0.4);
      mesh.add(bar);
      const light = new THREE.PointLight(0xff3355, 0, 90);
      light.position.set(0, 3.4, -0.4);
      mesh.add(light);
      scene.add(mesh);
      this.cops.push({
        x: x, y: y, a: Math.random() * Math.PI * 2, v: 0, siren: Math.random() * 6,
        mesh: mesh, bar: bar, light: light
      });
      return;
    }
  };

  game.updateCops = function (dt) {
    const target = this.onFoot ? this.foot : this.car;
    const want = Math.min(5, this.wanted + (this.wanted > 0 ? 1 : 0));

    this.copTimer -= dt;
    if (this.wanted > 0 && this.cops.length < want && this.copTimer <= 0) {
      this.copTimer = 2.6;
      this.spawnCop();
    }
    while (this.cops.length > want) {
      const gone = this.cops.pop();
      scene.remove(gone.mesh);
    }

    for (const cop of this.cops) {
      cop.siren += dt;
      const dx = target.x - cop.x;
      const dy = target.y - cop.y;
      const dist = Math.hypot(dx, dy) || 1;
      let desired = Math.atan2(dy, dx);
      let wantSpeed = clamp(dist * 1.5, 0, COP_MAX);

      if (this.blockedAt(cop.x + Math.cos(cop.a) * 66, cop.y + Math.sin(cop.a) * 66)) {
        const left = cop.a - Math.PI / 2;
        const right = cop.a + Math.PI / 2;
        const leftFree = !this.blockedAt(cop.x + Math.cos(left) * 82, cop.y + Math.sin(left) * 82);
        const rightFree = !this.blockedAt(cop.x + Math.cos(right) * 82, cop.y + Math.sin(right) * 82);
        desired = leftFree && !rightFree ? left : rightFree ? right : left;
        wantSpeed = Math.min(wantSpeed, 230);
      }

      const diff = Math.atan2(Math.sin(desired - cop.a), Math.cos(desired - cop.a));
      cop.a += clamp(diff, -1, 1) * 3.2 * dt;
      cop.v += clamp(wantSpeed - cop.v, -COP_ACCEL * dt, COP_ACCEL * dt);
      cop.x += Math.cos(cop.a) * cop.v * dt;
      cop.y += Math.sin(cop.a) * cop.v * dt;
      const bx = cop.x;
      const by = cop.y;
      this.pushOut(cop, 15, false);
      if (bx !== cop.x || by !== cop.y) cop.v *= 0.5;
      cop.x = clamp(cop.x, 16, WORLD_W - 16);
      cop.y = clamp(cop.y, 16, WORLD_H - 16);

      const hit = Math.hypot(cop.x - target.x, cop.y - target.y);
      if (hit < 34 && cop.v > 140) {
        this.health -= 16;
        this.flash = 1;
        cop.v = 40;
        this.A.Sound.tone(110, 0.14, { type: 'sawtooth', vol: 0.05 });
      }
      if (hit < 30 && cop.v < 60 && this.wanted > 0 && this.copBust > 0.9) {
        this.A.die('busted');
        return;
      }
      if (hit < 30 && cop.v < 60) this.copBust = (this.copBust || 0) + dt;
      else this.copBust = 0;

      const phase = Math.sin(cop.siren * 12) > 0;
      cop.bar.material.color.setHex(phase ? 0xff3355 : 0x3355ff);
      cop.light.color.setHex(phase ? 0xff3355 : 0x3355ff);
      cop.light.intensity = 26;
    }
  };

  game.updateHeat = function (dt) {
    if (this.wanted <= 0) return;
    this.heatCooldown -= dt;
    if (this.heatCooldown > 0) return;
    this.heat -= dt;
    if (this.heat <= 0) {
      this.wanted -= 1;
      this.heat = 5;
      if (this.wanted === 0) {
        this.heat = 0;
        this.copBust = 0;
      }
    }
  };

  game.updateMarker = function (dt) {
    const m = this.marker;
    m.pulse += dt;
    const who = this.onFoot ? this.foot : this.car;
    if (Math.hypot(who.x - m.x, who.y - m.y) < 52) {
      this.cash += 200;
      this.A.setScore(this.cash);
      this.health = Math.min(100, this.health + 8);
      this.A.Sound.tone(660, 0.09, { type: 'triangle', vol: 0.05, to: 990 });
      this.marker = newMarker(this);
      this.markerMesh.userData.ring.scale.setScalar(1);
    }
  };

  game.updateCamera = function (dt) {
    const body = this.onFoot ? this.foot : this.car;
    const a = this.onFoot ? this.foot.a : this.car.a;
    const speed = Math.abs(this.car.v);
    const back = this.onFoot ? 11 : 17 + Math.min(5, speed / 110);
    const height = this.onFoot ? 6.8 : 8.8;

    const tx = toX(body.x) - Math.cos(a) * back;
    const tz = toZ(body.y) - Math.sin(a) * back;
    const k = 1 - Math.exp(-dt * 14);
    this.camPos.x = lerp(this.camPos.x, tx, k);
    this.camPos.y = lerp(this.camPos.y, height, k);
    this.camPos.z = lerp(this.camPos.z, tz, k);
    // at speed the smoothing would leave the chase camera far behind: snap when it drifts
    if (Math.hypot(this.camPos.x - tx, this.camPos.z - tz) > 34) {
      this.camPos.x = tx;
      this.camPos.z = tz;
    }

    const lx = toX(body.x) + Math.cos(a) * 13;
    const lz = toZ(body.y) + Math.sin(a) * 13;
    this.camLook.x = lerp(this.camLook.x, lx, Math.min(1, k * 1.4));
    this.camLook.y = lerp(this.camLook.y, 2.6, k);
    this.camLook.z = lerp(this.camLook.z, lz, Math.min(1, k * 1.4));

    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    const targetFov = 62 + Math.min(10, speed / 48);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
    }
  };

  /* ---------------- scene sync + HUD ---------------- */
  game.syncScene = function () {
    const car = this.car;
    this.carMesh.position.set(toX(car.x), 0, toZ(car.y));
    this.carMesh.rotation.y = Math.PI / 2 - car.a;
    this.carMesh.visible = !this.onFoot;

    this.footMesh.position.set(toX(this.foot.x), 0, toZ(this.foot.y));
    this.footMesh.rotation.y = Math.PI / 2 - this.foot.a;
    this.footMesh.visible = !!this.onFoot;

    for (const p of this.peds) {
      p.mesh.position.set(toX(p.x), Math.abs(Math.sin(p.phase)) * 0.35, toZ(p.y));
      p.mesh.rotation.y = Math.PI / 2 - p.a;
    }
    for (const c of this.cops) {
      c.mesh.position.set(toX(c.x), 0, toZ(c.y));
      c.mesh.rotation.y = Math.PI / 2 - c.a;
    }
    const m = this.marker;
    this.markerMesh.position.set(toX(m.x), 0, toZ(m.y));
    this.markerMesh.userData.ring.rotation.z += 0.02;
    this.markerMesh.userData.beam.material.opacity = 0.1 + Math.sin(m.pulse * 3) * 0.05;

    for (const b of this.city) {
      if (b.beacon) b.beacon.visible = Math.sin(this.time * 2 + b.index) > 0;
    }
  };

  game.updateHud = function () {
    const cashEl = hud.querySelector('.v3-cash');
    const starsEl = hud.querySelector('.v3-stars');
    const speedEl = hud.querySelector('.v3-speed');
    const hintEl = hud.querySelector('.v3-hint');
    cashEl.textContent = '$' + this.cash;

    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < this.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('is-hot', this.wanted > 0);

    const kph = Math.round(Math.abs(this.car.v) * 0.42);
    speedEl.innerHTML = (this.onFoot ? '—' : kph) + ' <i>KM/H</i>';

    hintEl.textContent = this.onFoot
      ? (this.nearCar() ? 'E — get back in' : 'On foot · E returns you to the car')
      : (Math.abs(this.car.v) < 8 ? 'E — step out of the car' : '');

    hud.querySelector('.v3-flash').style.opacity = (this.flash * 0.55).toFixed(2);
  };

  game.update = function (dt) {
    this.time += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
    if (this.health < 0) this.health = 0;

    if (this.onFoot) this.updateFoot(dt);
    else this.updateCar(dt);

    this.updatePeds(dt);
    this.updateCops(dt);
    this.updateHeat(dt);
    this.updateMarker(dt);
    this.updateCamera(dt);
    this.syncScene();
    if (this.carMesh && this.carMesh.spinWheels) this.carMesh.spinWheels(dt * Math.min(28, Math.abs(this.car.v) * 0.16));
    this.updateHud();

    if (this.health <= 0) this.A.die('wasted');
  };

  game.draw = function () {
    renderer.render(scene, camera);
  };

  /* ---------------- input ---------------- */
  const TRACKED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];

  window.addEventListener('keydown', function (e) {
    if (Arcade.gameId !== 'vice') return;
    const game = window.Games.vice;
    if (!game || !game.keys) return;
    if (TRACKED.indexOf(e.code) >= 0 && Arcade.state === 'playing') e.preventDefault();
    if (TRACKED.indexOf(e.code) >= 0) game.keys[e.code] = true;
    if (e.code === 'KeyE' && Arcade.state === 'playing') {
      e.preventDefault();
      game.toggleCar();
    }
  });

  window.addEventListener('keyup', function (e) {
    const game = window.Games.vice;
    if (!game || !game.keys) return;
    if (TRACKED.indexOf(e.code) >= 0) game.keys[e.code] = false;
  });

  window.addEventListener('blur', function () {
    const game = window.Games.vice;
    if (game) game.keys = {};
  });

  resize3d();
  renderer.domElement.style.display = 'none';
  hud.style.display = 'none';

  window.Games = window.Games || {};
  window.Games.vice = game;
})();



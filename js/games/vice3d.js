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
  const PED_COUNT = 44;

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

  function makeCar(bodyColor, cabinColor, emissive, style, driver) {
    if (KIT) {
      // Real car silhouette: extruded body, glass, rims, lamps, optional driver.
      const model = KIT.car({
        color: bodyColor, length: 9.6, width: 4.2,
        height: style === 'van' || style === 'suv' || style === 'pickup' ? 2.1 : 1.7,
        style: style || 'sedan',
        rimColor: style === 'police' ? 0x1b1f27 : 0xd7e2ef,
        envMap: ENV,
        driver: driver || null
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
    usesArrowUp: true,
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
    '<div class="v3-row v3-top"><span class="v3-cash">$0</span>' +
    '<span class="v3-health"><i></i></span>' +
    '<span class="v3-stars"></span></div>' +
    '<canvas class="v3-map" width="176" height="136"></canvas>' +
    '<div class="v3-row v3-bottom"><span class="v3-speed">0 <i>KM/H</i></span>' +
    '<span class="v3-weapon"></span><span class="v3-hint"></span></div>' +
    '<div class="v3-prompt"></div><div class="v3-toast"></div><div class="v3-flash"></div>';
  if (frame) frame.appendChild(hud);

  window.Vice3D = { game: game, renderer: renderer, hud: hud };
  const mapCanvas = hud.querySelector('.v3-map');
  const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;

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

    this.carMesh = makeCar(0x34e0ff, 0x0d2233, 0x34e0ff, 'sports', { suit: 0x1b2740, accent: 0x34e0ff, skin: 0xd9ab86, envMap: ENV });
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
        state: 'walk',
        timer: 0,
        fx: 0,
        fy: 0,
        idx: n,
        mesh: makePed(NEON[Math.floor(rp() * NEON.length)], n)
      };
      scene.add(ped.mesh);
      this.peds.push(ped);
    }

    this.stores = [];
    this.buildStores();
    this.traffic = [];
    this.buildTraffic();
    this.makeWeapons();
    this.prompt = '';
    this.toastText = '';
    this.toastTimer = 0;
    this.footStep = 0;
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
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
    (this.bullets || []).forEach(function (b) { scene.remove(b.line); });
    this.bullets = [];
    this.firing = false;
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

  /* ---------------- people, traffic, weapons, shops ---------------- */

  const SKINS = [0xe6b78f, 0xc98a63, 0x8a5a3b, 0xf2cdb0, 0xa6724f, 0x5f3c27];
  const HAIRS = [0x201614, 0x3b2519, 0x0e0c0b, 0x8a6a3e, 0x6b6f76, 0xb14a2a];
  const CLOTHES = [0x34e0ff, 0xff4d9d, 0x8b5cf6, 0x4ade80, 0xffd166, 0xe8eef7, 0x2b3f63, 0xff7a4d];

  function makePed(color, idx) {
    if (KIT) {
      const n = idx || 0;
      const p = KIT.person({
        suit: color || CLOTHES[n % CLOTHES.length],
        accent: CLOTHES[(n + 3) % CLOTHES.length],
        skin: SKINS[n % SKINS.length],
        hair: HAIRS[(n * 2) % HAIRS.length],
        pants: n % 4 === 0 ? 0x2b3547 : 0x141a24,
        cap: n % 5 === 0,
        envMap: ENV
      });
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

  const STORE_DEFS = [
    { idx: 0, kind: 'ammo', name: 'AMMU-NATION', color: 0xffb347 },
    { idx: 9, kind: 'food', name: "CLUCKIN' BELL", color: 0xff4d6d },
    { idx: 18, kind: 'market', name: '24/7', color: 0x2ee6a8 },
    { idx: 6, kind: 'home', name: 'HOME', color: 0x34e0ff }
  ];

  const TRAFFIC_COUNT = 16;
  const TRAFFIC_STYLES = ['sedan', 'suv', 'van', 'pickup', 'sports'];
  const TRAFFIC_COLORS = [0xd8dee7, 0x22252c, 0x8a1f2e, 0x1f3f7a, 0x3c7a4a, 0xd8a531, 0x6c6f78, 0xb4b8bf];

  /* Storefront: lowered unit with lit windows, sign, awning and a door the
     player can reach on foot. Kept in world units next to the block it fronts. */
  game.buildStores = function () {
    this.stores = [];
    const self = this;

    STORE_DEFS.forEach(function (def, n) {
      const b = self.city[def.idx];
      if (!b) return;
      b.h = def.kind === 'home' ? 30 : 24;
      b.storeKind = def.kind;

      // Which of the four faces looks onto a road? Use the nearest one.
      const dl = b.x - roadLine(Math.floor(def.idx / ROWS));
      const dr = roadLine(Math.floor(def.idx / ROWS) + 1) - (b.x + b.w);
      const dt2 = b.y - roadLine(def.idx % ROWS);
      const db = roadLine((def.idx % ROWS) + 1) - (b.y + b.d);
      let side = 'left', best = dl;
      if (dr < best) { best = dr; side = 'right'; }
      if (dt2 < best) { best = dt2; side = 'top'; }
      if (db < best) { best = db; side = 'bottom'; }

      const g = new THREE.Group();
      const midY = def.kind === 'home' ? 9 : 8;
      const face = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[side];
      const across = b.w, depth = b.d;
      const spanW = side === 'left' || side === 'right' ? depth : across;
      const faceDist = (side === 'left' || side === 'right' ? across : depth) / 2;

      const glassMatStore = new THREE.MeshStandardMaterial({
        color: 0x0b1a26, emissive: def.color, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.4
      });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f1420, roughness: 0.6, metalness: 0.35 });

      // ground-floor shop window band on the road-facing wall
      const band = new THREE.Mesh(new THREE.BoxGeometry(spanW * 0.86, 8.4, 0.8), glassMatStore);
      band.position.set(b.cx + face[0] * faceDist, midY, b.cy + face[1] * faceDist);
      if (side === 'left' || side === 'right') band.scale.x = 1;
      else band.scale.x = 1;
      g.add(band);

      // mullions
      for (let k = -3; k <= 3; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 8.4, 0.9), frameMat);
        bar.position.set(
          b.cx + face[0] * (faceDist + 0.5) + (side === 'top' || side === 'bottom' ? k * spanW * 0.12 : 0),
          midY,
          b.cy + face[1] * (faceDist + 0.5) + (side === 'left' || side === 'right' ? k * spanW * 0.12 : 0)
        );
        if (side === 'left' || side === 'right') bar.rotation.y = Math.PI / 2;
        g.add(bar);
      }

      // door with a lit frame
      const doorX = b.cx + face[0] * (faceDist + 0.6);
      const doorZ = b.cy + face[1] * (faceDist + 0.6);
      const door = new THREE.Mesh(new THREE.BoxGeometry(5.4, 8, 0.6), new THREE.MeshStandardMaterial({
        color: 0x0d1520, emissive: def.color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5
      }));
      door.position.set(doorX, 4, doorZ);
      if (side === 'left' || side === 'right') door.rotation.y = Math.PI / 2;
      g.add(door);
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 9, 0.4), new THREE.MeshBasicMaterial({ color: def.color }));
      doorFrame.position.set(doorX + face[0] * -0.4, 4.6, doorZ + face[1] * -0.4);
      if (side === 'left' || side === 'right') doorFrame.rotation.y = Math.PI / 2;
      g.add(doorFrame);

      // awning + sign above
      const awning = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.6, 3.6), new THREE.MeshStandardMaterial({
        color: def.color, roughness: 0.5, metalness: 0.2, emissive: def.color, emissiveIntensity: 0.25
      }));
      awning.position.set(doorX + face[0] * 1.6, 9.4, doorZ + face[1] * 1.6);
      awning.rotation.x = face[1] !== 0 ? face[1] * 0.16 : 0;
      awning.rotation.z = face[0] !== 0 ? -face[0] * 0.16 : 0;
      if (side === 'left' || side === 'right') awning.rotation.y = Math.PI / 2;
      g.add(awning);

      if (KIT) {
        const plate = KIT.sign(def.name, {
          color: '#' + def.color.toString(16).padStart(6, '0'),
          planeW: Math.min(spanW * 0.8, 60),
          planeH: Math.min(spanW * 0.8, 60) * 0.22
        });
        plate.position.set(b.cx + face[0] * (faceDist + 1.1), 15.4, b.cy + face[1] * (faceDist + 1.1));
        if (side === 'left' || side === 'right') plate.rotation.y = face[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
        else plate.rotation.y = face[1] > 0 ? 0 : Math.PI;
        g.add(plate);
        const glow = new THREE.PointLight(def.color, 16, 120);
        glow.position.set(doorX + face[0] * 5, 8, doorZ + face[1] * 5);
        g.add(glow);
      }

      // doorstep and pavement so the entrance reads as a real entrance
      const step = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.9 }));
      step.position.set(doorX + face[0] * 5.4, 0.6, doorZ + face[1] * 5.4);
      g.add(step);

      if (def.kind === 'home') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(across + 16, 2.4, depth + 16), new THREE.MeshStandardMaterial({ color: 0x1b2436, roughness: 0.85 }));
        roof.position.set(b.cx, b.h + 1, b.cy);
        g.add(roof);
        const garden = new THREE.Mesh(new THREE.BoxGeometry(across + 30, 0.6, 40), new THREE.MeshStandardMaterial({ color: 0x1d3a2a, roughness: 0.95 }));
        garden.position.set(b.cx + face[0] * (faceDist + 22), 0.3, b.cy + face[1] * (faceDist + 22));
        g.add(garden);
      }

      propGroup.add(g);
      self.stores.push({
        kind: def.kind,
        name: def.name,
        color: def.color,
        x: doorX + face[0] * 5,
        y: doorZ + face[1] * 5
      });
    });
  };

  game.buildTraffic = function () {
    this.traffic = [];
    const self = this;
    const rnd = seeded(4242);
    const lanes = [];
    for (let i = 0; i <= COLS; i++) lanes.push({ axis: 'x', line: roadLine(i), max: WORLD_W });
    for (let j = 0; j <= ROWS; j++) lanes.push({ axis: 'y', line: roadLine(j), max: WORLD_H });

    for (let n = 0; n < TRAFFIC_COUNT; n++) {
      const lane = lanes[Math.floor(rnd() * lanes.length)];
      const dir = rnd() < 0.5 ? 1 : -1;
      const style = TRAFFIC_STYLES[Math.floor(rnd() * TRAFFIC_STYLES.length)];
      const color = TRAFFIC_COLORS[Math.floor(rnd() * TRAFFIC_COLORS.length)];
      const mesh = KIT
        ? KIT.car({ color: color, style: style, length: 9.6, width: 4.2, height: style === 'van' || style === 'suv' ? 2.1 : 1.7, envMap: ENV, driver: { suit: CLOTHES[Math.floor(rnd() * CLOTHES.length)], skin: SKINS[Math.floor(rnd() * SKINS.length)], envMap: ENV } })
        : makeCar(color, 0x101826, color);
      mesh.rotation.y = lane.axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      scene.add(mesh);
      const pos = rnd() * lane.max;
      self.traffic.push({
        axis: lane.axis,
        line: lane.line,
        dir: dir,
        lane: 26 + rnd() * 6,
        speed: 78 + rnd() * 70,
        pos: pos,
        mesh: mesh,
        stop: 0,
        honk: 0
      });
    }
  };

  game.updateTraffic = function (dt) {
    const player = this.onFoot ? this.foot : this.car;
    for (const t of this.traffic) {
      const tpos = { x: t.axis === 'x' ? t.pos : t.line + t.dir * t.lane, y: t.axis === 'y' ? t.pos : t.line + t.dir * t.lane };

      // brake for the player or a pedestrian directly ahead
      let blockAhead = false;
      const aheadX = tpos.x + (t.axis === 'x' ? t.dir * 46 : 0);
      const aheadY = tpos.y + (t.axis === 'y' ? t.dir * 46 : 0);
      if (Math.hypot(aheadX - player.x, aheadY - player.y) < 30) blockAhead = true;
      for (const p of this.peds) {
        if (!p.alive) continue;
        if (Math.hypot(aheadX - p.x, aheadY - p.y) < 26) {
          blockAhead = true;
          if (p.state !== 'flee') { p.state = 'flee'; p.timer = 2.4; p.fx = tpos.x; p.fy = tpos.y; }
        }
      }
      t.stop = lerp(t.stop, blockAhead ? 1 : 0, Math.min(1, dt * 4));
      const speed = t.speed * (1 - t.stop);
      t.pos += t.dir * speed * dt;
      if (t.pos > (t.axis === 'x' ? WORLD_W : WORLD_H) + 30) t.pos = -30;
      if (t.pos < -30) t.pos = (t.axis === 'x' ? WORLD_W : WORLD_H) + 30;

      t.honk = Math.max(0, t.honk - dt);
      if (!this.onFoot && t.honk === 0 && Math.hypot(tpos.x - this.car.x, tpos.y - this.car.y) < 34) {
        t.honk = 1.4;
        this.A.Sound.tone(430, 0.08, { type: 'square', vol: 0.03, to: 380 });
      }

      // traffic vs player car: a real collision, both lose speed
      if (!this.onFoot) {
        const d = Math.hypot(tpos.x - this.car.x, tpos.y - this.car.y);
        if (d < 17) {
          const impact = Math.abs(this.car.v);
          if (impact > 150) {
            this.health -= (impact - 150) * 0.035;
            this.flash = 0.7;
            this.A.Sound.tone(96, 0.14, { type: 'sawtooth', vol: 0.05 });
          }
          this.car.v *= -0.14;
          t.speed = Math.max(20, t.speed * 0.6);
        }
      }
      t.mesh.position.set(toX(tpos.x), 0, toZ(tpos.y));
      if (t.mesh.spinWheels) t.mesh.spinWheels(dt * Math.min(26, speed * 0.16));
    }
  };

  /* ---------------- weapons ---------------- */
  game.makeWeapons = function () {
    this.weapons = {
      pistol: { label: 'PISTOL', mag: 12, ammo: 36, cap: 12, dmg: 42, rate: 0.3, spread: 0.015, auto: false, model: 'pistol' },
      smg: { label: 'SMG', mag: 0, ammo: 0, cap: 30, dmg: 24, rate: 0.09, spread: 0.055, auto: true, model: 'smg' }
    };
    this.weapon = 'pistol';
    this.cool = 0;
    this.reloading = 0;
    this.firing = false;
    this.bullets = [];
    this.gunMesh = null;
    this.muzzleLight = new THREE.PointLight(0xffd27a, 0, 60);
    scene.add(this.muzzleLight);
    this.muzzleTimer = 0;
    this.applyWeapon();
  };

  game.applyWeapon = function () {
    if (this.gunMesh) {
      if (this.gunMesh.parent) this.gunMesh.parent.remove(this.gunMesh);
      this.gunMesh = null;
    }
    if (!KIT || !this.footMesh) return;
    const w = this.weapons[this.weapon];
    const mesh = KIT.gun({ kind: w.model });
    mesh.scale.setScalar(0.26);
    mesh.position.set(0, -5.6, 0.7);
    mesh.rotation.z = -Math.PI / 2;
    mesh.rotation.y = Math.PI / 2;
    const hand = this.footMesh.elbows && this.footMesh.elbows[1];
    if (hand) hand.add(mesh);
    else {
      mesh.position.set(1.2, 3.6, 1.1);
      this.footMesh.add(mesh);
    }
    this.gunMesh = mesh;
    if (this.gunMesh) this.gunMesh.visible = !!this.onFoot;
  };

  game.selectWeapon = function (name) {
    if (!this.weapons[name] || this.weapon === name) return;
    this.weapon = name;
    this.reloading = 0;
    this.applyWeapon();
    this.A.Sound.tone(560, 0.06, { type: 'triangle', vol: 0.04 });
  };

  game.reload = function () {
    const w = this.weapons[this.weapon];
    if (!w || this.reloading > 0) return;
    if (w.mag >= w.cap || w.ammo <= 0) return;
    this.reloading = this.weapon === 'smg' ? 1.1 : 0.8;
    this.A.Sound.tone(240, 0.06, { type: 'square', vol: 0.03 });
  };

  game.fireGun = function () {
    const w = this.weapons[this.weapon];
    if (!w || !this.onFoot || this.cool > 0 || this.reloading > 0) return;
    if (w.mag <= 0) {
      this.reload();
      return;
    }
    w.mag -= 1;
    this.cool = w.rate;
    this.flash = Math.max(this.flash, 0.22);

    const f = this.foot;
    const spread = (Math.random() - 0.5) * w.spread * 2;
    const ang = f.a + spread;
    const ox = f.x, oy = f.y;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const range = 360;

    let bestT = range, bestKind = null, bestRef = null;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const rx = p.x - ox, ry = p.y - oy;
      const t = rx * dx + ry * dy;
      if (t < 6 || t > range) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 6 && t < bestT) { bestT = t; bestKind = 'ped'; bestRef = p; }
    }
    for (const c of this.cops) {
      const rx = c.x - ox, ry = c.y - oy;
      const t = rx * dx + ry * dy;
      if (t < 6 || t > range) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 8 && t < bestT) { bestT = t; bestKind = 'cop'; bestRef = c; }
    }
    for (const t of this.traffic) {
      const tx = t.axis === 'x' ? t.pos : t.line + t.dir * t.lane;
      const ty = t.axis === 'y' ? t.pos : t.line + t.dir * t.lane;
      const rx = tx - ox, ry = ty - oy;
      const tt = rx * dx + ry * dy;
      if (tt < 8 || tt > range) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 9 && tt < bestT) { bestT = tt; bestKind = 'car'; bestRef = t; }
    }

    const hx = ox + dx * bestT, hy = oy + dy * bestT;
    this.tracer(ox, oy, hx, hy);

    if (bestKind === 'ped') {
      this.killPed(bestRef);
      addWanted(this, 1);
      this.A.Sound.tone(120, 0.1, { type: 'square', vol: 0.05 });
    } else if (bestKind === 'cop') {
      bestRef.hp = (bestRef.hp || 100) - w.dmg;
      bestRef.stun = 0.9;
      if (bestRef.hp <= 0) {
        scene.remove(bestRef.mesh);
        this.cops = this.cops.filter(function (c) { return c !== bestRef; });
        this.cash += 150;
        this.A.setScore(this.cash);
        addWanted(this, 1);
      }
      this.A.Sound.tone(180, 0.08, { type: 'square', vol: 0.05 });
    } else if (bestKind === 'car') {
      bestRef.speed = Math.min(bestRef.speed, 24);
      bestRef.stop = 1;
      this.A.Sound.tone(300, 0.07, { type: 'triangle', vol: 0.04 });
    } else {
      this.A.Sound.tone(900, 0.03, { type: 'square', vol: 0.02 });
    }

    // muzzle flash + report
    const world = this.footMesh ? new THREE.Vector3() : null;
    if (this.gunMesh && this.gunMesh.muzzle) {
      this.gunMesh.muzzle.getWorldPosition(world);
      this.muzzleLight.position.copy(world);
      this.muzzleLight.intensity = 30;
      this.muzzleTimer = 0.07;
    }
    this.A.Sound.tone(190, 0.09, { type: 'sawtooth', vol: 0.06, to: 70 });

    // everyone nearby panics
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - ox, p.y - oy) < 320) {
        p.state = 'flee';
        p.timer = 5 + Math.random() * 4;
        p.fx = ox;
        p.fy = oy;
      }
    }
  };

  game.killPed = function (p) {
    p.alive = false;
    p.cool = 9;
    p.dead = true;
    if (p.mesh) {
      p.mesh.rotation.z = Math.PI / 2;
      p.mesh.position.y = 0.6;
    }
    this.flash = Math.max(this.flash, 0.5);
  };

  game.tracer = function (x1, y1, x2, y2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(toX(x1), 3.2, toZ(y1)),
      new THREE.Vector3(toX(x2), 3.0, toZ(y2))
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    this.bullets.push({ line: line, life: 0.09 });
  };

  game.updateGuns = function (dt) {
    if (this.cool > 0) this.cool -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.weapons[this.weapon];
        const take = Math.min(w.cap - w.mag, w.ammo);
        w.mag += take;
        w.ammo -= take;
        this.A.Sound.tone(360, 0.05, { type: 'square', vol: 0.03 });
      }
    }
    if (this.firing && this.onFoot) {
      const w = this.weapons[this.weapon];
      if (w && w.auto) this.fireGun();
    }
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 420);
      if (this.muzzleTimer <= 0) this.muzzleLight.intensity = 0;
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / 0.09);
      if (b.life <= 0) {
        scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bullets.splice(i, 1);
      }
    }
  };

  /* ---------------- shops and the safehouse ---------------- */
  game.nearestStore = function () {
    if (!this.onFoot || !this.stores) return null;
    let best = null, bestD = 42;
    for (const s of this.stores) {
      const d = Math.hypot(this.foot.x - s.x, this.foot.y - s.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  };

  game.useStore = function () {
    const s = this.nearestStore();
    if (!s) return false;
    this.toastText = '';
    if (s.kind === 'ammo') {
      const p = this.weapons.pistol, m = this.weapons.smg;
      p.ammo += 36;
      m.ammo += 60;
      m.mag = Math.max(m.mag, 0);
      this.toastText = 'AMMU-NATION · +36 pistol rounds, +60 SMG rounds';
      this.A.Sound.tone(620, 0.1, { type: 'triangle', vol: 0.05, to: 880 });
    } else if (s.kind === 'food') {
      this.health = Math.min(100, this.health + 55);
      this.toastText = "CLUCKIN' BELL · hot meal, +55 health";
      this.A.Sound.tone(520, 0.12, { type: 'sine', vol: 0.05, to: 680 });
    } else if (s.kind === 'market') {
      this.health = Math.min(100, this.health + 25);
      this.cash += 25;
      this.A.setScore(this.cash);
      this.toastText = '24/7 · snacks and $25 change';
      this.A.Sound.tone(700, 0.08, { type: 'triangle', vol: 0.04 });
    } else if (s.kind === 'home') {
      this.health = 100;
      this.wanted = 0;
      this.heat = 0;
      this.copBust = 0;
      this.toastText = 'HOME · rested, healed, wanted level cleared';
      this.A.Sound.tone(440, 0.16, { type: 'sine', vol: 0.05, to: 620 });
    }
    this.toastTimer = 3.2;
    return true;
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
          p.dead = false;
          p.state = 'walk';
          p.x = rand(roadLine(0), roadLine(COLS));
          p.y = rand(roadLine(0), roadLine(ROWS));
          if (p.mesh) {
            p.mesh.visible = true;
            p.mesh.rotation.z = 0;
          }
        }
        continue;
      }

      p.timer -= dt;
      if (p.state === 'flee' && p.timer <= 0) p.state = 'walk';

      if (p.state === 'flee') {
        // run directly away from whatever scared them
        const ax = p.x - p.fx;
        const ay = p.y - p.fy;
        p.a = Math.atan2(ay, ax) + (p.idx % 2 ? 0.12 : -0.12);
        const run = p.speed * 2.5;
        p.x += Math.cos(p.a) * run * dt;
        p.y += Math.sin(p.a) * run * dt;
        p.phase += dt * 11;
        if (p.mesh && p.mesh.run) p.mesh.run(p.phase, 1);
      } else {
        p.phase += dt * 4.2;
        p.x += Math.cos(p.a) * p.speed * dt;
        p.y += Math.sin(p.a) * p.speed * dt;
        if (p.mesh && p.mesh.walk) p.mesh.walk(p.phase, 0.62);
      }

      if (this.blockedAt(p.x, p.y) || p.x < 8 || p.x > WORLD_W - 8 || p.y < 8 || p.y > WORLD_H - 8) {
        p.x -= Math.cos(p.a) * p.speed * dt * 1.2;
        p.y -= Math.sin(p.a) * p.speed * dt * 1.2;
        p.a += Math.PI * (0.5 + Math.random());
      }

      // step out of the way of a moving car; being clipped hurts
      const carDist = Math.hypot(car.x - p.x, car.y - p.y);
      if (!this.onFoot && Math.abs(car.v) > 70 && carDist < 42 && p.state !== 'flee') {
        p.state = 'flee';
        p.timer = 1.8;
        p.fx = car.x;
        p.fy = car.y;
      }
      if (!this.onFoot && Math.abs(car.v) > 70 && carDist < 24) {
        p.alive = false;
        p.cool = 7;
        if (p.mesh) p.mesh.visible = false;
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
      const mesh = makeCar(0xe9eeff, 0x101528, 0x9fb4ff, 'police', { suit: 0x1a2340, accent: 0x9fb4ff, skin: 0xd9ab86, envMap: ENV });
      const bar = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({ color: 0xff3355 })
      );
      bar.scale.set(2.6, 0.5, 0.9);
      bar.position.set(0, 2.4, -0.5);
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
    if (this.onFoot && this.footMesh.walk) {
      const moving = this.keys && (this.keys.KeyW || this.keys.KeyA || this.keys.KeyS || this.keys.KeyD || this.keys.ArrowUp || this.keys.ArrowLeft || this.keys.ArrowDown || this.keys.ArrowRight);
      if (moving) this.footMesh.walk(this.footStep || 0, 0.9);
      else this.footMesh.pose(this.time, 0.8);
      this.footMesh.aim();
    }
    if (this.gunMesh) this.gunMesh.visible = !!this.onFoot;

    for (const p of this.peds) {
      if (!p.mesh) continue;
      p.mesh.position.set(toX(p.x), 0, toZ(p.y));
      if (!p.dead) p.mesh.rotation.y = Math.PI / 2 - p.a;
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

  game.drawMap = function () {
    if (!mapCtx) return;
    const w = mapCanvas.width, h = mapCanvas.height;
    const sx = w / WORLD_W, sy = h / WORLD_H;
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = 'rgba(6, 10, 20, 0.72)';
    mapCtx.fillRect(0, 0, w, h);

    // blocks
    mapCtx.fillStyle = 'rgba(90, 110, 150, 0.5)';
    for (const b of this.city) {
      mapCtx.fillRect(b.x * sx, b.y * sy, b.w * sx, b.d * sy);
    }
    // roads
    mapCtx.strokeStyle = 'rgba(160, 200, 255, 0.22)';
    mapCtx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      mapCtx.beginPath();
      mapCtx.moveTo(roadLine(i) * sx, 0);
      mapCtx.lineTo(roadLine(i) * sx, h);
      mapCtx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, roadLine(j) * sy);
      mapCtx.lineTo(w, roadLine(j) * sy);
      mapCtx.stroke();
    }

    // landmark pins
    (this.stores || []).forEach(function (st) {
      mapCtx.fillStyle = '#' + st.color.toString(16).padStart(6, '0');
      mapCtx.fillRect(st.x * sx - 2, st.y * sy - 2, 5, 5);
    });

    // traffic, peds, cops
    mapCtx.fillStyle = 'rgba(240, 240, 250, 0.55)';
    for (const t of this.traffic) {
      const tx = t.axis === 'x' ? t.pos : t.line + t.dir * t.lane;
      const ty = t.axis === 'y' ? t.pos : t.line + t.dir * t.lane;
      mapCtx.fillRect(tx * sx - 1, ty * sy - 1, 3, 3);
    }
    mapCtx.fillStyle = 'rgba(120, 210, 255, 0.4)';
    for (const p of this.peds) {
      if (!p.alive) continue;
      mapCtx.fillRect(p.x * sx - 1, p.y * sy - 1, 2, 2);
    }
    mapCtx.fillStyle = '#ff3355';
    for (const c of this.cops) {
      mapCtx.beginPath();
      mapCtx.arc(c.x * sx, c.y * sy, 2.6, 0, Math.PI * 2);
      mapCtx.fill();
    }

    // delivery marker
    if (this.marker) {
      const pulse = 2.5 + Math.sin(this.time * 4) * 1.2;
      mapCtx.strokeStyle = '#ff4d9d';
      mapCtx.lineWidth = 1.4;
      mapCtx.beginPath();
      mapCtx.arc(this.marker.x * sx, this.marker.y * sy, pulse, 0, Math.PI * 2);
      mapCtx.stroke();
    }

    // player arrow
    const who = this.onFoot ? this.foot : this.car;
    mapCtx.save();
    mapCtx.translate(who.x * sx, who.y * sy);
    mapCtx.rotate(who.a);
    mapCtx.fillStyle = '#34e0ff';
    mapCtx.beginPath();
    mapCtx.moveTo(5, 0);
    mapCtx.lineTo(-3.6, 3.2);
    mapCtx.lineTo(-3.6, -3.2);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  };

  game.updateHud = function () {
    const cashEl = hud.querySelector('.v3-cash');
    const starsEl = hud.querySelector('.v3-stars');
    const speedEl = hud.querySelector('.v3-speed');
    const hintEl = hud.querySelector('.v3-hint');
    const hpEl = hud.querySelector('.v3-health');
    const hpFill = hpEl && hpEl.querySelector('i');
    const ammoEl = hud.querySelector('.v3-weapon');
    const promptEl = hud.querySelector('.v3-prompt');
    const toastEl = hud.querySelector('.v3-toast');

    if (cashEl) cashEl.textContent = '$' + this.cash;
    if (hpEl) {
      hpEl.classList.toggle('is-low', this.health < 35);
      hpFill.style.width = clamp(this.health, 0, 100) + '%';
    }

    if (starsEl) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < this.wanted ? '★' : '☆';
      starsEl.textContent = stars;
      starsEl.classList.toggle('is-hot', this.wanted > 0);
    }

    const kph = Math.round(Math.abs(this.car.v) * 0.42);
    speedEl.innerHTML = (this.onFoot ? '—' : kph) + ' <i>KM/H</i>';

    const w = this.weapons && this.weapons[this.weapon];
    if (ammoEl) {
      if (this.onFoot && w) {
        ammoEl.textContent = w.label + ' ' + w.mag + '/' + w.ammo + (this.reloading > 0 ? ' · RELOADING' : '');
        ammoEl.classList.add('is-on');
      } else {
        ammoEl.textContent = '';
        ammoEl.classList.remove('is-on');
      }
    }

    const store = this.nearestStore();
    if (promptEl) {
      if (store) promptEl.textContent = 'E — ' + (store.kind === 'home' ? 'go home' : 'shop at ' + store.name);
      else if (this.onFoot) promptEl.textContent = this.nearCar() ? 'E — get back in' : '';
      else promptEl.textContent = Math.abs(this.car.v) < 8 ? 'E — step out' : '';
    }
    hintEl.textContent = this.onFoot ? 'LMB — fire · R — reload · 1/2 — weapon' : '';

    if (toastEl) {
      this.toastTimer = Math.max(0, (this.toastTimer || 0) - 0.016);
      toastEl.textContent = this.toastTimer > 0 ? (this.toastText || '') : '';
      toastEl.style.opacity = this.toastTimer > 0 ? '1' : '0';
    }

    hud.querySelector('.v3-flash').style.opacity = (this.flash * 0.55).toFixed(2);
    this.drawMap();
  };

  game.update = function (dt) {
    this.time += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
    if (this.health < 0) this.health = 0;

    if (this.onFoot) this.updateFoot(dt);
    else this.updateCar(dt);

    this.updatePeds(dt);
    this.updateTraffic(dt);
    this.updateGuns(dt);
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
      if (game.nearestStore && game.nearestStore()) game.useStore();
      else game.toggleCar();
    }
    if (e.code === 'KeyF' && Arcade.state === 'playing') {
      e.preventDefault();
      game.fireGun();
    }
    if (e.code === 'KeyR' && Arcade.state === 'playing') game.reload();
    if (e.code === 'Digit1') game.selectWeapon('pistol');
    if (e.code === 'Digit2') game.selectWeapon('smg');
    if (e.code === 'KeyQ') game.firing = false;
  });

  window.addEventListener('keyup', function (e) {
    const game = window.Games.vice;
    if (!game || !game.keys) return;
    if (TRACKED.indexOf(e.code) >= 0) game.keys[e.code] = false;
  });

  window.addEventListener('blur', function () {
    const game = window.Games.vice;
    if (game) { game.keys = {}; game.firing = false; }
  });

  renderer.domElement.addEventListener('mousedown', function (e) {
    if (Arcade.gameId !== 'vice' || Arcade.state !== 'playing') return;
    const game = window.Games.vice;
    if (!game || !game.keys) return;
    e.preventDefault();
    game.firing = true;
    game.fireGun();
  });
  window.addEventListener('mouseup', function () {
    const game = window.Games.vice;
    if (game) game.firing = false;
  });
  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  resize3d();
  renderer.domElement.style.display = 'none';
  hud.style.display = 'none';

  window.Games = window.Games || {};
  window.Games.vice = game;
})();



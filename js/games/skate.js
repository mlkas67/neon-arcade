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

  const KIT = window.Kit3D || null;
  if (KIT) {
    KIT.quality(stage.renderer);
    stage.renderer.toneMappingExposure = 1.1;
    KIT.sky(scene, { top: 0x050a1e, bottom: 0x22304d, sunColor: 0xffe9c4, sunPower: 0.4, sunDir: new THREE.Vector3(-0.5, 0.35, -0.7) });
    scene.environment = KIT.environment(stage.renderer, { top: '#2b3f66', mid: '#141c2c', bottom: '#080b12' });
  }

  scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x101728, KIT ? 0.8 : 1.0));
  scene.add(new THREE.AmbientLight(0x36406b, 0.5));

  const key = KIT
    ? KIT.keyLight(scene, { color: 0xfff0d6, intensity: 1.6, x: -90, y: 150, z: 80, shadowSize: 150, shadowFar: 900, shadowMap: 1024 })
    : new THREE.DirectionalLight(0xfff0d6, 1.15);
  if (!KIT) { key.position.set(-70, 120, 60); scene.add(key); }

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


  const MAPS = [
    { name: 'Neon Plaza', tint: 0x6f7280, accent: PALETTE.line, spawn: { x: 0, z: 62, a: Math.PI } },
    { name: 'Dockyard', tint: 0x59686a, accent: 0x2ee6a8, spawn: { x: -66, z: 58, a: Math.PI } },
    { name: 'Rooftop', tint: 0x5b5470, accent: PALETTE.pink, spawn: { x: 0, z: 46, a: Math.PI } }
  ];

  const maps = [];
  let plaza = { ledges: [], rails: [], ramps: [] };

  function buildMap(id) {
    const def = MAPS[id];
    const m = {
      id: id,
      name: def.name,
      group: new THREE.Group(),
      ledges: [],
      rails: [],
      ramps: [],
      spawn: def.spawn
    };
    m.group.visible = false;
    world.add(m.group);
    const add = function (obj) { m.group.add(obj); return obj; };

    const floorGeo = new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2);
    const floorMat = mat(0xffffff, { roughness: KIT ? 0.72 : 0.85, metalness: KIT ? 0.16 : 0 });
    const floorTex = deckTexture();
    if (KIT) {
      // blend the procedural concrete with the plaza's painted lines
      const concrete = KIT.textures.concrete();
      concrete.repeat.set(HALF_X * 2 / 22, HALF_Z * 2 / 22);
      floorMat.map = concrete;
      floorMat.color.setHex(def.tint);
      floorMat.emissiveMap = floorTex;
      floorMat.emissive = new THREE.Color(0x1a2b44);
      floorMat.emissiveIntensity = 0.9;
      floorMat.map.needsUpdate = true;
    } else {
      floorMat.map = floorTex;
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    add(floor);

    const kerbMat = mat(PALETTE.concrete, { roughness: 0.75 });
    const edges = [
      [0, -HALF_Z, HALF_X * 2, 1.4],
      [0, HALF_Z, HALF_X * 2, 1.4],
      [-HALF_X, 0, 1.4, HALF_Z * 2],
      [HALF_X, 0, 1.4, HALF_Z * 2]
    ];
    edges.forEach(function (e) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(e[2], id === 2 ? 9 : 6, e[3]), kerbMat);
      wall.position.set(e[0], (id === 2 ? 9 : 6) / 2, e[1]);
      add(wall);
      const glow = neonEdge(e[2], 0.3, 0.3, def.accent);
      glow.position.set(e[0], id === 2 ? 9.1 : 6.1, e[1]);
      add(glow);
    });

    /* raised ledge with steps on both sides */
    function addLedge(x, z, w, d, h) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kerbMat);
      base.position.set(x, h / 2, z);
      add(base);

      const lip = neonEdge(w, 0.22, d, PALETTE.violet);
      lip.position.set(x, h + 0.11, z);
      add(lip);
      const edgeGlow = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.5, 0.24),
        new THREE.MeshBasicMaterial({ color: PALETTE.violet })
      );
      edgeGlow.position.set(x, h * 0.55, z + d / 2 + 0.08);
      add(edgeGlow);

      /* stairs at both ends */
      for (let i = 1; i <= 3; i++) {
        const stepH = (h / 4) * i;
        const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, stepH, d), mat(0x2a3350, { roughness: 0.8 }));
        step.position.set(x - w / 2 - 2.1 * i, stepH / 2, z);
        add(step);
        const step2 = step.clone();
        step2.position.x = x + w / 2 + 2.1 * i;
        add(step2);
      }

      m.ledges.push({ x: x, z: z, w: w, d: d, h: h });
    }

    /* rail: pos, length, axis */
    function addRail(x, z, length, axis, height) {
      const h = height == null ? 2.3 : height;
      const barGeo = new THREE.CylinderGeometry(0.28, 0.28, length, 10);
      const bar = new THREE.Mesh(barGeo, mat(PALETTE.rail, { metalness: 0.85, roughness: 0.22 }));
      bar.position.set(x, h, z);
      if (axis === 'x') bar.rotation.z = Math.PI / 2;
      else bar.rotation.x = Math.PI / 2;
      add(bar);

      const glowBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, length, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.28 })
      );
      glowBar.position.copy(bar.position);
      glowBar.rotation.copy(bar.rotation);
      add(glowBar);

      const postGeo = new THREE.CylinderGeometry(0.2, 0.2, h, 8);
      const postMat = mat(0x2c3552, { metalness: 0.6, roughness: 0.4 });
      [-length / 2 + 0.6, length / 2 - 0.6].forEach(function (off) {
        const p = new THREE.Mesh(postGeo, postMat);
        if (axis === 'x') p.position.set(x + off, h / 2, z);
        else p.position.set(x, h / 2, z + off);
        add(p);
      });

      m.rails.push({ x: x, z: z, len: length, axis: axis, h: h });
    }

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
      const mm = new THREE.Mesh(geo, mat(PALETTE.concrete, { roughness: 0.7 }));
      mm.position.set(-2, 0, -11);
      g.add(mm);

      const lipCurve = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 21),
        new THREE.MeshBasicMaterial({ color: def.accent })
      );
      lipCurve.position.set(4.4, 7.5, 0);
      g.add(lipCurve);

      g.position.set(x, 0, z);
      g.rotation.y = face;
      add(g);
      m.ramps.push({ x: x, z: z, face: face });
    }

    function addBank(x, z, w, d, h, colour) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kerbMat);
      bank.position.set(x, h / 2, z);
      add(bank);
      const glow = neonEdge(w, 0.18, d, colour || def.accent);
      glow.position.set(x, h + 0.05, z);
      add(glow);
      m.ledges.push({ x: x, z: z, w: w, d: d, h: h });
    }

    function addContainer(x, z, rot, colour) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 12), mat(colour, { roughness: 0.7, metalness: 0.35 }));
      box.position.set(x, 4.5, z);
      box.rotation.y = rot;
      add(box);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(30.2, 0.4, 12.2), new THREE.MeshBasicMaterial({ color: def.accent }));
      stripe.position.set(x, 8.4, z);
      stripe.rotation.y = rot;
      add(stripe);
      m.ledges.push({ x: x, z: z, w: Math.abs(Math.cos(rot)) > 0.5 ? 30 : 12, d: Math.abs(Math.cos(rot)) > 0.5 ? 12 : 30, h: 9 });
    }

    if (id === 0) {
      addLedge(-46, -26, 44, 22, PLATFORM_Y);
      addBank(30, -48, 60, 16, 3, PALETTE.line);
      addBank(-62, 40, 26, 26, 3.6, PALETTE.pink);
      addRail(18, 8, 34, 'z');
      addRail(46, -18, 26, 'x');
      addRail(-14, 58, 30, 'x');
      addKicker(72, 52, Math.PI);
      addKicker(-70, -60, 0);
    } else if (id === 1) {
      // Docker yard: containers to hop, a long pier rail and one huge launch
      addContainer(-52, -40, 0, 0x2b6b58);
      addContainer(-52, -40, 0, 0x2b6b58);
      addContainer(-18, -52, 0, 0x7a3c52);
      addContainer(30, -34, Math.PI / 2, 0x35506e);
      addBank(66, 22, 40, 20, 4.2, def.accent);
      addRail(-70, 10, 60, 'z', 3.1);
      addRail(8, 44, 44, 'x', 1.9);
      addKicker(-16, 24, -Math.PI / 2);
      addKicker(58, -60, Math.PI);
      // water beyond the pier edge
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_X * 6, HALF_Z * 6),
        new THREE.MeshStandardMaterial({ color: 0x081420, roughness: 0.15, metalness: 0.75 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = -2.4;
      add(water);
    } else {
      // Rooftop: tight parapets, AC units, two lips
      addLedge(0, -30, 38, 20, 6.4);
      addLedge(-58, 26, 26, 22, 4.6);
      addLedge(56, 30, 24, 20, 7.2);
      addBank(0, 58, 34, 12, 2.6, PALETTE.pink);
      addRail(-22, 6, 40, 'x', 2.1);
      addRail(34, -2, 28, 'z', 2.6);
      addKicker(72, -46, Math.PI);
      const unitMat = mat(0x39405a, { roughness: 0.55, metalness: 0.4 });
      [[24, 44], [-34, 46], [12, -66]].forEach(function (p) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 8), unitMat);
        ac.position.set(p[0], 2, p[1]);
        add(ac);
        m.ledges.push({ x: p[0], z: p[1], w: 10, d: 8, h: 4 });
      });
    }

    /* street lamps for glow */
    const lampGeo = new THREE.CylinderGeometry(0.3, 0.42, 26, 8);
    const lampMat = mat(0x222b42, { metalness: 0.7, roughness: 0.35 });
    const bulbGeo = new THREE.SphereGeometry(1.1, 10, 8);
    [[-96, -74], [96, -74], [-96, 74], [96, 74], [0, -78]].forEach(function (p, i) {
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(p[0], 13, p[1]);
      add(pole);
      const colour = [PALETTE.pink, def.accent, PALETTE.violet, PALETTE.gold, def.accent][i % 5];
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: colour }));
      bulb.position.set(p[0], 26, p[1]);
      add(bulb);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18 })
      );
      glow.position.copy(bulb.position);
      add(glow);
    });

    /* skyline backdrop */
    const bMat = mat(0x121a30, { roughness: 0.9 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x2b6f9a });
    const rnd = seeded(20234 + id * 17);
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
      add(b);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.5, 0.3), winMat);
      strip.position.set(b.position.x, h * 0.72, b.position.z + (b.position.z < 0 ? d / 2 : -d / 2));
      if (side >= 2) {
        strip.position.set(b.position.x + (b.position.x < 0 ? w / 2 : -w / 2), h * 0.72, b.position.z);
        strip.rotation.y = Math.PI / 2;
      }
      add(strip);
    }

    maps.push(m);
    return m;
  }

  for (let i = 0; i < MAPS.length; i++) buildMap(i);

  /* ---------------- rival skaters (multiplayer ghosts) ---------------- */
  const ghostSkaters = new Map();

  function clearGhostSkaters() {
    ghostSkaters.forEach(function (g) {
      scene.remove(g);
      g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    });
    ghostSkaters.clear();
  }

  function syncGhostSkaters(dt) {
    const live = window.Arcade && typeof Arcade.rivals === 'function' && Arcade.state === 'playing';
    if (!live) {
      ghostSkaters.forEach(function (g) { g.visible = false; });
      return;
    }
    const list = Arcade.rivals('deck');
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.age > 4000) continue;
      seen.add(r.id);
      let g = ghostSkaters.get(r.id);
      if (!g) {
        g = buildSkater({ ghost: true, color: parseInt(String(Arcade.rivalColor(i)).slice(1), 16) });
        scene.add(g);
        ghostSkaters.set(r.id, g);
      }
      const q = r.s || {};
      const want = new THREE.Vector3(q.x || 0, q.y || 0, q.z || 0);
      g.position.lerp(want, Math.min(1, dt * 10));
      g.rotation.y = typeof q.a === 'number' ? q.a : 0;
      g.visible = true;
      if (g.person && g.person.pose) g.person.pose(performance.now() / 1000, 0.75);
    }
    ghostSkaters.forEach(function (g, id) {
      if (seen.has(id)) return;
      scene.remove(g);
      g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      ghostSkaters.delete(id);
    });
  }

  /* ---------------- skater ---------------- */
  let skater = null;
  let board = null;
  let deckPivotRef = null;
  let riderBody = null;

  function buildSkater(opts) {
    const ghost = !!(opts && opts.ghost);
    const tint = (opts && opts.color) || 0x34e0ff;
    if (KIT) {
      const gk = new THREE.Group();
      const deckPivotK = new THREE.Group();
      deckPivotK.position.y = 1.0;
      gk.add(deckPivotK);
      if (!ghost) deckPivotRef = deckPivotK;
      const deckK = KIT.board({ color: ghost ? 0x121a2a : 0x1c2338, grip: 0x0c111c });
      deckK.scale.setScalar(0.13);
      deckPivotK.add(deckK);
      deckPivotK.position.y = 0.62;
      const bodyK = new THREE.Group();
      bodyK.position.y = 0.1;
      const person = KIT.person({ suit: ghost ? tint : 0x34e0ff, accent: ghost ? tint : 0xff4d9d, skin: 0xf0c39a, pants: 0x222b3f, envMap: scene.environment });
      person.scale.setScalar(0.175);
      person.position.y = 0.05;
      person.rotation.x = 0.08;
      bodyK.add(person);
      gk.add(bodyK);
      gk.person = person;
      if (!ghost) {
        board = gk;
        riderBody = bodyK;
      }
      return gk;
    }
    const g = new THREE.Group();

    const deckShape = new THREE.BoxGeometry(3.4, 0.26, 9.6);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x1c2338, roughness: 0.55, metalness: 0.15,
      emissive: 0x0a4a63, emissiveIntensity: 0.45
    });
    const deckPivot = new THREE.Group();
    deckPivot.position.y = 1.0;
    g.add(deckPivot);
    if (!ghost) deckPivotRef = deckPivot;

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
      color: ghost ? tint : 0x34e0ff, roughness: 0.45, emissive: ghost ? tint : 0x063a4a, emissiveIntensity: 0.5
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
    if (!ghost) {
      board = g;
      riderBody = body;
    }
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
    if (e.code === 'KeyM' && Arcade.state === 'playing') g.cycleMap();
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
    usesArrowUp: true,
    tip: 'Skate plaza: push, pop, flip and grind the rails. Chain tricks, keep the combo alive.',
    readyHeading: 'Neon Deck',
    readyText: 'Three parks, real decks and no rules. Press <kbd>Space</kbd> to drop in, <kbd>M</kbd> for the next park.',
    deadHeading: 'Bailed',
    deadText: 'Sketchy landing. Shake it off and run it back?',
    overlayDelay: 480,
    controlHint: '<kbd>W</kbd> push · <kbd>A</kbd><kbd>D</kbd> carve / flip in the air · <kbd>Space</kbd> ollie · <kbd>S</kbd> brake · <kbd>M</kbd> change park',

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
        skater = buildSkater();
        scene.add(skater);
      }
      if (this.mapIndex == null) this.mapIndex = 0;
      this.setMap(this.mapIndex);

      this.poseSkater();
      this.placeCamera(1);
      stage.show();
      A.setScore(0);
      this.updateHud();
    },

    setMap: function (idx) {
      if (!maps.length) return;
      this.mapIndex = ((idx % maps.length) + maps.length) % maps.length;
      const m = maps[this.mapIndex];
      for (const other of maps) other.group.visible = other.id === this.mapIndex;
      plaza = m;
      this.pos.set(m.spawn.x, 0, m.spawn.z);
      this.a = m.spawn.a;
      this.speed = 0;
      this.vy = 0;
      this.grounded = true;
      this.grind = null;
      this.flip = 0;
      this.flipVel = 0;
      this.shove = 0;
      this.startLock = true;
      this.poseSkater();
      this.placeCamera(1);
      if (trickText && trickEl) {
        trickText.textContent = 'MAP · ' + m.name;
        trickEl.classList.add('is-on');
        this.trickTimer = 1.6;
      }
    },

    cycleMap: function () {
      this.setMap(this.mapIndex + 1);
      if (this.A && this.A.Sound) this.A.Sound.point();
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

    mpPose: function () {
      return { x: this.pos.x, y: this.pos.y, z: this.pos.z, a: this.a };
    },

    update: function (dt) {
      const keys = this.keys || {};
      this.time += dt;
      syncGhostSkaters(dt);
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
      if (skater.person && skater.person.pose) {
        skater.person.pose(this.time * 1.7 + 0.4, this.grounded ? (this.grind ? 0.6 : 0.85) : 0.45);
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
      clearGhostSkaters();
      stage.hide();
    }
  };

  window.Games = window.Games || {};
  window.Games.deck = game;
  window.Deck = { game: game, stage: stage, plaza: plaza, ghosts: ghostSkaters };
})();

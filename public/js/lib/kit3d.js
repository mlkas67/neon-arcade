/* ============================================================
   Legeniko Arcade — 3D realism kit
   Procedural textures, a physically-lit look and detailed
   models shared by Neon Vice 3D, Neon Ridge and Neon Deck.
   Everything is generated at runtime: no image downloads, and
   it all works offline in the static build.
   ============================================================ */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('Kit3D needs three.js (vendor/three.min.js).');
    return;
  }

  const cache = new Map();

  /* ---------------- textures ---------------- */

  function canvasTexture(key, w, h, draw, opts) {
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (opts && opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    cache.set(key, tex);
    return tex;
  }

  function noise(ctx, w, h, amount) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  const textures = {
    asphalt: function () {
      return canvasTexture('asphalt', 512, 512, function (ctx, w, h) {
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
          const g = 40 + Math.random() * 55;
          ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 4) + ',' + (0.25 + Math.random() * 0.5) + ')';
          ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
        }
        for (let i = 0; i < 26; i++) {
          ctx.strokeStyle = 'rgba(120,140,170,' + (0.02 + Math.random() * 0.05) + ')';
          ctx.lineWidth = 2 + Math.random() * 10;
          ctx.beginPath();
          ctx.moveTo(Math.random() * w, 0);
          ctx.lineTo(Math.random() * w, h);
          ctx.stroke();
        }
        noise(ctx, w, h, 14);
      });
    },

    concrete: function () {
      return canvasTexture('concrete', 512, 512, function (ctx, w, h) {
        ctx.fillStyle = '#9d9a92';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 700; i++) {
          ctx.fillStyle = 'rgba(120,118,112,' + (0.05 + Math.random() * 0.16) + ')';
          ctx.beginPath();
          ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(60,58,54,0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
        ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
        ctx.stroke();
        noise(ctx, w, h, 20);
      });
    },

    snow: function () {
      return canvasTexture('snow', 512, 512, function (ctx, w, h) {
        ctx.fillStyle = '#eef4ff';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = 'rgba(186,204,230,' + (0.05 + Math.random() * 0.2) + ')';
          ctx.beginPath();
          ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 26, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 1600; i++) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.6) + ')';
          ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
        }
      });
    },

    facade: function (tint, lit) {
      const key = 'facade-' + tint + '-' + (lit ? 1 : 0);
      return canvasTexture(key, 512, 1024, function (ctx, w, h) {
        ctx.fillStyle = tint || '#1b2a44';
        ctx.fillRect(0, 0, w, h);
        const cols = 8, rows = 22;
        const cw = w / cols, ch = h / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * cw + cw * 0.14;
            const y = r * ch + ch * 0.16;
            const ww = cw * 0.72, wh = ch * 0.62;
            if (Math.random() < (lit ? 0.5 : 0.1)) {
              const warm = Math.random() < 0.7;
              const g = ctx.createLinearGradient(x, y, x, y + wh);
              g.addColorStop(0, warm ? 'rgba(255,226,168,0.95)' : 'rgba(176,224,255,0.95)');
              g.addColorStop(1, warm ? 'rgba(255,190,120,0.6)' : 'rgba(120,180,255,0.55)');
              ctx.fillStyle = g;
            } else {
              ctx.fillStyle = 'rgba(14,22,38,0.92)';
            }
            ctx.fillRect(x, y, ww, wh);
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, ww, wh);
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let r = 0; r < rows; r++) ctx.fillRect(0, r * ch, w, 2);
      });
    },

    grip: function () {
      return canvasTexture('grip', 128, 128, function (ctx, w, h) {
        ctx.fillStyle = '#191919';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
          ctx.fillStyle = 'rgba(70,70,70,' + (Math.random() * 0.5) + ')';
          ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
        }
      });
    },

    spark: function () {
      return canvasTexture('spark', 64, 64, function (ctx, w, h) {
        const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    },

    graffiti: function () {
      return canvasTexture('graffiti', 512, 256, function (ctx, w, h) {
        ctx.fillStyle = '#3b3a3a';
        ctx.fillRect(0, 0, w, h);
        noise(ctx, w, h, 30);
        const colors = ['#e94ec0', '#43d8ff', '#ffe066', '#69ffa5', '#ff6b6b'];
        for (let i = 0; i < 12; i++) {
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth = 6 + Math.random() * 16;
          ctx.lineCap = 'round';
          ctx.beginPath();
          let x = Math.random() * w, y = 30 + Math.random() * (h - 60);
          ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (Math.random() - 0.5) * 180;
            y += (Math.random() - 0.5) * 120;
            ctx.quadraticCurveTo(x + 30, y - 30, x, y);
          }
          ctx.stroke();
        }
      });
    }
  };

  /* ---------------- sky, light, environment ---------------- */

  function sky(scene, opts) {
    opts = opts || {};
    const geo = new THREE.SphereGeometry(opts.radius || 2600, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(opts.top == null ? 0x0a1430 : opts.top) },
        bottom: { value: new THREE.Color(opts.bottom == null ? 0x2a3d63 : opts.bottom) },
        sunDir: { value: (opts.sunDir || new THREE.Vector3(-0.4, 0.5, 0.7)).clone().normalize() },
        sunColor: { value: new THREE.Color(opts.sunColor == null ? 0xfff0c4 : opts.sunColor) },
        sunPower: { value: opts.sunPower == null ? 0.55 : opts.sunPower }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunPower;',
        'varying vec3 vDir;',
        'void main() {',
        '  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(bottom, top, pow(h, 0.85));',
        '  float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        '  col += sunColor * pow(d, 340.0) * 3.0;',
        '  col += sunColor * pow(d, 6.0) * sunPower * 0.5;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    scene.background = new THREE.Color(opts.top == null ? 0x0a1430 : opts.top);
    return mesh;
  }

  function quality(renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /* A gradient equirect texture turned into an env map: metal and glass reflect it. */
  function environment(renderer, opts) {
    opts = opts || {};
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, opts.top || '#8fb8ff');
    g.addColorStop(0.5, opts.mid || '#4a5f8c');
    g.addColorStop(1, opts.bottom || '#141a26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  function keyLight(scene, opts) {
    opts = opts || {};
    const light = new THREE.DirectionalLight(opts.color == null ? 0xffffff : opts.color, opts.intensity == null ? 2.1 : opts.intensity);
    light.position.set(opts.x == null ? -260 : opts.x, opts.y == null ? 420 : opts.y, opts.z == null ? 240 : opts.z);
    light.castShadow = true;
    const size = opts.shadowSize || 320;
    light.shadow.mapSize.set(opts.shadowMap || 1024, opts.shadowMap || 1024);
    light.shadow.camera.near = 20;
    light.shadow.camera.far = opts.shadowFar || 1600;
    light.shadow.camera.left = -size;
    light.shadow.camera.right = size;
    light.shadow.camera.top = size;
    light.shadow.camera.bottom = -size;
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.7;
    scene.add(light);
    if (opts.target) {
      light.target.position.copy(opts.target);
      scene.add(light.target);
    }
    return light;
  }

  /* ---------------- materials ---------------- */

  function paint(color, opts) {
    opts = opts || {};
    return new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: opts.metalness == null ? 0.55 : opts.metalness,
      roughness: opts.roughness == null ? 0.28 : opts.roughness,
      clearcoat: opts.clearcoat == null ? 1 : opts.clearcoat,
      clearcoatRoughness: opts.clearcoatRoughness == null ? 0.12 : opts.clearcoatRoughness,
      envMap: opts.envMap || null,
      envMapIntensity: opts.envMapIntensity == null ? 1.1 : opts.envMapIntensity
    });
  }

  function glassMat(opts) {
    opts = opts || {};
    return new THREE.MeshPhysicalMaterial({
      color: opts.color == null ? 0x0d1622 : opts.color,
      metalness: 0.2,
      roughness: 0.06,
      transparent: true,
      opacity: opts.opacity == null ? 0.72 : opts.opacity,
      envMap: opts.envMap || null,
      envMapIntensity: 1.6
    });
  }

  /* ---------------- models ---------------- */

  function contactShadow(w, h, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: textures.spark(), transparent: true, opacity: opacity == null ? 0.5 : opacity, depthWrite: false, color: 0x000000 })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  /* A car built from an extruded side profile: nose, cabin, tail. */
  function car(opts) {
    opts = opts || {};
    const envMap = opts.envMap || null;
    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    const L = opts.length || 34;
    const W = opts.width || 17;
    const H = opts.height || 9;

    const shape = new THREE.Shape();
    shape.moveTo(-L / 2, 0);
    shape.lineTo(-L / 2 + 1.4, H * 0.62);
    shape.lineTo(-L * 0.12, H * 0.78);
    shape.lineTo(L * 0.1, H * 1.36);
    shape.lineTo(L * 0.3, H * 1.3);
    shape.lineTo(L * 0.42, H * 0.72);
    shape.lineTo(L / 2 - 0.6, H * 0.6);
    shape.lineTo(L / 2, 0);
    shape.lineTo(-L / 2, 0);
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelSize: 1.1, bevelThickness: 0.9, bevelSegments: 3, steps: 1 });
    bodyGeo.translate(0, 0, -W / 2);
    const body = new THREE.Mesh(bodyGeo, paint(opts.color == null ? 0xd21f3c : opts.color, { envMap: envMap, metalness: 0.6, roughness: 0.22 }));
    body.castShadow = true;
    body.receiveShadow = true;
    bodyGroup.add(body);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, H * 0.5, W * 0.9), glassMat({ envMap: envMap }));
    glass.position.set(L * 0.08, H * 1.02, 0);
    bodyGroup.add(glass);

    const trimMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.8, roughness: 0.4 });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 0.9, W * 1.01), trimMat);
    sill.position.set(0, H * 0.34, 0);
    bodyGroup.add(sill);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 2.6, roughness: 0.2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2f4e, emissive: 0xff2f4e, emissiveIntensity: 2.2, roughness: 0.3 });
    const lampGeo = new THREE.BoxGeometry(1.1, 1.6, 4.2);
    [-1, 1].forEach(function (s) {
      const lamp = new THREE.Mesh(lampGeo, headMat);
      lamp.position.set(L / 2 - 0.4, H * 0.52, s * W * 0.3);
      bodyGroup.add(lamp);
      const tail = new THREE.Mesh(lampGeo, tailMat);
      tail.position.set(-L / 2 + 0.4, H * 0.52, s * W * 0.3);
      bodyGroup.add(tail);
    });

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, W * 0.94), trimMat);
    spoiler.position.set(-L / 2 + 2.2, H * 1.05, 0);
    bodyGroup.add(spoiler);
    [-1, 1].forEach(function (s) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 2.4), trimMat);
      mirror.position.set(L * 0.16, H * 0.98, s * W * 0.62);
      bodyGroup.add(mirror);
    });

    const wheels = [];
    const tyreGeo = new THREE.CylinderGeometry(3.5, 3.5, 2.4, 20);
    tyreGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(2.1, 2.1, 2.6, 12);
    rimGeo.rotateX(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(3.6, 0.55, 0.9);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.94, metalness: 0.05 });
    const rimMat = new THREE.MeshStandardMaterial({ color: opts.rimColor == null ? 0xc9d2dd : opts.rimColor, metalness: 0.95, roughness: 0.22, envMap: envMap });
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (pair) {
      const hub = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      hub.add(tyre);
      hub.add(new THREE.Mesh(rimGeo, rimMat));
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.z = (Math.PI / 4) * i;
        hub.add(spoke);
      }
      hub.position.set(pair[0] * (L * 0.32), 3.4, pair[1] * (W * 0.5 + 0.4));
      bodyGroup.add(hub);
      wheels.push(hub);
    });

    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 3.2, W * 2.2),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(L * 2, 0.16, 0);
    group.add(beam);

    const contact = contactShadow(L * 1.5, W * 1.7, 0.45);
    contact.position.y = 0.24;
    group.add(contact);

    group.wheels = wheels;
    group.body = bodyGroup;
    group.beam = beam;
    group.dims = { L: L, W: W, H: H };
    group.spinWheels = function (speed) {
      wheels.forEach(function (w) { w.rotation.z -= speed; });
    };
    return group;
  }

  /* Articulated humanoid: enough joints for a believable rider/skater pose. */
  function person(opts) {
    opts = opts || {};
    const skin = opts.skin == null ? 0xe8b995 : opts.skin;
    const suit = opts.suit == null ? 0x24303f : opts.suit;
    const accent = opts.accent == null ? 0xff4d9d : opts.accent;
    const root = new THREE.Group();
    const matSuit = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.62, metalness: 0.12 });
    const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7, metalness: 0.02 });
    const matAccent = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42, metalness: 0.3, emissive: accent, emissiveIntensity: 0.25 });

    const hips = new THREE.Group();
    hips.position.y = 18;
    root.add(hips);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(4.4, 10, 6, 12), matSuit);
    torso.position.y = 7;
    torso.castShadow = true;
    hips.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.4, 5.2), matAccent);
    chest.position.y = 9.6;
    hips.add(chest);

    const neck = new THREE.Group();
    neck.position.y = 13.4;
    hips.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.5, 18, 14), matSkin);
    head.castShadow = true;
    neck.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(3.9, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), matAccent);
    helmet.position.y = 0.7;
    neck.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(3.55, 18, 12, -0.9, 1.8, 1.05, 0.5), glassMat({ envMap: opts.envMap || null, color: 0x101820, opacity: 0.9 }));
    visor.position.y = 0.2;
    neck.add(visor);

    function limb(len, radius, mat) {
      const g = new THREE.Group();
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 4, 8), mat);
      seg.position.y = -len / 2 - radius * 0.4;
      seg.castShadow = true;
      g.add(seg);
      return g;
    }

    const arms = [], legs = [];
    [-1, 1].forEach(function (s) {
      const shoulder = limb(9, 1.55, matSuit);
      shoulder.position.set(s * 5.4, 10.6, 0);
      shoulder.rotation.z = s * 0.12;
      hips.add(shoulder);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), matSkin);
      hand.position.y = -10.2;
      shoulder.add(hand);
      arms.push(shoulder);

      const hip = limb(12, 1.9, matSuit);
      hip.position.set(s * 2.5, -1.6, 0);
      hips.add(hip);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 5.4), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.8 }));
      boot.position.set(0, -13.4, 0.9);
      hip.add(boot);
      legs.push(hip);
    });

    root.hips = hips;
    root.arms = arms;
    root.legs = legs;
    root.head = head;

    /* Gentle idle: counter-swaying limbs, small bounce. */
    root.pose = function (t, effort) {
      const e = effort == null ? 1 : effort;
      const s = Math.sin(t * 6.2) * 0.34 * e;
      legs[0].rotation.x = s * 0.9;
      legs[1].rotation.x = -s * 0.9;
      arms[0].rotation.x = -s * 0.8;
      arms[1].rotation.x = s * 0.8;
      hips.position.y = 18 + Math.abs(Math.cos(t * 6.2)) * 1.1 * e;
      hips.rotation.y = Math.sin(t * 3.1) * 0.08 * e;
    };
    return root;
  }

  function board(opts) {
    opts = opts || {};
    const group = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.7, 26),
      new THREE.MeshStandardMaterial({ color: opts.color == null ? 0xff4d9d : opts.color, roughness: 0.4, metalness: 0.25 })
    );
    deck.castShadow = true;
    group.add(deck);
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.22, 25.8),
      new THREE.MeshStandardMaterial({ map: textures.grip(), roughness: 0.95 })
    );
    grip.position.y = 0.45;
    group.add(grip);
    const truckMat = new THREE.MeshStandardMaterial({ color: 0xb9c4cf, metalness: 0.9, roughness: 0.3 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.6 });
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 12), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0] * 3.2, -1, p[1] * 8.4);
      group.add(wheel);
    });
    [-6.5, 6.5].forEach(function (z) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.9, 1.6), truckMat);
      truck.position.set(0, -0.5, z);
      group.add(truck);
    });
    return group;
  }

  /* ---------------- scenery ---------------- */

  function building(opts) {
    opts = opts || {};
    const w = opts.w || 40, h = opts.h || 60, d = opts.d || 40;
    const tex = textures.facade(opts.tint || '#1b2a44', opts.lit !== false);
    tex.repeat.set(Math.max(1, Math.round(w / 26)), Math.max(1, Math.round(h / 44)));
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(opts.glow == null ? 0xffffff : opts.glow),
      emissiveIntensity: opts.emissive == null ? 0.5 : opts.emissive,
      roughness: 0.48,
      metalness: 0.28
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function streetLamp(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2029, metalness: 0.7, roughness: 0.45 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.05, 26, 8), dark);
    pole.position.y = 13;
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 0.9), dark);
    arm.position.set(3.1, 25.4, 0);
    g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.4), new THREE.MeshStandardMaterial({
      color: 0xfff0c0, emissive: opts.color == null ? 0xffd9a0 : opts.color, emissiveIntensity: 3.2, roughness: 0.3
    }));
    head.position.set(5.6, 24.7, 0);
    g.add(head);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: opts.color == null ? 0xffcf90 : opts.color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(5.6, 0.22, 0);
    g.add(pool);
    return g;
  }

  function tree(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, opts.trunk || 9, 7), trunkMat);
    trunk.position.y = (opts.trunk || 9) / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: opts.leaf == null ? 0x1f7a4d : opts.leaf, roughness: 0.88, metalness: 0.02 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.75 });
    let y = (opts.trunk || 9) + 2;
    for (let i = 0; i < 3; i++) {
      const r = (opts.radius || 8) * (1 - i * 0.24);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, (opts.height || 10) * 0.75, 9), leafMat);
      cone.position.y = y;
      cone.castShadow = true;
      g.add(cone);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, (opts.height || 10) * 0.42, 9), snowMat);
      cap.position.y = y + (opts.height || 10) * 0.26;
      g.add(cap);
      y += (opts.height || 10) * 0.46;
    }
    return g;
  }

  function rock(size) {
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * (0.75 + Math.random() * 0.5), pos.getY(i) * (0.5 + Math.random() * 0.5), pos.getZ(i) * (0.75 + Math.random() * 0.5));
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function rail(opts) {
    opts = opts || {};
    const len = opts.length || 40;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: opts.color == null ? 0xd7dee7 : opts.color, metalness: 0.92, roughness: 0.24, envMap: opts.envMap || null });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, len, 10), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = opts.height || 7;
    bar.castShadow = true;
    g.add(bar);
    [-1, 1].forEach(function (s) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, (opts.height || 7) + 3, 8), metal);
      post.position.set(s * (len / 2 - 2), ((opts.height || 7) + 3) / 2, 0);
      post.castShadow = true;
      g.add(post);
    });
    return g;
  }

  function ledge(opts) {
    opts = opts || {};
    const w = opts.w || 60, h = opts.h || 9, d = opts.d || 14;
    const tex = textures.concrete();
    tex.repeat.set(Math.max(1, w / 30), 1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 }));
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 1, d + 1.6), new THREE.MeshStandardMaterial({ color: opts.cap == null ? 0xb9b4a8 : opts.cap, roughness: 0.8 }));
    cap.position.y = h / 2;
    mesh.add(cap);
    return mesh;
  }

  /* Snow / dust / spark spray that follows a moving actor. */
  function spray(opts) {
    opts = opts || {};
    const count = opts.count || 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos[i * 3 + 1] = -999;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size || 5,
      color: opts.color == null ? 0xffffff : opts.color,
      transparent: true,
      opacity: opts.opacity == null ? 0.75 : opts.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: textures.spark()
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const life = new Float32Array(count);
    const vel = new Float32Array(count * 3);
    return {
      points: points,
      burst: function (x, y, z, power) {
        for (let i = 0; i < count; i++) {
          if (life[i] > 0) continue;
          pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
          vel[i * 3] = (Math.random() - 0.5) * power;
          vel[i * 3 + 1] = Math.random() * power * 0.8;
          vel[i * 3 + 2] = (Math.random() - 0.5) * power;
          life[i] = 0.5 + Math.random() * 0.6;
          break;
        }
        geo.attributes.position.needsUpdate = true;
      },
      update: function (dt) {
        let live = 0;
        for (let i = 0; i < count; i++) {
          if (life[i] <= 0) continue;
          live += 1;
          life[i] -= dt;
          vel[i * 3 + 1] -= 22 * dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] = Math.max(0, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          if (life[i] <= 0) pos[i * 3 + 1] = -999;
        }
        geo.attributes.position.needsUpdate = true;
      }
    };
  }

  function mountains(scene, opts) {
    opts = opts || {};
    const group = new THREE.Group();
    const light = new THREE.MeshStandardMaterial({ color: 0xdfe9f7, roughness: 0.95, metalness: 0.02 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x94a7c4, roughness: 0.95 });
    for (let i = 0; i < (opts.count || 14); i++) {
      const r = 260 + Math.random() * 420;
      const h = 280 + Math.random() * 460;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), Math.random() < 0.5 ? light : dark);
      const a = Math.random() * Math.PI * 2;
      const dist = (opts.distance || 1500) + Math.random() * 700;
      cone.position.set(Math.cos(a) * dist, h / 2 - 60, Math.sin(a) * dist);
      cone.rotation.y = Math.random() * Math.PI;
      group.add(cone);
    }
    scene.add(group);
    return group;
  }

  window.Kit3D = {
    textures: textures,
    canvasTexture: canvasTexture,
    sky: sky,
    quality: quality,
    environment: environment,
    keyLight: keyLight,
    paint: paint,
    glass: glassMat,
    car: car,
    person: person,
    board: board,
    building: building,
    streetLamp: streetLamp,
    tree: tree,
    rock: rock,
    rail: rail,
    ledge: ledge,
    spray: spray,
    mountains: mountains,
    contactShadow: contactShadow
  };
})();

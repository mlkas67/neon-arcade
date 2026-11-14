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

  /* A car with real proportions: wheels sized to the body, a greenhouse with
     glass and pillars, bumpers, grille, lamps, mirrors and an optional driver.
     opts.style: 'sedan' | 'suv' | 'van' | 'pickup' | 'sports' | 'police'. */
  function car(opts) {
    opts = opts || {};
    const envMap = opts.envMap || null;
    const style = opts.style || 'sedan';
    const L = opts.length || 9.6;
    const W = opts.width || 4.2;
    const H = opts.height || 1.7;
    const group = new THREE.Group();
    const shell = new THREE.Group();
    group.add(shell);

    const wheelR = H * (style === 'suv' || style === 'pickup' ? 0.36 : 0.31);
    const sill = wheelR * 1.28;
    const belt = H * (style === 'van' ? 0.98 : 0.9);
    const roof = H * (style === 'sports' ? 1.28 : style === 'van' || style === 'suv' ? 1.46 : 1.34);
    const bodyColor = opts.color == null ? 0xd21f3c : opts.color;

    const paintMat = paint(bodyColor, { envMap: envMap, metalness: 0.62, roughness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.6, roughness: 0.55 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd6dde6, metalness: 1, roughness: 0.16, envMap: envMap });
    const glass = glassMat({ envMap: envMap, color: 0x0b1420, opacity: 0.8 });

    /* Lower body: side profile extruded across the width. */
    const noseX = L / 2;
    const tailX = -L / 2;
    const profile = new THREE.Shape();
    const noseH = style === 'van' ? belt : style === 'pickup' ? belt * 0.92 : belt * 0.8;
    profile.moveTo(tailX, sill);
    profile.lineTo(tailX, belt * (style === 'sports' ? 0.96 : 0.9));
    profile.lineTo(tailX + L * 0.06, belt);
    profile.lineTo(noseX - L * 0.16, noseH);
    profile.quadraticCurveTo(noseX - L * 0.05, noseH * 0.98, noseX - L * 0.01, noseH * 0.72);
    profile.lineTo(noseX, sill + wheelR * 0.3);
    profile.lineTo(noseX - L * 0.03, sill * 0.82);
    profile.lineTo(tailX + L * 0.04, sill * 0.82);
    profile.lineTo(tailX, sill);
    const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: W, bevelEnabled: true, bevelSize: 0.34, bevelThickness: 0.28, bevelSegments: 2, steps: 1 });
    bodyGeo.translate(0, 0, -W / 2);
    const body = new THREE.Mesh(bodyGeo, paintMat);
    body.castShadow = true;
    body.receiveShadow = true;
    shell.add(body);

    /* Greenhouse: side glass, painted roof, A/B/C pillars. */
    const cabinLen = L * (style === 'van' ? 0.62 : style === 'pickup' ? 0.36 : 0.44);
    const cabinZ = style === 'pickup' ? -L * 0.14 : style === 'sports' ? -L * 0.06 : -L * 0.05;
    const cabinY = belt + (roof - belt) * 0.5;
    const cabinH = roof - belt;

    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, 0.3, W * 0.9), paintMat);
    roofPanel.position.set(cabinZ, roof, 0);
    roofPanel.castShadow = true;
    shell.add(roofPanel);

    const greenhouse = new THREE.Mesh(new THREE.BoxGeometry(cabinLen * 0.98, cabinH * 0.96, W * 0.9), glass);
    greenhouse.position.set(cabinZ, cabinY, 0);
    shell.add(greenhouse);

    [-1, 1].forEach(function (s) {
      [cabinLen * 0.45, -cabinLen * 0.02, -cabinLen * 0.44].forEach(function (dx) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.34, cabinH, 0.3), trimMat);
        pillar.position.set(cabinZ + dx, cabinY, s * W * 0.45);
        shell.add(pillar);
      });
      const rail = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, 0.22, 0.3), trimMat);
      rail.position.set(cabinZ, roof - 0.04, s * W * 0.45);
      shell.add(rail);
    });
    if (style === 'suv' || style === 'van') {
      [-1, 1].forEach(function (s) {
        const roofRail = new THREE.Mesh(new THREE.BoxGeometry(cabinLen * 0.9, 0.16, 0.28), chromeMat);
        roofRail.position.set(cabinZ, roof + 0.2, s * W * 0.36);
        shell.add(roofRail);
      });
    }
    if (style === 'pickup') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.7, W * 0.94), trimMat);
      bed.position.set(-L * 0.27, belt * 0.92, 0);
      shell.add(bed);
      const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.18, W * 0.86), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }));
      bedFloor.position.set(-L * 0.27, belt * 0.95, 0);
      shell.add(bedFloor);
    }

    /* Bumpers, grille, plates, exhaust. */
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.7, wheelR * 0.62, W * 1.01), trimMat);
    bumperF.position.set(noseX + 0.1, sill * 0.9, 0);
    shell.add(bumperF);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.6, wheelR * 0.58, W * 1.01), trimMat);
    bumperR.position.set(tailX - 0.1, sill * 0.9, 0);
    shell.add(bumperR);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.25, wheelR * 0.5, W * 0.52), trimMat);
    grille.position.set(noseX + 0.02, sill * 1.18, 0);
    shell.add(grille);
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.08, wheelR * 0.06, W * 0.48), chromeMat);
      slat.position.set(noseX + 0.16, sill * (1.0 + i * 0.11), 0);
      shell.add(slat);
    }

    const plateMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.5 });
    const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 1.5), plateMat);
    plateF.position.set(noseX + 0.42, sill * 0.95, 0);
    shell.add(plateF);
    const plateR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 1.4), plateMat);
    plateR.position.set(tailX - 0.42, sill * 0.95, 0);
    shell.add(plateR);

    [-1, 1].forEach(function (s) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.1, 10), chromeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(tailX - 0.5, sill * 0.68, s * W * 0.3);
      shell.add(pipe);
    });

    /* Lamps and mirrors. */
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 2.4, roughness: 0.15 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2f4e, emissive: 0xff2f4e, emissiveIntensity: 1.8, roughness: 0.3 });
    const lensGeo = new THREE.BoxGeometry(0.24, wheelR * 0.38, W * 0.28);
    [-1, 1].forEach(function (s) {
      const lamp = new THREE.Mesh(lensGeo, headMat);
      lamp.position.set(noseX - 0.02, sill * 1.2, s * W * 0.31);
      shell.add(lamp);
      const tail = new THREE.Mesh(lensGeo, tailMat);
      tail.position.set(tailX + 0.02, sill * 1.24, s * W * 0.31);
      shell.add(tail);

      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 1.2), paintMat);
      mirror.position.set(cabinZ + cabinLen * 0.46, belt + 0.35, s * (W / 2 + 0.34));
      shell.add(mirror);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), trimMat);
      arm.position.set(cabinZ + cabinLen * 0.46, belt + 0.3, s * (W / 2 + 0.05));
      shell.add(arm);
    });

    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 4.2, W * 2.6),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(noseX + L * 1.6, 0.1, 0);
    group.add(beam);

    /* Wheels: tyre, rim, five spokes, brake disc, arch flare. */
    const wheels = [];
    const tyreGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.62, 22);
    tyreGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(wheelR * 0.64, wheelR * 0.64, wheelR * 0.66, 18);
    rimGeo.rotateX(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(wheelR * 0.48, wheelR * 0.48, wheelR * 0.7, 16);
    discGeo.rotateX(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(wheelR * 1.08, wheelR * 0.16, wheelR * 0.22);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95, metalness: 0.02 });
    const rimMat = new THREE.MeshStandardMaterial({ color: opts.rimColor == null ? 0xc9d2dd : opts.rimColor, metalness: 0.95, roughness: 0.2, envMap: envMap });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.8, roughness: 0.45 });

    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (pair) {
      const hub = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      hub.add(tyre);
      hub.add(new THREE.Mesh(discGeo, discMat));
      hub.add(new THREE.Mesh(rimGeo, rimMat));
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.z = (Math.PI / 5) * i;
        hub.add(spoke);
      }
      hub.position.set(pair[0] * (L * 0.315), wheelR, pair[1] * (W / 2 - wheelR * 0.22));
      shell.add(hub);
      wheels.push(hub);
      const flare = new THREE.Mesh(
        new THREE.TorusGeometry(wheelR * 1.16, wheelR * 0.13, 6, 14, Math.PI),
        trimMat
      );
      flare.rotation.y = Math.PI / 2;
      flare.position.set(pair[0] * (L * 0.315), wheelR, pair[1] * (W / 2));
      shell.add(flare);
    });

    if (opts.driver) {
      const driver = opts.driver === true ? person({}) : person(opts.driver);
      driver.scale.setScalar(0.1);
      driver.position.set(cabinZ + cabinLen * 0.12, belt * 0.86, -W * 0.22);
      driver.aim();
      shell.add(driver);
      group.driver = driver;
    }

    const contact = contactShadow(L * 1.35, W * 1.6, 0.42);
    contact.position.y = 0.06;
    group.add(contact);

    group.wheels = wheels;
    group.body = shell;
    group.beam = beam;
    group.dims = { L: L, W: W, H: H, wheelR: wheelR };
    group.spinWheels = function (speed) {
      wheels.forEach(function (w) { w.rotation.z -= speed; });
    };
    return group;
  }

  /* A rigged human: two-segment limbs with knees and elbows, neck, face,
     clothing layers. Feet sit at y = 0, total height ~36 units, so callers
     scale by worldMetres / 36 (0.115 puts an adult at about 1.8 m). */
  function person(opts) {
    opts = opts || {};
    const skin = opts.skin == null ? 0xe0b395 : opts.skin;
    const coat = opts.suit == null ? 0x24303f : opts.suit;
    const accent = opts.accent == null ? 0xff4d9d : opts.accent;
    const trousers = opts.pants == null ? 0x1a2130 : opts.pants;
    const envMap = opts.envMap || null;
    const hairColor = opts.hair == null ? 0x241a17 : opts.hair;
    const shoe = opts.shoe == null ? 0x15171c : opts.shoe;

    const root = new THREE.Group();
    const matCoat = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.72, metalness: 0.04, envMap: envMap });
    const matPants = new THREE.MeshStandardMaterial({ color: trousers, roughness: 0.82, metalness: 0.03 });
    const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0.01 });
    const matAccent = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, metalness: 0.1, emissive: accent, emissiveIntensity: 0.12 });
    const matShoe = new THREE.MeshStandardMaterial({ color: shoe, roughness: 0.7, metalness: 0.08 });
    const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

    const hips = new THREE.Group();
    hips.position.y = 15.6;
    root.add(hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 4.4), matPants);
    pelvis.position.y = 0.4;
    hips.add(pelvis);

    const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(3.5, 3.4, 4, 10), matCoat);
    abdomen.position.y = 4.4;
    abdomen.scale.set(1.06, 1, 0.78);
    hips.add(abdomen);

    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(4.1, 4.6, 5, 12), matCoat);
    chest.position.y = 8.6;
    chest.scale.set(1.05, 1, 0.74);
    chest.castShadow = true;
    hips.add(chest);

    const shirt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 7.4, 0.5), matAccent);
    shirt.position.set(0, 7.4, 3.3);
    hips.add(shirt);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.55, 6, 14), matCoat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 11.9;
    hips.add(collar);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 2.2, 10), matSkin);
    neck.position.y = 12.8;
    hips.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 14.1;
    hips.add(headGroup);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 16), matSkin);
    skull.scale.set(0.92, 1.12, 0.98);
    skull.castShadow = true;
    headGroup.add(skull);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), matSkin);
    jaw.scale.set(0.92, 0.72, 0.95);
    jaw.position.set(0, -1.5, 0.5);
    headGroup.add(jaw);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), matSkin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.3, 2.9);
    headGroup.add(nose);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.3 });
    [-1, 1].forEach(function (s) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), eyeMat);
      eye.position.set(s * 1.05, 0.5, 2.65);
      headGroup.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 8), matSkin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 2.9, -0.1, 0);
      headGroup.add(ear);
    });

    const hair = new THREE.Mesh(new THREE.SphereGeometry(3.25, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), matHair);
    hair.position.y = 0.45;
    hair.rotation.x = -0.12;
    headGroup.add(hair);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.9, 1.5), matHair);
    fringe.position.set(0, 2.1, 2.3);
    headGroup.add(fringe);

    if (opts.helmet) {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(3.55, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), matAccent);
      helmet.position.y = 0.5;
      headGroup.add(helmet);
      const visor = new THREE.Mesh(
        new THREE.SphereGeometry(3.3, 18, 12, -0.9, 1.8, 1.15, 0.55),
        glassMat({ envMap: envMap, color: 0x101820, opacity: 0.85 })
      );
      visor.position.y = 0.1;
      headGroup.add(visor);
    } else if (opts.cap) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), matAccent);
      cap.position.y = 0.6;
      headGroup.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.6), matAccent);
      brim.position.set(0, 1.5, 3.4);
      headGroup.add(brim);
    }

    function segment(len, rTop, rLow, mat) {
      const geo = new THREE.CylinderGeometry(rTop, rLow, len, 10);
      geo.translate(0, -len / 2, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    }

    const arms = [], legs = [], knees = [], elbows = [];

    [-1, 1].forEach(function (s) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 4.6, 9.9, 0);
      hips.add(shoulder);
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(1.85, 10, 8), matCoat);
      deltoid.scale.set(1, 1.1, 1);
      shoulder.add(deltoid);
      shoulder.add(segment(5.6, 1.5, 1.25, matCoat));

      const elbow = new THREE.Group();
      elbow.position.y = -5.6;
      shoulder.add(elbow);
      elbow.add(segment(4.8, 1.25, 1.0, matCoat));
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.1, 1.1, 10), matAccent);
      cuff.position.y = -3.6;
      elbow.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), matSkin);
      hand.scale.set(1, 1.25, 0.62);
      hand.position.y = -5.2;
      elbow.add(hand);
      shoulder.rotation.z = s * 0.1;
      arms.push(shoulder);
      elbows.push(elbow);

      const hip = new THREE.Group();
      hip.position.set(s * 2.2, -1.1, 0);
      hips.add(hip);
      hip.add(segment(7.2, 2.0, 1.6, matPants));

      const knee = new THREE.Group();
      knee.position.y = -7.2;
      hip.add(knee);
      knee.add(segment(6.4, 1.55, 1.25, matPants));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 5.4), matShoe);
      foot.position.set(0, -6.9, 1.3);
      knee.add(foot);
      legs.push(hip);
      knees.push(knee);
    });

    root.hips = hips;
    root.arms = arms;
    root.legs = legs;
    root.knees = knees;
    root.elbows = elbows;
    root.headGroup = headGroup;
    root.height = 36;

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function applyLegs(swing, bend) {
      legs.forEach(function (g, i) {
        const dir = i === 0 ? 1 : -1;
        g.rotation.x = swing * dir;
        knees[i].rotation.x = bend * (dir > 0 ? 1 : 0.55);
      });
    }

    /* Walking cycle. phase is in radians, speed 0..1 scales the stride. */
    root.walk = function (phase, speed) {
      const s = speed == null ? 1 : clamp01(speed);
      const swing = Math.sin(phase) * (0.42 + 0.4 * s);
      applyLegs(swing, Math.max(0, -Math.cos(phase)) * 0.85 * s);
      arms[0].rotation.x = -swing * 0.85;
      arms[1].rotation.x = swing * 0.85;
      arms[0].rotation.z = 0.1 + Math.abs(swing) * 0.05;
      arms[1].rotation.z = -0.1 - Math.abs(swing) * 0.05;
      elbows.forEach(function (el, i) { el.rotation.x = -0.25 - Math.abs(swing) * 0.35 * (i ? -1 : 1); });
      hips.position.y = 15.6 + Math.abs(Math.sin(phase)) * 0.7 * s;
      hips.rotation.y = Math.sin(phase) * 0.1 * s;
      hips.rotation.z = Math.sin(phase) * 0.05 * s;
    };

    /* Idle breathing with a weight shift; used by riders and standing NPCs. */
    root.pose = function (t, effort) {
      const e = effort == null ? 1 : effort;
      const breathe = Math.sin(t * 2.1) * 0.5 * e;
      const sway = Math.sin(t * 1.3) * 0.06 * e;
      hips.position.y = 15.6 + breathe * 0.4;
      hips.rotation.y = sway;
      chest.scale.y = 1 + breathe * 0.012;
      arms[0].rotation.z = 0.1 + sway * 0.5;
      arms[1].rotation.z = -0.1 + sway * 0.5;
      legs[0].rotation.x = sway * 0.4;
      legs[1].rotation.x = -sway * 0.3;
      knees[0].rotation.x = 0.04 + Math.max(0, sway) * 0.2;
      knees[1].rotation.x = 0.04 + Math.max(0, -sway) * 0.2;
      headGroup.rotation.y = Math.sin(t * 0.7) * 0.22 * e;
      headGroup.rotation.x = Math.sin(t * 1.1) * 0.05 * e;
    };

    /* Running or panicking: high knees, pumping arms, forward lean. */
    root.run = function (phase, speed) {
      const s = speed == null ? 1 : clamp01(speed);
      const swing = Math.sin(phase) * (0.55 + 0.55 * s);
      applyLegs(swing, Math.max(0, -Math.cos(phase)) * 1.5 * s);
      arms[0].rotation.x = -swing * 1.5;
      arms[1].rotation.x = swing * 1.5;
      elbows.forEach(function (el) { el.rotation.x = -0.9; });
      hips.position.y = 15.6 + Math.abs(Math.sin(phase)) * 1.2 * s;
      hips.rotation.x = 0.16 * s;
      hips.rotation.y = Math.sin(phase) * 0.16 * s;
    };

    /* Ride stance: knees bent, feet apart, torso turned with the board. */
    root.ride = function (t, lean) {
      const l = lean || 0;
      hips.position.y = 13.8;
      hips.rotation.x = 0.1;
      hips.rotation.y = 0;
      hips.rotation.z = -l * 0.35;
      legs[0].rotation.x = -0.45;
      legs[1].rotation.x = 0.5;
      knees[0].rotation.x = 0.85;
      knees[1].rotation.x = 0.6;
      arms[0].rotation.x = -0.65 + Math.sin(t * 1.7) * 0.06;
      arms[1].rotation.x = 0.55 + Math.cos(t * 1.9) * 0.06;
      arms[0].rotation.z = 0.75;
      arms[1].rotation.z = -0.75;
      elbows[0].rotation.x = -0.55;
      elbows[1].rotation.x = -0.35;
      headGroup.rotation.y = l * 0.4;
    };

    /* Aim pose: right arm out along the body's forward axis, left supporting. */
    root.aim = function () {
      arms[1].rotation.x = -1.45;
      arms[1].rotation.z = -0.06;
      elbows[1].rotation.x = -0.05;
      arms[0].rotation.x = -0.55;
      elbows[0].rotation.x = -0.6;
      hips.rotation.y = -0.14;
    };

    return root;
  }

  /* Skateboard / snowboard blank. opts.shape 'skate' (default) or 'snow'. */
  function board(opts) {
    opts = opts || {};
    const snow = opts.shape === 'snow';
    const len = opts.length || (snow ? 32 : 26);
    const width = opts.width || (snow ? 10.6 : 8.4);
    const thickness = opts.thickness || (snow ? 0.55 : 0.7);
    const group = new THREE.Group();
    const envMap = opts.envMap || null;

    const outline = new THREE.Shape();
    const nose = len / 2, tail = -len / 2;
    const waist = width * (snow ? 0.46 : 0.44);
    if (snow) {
      outline.moveTo(-waist, tail);
      outline.quadraticCurveTo(-width / 2, tail + 2, -width / 2, tail + len * 0.19);
      outline.lineTo(-width / 2, nose - len * 0.19);
      outline.quadraticCurveTo(-width / 2, nose - 2, -waist * 0.86, nose);
      outline.quadraticCurveTo(0, nose + 1.4, waist * 0.86, nose);
      outline.quadraticCurveTo(width / 2, nose - 2, width / 2, nose - len * 0.19);
      outline.lineTo(width / 2, tail + len * 0.19);
      outline.quadraticCurveTo(width / 2, tail + 2, waist, tail);
      outline.quadraticCurveTo(0, tail - 1.2, -waist, tail);
    } else {
      outline.moveTo(-waist, tail);
      outline.lineTo(-width / 2, tail + 3.2);
      outline.lineTo(-width / 2, nose - 3.2);
      outline.quadraticCurveTo(-width / 2 + 0.4, nose - 1.4, -waist, nose);
      outline.lineTo(waist, nose);
      outline.quadraticCurveTo(width / 2 - 0.4, nose - 1.4, width / 2, nose - 3.2);
      outline.lineTo(width / 2, tail + 3.2);
      outline.lineTo(waist, tail);
      outline.quadraticCurveTo(0, tail - 1.1, -waist, tail);
    }

    const geo = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: true, bevelSize: 0.22, bevelThickness: 0.18, bevelSegments: 2, steps: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, thickness / 2, 0);

    const graphic = snow ? canvasTexture('snowboard-top', 256, 512, function (ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#ff4d9d');
      g.addColorStop(0.5, '#7c5cff');
      g.addColorStop(1, '#34e0ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      for (let y = 0; y < h; y += 26) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.35, y + 18, w * 0.65, y - 18, w, y + 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }) : null;

    const deckMat = new THREE.MeshStandardMaterial({
      color: opts.color == null ? (snow ? 0xffffff : 0xff4d9d) : opts.color,
      map: graphic,
      roughness: opts.roughness == null ? 0.38 : opts.roughness,
      metalness: 0.12,
      envMap: envMap
    });
    const deck = new THREE.Mesh(geo, deckMat);
    deck.castShadow = true;
    group.add(deck);

    if (!snow) {
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.94, 0.1, len * 0.94),
        new THREE.MeshStandardMaterial({ map: textures.grip(), roughness: 0.96 })
      );
      grip.position.y = thickness + 0.02;
      group.add(grip);

      const metal = new THREE.MeshStandardMaterial({ color: 0xc2ccd6, metalness: 0.95, roughness: 0.25, envMap: envMap });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0xf6e6c4, roughness: 0.55, metalness: 0.05 });
      const wheelGeo = new THREE.CylinderGeometry(1.45, 1.45, 1.35, 14);
      wheelGeo.rotateZ(Math.PI / 2);
      const bwheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 10);
      bwheelGeo.rotateZ(Math.PI / 2);
      [len * 0.3, -len * 0.3].forEach(function (z) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.5, 2.2), metal);
        base.position.set(0, -0.3, z);
        group.add(base);
        const hanger = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.55, 0.9), metal);
        hanger.position.set(0, -0.85, z);
        group.add(hanger);
        const kingpin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8), metal);
        kingpin.position.set(0, -0.75, z + 0.75);
        kingpin.rotation.x = 0.5;
        group.add(kingpin);
        [-1, 1].forEach(function (s) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.position.set(s * (width * 0.47), -1.05, z);
          group.add(wheel);
          const bearing = new THREE.Mesh(bwheelGeo, metal);
          bearing.position.copy(wheel.position);
          group.add(bearing);
        });
      });
    } else {
      const bindMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.6, metalness: 0.3 });
      const strapMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 });
      [len * 0.19, -len * 0.19].forEach(function (z) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.45, 5.2), bindMat);
        plate.position.set(0, thickness + 0.2, z);
        group.add(plate);
        const high = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 4.2, 0.55), bindMat);
        high.position.set(0, thickness + 2.2, z - 2.6);
        high.rotation.x = -0.22;
        group.add(high);
        [1.1, 2.9].forEach(function (y) {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.42, 1.0), strapMat);
          strap.position.set(0, thickness + y, z + 0.4);
          group.add(strap);
        });
      });
    }

    group.length = len;
    group.width = width;
    return group;
  }

  /* Firearm: pistol or rifle, with a muzzle anchor at group.muzzle. */
  function gun(opts) {
    opts = opts || {};
    const rifle = opts.kind === 'rifle' || opts.kind === 'smg';
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.85, roughness: 0.32 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.85 });
    const bodyLen = rifle ? 15 : 6.4;

    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, 1.9, 1.5), metal);
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, rifle ? 8 : 3.4, 10), metal);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(bodyLen / 2 + (rifle ? 3.4 : 1.6), 0.35, 0);
    group.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 1.5), gripMat);
    grip.position.set(-bodyLen / 2 + 1.4, -2.4, 0);
    grip.rotation.z = -0.22;
    group.add(grip);

    if (rifle) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.7, 1.3), gripMat);
      stock.position.set(-bodyLen / 2 - 2.2, 0.1, 0);
      group.add(stock);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.2, 1.2), metal);
      mag.position.set(0.5, -2.8, 0);
      mag.rotation.z = 0.18;
      group.add(mag);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.6, 0.4, 0.7), metal);
      rail.position.set(0, 1.15, 0);
      group.add(rail);
    } else {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.9, 0.7, 1.0), metal);
      slide.position.set(0.6, 1.05, 0);
      group.add(slide);
    }

    const muzzle = new THREE.Object3D();
    muzzle.position.set(bodyLen / 2 + (rifle ? 7.4 : 3.2), 0.35, 0);
    group.add(muzzle);
    group.muzzle = muzzle;
    return group;
  }

  /* Storefront sign: emissive canvas text on a plate. */
  function sign(text, opts) {
    opts = opts || {};
    const w = opts.w || 512, h = opts.h || 128;
    const tex = canvasTexture('sign-' + text + '-' + (opts.color || '') + '-' + w + 'x' + h, w, h, function (ctx, cw, ch) {
      ctx.fillStyle = opts.background || '#0a0f1c';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = opts.color || '#34e0ff';
      ctx.lineWidth = Math.max(4, ch * 0.05);
      ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, cw - ctx.lineWidth * 2, ch - ctx.lineWidth * 2);
      ctx.fillStyle = opts.color || '#34e0ff';
      ctx.font = 'bold ' + Math.round(ch * 0.44) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = opts.color || '#34e0ff';
      ctx.shadowBlur = ch * 0.28;
      ctx.fillText(text, cw / 2, ch * 0.56);
      ctx.shadowBlur = 0;
    });
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.planeW || 30, opts.planeH || 7.5),
      new THREE.MeshBasicMaterial({ map: tex })
    );
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
    gun: gun,
    sign: sign,
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

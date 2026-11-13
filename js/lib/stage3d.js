/* Shared scaffolding for the three.js games: one renderer, one HUD layer and
   clean show/hide/dispose so the 2D cabinet keeps working around them. */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('Stage3D needs three.js (vendor/three.min.js).');
    return;
  }

  const frame = document.querySelector('.canvas-frame');
  const canvas2d = document.getElementById('game');

  function create(opts) {
    opts = opts || {};

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(960, 540, false);
    renderer.domElement.className = opts.canvasClass || 's3d-canvas';
    renderer.domElement.style.display = 'none';
    if (frame) frame.insertBefore(renderer.domElement, canvas2d);
    else document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(opts.bg == null ? 0x0a1024 : opts.bg);
    if (opts.fog) scene.fog = new THREE.Fog(opts.fog.color, opts.fog.near, opts.fog.far);

    const camera = new THREE.PerspectiveCamera(
      opts.fov || 60,
      16 / 9,
      opts.near || 1,
      opts.far || 4000
    );

    const hud = document.createElement('div');
    hud.className = opts.hudClass || 's3d-hud';
    hud.innerHTML = opts.hudHTML || '';
    hud.style.display = 'none';
    if (frame) frame.appendChild(hud);

    let active = false;

    const stage = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      hud: hud,

      resize: function () {
        const width = Math.min((frame && frame.clientWidth) || 960, 1440);
        const height = Math.round(width * 9 / 16);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        return { w: width, h: height };
      },

      show: function () {
        active = true;
        if (canvas2d) canvas2d.style.visibility = 'hidden';
        renderer.domElement.style.display = 'block';
        hud.style.display = 'block';
        stage.resize();
      },

      hide: function () {
        active = false;
        if (canvas2d) canvas2d.style.visibility = 'visible';
        renderer.domElement.style.display = 'none';
        hud.style.display = 'none';
      },

      isActive: function () { return active; },

      dispose: function () {
        stage.hide();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        if (hud.parentNode) hud.parentNode.removeChild(hud);
      }
    };

    window.addEventListener('resize', function () {
      if (active) stage.resize();
    });

    return stage;
  }

  function disposeGroup(group, skip) {
    if (!group) return;
    group.traverse(function (o) {
      if (o.geometry && (!skip || skip.indexOf(o.geometry) < 0)) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    if (group.parent) group.parent.remove(group);
  }

  window.Stage3D = { create: create, disposeGroup: disposeGroup };
})();

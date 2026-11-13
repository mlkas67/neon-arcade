/* ============================================================
   Neon Arcade — menu wiring
   ============================================================ */
(function () {
  'use strict';

  document.querySelectorAll('[data-game]').forEach(function (card) {
    card.addEventListener('click', function () {
      const id = card.getAttribute('data-game');
      if (window.Arcade) window.Arcade.openGame(id);
    });
  });

  // number keys jump straight into a game from the menu, in menu order
  const ORDER = ['gd', 'flappy', 'break', 'snake', 'p2048', 'rocks', 'pong', 'memory', 'whack', 'vice'];
  window.addEventListener('keydown', function (e) {
    if (!window.Arcade || window.Arcade.state !== 'menu') return;
    const m = /^Digit([0-9])$/.exec(e.code);
    if (!m) return;
    const id = m[1] === '0' ? ORDER[9] : ORDER[Number(m[1]) - 1];
    if (id) window.Arcade.openGame(id);
  });

  // refresh best scores when coming back from a run
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.Arcade) window.Arcade.refreshMenuBests();
  });

  // app shortcuts (manifest) open a game directly: ?play=<id>
  try {
    const wanted = new URLSearchParams(window.location.search).get('play');
    if (wanted && window.Games && window.Games[wanted]) {
      window.addEventListener('load', function () { window.Arcade.openGame(wanted); });
    }
  } catch (err) { /* no URLSearchParams: stay on the menu */ }

  /* ---------- installable app ---------- */
  const installBtn = document.getElementById('installBtn');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  let deferredPrompt = null;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function toast(text) {
    let el = document.getElementById('appToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appToast';
      el.className = 'app-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('is-on'); }, 5200);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !isStandalone) installBtn.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
          if (choice.outcome === 'accepted') installBtn.hidden = true;
          deferredPrompt = null;
        });
      } else if (isIos) {
        toast('On iPhone or iPad: tap Share, then “Add to Home Screen”.');
      } else {
        toast('Use your browser menu → “Install app” / “Add to Home screen”.');
      }
    });

    // iOS (and browsers without beforeinstallprompt) get the button as a hint
    if (isIos && !isStandalone) installBtn.hidden = false;
  }

  window.addEventListener('appinstalled', function () {
    if (installBtn) installBtn.hidden = true;
    deferredPrompt = null;
  });

  if ('serviceWorker' in navigator) {
    // the page is fully playable without the worker, so failures only lose offline mode
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();

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
  const ORDER = ['gd', 'flappy', 'break', 'snake', 'p2048', 'rocks', 'pong', 'memory', 'whack'];
  window.addEventListener('keydown', function (e) {
    if (!window.Arcade || window.Arcade.state !== 'menu') return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const id = ORDER[Number(m[1]) - 1];
    if (id) window.Arcade.openGame(id);
  });

  // refresh best scores when coming back from a run
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.Arcade) window.Arcade.refreshMenuBests();
  });
})();

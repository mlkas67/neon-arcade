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

  // number keys jump straight into a game from the menu
  window.addEventListener('keydown', function (e) {
    if (!window.Arcade || window.Arcade.state !== 'menu') return;
    if (e.code === 'Digit1') window.Arcade.openGame('gd');
    if (e.code === 'Digit2') window.Arcade.openGame('flappy');
  });

  // refresh best scores when coming back from a run
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && window.Arcade) window.Arcade.refreshMenuBests();
  });
})();

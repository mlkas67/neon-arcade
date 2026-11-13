/* ============================================================
   Legeniko Arcade — Neon Snake
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const CELL = 30;
  const COLS = 30, ROWS = 15;
  const OX = (W - COLS * CELL) / 2;
  const OY = 70;

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };

  const game = {
    title: 'Neon Snake',
    readyHeading: 'Eat, grow, survive',
    readyText: 'Steer with <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>, <kbd>WASD</kbd> or a swipe.',
    controlHint: 'Walls and your own tail are lethal',
    tip: 'Arrows / WASD / swipe · eat the orbs, avoid yourself',
    deadHeading: 'Tangled',
    deadText: 'The grid claims another snake.',
    overlayDelay: 750,

    reset() {
      const midY = Math.floor(ROWS / 2);
      this.body = [{ x: 6, y: midY }, { x: 5, y: midY }, { x: 4, y: midY }];
      this.dir = DIRS.right;
      this.nextDirs = [];
      this.grow = 0;
      this.food = null;
      this.placeFood();
      this.acc = 0;
      this.interval = 0.13;
      this.eaten = 0;
      this.hurt = 0;
      this.bindOnce();
      A.setScore(0);
    },

    placeFood() {
      const free = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!this.body.some((s) => s.x === x && s.y === y)) free.push({ x, y });
        }
      }
      this.food = free.length ? free[U.randInt(0, free.length - 1)] : null;
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener('keydown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'snake') return;
        const map = {
          ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
          ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
        };
        const d = map[e.code];
        if (!d) return;
        e.preventDefault();
        this.turn(d);
      });
      let sx = null, sy = null;
      A.canvas.addEventListener('pointerdown', (e) => {
        const p = U.eventPoint(e);
        sx = p.x; sy = p.y;
      });
      A.canvas.addEventListener('pointerup', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'snake' || sx == null) return;
        const p = U.eventPoint(e);
        const dx = p.x - sx, dy = p.y - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
        if (Math.abs(dx) > Math.abs(dy)) this.turn(dx > 0 ? 'right' : 'left');
        else this.turn(dy > 0 ? 'down' : 'up');
        sx = null;
      });
    },

    // queue turns so a fast double-tap (e.g. up then left) is not swallowed
    turn(name) {
      const last = this.nextDirs.length ? this.nextDirs[this.nextDirs.length - 1] : this.dir;
      const d = DIRS[name];
      if (!d) return;
      if (d.x === -last.x && d.y === -last.y) return; // no 180 into own neck
      if (d.x === last.x && d.y === last.y) return;
      if (this.nextDirs.length < 2) this.nextDirs.push(d);
    },

    action() {
      // Space/tap does nothing here on purpose — steering is the game.
    },

    onDeath() {
      A.Sound.hit();
      A.fx.kick(9);
      for (const s of this.body) {
        A.fx.burst(OX + s.x * CELL + CELL / 2, OY + s.y * CELL + CELL / 2, {
          count: 2, colors: ['#4ade80', '#34e0ff'], speed: 130, life: 0.6, size: 5
        });
      }
    },

    update(dt) {
      if (this.hurt > 0) this.hurt -= dt;
      this.acc += dt;
      // speed up slightly with every bite, down to a floor
      this.interval = Math.max(0.062, 0.13 - this.eaten * 0.0035);
      while (this.acc >= this.interval) {
        this.acc -= this.interval;
        this.tickGrid();
        if (A.state !== 'playing') return;
      }
    },

    tickGrid() {
      if (this.nextDirs.length) this.dir = this.nextDirs.shift();
      const head = this.body[0];
      const nx = head.x + this.dir.x;
      const ny = head.y + this.dir.y;

      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return this.bump();
      // the tail tip is about to move away, so stepping onto it is legal
      const hitTail = this.grow === 0 && this.body.length > 1 &&
        this.body[this.body.length - 1].x === nx && this.body[this.body.length - 1].y === ny;
      if (!hitTail && this.body.some((s) => s.x === nx && s.y === ny)) return this.bump();

      this.body.unshift({ x: nx, y: ny });

      if (this.food && nx === this.food.x && ny === this.food.y) {
        this.eaten++;
        this.grow += 1;
        A.setScore(this.eaten * 10);
        A.Sound.point();
        A.fx.burst(OX + nx * CELL + CELL / 2, OY + ny * CELL + CELL / 2, {
          count: 14, colors: ['#ffd166', '#ffffff'], speed: 220, life: 0.5, size: 4
        });
        this.placeFood();
      }

      if (this.grow > 0) this.grow--;
      else this.body.pop();
    },

    bump() {
      this.hurt = 0.25;
      A.die('crash');
    },

    draw(c, dt) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#060a12');
      g.addColorStop(1, '#0a1420');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // board
      c.save();
      c.strokeStyle = 'rgba(74,222,128,0.18)';
      c.lineWidth = 2;
      c.shadowColor = 'rgba(74,222,128,0.4)';
      c.shadowBlur = 16;
      U.roundRect(c, OX - 6, OY - 6, COLS * CELL + 12, ROWS * CELL + 12, 14);
      c.stroke();
      c.restore();

      // grid dots
      c.fillStyle = 'rgba(120,200,255,0.12)';
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          c.fillRect(OX + x * CELL + CELL / 2 - 1, OY + y * CELL + CELL / 2 - 1, 2, 2);
        }
      }

      // food
      if (this.food) {
        const pulse = 1 + Math.sin(performance.now() / 160) * 0.12;
        const fx = OX + this.food.x * CELL + CELL / 2;
        const fy = OY + this.food.y * CELL + CELL / 2;
        c.save();
        c.fillStyle = '#ffd166';
        c.shadowColor = '#ffd166';
        c.shadowBlur = 22;
        c.beginPath();
        c.arc(fx, fy, CELL * 0.3 * pulse, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // snake, head to tail with a fading glow
      const n = this.body.length;
      for (let i = n - 1; i >= 0; i--) {
        const s = this.body[i];
        const t = i / Math.max(1, n - 1);
        const px = OX + s.x * CELL + 2;
        const py = OY + s.y * CELL + 2;
        const size = CELL - 4;
        c.save();
        c.globalAlpha = 1 - t * 0.45;
        c.fillStyle = i === 0 ? '#b8ffe0' : '#4ade80';
        if (i === 0) {
          c.shadowColor = '#4ade80';
          c.shadowBlur = 20;
        }
        U.roundRect(c, px, py, size, size, 9 - t * 3);
        c.fill();
        if (i === 0) {
          U.noShadow(c);
          c.fillStyle = '#062018';
          const ex = this.dir.x, ey = this.dir.y;
          c.beginPath();
          c.arc(px + size / 2 + ex * 5 - ey * 5, py + size / 2 + ey * 5 - ex * 5, 2.6, 0, 7);
          c.arc(px + size / 2 + ex * 5 + ey * 5, py + size / 2 + ey * 5 + ex * 5, 2.6, 0, 7);
          c.fill();
        }
        c.restore();
      }

      // score strip
      c.save();
      c.font = 'bold 15px ui-monospace, monospace';
      c.fillStyle = 'rgba(242,243,255,0.75)';
      c.textAlign = 'left';
      c.fillText('LENGTH ' + this.body.length, OX - 4, 46);
      c.textAlign = 'right';
      c.fillText('ORBS ' + (this.eaten || 0), OX + COLS * CELL + 4, 46);
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.snake = game;
})();

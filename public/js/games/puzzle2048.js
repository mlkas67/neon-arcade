/* ============================================================
   Legeniko Arcade — 2048
   ============================================================ */
(function () {
  'use strict';
  const A = window.Arcade;
  const U = A.util;

  const W = 960, H = 540;
  const N = 4;
  const TILE = 100, GAP = 14;
  const BOARD = N * TILE + (N - 1) * GAP;
  const BX = (W - BOARD) / 2;
  const BY = (H - BOARD) / 2 + 10;

  const COLORS = {
    2: ['#1d2a3a', '#cfe8ff'],
    4: ['#1f3247', '#bfe0ff'],
    8: ['#2b6ea8', '#ffffff'],
    16: ['#2b8fa8', '#ffffff'],
    32: ['#37b3a0', '#062018'],
    64: ['#4ade80', '#062018'],
    128: ['#ffd166', '#241a00'],
    256: ['#ffa94d', '#241a00'],
    512: ['#ff7a5c', '#220a05'],
    1024: ['#ff4d9d', '#ffffff'],
    2048: ['#8b5cf6', '#ffffff']
  };

  const key = (r, c) => r * N + c;

  const game = {
    title: '2048',
    readyHeading: 'Merge to 2048',
    readyText: 'Slide with <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>, <kbd>WASD</kbd> or a swipe.',
    controlHint: 'Same numbers merge — the game ends when the board jams',
    tip: 'Arrows / WASD / swipe to slide the board',
    deadHeading: 'Board jammed',
    deadText: 'No moves left.',
    overlayDelay: 700,

    reset() {
      this.cells = new Array(N * N).fill(null);
      this.moves = 0;
      this.points = 0;
      this.reached = 0;
      this.spawn();
      this.spawn();
      this.bindOnce();
      A.setScore(0);
    },

    spawn() {
      const empty = [];
      for (let i = 0; i < this.cells.length; i++) if (!this.cells[i]) empty.push(i);
      if (!empty.length) return;
      const i = empty[U.randInt(0, empty.length - 1)];
      this.cells[i] = { v: Math.random() < 0.9 ? 2 : 4, pop: 1, anim: null };
    },

    bindOnce() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener('keydown', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'p2048') return;
        const map = {
          ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
          ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
        };
        const d = map[e.code];
        if (!d) return;
        e.preventDefault();
        this.move(d);
      });
      let sx = null, sy = null;
      A.canvas.addEventListener('pointerdown', (e) => {
        const p = U.eventPoint(e);
        sx = p.x; sy = p.y;
      });
      A.canvas.addEventListener('pointerup', (e) => {
        if (A.state !== 'playing' || A.gameId !== 'p2048' || sx == null) return;
        const p = U.eventPoint(e);
        const dx = p.x - sx, dy = p.y - sy;
        sx = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 'right' : 'left');
        else this.move(dy > 0 ? 'down' : 'up');
      });
    },

    action() {},

    lineCoords(dir) {
      const out = [];
      for (let i = 0; i < N; i++) {
        const line = [];
        for (let k = 0; k < N; k++) {
          if (dir === 'left') line.push([i, k]);
          else if (dir === 'right') line.push([i, N - 1 - k]);
          else if (dir === 'up') line.push([k, i]);
          else line.push([N - 1 - k, i]);
        }
        out.push(line);
      }
      return out;
    },

    move(dir) {
      let gained = 0;
      const before = this.cells.map((t) => (t ? t.v : 0));
      const next = new Array(N * N).fill(null);

      for (const line of this.lineCoords(dir)) {
        const vals = line
          .map((rc) => this.cells[key(rc[0], rc[1])])
          .filter(Boolean)
          .map((t) => t.v);

        const merged = [];
        for (let i = 0; i < vals.length; i++) {
          if (i + 1 < vals.length && vals[i + 1] === vals[i]) {
            const nv = vals[i] * 2;
            merged.push({ v: nv, fresh: true });
            gained += nv;
            if (nv > this.reached) this.reached = nv;
            i++;
          } else {
            merged.push({ v: vals[i], fresh: false });
          }
        }

        line.forEach((rc, i) => {
          if (i < merged.length) next[key(rc[0], rc[1])] = { v: merged[i].v, pop: merged[i].fresh ? 1 : 0 };
        });
      }

      // a move counts when any tile ends up somewhere new, not only when values merge
      const moved = next.some((t, i) => (t ? t.v : 0) !== before[i]);
      // nothing slid: the board may simply be jammed, so check before giving up
      if (!moved) {
        if (!this.hasMoves()) A.die('jam');
        return;
      }

      this.cells = next;
      this.moves++;
      if (gained) {
        this.points = (this.points || 0) + gained;
        A.setScore(this.points);
        A.Sound.tone(420 + Math.min(600, gained), 0.07, { type: 'triangle', vol: 0.05 });
      }
      A.Sound.tone(200, 0.03, { type: 'sine', vol: 0.03 });
      this.spawn();
      if (!this.hasMoves()) A.die('jam');
    },

    hasMoves() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = this.cells[key(r, c)];
          if (!t) return true;
          const right = c + 1 < N ? this.cells[key(r, c + 1)] : null;
          const down = r + 1 < N ? this.cells[key(r + 1, c)] : null;
          if (right && right.v === t.v) return true;
          if (down && down.v === t.v) return true;
        }
      }
      return false;
    },

    update(dt) {
      for (const t of this.cells) {
        if (!t) continue;
        if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 5);
      }
    },

    onDeath() {
      A.Sound.hit();
      A.fx.kick(7);
    },

    drawCell(c, v, x, y, size, pop, ghost) {
      const pal = COLORS[v] || COLORS[2048];
      c.save();
      if (ghost) c.globalAlpha = 0.35;
      c.fillStyle = pal[0];
      c.shadowColor = pal[0];
      c.shadowBlur = v >= 64 ? 22 : 8;
      U.roundRect(c, x, y, size, size, 12);
      c.fill();
      U.noShadow(c);
      c.fillStyle = pal[1];
      const fs = v < 100 ? size * 0.42 : v < 1000 ? size * 0.34 : size * 0.27;
      c.font = '900 ' + Math.round(fs) + 'px ui-monospace, monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(v), x + size / 2, y + size / 2 + 2);
      c.restore();
    },

    mpPose() {
      return { s: this.score };
    },

    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0714');
      g.addColorStop(1, '#140d24');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      Arcade.drawRivalCards(c, 'p2048', H - 56);

      c.save();
      c.fillStyle = 'rgba(255,255,255,0.04)';
      c.strokeStyle = 'rgba(139,92,246,0.35)';
      c.lineWidth = 2;
      c.shadowColor = 'rgba(139,92,246,0.5)';
      c.shadowBlur = 26;
      U.roundRect(c, BX - 12, BY - 12, BOARD + 24, BOARD + 24, 20);
      c.fill();
      c.stroke();
      c.restore();

      for (let r = 0; r < N; r++) {
        for (let cc = 0; cc < N; cc++) {
          c.fillStyle = 'rgba(255,255,255,0.045)';
          U.roundRect(c, BX + cc * (TILE + GAP), BY + r * (TILE + GAP), TILE, TILE, 12);
          c.fill();
        }
      }

      for (let r = 0; r < N; r++) {
        for (let cc = 0; cc < N; cc++) {
          const t = this.cells[key(r, cc)];
          if (!t) continue;
          const scale = 1 - t.pop * 0.18;
          const size = TILE * scale;
          const off = (TILE - size) / 2;
          const x = BX + cc * (TILE + GAP) + off;
          const y = BY + r * (TILE + GAP) + off;
          this.drawCell(c, t.v, x, y, size, t.pop);
        }
      }

      c.save();
      c.font = 'bold 14px ui-monospace, monospace';
      c.fillStyle = 'rgba(242,243,255,0.7)';
      c.textAlign = 'left';
      c.fillText('MOVES ' + this.moves, BX - 6, BY - 26);
      c.textAlign = 'right';
      c.fillText(this.reached ? 'BIGGEST ' + this.reached : 'MERGE TO 2048', BX + BOARD + 6, BY - 26);
      c.restore();
    }
  };

  window.Games = window.Games || {};
  window.Games.p2048 = game;
})();

# Neon Arcade

Ten arcade games in one neon-lit browser page — no build step and no
package installs, just HTML/CSS/JS on a shared canvas, with Neon Vice running
in full 3D on a locally vendored three.js. It installs as an app and plays
offline.

**Play it:** <https://mlkas67.github.io/neon-arcade/>
**Source:** <https://github.com/mlkas67/neon-arcade>

## Install it as an app

The site is a PWA, so the browser can install it as a real app with its own
window, icon and dock/taskbar entry — no store, no download.

| Where | How |
|-------|-----|
| Chrome / Edge (desktop) | click the **Install** button in the page header, or the install icon at the right of the address bar |
| Android (Chrome) | **Install** in the header, or menu ⋮ → *Add to Home screen* |
| iPhone / iPad (Safari) | Share → *Add to Home Screen* (the header's Install button shows these steps) |
| Firefox | menu → *Install* / *Add to Home screen* where supported |

Once installed, the whole cabinet launches from the icon and **works with no
network**: `sw.js` precaches the page, styles, engine and all ten games (21
files), then refreshes them in the background when you are online. Installed
icons also get shortcuts to Geometry Dash, Flappy Bird and 2048.

| # | Game | What it is |
|---|------|-----------|
| 1 | **Geometry Dash** | one-button neon runner: jump spikes and blocks, speed keeps climbing |
| 2 | **Flappy Bird** | flap through pipes, score goes up with every gap |
| 3 | **Brick Breaker** | paddle, ball, an 11×5 brick wall, three lives, levels add tougher bricks |
| 4 | **Neon Snake** | grid snake, eat to grow, walls and your own tail are lethal |
| 5 | **2048** | slide and merge tiles, chase the biggest number you can reach |
| 6 | **Asteroid Drift** | thrust-and-turn shooter, rocks split when hit, three ships |
| 7 | **Neon Pong** | you against the CPU, first to 7 |
| 8 | **Memory Grid** | flip pairs in a 4×4 grid, finish in as few moves as possible |
| 9 | **Whack-a-Bot** | 40-second bot-bashing sprint with gold bots and combos |
| 10 | **Neon Vice 3D** | third-person open-city driving in WebGL: run deliveries, bank cash, out-drive the cops (press <kbd>0</kbd>) |

## Run it

```bash
npm start          # https://localhost:8443  (+ http://localhost:8080)
```

`npm start` uses Node 18+ only — there is nothing to install. On first run the
server generates a self-signed certificate in `.certs/` so the site is served
over TLS.

Browsers do not trust self-signed certificates, so the first visit shows
"Your connection is not private". Click **Advanced → Proceed to localhost** and
you are in (the page then reports a secure `https://` context).

### A certificate without the warning

Create a locally-trusted certificate with [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1
TLS_CERT=cert.pem TLS_KEY=key.pem npm start
```

`TLS_CERT` / `TLS_KEY` make the server skip its self-signed fallback. Put a real
certificate there (e.g. from Let's Encrypt on a domain) and the same command
serves production-grade HTTPS.

### A public HTTPS link with a real certificate

Want to play from your phone or send the link to someone? Put it on the
internet behind a genuine, browser-trusted certificate — no warning page at all:

```bash
npm start              # the game server, in one terminal
bash scripts/share.sh  # prints https://<random-words>.trycloudflare.com
```

`scripts/share.sh` starts a Cloudflare quick tunnel to the local server and
prints a public `https://` URL backed by a Google Trust Services certificate, so
every browser treats it as secure. No account or token is needed. The link works
while the tunnel and this machine are running; stop the script (`Ctrl-C`) to take
it down, or run it again for a fresh address.

That script needs `cloudflared`. On macOS `brew install cloudflared`, on Linux:

```bash
curl -fsSL -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
```

## Controls

| Game | Keys | Pointer |
|---|---|---|
| Geometry Dash | `Space` / `W` / `↑`, hold to keep jumping | click or tap |
| Flappy Bird | `Space` / `W` / `↑` | click or tap |
| Brick Breaker | `←` `→` / `A` `D` move, `Space` launch | drag to aim, tap to launch |
| Neon Snake | arrows / `WASD` | swipe |
| 2048 | arrows / `WASD` | swipe |
| Asteroid Drift | `←` `→` turn, `↑` thrust, `Space` fire | hold to fly at the pointer and auto-fire |
| Neon Pong | `W` `S` move, `Space` serve | mouse or touch to move |
| Memory Grid | — | click or tap cards |
| Whack-a-Bot | — | click or tap bots |
| Neon Vice 3D | `↑`/`W` gas, `↓`/`S` brake + reverse, `←` `→` steer, `Space` handbrake, `E` get in/out | keyboard needed — there are no touch controls |

Shared: `P` / `Esc` pauses, `R` restarts, `1`–`9` opens a game straight from the
menu (`0` opens Neon Vice), and ‹ Back or the logo returns to the menu.

Best scores are stored per browser in `localStorage` (`neon.best.<game>`) and
shown on the menu chips. Sound can be muted with the speaker button.

## Layout

```
public/                 the whole site (this is all the server exposes)
  index.html
  css/style.css
  js/core.js            shared engine: canvas, loop, input, HUD, overlays, audio, particles
  js/geometry-dash.js
  js/flappy.js
  js/main.js            menu wiring and the 1–9 / 0 shortcuts
  js/games/breakout.js
  js/games/snake.js
  js/games/puzzle2048.js
  js/games/asteroids.js
  js/games/pong.js
  js/games/memory.js
  js/games/whack.js
  js/games/vice3d.js    Neon Vice 3D: three.js city, chase camera, cars, peds, wanted level
  vendor/three.min.js   three.js r160 (UMD build, vendored so the game works offline)
server.js               static HTTPS/HTTP server, path-guarded to public/
scripts/share.sh        public https:// link via a Cloudflare quick tunnel
scripts/publish-pages.sh  rebuild the gh-pages branch that GitHub Pages serves
manifest.webmanifest    PWA manifest (name, icons, shortcuts, standalone display)
sw.js                   service worker: precache + offline play
icons/                  app icons (maskable, apple-touch, favicon)
```

Neon Vice 3D needs WebGL. If a browser blocks it, the rest of the cabinet still
works; the game logs a warning instead of starting. Its WebGL canvas is torn down
on ‹ Back through an optional `destroy()` hook so the 2D games keep a clean scene.

Games plug into the engine through `window.Games.<id>` and implement
`reset(arcade)`, `update(dt)`, `draw(ctx, dt)` and `action()`, with optional
`onStart`, `onDeath`, `updateDeath(dt)`, `onHoldStart` / `onHoldEnd`, and
`usesArrowUp` when a game steers with the up arrow itself.

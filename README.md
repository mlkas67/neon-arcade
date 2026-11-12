# Neon Arcade

Two arcade classics in one neon-lit browser page: a **Geometry Dash**-style
one-button runner and **Flappy Bird**. No build step, no dependencies — plain
HTML/CSS/JS on a single canvas, served by a tiny Node server over **HTTPS**.

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

## Controls

| | Geometry Dash | Flappy Bird |
|---|---|---|
| Jump / flap | `Space`, `W`, `↑`, click or tap | same |
| Hold to jump repeatedly | yes | — |
| Pause | `P` / `Esc` / pause button | same |
| Restart | `R` / the overlay button | same |
| Back to menu | ‹ Back / the logo | same |

Best scores are stored per browser in `localStorage` (`neon.best.gd`,
`neon.best.flappy`). Sound can be muted with the speaker button.

## Layout

```
public/            the whole site (this is all the server exposes)
  index.html
  css/style.css
  js/core.js          shared engine: canvas, loop, input, HUD, overlays, audio, particles
  js/geometry-dash.js
  js/flappy.js
  js/main.js          menu wiring
server.js          static HTTPS/HTTP server, path-guarded to public/
```

Games plug into the engine through `window.Games.<id>` and implement
`reset(arcade)`, `update(dt)`, `draw(ctx, dt)` and `action()`.

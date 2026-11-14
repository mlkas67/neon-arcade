/* ============================================================
   Legeniko Arcade — static server
   Serves the site over both HTTP (8080) and HTTPS (8443).
   On first run it generates a self-signed certificate.
   ============================================================ */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const api = require('./server/api');
const rooms = require('./server/rooms');

const ROOT = path.join(__dirname, 'public');
const HTTP_PORT = Number(process.env.PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN'
  }, headers || {}));
  res.end(body);
}

function handler(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain' });
  }

  if (pathname.startsWith('/api/')) {
    return api.handle(req, res, pathname).catch(() => {
      send(res, 500, '{"ok":false,"error":"Server problem."}', { 'Content-Type': 'application/json; charset=utf-8' });
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain' });
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = path.normalize(path.join(ROOT, pathname));
  const relative = path.relative(ROOT, filePath);
  // never serve outside public/, and never serve dot-files (.git, .env, .certs)
  if (relative.startsWith('..') || path.isAbsolute(relative) ||
      relative.split(path.sep).some(seg => seg.startsWith('.'))) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT' && !path.extname(filePath)) {
        return fs.readFile(path.join(ROOT, 'index.html'), (e2, fallback) => {
          if (e2) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
          send(res, 200, fallback, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        });
      }
      return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' });
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, req.method === 'HEAD' ? '' : data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    });
  });
}

function ensureCert() {
  // 1. explicit cert files (e.g. from mkcert) win
  const envKey = process.env.TLS_KEY;
  const envCrt = process.env.TLS_CERT;
  if (envKey && envCrt) {
    if (!fs.existsSync(envKey) || !fs.existsSync(envCrt)) {
      throw new Error('TLS_KEY / TLS_CERT point at missing files');
    }
    return { key: envKey, cert: envCrt };
  }

  // 2. otherwise a self-signed pair, generated once into .certs/ (outside public/)
  const dir = path.join(__dirname, '.certs');
  const key = path.join(dir, 'key.pem');
  const crt = path.join(dir, 'cert.pem');
  if (fs.existsSync(key) && fs.existsSync(crt)) return { key, cert: crt };

  fs.mkdirSync(dir, { recursive: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', crt,
    '-days', '825',
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  ], { stdio: 'ignore' });
  return { key, cert: crt };
}

const httpServer = http.createServer(handler);
const httpsServer = (() => {
  try {
    const creds = ensureCert();
    return https.createServer({
      key: fs.readFileSync(creds.key),
      cert: fs.readFileSync(creds.cert)
    }, handler);
  } catch (e) {
    console.warn('HTTPS disabled:', e.message);
    return null;
  }
})();

// live layer: presence, invites and race rooms share the http server,
// and the https one when there is a certificate
rooms.attach(httpServer, '/ws');
if (httpsServer) rooms.attach(httpsServer, '/ws');

httpServer.listen(HTTP_PORT, () => {
  console.log('  http://localhost:' + HTTP_PORT);
});

if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log('  https://localhost:' + HTTPS_PORT + '  (certificate: ' + (process.env.TLS_KEY ? 'provided' : 'self-signed') + ')');
  });
}

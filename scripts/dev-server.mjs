/* A local server for the browser preview.
 *
 * It serves app/, proxies /api to hackertube.org on the same origin, and
 * serves the same /player page as the deployed Worker. That lets the app be
 * developed without deploying the Cloudflare Worker. The TV itself cannot do
 * this: it needs the proxy.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_HTML } from '../proxy/player-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM = 'https://hackertube.org';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  res.end(body);
}

async function proxy(req, res) {
  try {
    const upstream = await fetch(UPSTREAM + req.url, {
      headers: { Accept: 'application/json' }
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    };
    send(res, upstream.status, body, headers);
  } catch (error) {
    send(res, 502, JSON.stringify({ error: 'Could not reach hackertube.org' }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  }
}

function serveFile(req, res, pathname) {
  let target = decodeURIComponent(pathname);
  if (target === '/' || target === '') {
    target = '/index.html';
  }

  const file = path.normalize(path.join(APP, target));
  if (!file.startsWith(APP + path.sep) && file !== path.join(APP, 'index.html')) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    const extension = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[extension] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/player' || url.pathname === '/player/') {
    send(res, 200, PLAYER_HTML, {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    return;
  }
  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, player: true }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    proxy(req, res);
    return;
  }
  serveFile(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`HackerTube preview: http://${HOST}:${PORT}/`);
  console.log(`API proxy:         http://${HOST}:${PORT}/api/feed`);
  console.log(`Player page:       http://${HOST}:${PORT}/player`);
});

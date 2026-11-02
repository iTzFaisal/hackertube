/* A tiny CORS proxy for the HackerTube API, plus the in-app player page.
 *
 * hackertube.org does not send Access-Control-Allow-Origin, so a packaged TV
 * app (origin file://) cannot read its JSON. This Worker forwards only
 * /api/* to hackertube.org and adds the one header the TV needs.
 *
 * It also serves /player. YouTube's embedded player refuses file:// origins
 * with "Error 153", so the app embeds this HTTPS page instead of the YouTube
 * iframe directly. See proxy/player-page.js.
 *
 * Deploy:
 *   npm run deploy:proxy
 * then build with the URL Wrangler prints:
 *   npm run package -- --api https://hackertube-proxy.<you>.workers.dev
 */
import { PLAYER_HTML } from './player-page.js';

const UPSTREAM = 'https://hackertube.org';

function corsHeaders() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

function text(message, status) {
  const headers = corsHeaders();
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(message, { status: status || 200, headers });
}

function playerPage() {
  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(PLAYER_HTML, { headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text('Only GET is supported.', 405);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        upstream: UPSTREAM,
        player: true
      }), {
        headers: (() => {
          const headers = corsHeaders();
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.set('Cache-Control', 'no-store');
          return headers;
        })()
      });
    }

    if (url.pathname === '/player' || url.pathname === '/player/') {
      return playerPage();
    }

    if (!url.pathname.startsWith('/api/')) {
      return text('HackerTube proxy. Use /api/... or /player.', 404);
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      return text('Could not reach hackertube.org.', 502);
    }

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
    headers.set('Cache-Control', 'public, max-age=60');
    headers.delete('set-cookie');
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }
};

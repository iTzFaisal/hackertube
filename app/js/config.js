/* Runtime configuration.
 *
 * apiBase:
 *   Empty means "same origin /api". The development server proxies /api to
 *   hackertube.org, so this works in a browser.
 *
 *   A packaged Tizen app has no server of its own. hackertube.org does not
 *   send CORS headers, so the TV cannot call it directly. Deploy the tiny
 *   proxy in ../proxy and set this to its URL, for example:
 *
 *     apiBase: 'https://hackertube-proxy.example.workers.dev'
 *
 *   You do not have to edit this file by hand: the package script can write
 *   the value into the build:
 *
 *     npm run package -- --api https://hackertube-proxy.example.workers.dev
 */
window.HACKERTUBE_CONFIG = {
  apiBase: '',
  youtubeAppId: '111299001912'
};

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
 *
 * playerBase:
 *   Optional URL of the in-app player page. Leave it empty to derive it from
 *   apiBase (the same Worker serves /player). Set it only if the player page
 *   lives on a different host.
 *
 * youtubeAppId:
 *   Samsung's YouTube app id, used when a video has to be handed to YouTube.
 */
window.HACKERTUBE_CONFIG = {
  apiBase: '',
  playerBase: '',
  youtubeAppId: '111299001912'
};

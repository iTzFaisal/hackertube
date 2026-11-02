/* The page the TV app embeds for in-app YouTube playback.
 *
 * YouTube's embedded player refuses file:// origins ("Error 153"), so the
 * packaged app cannot put the embed straight into its own page. This page is
 * served over HTTPS by the same Worker as the API proxy; YouTube sees a normal
 * web origin and plays. The app controls it with postMessage (app/js/player.js).
 *
 * This file is imported by proxy/worker.js and scripts/dev-server.mjs so the
 * browser preview and the TV use exactly the same player page.
 */
export const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>HackerTube player</title>
<style>
  html,
  body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #000000;
  }

  #player,
  #player iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
</head>
<body>
<div id="player"></div>
<script>
(function () {
  'use strict';

  var query = window.location.search ? window.location.search.substring(1) : '';
  var parts = query.split('&');
  var params = {};
  var i;
  for (i = 0; i < parts.length; i++) {
    if (!parts[i]) {
      continue;
    }
    var pair = parts[i].split('=');
    params[decodeURIComponent(pair[0] || '')] =
      decodeURIComponent(pair[1] || '');
  }

  var vid = params.v || '';
  var player = null;
  var ready = false;
  var failed = false;
  var pendingPlay = false;
  var apiTimer = null;
  var timeTimer = null;
  var origin = window.location.protocol + '//' + window.location.host;

  function send(message) {
    message.source = 'hackertube-player';
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }

  function fail(code) {
    if (failed) {
      return;
    }
    failed = true;
    if (apiTimer) {
      window.clearTimeout(apiTimer);
      apiTimer = null;
    }
    send({ type: 'error', code: code });
  }

  function sendTime() {
    if (!ready || !player || !player.getCurrentTime) {
      return;
    }
    send({
      type: 'time',
      time: player.getCurrentTime(),
      duration: player.getDuration(),
      state: player.getPlayerState()
    });
  }

  function sendState() {
    if (!ready || !player || !player.getPlayerState) {
      return;
    }
    send({ type: 'state', state: player.getPlayerState() });
  }

  function onReady() {
    ready = true;
    if (apiTimer) {
      window.clearTimeout(apiTimer);
      apiTimer = null;
    }
    send({ type: 'ready', duration: player.getDuration() });
    sendState();
    sendTime();
    if (timeTimer) {
      window.clearInterval(timeTimer);
    }
    timeTimer = window.setInterval(sendTime, 500);
    if (pendingPlay) {
      player.playVideo();
    }
  }

  function onStateChange(event) {
    send({ type: 'state', state: event.data });
    if (event.data === 1) {
      sendTime();
    }
  }

  function onError(event) {
    send({ type: 'error', code: event.data });
  }

  function onMessage(event) {
    var data = event.data;
    if (event.source !== window.parent) {
      return;
    }
    if (!data || data.source !== 'hackertube-app') {
      return;
    }
    if (data.type === 'play') {
      pendingPlay = true;
      if (ready) {
        player.playVideo();
      }
    } else if (data.type === 'pause') {
      pendingPlay = false;
      if (ready) {
        player.pauseVideo();
      }
    } else if (data.type === 'seek') {
      if (ready) {
        var target = Number(data.time);
        if (isNaN(target) || target < 0) {
          target = 0;
        }
        var duration = player.getDuration();
        if (duration && target > duration) {
          target = duration;
        }
        player.seekTo(target, true);
        sendTime();
      }
    } else if (data.type === 'ping') {
      sendState();
      sendTime();
    }
  }

  if (!vid) {
    fail('novideo');
    return;
  }

  window.addEventListener('message', onMessage, false);

  window.onYouTubeIframeAPIReady = function () {
    if (failed) {
      return;
    }
    player = new window.YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: vid,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: origin
      },
      events: {
        onReady: onReady,
        onStateChange: onStateChange,
        onError: onError
      }
    });
  };

  apiTimer = window.setTimeout(function () {
    if (!window.YT || !window.YT.Player) {
      fail('api');
    }
  }, 12000);

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = function () {
    fail('api');
  };
  document.getElementsByTagName('head')[0].appendChild(tag);
})();
</script>
</body>
</html>
`;

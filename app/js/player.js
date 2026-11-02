/* The in-app player.
 *
 * YouTube's embedded player refuses file:// origins ("Error 153"), so the
 * packaged app cannot put the embed straight into its own page. The API proxy
 * serves a small player page over HTTPS (proxy/player-page.js); this module
 * embeds that page and controls it with postMessage.
 *
 * If the player cannot load, the page offers the official YouTube app. The
 * app never sends the viewer to the TV browser.
 */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var h = HT.dom.h;
  var clear = HT.dom.clear;
  var PLAYER_SOURCE = 'hackertube-player';
  var APP_SOURCE = 'hackertube-app';
  var STATE = {
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
    UNSTARTED: -1
  };
  var unavailable = false;
  var checked = false;

  function config() {
    return window.HACKERTUBE_CONFIG || {};
  }

  function trim(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function base() {
    var explicit = trim(config().playerBase);
    if (explicit) {
      return explicit;
    }
    var api = '';
    try {
      api = trim(HT.api.base());
    } catch (error) {
      api = '';
    }
    if (!api) {
      return '';
    }
    if (/^https?:\/\//i.test(api)) {
      return api.replace(/\/api$/i, '') + '/player';
    }
    return 'player';
  }

  function available() {
    return !unavailable && !!base();
  }

  function disable() {
    unavailable = true;
  }

  function enable() {
    unavailable = false;
  }

  function healthUrl() {
    var root = base();
    if (!root) {
      return '';
    }
    if (root === 'player') {
      return 'health';
    }
    if (/\/player$/i.test(root)) {
      return root.replace(/\/player$/i, '/health');
    }
    return '';
  }

  function check() {
    if (checked || !base()) {
      return;
    }
    checked = true;
    var target = healthUrl();
    if (!target) {
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', target, true);
    xhr.timeout = 5000;
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        return;
      }
      try {
        var data = JSON.parse(xhr.responseText);
        if (data && data.player === true) {
          unavailable = false;
        } else {
          /* An older Worker without the /player route. Go straight to the
             YouTube app instead of waiting for the player to time out. */
          unavailable = true;
        }
      } catch (error) {
        /* Leave the player enabled if the health payload is unexpected. */
      }
    };
    try {
      xhr.send();
    } catch (error) {
      /* Leave the player enabled if the check cannot start. */
    }
  }

  function url(vid) {
    var root = base();
    if (!root) {
      return '';
    }
    var join = root.indexOf('?') >= 0 ? '&' : '?';
    return root + join + 'v=' + encodeURIComponent(vid) + '&t=' +
      (new Date().getTime());
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function clock(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) {
      return h + ':' + pad2(m) + ':' + pad2(s);
    }
    return m + ':' + pad2(s);
  }

  function PlayerPage(nav, video) {
    HT.screens.Page.call(this, 'player', nav);
    this.video = video || {};
    this.el.className += ' player-page';
    this.el.setAttribute('data-page', 'player-' + (this.video.vid || 'video'));
    this.el.setAttribute('tabindex', '-1');
    if (this.scrollEl && this.scrollEl.parentNode) {
      this.scrollEl.parentNode.removeChild(this.scrollEl);
    }
    this.scrollEl = null;

    this.started = false;
    this.ready = false;
    this.failed = false;
    this.state = STATE.UNSTARTED;
    this.currentTime = 0;
    this.duration = Number(this.video.duration_s) || 0;
    this.hideTimer = null;
    this.readyTimer = null;
    this.playTimer = null;
    this.lastToggle = 0;
    this.messageHandler = null;
    this.frame = null;
    this.build();
  }

  PlayerPage.prototype = Object.create(HT.screens.Page.prototype);
  PlayerPage.prototype.constructor = PlayerPage;
  PlayerPage.prototype.isPlayer = true;

  PlayerPage.prototype.build = function () {
    var self = this;

    this.frame = h('iframe', {
      class: 'player-frame',
      allow: 'autoplay; encrypted-media; fullscreen',
      allowfullscreen: 'allowfullscreen',
      frameborder: '0',
      title: this.video.title || 'Video'
    });
    this.frame.addEventListener('load', function () {
      if (self.active) {
        self.el.focus();
      }
    });

    this.loadingEl = h('div', { class: 'player-loading' }, [
      h('span', { class: 'spinner' }),
      h('span', { text: 'Starting player\u2026' })
    ]);

    this.stateEl = h('div', { class: 'player-state', text: 'Starting\u2026' });
    this.timeEl = h('div', { class: 'player-time', text: '0:00 / 0:00' });
    this.fillEl = h('div', { class: 'player-progress-fill' });

    this.overlayEl = h('div', { class: 'player-overlay' }, [
      h('div', { class: 'player-top' }, [
        h('div', { class: 'player-title', text: this.video.title || '' }),
        h('div', { class: 'player-channel', text: this.video.channel || '' })
      ]),
      h('div', { class: 'player-bottom' }, [
        h('div', { class: 'player-progress' }, this.fillEl),
        h('div', { class: 'player-row' }, [
          this.stateEl,
          this.timeEl,
          h('div', { class: 'player-hint', text:
            'OK Play/Pause \u00b7 \u25c0 \u25b6 Seek 10s \u00b7 Back Exit' })
        ])
      ])
    ]);

    this.errorTitleEl = h('h2', { text: 'Can\u2019t play this here' });
    this.errorTextEl = h('p', { text: '' });
    this.errorActionsEl = h('div', { class: 'action-row' });
    this.errorEl = h('div', { class: 'player-error hidden' }, [
      this.errorTitleEl,
      this.errorTextEl,
      this.errorActionsEl
    ]);

    this.el.appendChild(h('div', { class: 'player-stage' }, [
      this.frame,
      this.loadingEl,
      this.overlayEl,
      this.errorEl
    ]));

    this.messageHandler = function (event) {
      self.onMessage(event);
    };
    window.addEventListener('message', this.messageHandler, false);
  };

  PlayerPage.prototype.show = function () {
    this.active = true;
    this.el.classList.add('active');
    var app = document.getElementById('app');
    if (app) {
      app.classList.add('playing');
    }
    try {
      this.el.focus({ preventScroll: true });
    } catch (error) {
      try {
        this.el.focus();
      } catch (ignored) {
        /* The key handler still works without DOM focus. */
      }
    }
    if (!this.started) {
      this.start();
    } else if (!this.failed) {
      this.send('ping');
      this.showControls();
    }
  };

  PlayerPage.prototype.hide = function () {
    this.active = false;
    this.el.classList.remove('active');
    var app = document.getElementById('app');
    if (app) {
      app.classList.remove('playing');
    }
    this.clearTimers();
    this.overlayEl.classList.remove('show');
    this.send('pause');
  };

  PlayerPage.prototype.dispose = function () {
    this.clearTimers();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler, false);
      this.messageHandler = null;
    }
    if (this.frame) {
      try {
        this.frame.src = 'about:blank';
      } catch (error) {
        /* The frame is already gone. */
      }
    }
    HT.Focus.release(this.el);
    HT.screens.Page.prototype.dispose.call(this);
    var app = document.getElementById('app');
    if (app) {
      app.classList.remove('playing');
    }
  };

  PlayerPage.prototype.start = function () {
    var self = this;
    var playerUrl = url(this.video.vid);
    this.started = true;
    this.ready = false;
    this.failed = false;
    this.state = STATE.UNSTARTED;
    this.currentTime = 0;
    this.duration = Number(this.video.duration_s) || 0;
    HT.Focus.release(this.el);
    this.errorEl.classList.add('hidden');
    this.loadingEl.classList.remove('hidden');
    this.overlayEl.classList.remove('show');
    this.render();

    if (!playerUrl) {
      this.fail('noplayer');
      return;
    }

    this.readyTimer = window.setTimeout(function () {
      if (!self.ready && !self.failed) {
        disable();
        self.fail('timeout');
      }
    }, 13000);

    this.frame.src = playerUrl;
    this.showControls();
  };

  PlayerPage.prototype.retry = function () {
    this.started = false;
    this.clearTimers();
    HT.Focus.release(this.el);
    this.frame.src = 'about:blank';
    var self = this;
    window.setTimeout(function () {
      if (self.active) {
        self.start();
      }
    }, 50);
  };

  PlayerPage.prototype.clearTimers = function () {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.readyTimer) {
      window.clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.playTimer) {
      window.clearTimeout(this.playTimer);
      this.playTimer = null;
    }
  };

  PlayerPage.prototype.onMessage = function (event) {
    if (!this.active || event.source !== this.frame.contentWindow) {
      return;
    }
    var data = event.data;
    if (!data || data.source !== PLAYER_SOURCE || this.failed) {
      return;
    }
    if (data.type === 'ready') {
      this.ready = true;
      this.failed = false;
      enable();
      if (Number(data.duration) > 0) {
        this.duration = Number(data.duration);
      }
      if (this.readyTimer) {        window.clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      this.loadingEl.classList.add('hidden');
      this.overlayEl.classList.add('show');
      this.render();
      this.send('play');
      this.watchPlayback();
      return;
    }
    if (data.type === 'state') {
      this.state = Number(data.state);
      if (this.state === STATE.PLAYING || this.state === STATE.BUFFERING) {
        this.loadingEl.classList.add('hidden');
        if (this.playTimer) {
          window.clearTimeout(this.playTimer);
          this.playTimer = null;
        }
      }
      this.render();
      this.showControls();
      return;
    }
    if (data.type === 'time') {
      this.currentTime = Number(data.time) || 0;
      if (Number(data.duration) > 0) {
        this.duration = Number(data.duration);
      }
      if (data.state !== undefined) {
        this.state = Number(data.state);
      }
      this.render();
      return;
    }
    if (data.type === 'error') {
      this.fail(data.code);
    }
  };

  PlayerPage.prototype.watchPlayback = function () {
    var self = this;
    if (this.playTimer) {
      window.clearTimeout(this.playTimer);
    }
    this.playTimer = window.setTimeout(function () {
      self.playTimer = null;
      if (!self.active || self.failed) {
        return;
      }
      if (self.state === STATE.UNSTARTED || self.state === STATE.CUED ||
          self.state === STATE.PAUSED) {
        self.fail('blocked');
      }
    }, 5000);
  };

  PlayerPage.prototype.send = function (type, extra) {
    if (!this.frame || !this.frame.contentWindow) {
      return;
    }
    var message = { source: APP_SOURCE, type: type };
    var key;
    if (extra) {
      for (key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          message[key] = extra[key];
        }
      }
    }
    try {
      this.frame.contentWindow.postMessage(message, '*');
    } catch (error) {
      /* The frame may be navigating. */
    }
  };

  PlayerPage.prototype.play = function () {
    if (this.failed) {
      return;
    }
    if (this.state === STATE.ENDED) {
      this.seekTo(0);
    }
    this.send('play');
    this.showControls();
    this.watchPlayback();
  };

  PlayerPage.prototype.pause = function () {
    if (this.failed) {
      return;
    }
    if (this.playTimer) {
      window.clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.send('pause');
    this.showControls();
  };

  PlayerPage.prototype.toggle = function () {
    if (this.failed) {
      return;
    }
    if (!this.ready) {
      this.showControls();
      return;
    }
    if (this.state === STATE.PLAYING || this.state === STATE.BUFFERING) {
      this.pause();
    } else {
      this.play();
    }
  };

  PlayerPage.prototype.seekTo = function (target) {
    if (this.failed || !this.ready) {
      return;
    }
    target = Number(target) || 0;
    if (target < 0) {
      target = 0;
    }
    if (this.duration > 1 && target > this.duration - 1) {
      target = this.duration - 1;
    }
    this.currentTime = target;
    this.send('seek', { time: target });
    this.render();
    this.showControls();
  };

  PlayerPage.prototype.seek = function (delta) {
    this.seekTo(this.currentTime + delta);
  };

  PlayerPage.prototype.showControls = function () {
    var self = this;
    this.overlayEl.classList.add('show');
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.state === STATE.PLAYING) {
      this.hideTimer = window.setTimeout(function () {
        if (self.active && self.state === STATE.PLAYING && !self.failed) {
          self.overlayEl.classList.remove('show');
        }
      }, 4000);
    }
  };

  PlayerPage.prototype.stateLabel = function () {
    if (this.failed) {
      return '';
    }
    if (!this.ready) {
      return 'Starting\u2026';
    }
    if (this.state === STATE.PLAYING) {
      return 'Playing';
    }
    if (this.state === STATE.PAUSED) {
      return 'Paused';
    }
    if (this.state === STATE.BUFFERING) {
      return 'Buffering\u2026';
    }
    if (this.state === STATE.ENDED) {
      return 'Ended';
    }
    if (this.state === STATE.CUED || this.state === STATE.UNSTARTED) {
      return 'Press OK to play';
    }
    return 'Ready';
  };

  PlayerPage.prototype.render = function () {
    var percent = 0;
    if (this.duration > 0) {
      percent = Math.max(0,
        Math.min(100, (this.currentTime / this.duration) * 100));
    }
    this.fillEl.style.width = percent + '%';
    this.timeEl.textContent = clock(this.currentTime) + ' / ' +
      clock(this.duration);
    this.stateEl.textContent = this.stateLabel();
  };

  PlayerPage.prototype.fail = function (code) {
    if (this.failed) {
      return;
    }
    this.failed = true;
    this.ready = false;
    this.clearTimers();
    this.loadingEl.classList.add('hidden');
    this.overlayEl.classList.remove('show');
    this.errorEl.classList.remove('hidden');
    this.errorTitleEl.textContent = 'Can\u2019t play this here';
    this.errorTextEl.textContent = this.errorMessage(code);
    this.buildErrorActions(code);
  };

  PlayerPage.prototype.errorMessage = function (code) {
    code = String(code);
    if (code === '101' || code === '150') {
      return 'The video\u2019s owner does not allow it to be embedded. ' +
        'The official YouTube app can still play it.';
    }
    if (code === '100') {
      return 'This video is unavailable or private.';
    }
    if (code === '2' || code === '5') {
      return 'The player could not start this video.';
    }
    if (code === 'api') {
      return 'The YouTube player did not load. Check the TV\u2019s internet ' +
        'connection.';
    }
    if (code === 'blocked') {
      return 'This TV did not start the embedded player. The official ' +
        'YouTube app can still play it.';
    }
    if (code === 'timeout') {
      return 'The in-app player did not respond. Play it in the YouTube app ' +
        'instead.';
    }
    if (code === 'noplayer') {
      return 'The in-app player is not available in this build.';
    }
    return 'This video cannot play inside HackerTube.';
  };

  PlayerPage.prototype.buildErrorActions = function (code) {
    var self = this;
    clear(this.errorActionsEl);

    this.primaryEl = HT.ui.pill('Play in YouTube app', {
      key: 'player:youtube',
      icon: 'open_in_new',
      selected: true,
      onClick: function () {
        self.nav.openYouTube(self.video);
      }
    });
    this.errorActionsEl.appendChild(this.primaryEl);

    if (code === 'timeout' || code === 'api' || code === 'blocked' ||
        code === 'noplayer') {
      this.errorActionsEl.appendChild(HT.ui.pill('Try again', {
        key: 'player:retry',
        onClick: function () {
          self.retry();
        }
      }));
    }

    this.errorActionsEl.appendChild(HT.ui.pill('Back', {
      key: 'player:back',
      onClick: function () {
        self.nav.back();
      }
    }));

    HT.Focus.set(this.primaryEl);
  };

  PlayerPage.prototype.canToggle = function () {
    var now = new Date().getTime();
    if (this.lastToggle && now - this.lastToggle < 300) {
      return false;
    }
    this.lastToggle = now;
    return true;
  };

  PlayerPage.prototype.handleKey = function (event) {
    if (!this.active || this.failed) {
      return false;
    }
    var key = event.keyCode;
    if (key === 10009 || key === 27 || key === 461) {
      return false;
    }
    if (key === 13) {
      event.preventDefault();
      if (!event.repeat && this.canToggle()) {
        this.toggle();
      }
      return true;
    }
    if (key === 37) {
      event.preventDefault();
      this.seek(-10);
      return true;
    }
    if (key === 39) {
      event.preventDefault();
      this.seek(10);
      return true;
    }
    if (key === 415) {
      event.preventDefault();
      this.play();
      return true;
    }
    if (key === 19) {
      event.preventDefault();
      this.pause();
      return true;
    }
    if (key === 179 || key === 10252) {
      event.preventDefault();
      if (!event.repeat && this.canToggle()) {
        this.toggle();
      }
      return true;
    }
    if (key === 38 || key === 40 || key === 457) {
      event.preventDefault();
      this.showControls();
      return true;
    }
    event.preventDefault();
    this.showControls();
    return true;
  };

  PlayerPage.prototype.onResume = function () {
    if (this.active && !this.failed) {
      this.send('ping');
      this.showControls();
    }
  };

  HT.player = {
    PlayerPage: PlayerPage,
    STATE: STATE,
    available: available,
    check: check,
    disable: disable,
    enable: enable,
    base: base,
    url: url
  };
})();

/* App shell: the sidebar, the page stack and the remote-control keys. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var h = HT.dom.h;
  var clear = HT.dom.clear;

  var sections = [
    { id: 'home', label: 'Home', icon: 'home', iconFilled: 'home_filled' },
    { id: 'search', label: 'Search', icon: 'search', iconFilled: 'search_filled' },
    { id: 'longs', label: 'Longs', icon: 'longs', iconFilled: 'longs_filled' },
    { id: 'liked', label: 'Liked', icon: 'like', iconFilled: 'like_filled' },
    { id: 'history', label: 'History', icon: 'history', iconFilled: 'history_filled' },
    { id: 'later', label: 'Watch later', icon: 'later', iconFilled: 'later_filled' },
    { id: 'categories', label: 'Categories', icon: 'categories', iconFilled: 'categories_filled' },
    { id: 'playlists', label: 'Playlists', icon: 'playlists', iconFilled: 'playlists_filled' }
  ];

  function App() {
    this.library = new HT.Library();
    HT.library = this.library;
    this.stack = [];
    this.section = 'home';
    this.pagesEl = document.getElementById('pages');
    this.sidebarEl = document.getElementById('sidebar');
    this.navItems = {};
    this.enterPress = null;

    var self = this;
    this.library.onChange(function () {
      HT.ui.updateSavedBadges();
    });
  }

  App.prototype.start = function () {
    this.bindKeys();

    if (!HT.api.isConfigured()) {
      this.sidebarEl.classList.add('hidden');
      this.push(new HT.screens.SetupPage(this));
      return;
    }

    this.buildSidebar();
    this.push(new HT.screens.HomePage(this, this.library));
    if (HT.player && HT.player.check) {
      HT.player.check();
    }
    HT.youtube.check(function (available) {
      if (!available) {
        /* The in-app player still works; a failed handoff shows a message. */
        window.console && window.console.log &&
          window.console.log('YouTube app was not found by the app control check.');
      }
    });
  };

  /* ------------------------------------------------------------- sidebar */

  App.prototype.buildSidebar = function () {
    var self = this;
    clear(this.sidebarEl);
    this.sidebarEl.appendChild(HT.ui.brand());

    var nav = h('div', { role: 'navigation', 'aria-label': 'Sections' });
    for (var i = 0; i < sections.length; i++) {
      (function (section) {
        var item = HT.ui.navItem(section, function (choice) {
          self.go(choice.id);
        });
        self.navItems[section.id] = item;
        nav.appendChild(item);
      })(sections[i]);
    }
    this.sidebarEl.appendChild(nav);

    this.sidebarEl.appendChild(h('div', { class: 'sidebar-foot' }, [
      h('div', { text: 'OK plays \u00b7 Hold OK for details' }),
      h('div', { text: 'Back returns to the previous screen' })
    ]));
    this.updateSidebar();
  };

  App.prototype.updateSidebar = function () {
    for (var i = 0; i < sections.length; i++) {
      var item = this.navItems[sections[i].id];
      if (!item) {
        continue;
      }
      if (sections[i].id === this.section) {
        item.classList.add('current');
      } else {
        item.classList.remove('current');
      }
    }
  };

  /* ----------------------------------------------------------- page stack */

  App.prototype.page = function () {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  };

  App.prototype.push = function (page) {
    var top = this.page();
    if (top) {
      top.hide();
    }
    this.pagesEl.appendChild(page.el);
    this.stack.push(page);
    page.show();
  };

  App.prototype.pop = function () {
    if (this.stack.length <= 1) {
      return false;
    }
    var removed = this.stack.pop();
    removed.hide();
    removed.dispose();
    var top = this.page();
    if (top) {
      top.focusArmed = false;
      top.show();
    }
    return true;
  };

  App.prototype.go = function (sectionId) {
    if (!HT.api.isConfigured()) {
      return;
    }

    while (this.stack.length > 1) {
      var removed = this.stack.pop();
      removed.hide();
      removed.dispose();
    }

    var base = this.stack[0];
    this.section = sectionId;
    this.updateSidebar();

    if (sectionId === 'home') {
      if (base) {
        base.focusArmed = false;
        base.show();
      }
      return;
    }

    var page = this.sectionPage(sectionId);
    if (page) {
      this.push(page);
    }
  };

  App.prototype.sectionPage = function (sectionId) {
    var nav = this;
    if (sectionId === 'search') {
      return new HT.screens.SearchPage(nav);
    }
    if (sectionId === 'longs') {
      return new HT.screens.GridPage(nav, {
        title: 'Longs',
        subtitle: 'Every video over an hour. The opposite of Shorts.',
        filters: { dur: 'xlong' }
      });
    }
    if (sectionId === 'liked') {
      return new HT.screens.GridPage(nav, {
        title: 'Liked videos',
        savedKind: 'liked',
        empty: 'Videos you like will show up here, and shape your Home feed.'
      });
    }
    if (sectionId === 'history') {
      return new HT.screens.GridPage(nav, {
        title: 'History',
        savedKind: 'history',
        empty: 'Videos you open will show up here.'
      });
    }
    if (sectionId === 'later') {
      return new HT.screens.GridPage(nav, {
        title: 'Watch later',
        savedKind: 'later',
        empty: 'Hold OK on a video, then choose Watch later to save it here.'
      });
    }
    if (sectionId === 'categories') {
      return new HT.screens.CategoriesPage(nav);
    }
    if (sectionId === 'playlists') {
      return new HT.screens.PlaylistsPage(nav);
    }
    return null;
  };

  App.prototype.open = function (page) {
    this.push(page);
  };

  App.prototype.openDetails = function (video) {
    this.push(new HT.screens.DetailsPage(this, video));
  };

  App.prototype.openFocusedDetails = function () {
    var element = HT.Focus.element();
    if (element && element.__video) {
      this.openDetails(element.__video);
    }
  };

  App.prototype.play = function (video) {
    this.disarmFocus();
    this.library.markSeen(video.vid);
    if (HT.player && HT.player.available()) {
      this.push(new HT.player.PlayerPage(this, video));
      return;
    }
    this.openYouTube(video);
  };

  App.prototype.openYouTube = function (video) {
    var top = this.page();
    if (top && top.isPlayer) {
      this.pop();
    }
    this.library.markSeen(video.vid);
    var opened = HT.youtube.open(video.vid, function () {
      HT.ui.toast('Could not open YouTube. Make sure the YouTube app is ' +
        'installed and up to date.');
    });
    if (!opened) {
      HT.ui.toast('On your TV, this opens the YouTube app. (Browser preview.)');
      if (window.console && window.console.log) {
        window.console.log('Play on YouTube: https://www.youtube.com/watch?v=' +
          video.vid);
      }
    }
  };

  App.prototype.back = function () {
    var toast = document.getElementById('toast');
    if (toast && toast.classList.contains('show')) {
      toast.classList.remove('show');
      return;
    }

    var top = this.page();
    if (top && top.closeKeyboard && top.closeKeyboard()) {
      return;
    }
    if (!this.pop()) {
      this.exit();
    }
  };

  App.prototype.exit = function () {
    if (window.tizen && window.tizen.application) {
      try {
        window.tizen.application.getCurrentApplication().exit();
        return;
      } catch (error) {
        /* fall through */
      }
    }
    HT.ui.toast('Back would close the app on your TV.');
  };

  App.prototype.disarmFocus = function () {
    var top = this.page();
    if (top) {
      top.disarm();
    }
  };

  App.prototype.onResume = function () {
    var top = this.page();
    if (top && top.onResume) {
      top.onResume();
    }
  };

  /* --------------------------------------------------------------- keys */

  App.prototype.bindKeys = function () {
    var self = this;

    registerKeys();

    document.addEventListener('keydown', function (event) {
      self.onKeyDown(event);
    });
    document.addEventListener('keyup', function (event) {
      self.onKeyUp(event);
    });
    document.addEventListener('focusin', function (event) {
      var focusable = HT.Focus.closest(event.target, '.focusable');
      if (focusable && focusable !== HT.Focus.element()) {
        HT.Focus.set(focusable);
      }
    });

    window.addEventListener('focus', function () {
      self.onResume();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        self.onResume();
      }
    });
  };

  App.prototype.onKeyDown = function (event) {
    var key = event.keyCode;
    var top = this.page();

    /* A full-screen player owns the remote while it is on top. */
    if (top && top.handleKey && top.handleKey(event)) {
      return;
    }

    if (HT.Focus.isTextInput(event.target)) {
      if (key === 10009 || key === 27 || key === 461) {
        event.preventDefault();
        this.back();
      }
      return;
    }

    if (key === 37 || key === 38 || key === 39 || key === 40) {
      event.preventDefault();
      this.cancelEnter();
      this.disarmFocus();
      HT.Focus.move(key === 37 ? 'left' : key === 38 ? 'up' :
        key === 39 ? 'right' : 'down');
      return;
    }

    if (key === 13) {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      this.beginEnter();
      return;
    }

    if (key === 10009 || key === 27 || key === 461) {
      event.preventDefault();
      this.cancelEnter();
      this.back();
      return;
    }

    if (key === 457) {
      event.preventDefault();
      this.openFocusedDetails();
      return;
    }

    /* Colour keys are a small bonus for people who know them. */
    if (key === 403) {
      event.preventDefault();
      this.go('home');
    } else if (key === 404) {
      event.preventDefault();
      this.go('search');
    } else if (key === 405) {
      event.preventDefault();
      this.go('later');
    } else if (key === 406) {
      event.preventDefault();
      this.go('categories');
    }
  };

  App.prototype.cancelEnter = function () {
    if (this.enterPress) {
      window.clearTimeout(this.enterPress.timer);
      this.enterPress = null;
    }
  };

  App.prototype.beginEnter = function () {
    var self = this;
    var element = HT.Focus.element();
    if (!element) {
      return;
    }

    /* Some TV firmwares repeat keydown without setting event.repeat. Keep the
       first press (and its long-press timer) instead of restarting it. */
    if (this.enterPress && this.enterPress.element === element) {
      return;
    }

    this.cancelEnter();
    this.disarmFocus();

    var press = { element: element, long: false, timer: null };
    press.timer = window.setTimeout(function () {
      if (self.enterPress !== press) {
        return;
      }
      press.long = true;
      if (element.__video && element.getAttribute('data-long') === 'details') {
        self.openDetails(element.__video);
      }
    }, 600);

    this.enterPress = press;
  };

  App.prototype.onKeyUp = function (event) {
    if (event.keyCode !== 13 || !this.enterPress) {
      return;
    }
    event.preventDefault();

    var press = this.enterPress;
    this.enterPress = null;
    window.clearTimeout(press.timer);

    if (press.long) {
      return;
    }

    var element = press.element;
    if (!HT.Focus.visible(element)) {
      return;
    }
    if (element.__video && element.getAttribute('data-long') === 'details') {
      this.play(element.__video);
    } else if (element.click) {
      element.click();
    }
  };

  function registerKeys() {
    if (!window.tizen || !window.tizen.tvinputdevice) {
      return;
    }
    var keys = [
      'KEY_LEFT', 'KEY_RIGHT', 'KEY_UP', 'KEY_DOWN', 'KEY_ENTER',
      'KEY_RETURN', 'KEY_INFO', 'KEY_PLAY', 'KEY_PAUSE', 'KEY_PLAY_PAUSE',
      'KEY_RED', 'KEY_GREEN', 'KEY_YELLOW', 'KEY_BLUE'
    ];
    for (var i = 0; i < keys.length; i++) {
      try {
        window.tizen.tvinputdevice.registerKey(keys[i]);
      } catch (error) {
        /* Not every firmware knows every key name. */
      }
    }
  }

  HT.App = App;

  function boot() {
    HT.app = new App();
    HT.app.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

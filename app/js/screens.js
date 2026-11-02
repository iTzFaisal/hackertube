/* Screens and their data. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var h = HT.dom.h;
  var clear = HT.dom.clear;
  var ui = HT.ui;
  var F = HT.format;
  var pageSeq = 0;

  /* ---------------------------------------------------------------- feed */

  function Feed(loader) {
    this.loader = loader;
    this.videos = [];
    this.offset = 0;
    this.done = false;
    this.loading = false;
    this.error = null;
  }

  Feed.prototype.load = function () {
    var self = this;
    if (this.loading || this.done) {
      return Promise.resolve();
    }
    this.loading = true;
    this.error = null;

    var count = this.offset === 0 ? 12 : 24;
    var request;
    try {
      request = this.loader(this.offset, count);
    } catch (error) {
      request = Promise.reject(error);
    }

    return request.then(function (page) {
      if (!page) {
        page = [];
      }
      self.offset += page.length;
      self.done = page.length === 0;

      var known = {};
      for (var i = 0; i < self.videos.length; i++) {
        known[self.videos[i].vid] = true;
      }
      for (i = 0; i < page.length; i++) {
        if (!known[page[i].vid]) {
          known[page[i].vid] = true;
          self.videos.push(page[i]);
        }
      }
    }).catch(function (error) {
      self.error = error;
    }).then(function () {
      self.loading = false;
    });
  };

  Feed.prototype.reset = function (loader) {
    if (loader) {
      this.loader = loader;
    }
    this.videos = [];
    this.offset = 0;
    this.done = false;
    this.loading = false;
    this.error = null;
  };

  /* ----------------------------------------------------------- feed view */

  function FeedView(page, feed, opts) {
    this.page = page;
    this.feed = feed;
    this.opts = opts || {};
    this.container = this.opts.container;
    this.status = this.opts.status;
    this.rendered = 0;
    this.busy = false;
    this.watchScroll();
  }

  FeedView.prototype.watchScroll = function () {
    var self = this;
    var ticking = false;
    this.page.scrollEl.addEventListener('scroll', function () {
      if (ticking) {
        return;
      }
      ticking = true;
      window.setTimeout(function () {
        ticking = false;
        var scroller = self.page.scrollEl;
        if (scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 900) {
          self.load();
        }
      }, 120);
    });
  };

  FeedView.prototype.setFeed = function (feed) {
    this.feed = feed;
    this.rendered = 0;
    this.busy = false;
    clear(this.container);
    clear(this.status);
    this.updateStatus();
  };

  FeedView.prototype.load = function () {
    var self = this;
    if (this.busy || !this.feed) {
      return;
    }
    this.busy = true;
    var request = this.feed.load();
    this.updateStatus();

    request.then(function () {
      self.busy = false;
      self.append();
      self.updateStatus();
      if (self.feed.videos.length && self.opts.onLoaded) {
        self.opts.onLoaded(self.feed);
      }

      var current = HT.Focus.element();
      if (self.feed.videos.length && (!current || !HT.Focus.visible(current))) {
        var first = self.container.querySelector('.card');
        if (first) {
          HT.Focus.set(first);
        }
      }
      self.fill();
    });
  };

  FeedView.prototype.append = function () {
    var self = this;
    for (var i = this.rendered; i < this.feed.videos.length; i++) {
      var video = this.feed.videos[i];
      this.container.appendChild(ui.videoCard(video, {
        onPlay: function (item) {
          self.page.nav.play(item);
        },
        onDetails: function (item) {
          self.page.nav.openDetails(item);
        }
      }));
    }
    this.rendered = this.feed.videos.length;
  };

  FeedView.prototype.updateStatus = function () {
    var self = this;
    if (!this.status) {
      return;
    }
    clear(this.status);

    if (this.feed.error) {
      this.status.appendChild(ui.failure(this.feed.error, function () {
        self.load();
      }, 'retry:feed'));
      var retry = this.status.querySelector('.pill');
      if (retry && (!this.feed.videos.length ||
          !HT.Focus.visible(HT.Focus.element()))) {
        HT.Focus.set(retry);
      }
    } else if (this.feed.loading && !this.feed.videos.length) {
      this.status.appendChild(ui.loading());
    } else if (this.feed.loading) {
      this.status.appendChild(ui.loading('Loading more\u2026'));
    } else if (this.feed.done && !this.feed.videos.length) {
      this.status.appendChild(ui.empty(this.opts.empty || 'Nothing here yet.'));
    }
  };

  FeedView.prototype.fill = function () {
    var scroller = this.page.scrollEl;
    if (!this.feed.done && !this.feed.loading && !this.feed.error &&
        scroller.scrollHeight <= scroller.clientHeight + 20) {
      this.load();
    }
  };

  /* ----------------------------------------------------------------- page */

  function Page(id, nav) {
    pageSeq++;
    this.id = id + '-' + pageSeq;
    this.nav = nav;
    this.el = h('div', { class: 'page', 'data-page': this.id });
    this.scrollEl = h('div', { class: 'page-scroll' });
    this.el.appendChild(this.scrollEl);
    this.el.__page = this;
    this.lastFocus = null;
    this.savedScroll = 0;
    this.focusArmed = true;
    this.active = false;
  }

  Page.prototype.show = function () {
    var self = this;
    this.active = true;
    this.el.classList.add('active');
    this.scrollEl.scrollTop = this.savedScroll;
    if (this.onShow) {
      this.onShow();
    }
    window.setTimeout(function () {
      if (!self.active) {
        return;
      }
      self.restoreFocus();
    }, 0);
  };

  Page.prototype.hide = function () {
    this.active = false;
    this.savedScroll = this.scrollEl.scrollTop;
    this.el.classList.remove('active');
    this.focusArmed = false;
    var current = HT.Focus.element();
    if (current && this.el.contains(current)) {
      var key = current.getAttribute('data-key');
      if (key) {
        this.lastFocus = key;
      }
    }
  };

  Page.prototype.restoreFocus = function () {
    var target = this.lastFocus ? HT.Focus.findKey(this.el, this.lastFocus) : null;
    if (!target) {
      target = HT.Focus.firstIn(this.el);
    }
    if (target) {
      HT.Focus.set(target);
      return true;
    }
    return false;
  };

  Page.prototype.disarm = function () {
    this.focusArmed = false;
  };

  Page.prototype.focusIfLost = function (node) {
    var current = HT.Focus.element();
    if (this.active && (!current || !HT.Focus.visible(current))) {
      return HT.Focus.set(node || HT.Focus.firstIn(this.el));
    }
    return false;
  };

  Page.prototype.maybeFocus = function (node) {
    if (!this.focusArmed || !node) {
      return false;
    }
    var current = HT.Focus.element();
    if (!current || !HT.Focus.visible(current) ||
        (current.classList && current.classList.contains('nav-item')) ||
        this.el.contains(current)) {
      this.focusArmed = false;
      return HT.Focus.set(node);
    }
    return false;
  };

  Page.prototype.dispose = function () {
    HT.Focus.release(this.el);
    clear(this.el);
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  };

  Page.prototype.play = function (video) {
    this.nav.play(video);
  };

  Page.prototype.details = function (video) {
    this.nav.openDetails(video);
  };

  /* ----------------------------------------------------------------- home */

  function HomePage(nav, library) {
    Page.call(this, 'home', nav);
    this.library = library;
    this.seed = Math.floor(Math.random() * 1000000);
    this.area = null;
    this.areas = [];
    this.build();
    this.load();
  }

  HomePage.prototype = Object.create(Page.prototype);
  HomePage.prototype.constructor = HomePage;

  HomePage.prototype.build = function () {
    this.scrollEl.appendChild(ui.homeHead());

    this.chipsEl = h('div', { class: 'chip-row' });
    this.scrollEl.appendChild(this.chipsEl);
    this.renderChips();

    this.gridEl = h('div', { class: 'grid' });
    this.scrollEl.appendChild(this.gridEl);

    this.statusEl = h('div', { class: 'grid-status' });
    this.scrollEl.appendChild(this.statusEl);

    var self = this;
    this.feed = new Feed(function (offset, n) {
      if (self.area) {
        return HT.api.list({ area: self.area.id }, offset, n);
      }
      return HT.api.feed(self.library, self.seed, offset, n);
    });

    this.feedView = new FeedView(this, this.feed, {
      container: this.gridEl,
      status: this.statusEl,
      empty: 'No videos match these filters.',
      onLoaded: function () {
        if (self.focusArmed) {
          var first = self.gridEl.querySelector('.card');
          if (first) {
            self.maybeFocus(first);
          }
        }
      }
    });
  };

  HomePage.prototype.load = function () {
    var self = this;
    HT.api.areas().then(function (areas) {
      self.areas = areas || [];
      self.renderChips();
    }).catch(function () {
      /* The feed still works without the area chips. */
    });
    this.feedView.load();
  };

  HomePage.prototype.renderChips = function () {
    var self = this;
    var current = HT.Focus.element();
    var currentKey = current && this.chipsEl.contains(current) ?
      current.getAttribute('data-key') : null;

    clear(this.chipsEl);

    var all = ui.chip('All', {
      key: 'home:all',
      selected: !this.area,
      onClick: function () {
        self.setArea(null);
      }
    });
    all.setAttribute('data-area', '');
    this.chipsEl.appendChild(all);

    for (var i = 0; i < this.areas.length; i++) {
      (function (area) {
        var chip = ui.chip(area.name, {
          key: 'home:area:' + area.id,
          selected: self.area && self.area.id === area.id,
          onClick: function () {
            self.setArea(area);
          }
        });
        chip.setAttribute('data-area', area.id);
        self.chipsEl.appendChild(chip);
      })(this.areas[i]);
    }

    if (currentKey) {
      var again = HT.Focus.findKey(this.chipsEl, currentKey);
      if (again) {
        HT.Focus.set(again);
      }
    }
  };

  HomePage.prototype.setArea = function (area) {
    if ((!area && !this.area) || (area && this.area && area.id === this.area.id)) {
      return;
    }
    this.area = area;
    this.disarm();

    var chips = this.chipsEl.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      var id = chips[i].getAttribute('data-area');
      if ((!area && !id) || (area && id === area.id)) {
        chips[i].classList.add('selected');
      } else {
        chips[i].classList.remove('selected');
      }
    }

    var self = this;
    this.feed = new Feed(function (offset, n) {
      if (self.area) {
        return HT.api.list({ area: self.area.id }, offset, n);
      }
      return HT.api.feed(self.library, self.seed, offset, n);
    });
    this.feedView.setFeed(this.feed);
    this.scrollEl.scrollTop = 0;
    this.feedView.load();
  };

  /* ------------------------------------------------------------- grid page */

  function GridPage(nav, opts) {
    Page.call(this, 'grid', nav);
    opts = opts || {};
    this.title = opts.title || 'Videos';
    this.crumb = opts.crumb || '';
    this.subtitle = opts.subtitle || '';
    this.filters = opts.filters || null;
    this.savedKind = opts.savedKind || null;
    this.emptyText = opts.empty || 'No videos match these filters.';
    this.revision = HT.library.revision;
    this.build();
    this.load();
  }

  GridPage.prototype = Object.create(Page.prototype);
  GridPage.prototype.constructor = GridPage;

  GridPage.prototype.build = function () {
    this.scrollEl.appendChild(ui.pageHead(this.title, this.crumb, this.subtitle));
    this.gridEl = h('div', { class: 'grid' });
    this.scrollEl.appendChild(this.gridEl);
    this.statusEl = h('div', { class: 'grid-status' });
    this.scrollEl.appendChild(this.statusEl);

    var self = this;
    this.feed = new Feed(function (offset, n) {
      return self.loader(offset, n);
    });

    this.feedView = new FeedView(this, this.feed, {
      container: this.gridEl,
      status: this.statusEl,
      empty: this.emptyText,
      onLoaded: function () {
        if (self.focusArmed) {
          var first = self.gridEl.querySelector('.card');
          if (first) {
            self.maybeFocus(first);
          }
        }
      }
    });
  };

  GridPage.prototype.loader = function (offset, n) {
    if (this.savedKind) {
      var vids = HT.library.saved(this.savedKind);
      return HT.api.docs(vids.slice(offset, offset + n));
    }
    return HT.api.list(this.filters, offset, n);
  };

  GridPage.prototype.load = function () {
    this.revision = HT.library.revision;
    this.feedView.load();
  };

  GridPage.prototype.refresh = function () {
    this.revision = HT.library.revision;
    this.feed.reset();
    this.feedView.setFeed(this.feed);
    this.lastFocus = null;
    this.focusArmed = true;
    this.feedView.load();
  };

  GridPage.prototype.onShow = function () {
    if (this.savedKind && this.revision !== HT.library.revision) {
      this.refresh();
    }
  };

  GridPage.prototype.onResume = function () {
    if (this.savedKind && this.revision !== HT.library.revision) {
      this.refresh();
    }
  };

  /* --------------------------------------------------------------- search */

  function SearchPage(nav) {
    Page.call(this, 'search', nav);
    this.query = '';
    this.results = null;
    this.error = null;
    this.loading = false;
    this.lastQuery = '';
    this.seq = 0;
    this.timer = null;
    this.blurring = false;
    this.pendingFocus = false;
    this.build();
  }

  SearchPage.prototype = Object.create(Page.prototype);
  SearchPage.prototype.constructor = SearchPage;

  SearchPage.prototype.build = function () {
    var self = this;
    this.scrollEl.appendChild(ui.pageHead(
      'Search',
      null,
      'Search the videos Hacker News recommends, by words or by meaning.'
    ));

    this.input = h('input', {
      type: 'text',
      class: 'search-input focusable',
      'data-key': 'search:input',
      placeholder: 'Search',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Search videos'
    });

    var box = h('div', { class: 'search-box' }, [
      HT.dom.icon('search', 26),
      this.input
    ]);

    this.go = ui.pill('Search', {
      key: 'search:go',
      className: 'search-button',
      onClick: function () {
        self.searchNow(true);
      }
    });

    this.bar = h('div', { class: 'search-bar' }, [box, this.go]);
    this.scrollEl.appendChild(this.bar);

    this.hint = h('div', { class: 'search-hint', text:
      'Type with the TV keyboard and press Done to search. Back closes the keyboard.' });
    this.scrollEl.appendChild(this.hint);

    this.resultsEl = h('div', { class: 'search-results' });
    this.scrollEl.appendChild(this.resultsEl);

    this.input.addEventListener('keydown', function (event) {
      if (event.keyCode === 13) {
        event.preventDefault();
        self.searchNow(true);
      }
    });

    this.input.addEventListener('change', function () {
      if (self.blurring) {
        return;
      }
      var value = self.input.value.replace(/^\s+|\s+$/g, '');
      if (value === self.lastQuery) {
        return;
      }
      var active = document.activeElement === self.input;
      self.searchNow(active);
    });

    this.input.addEventListener('input', function () {
      self.query = self.input.value;
      if (self.timer) {
        window.clearTimeout(self.timer);
      }
      var q = self.query.replace(/^\s+|\s+$/g, '');
      if (q.length >= 3) {
        self.timer = window.setTimeout(function () {
          self.searchNow(false);
        }, 1200);
      }
    });

    this.renderResults();
  };

  SearchPage.prototype.searchNow = function (moveFocus) {
    var self = this;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    var q = String(this.input.value || '').replace(/^\s+|\s+$/g, '');
    this.query = q;
    if (q.length < 2) {
      this.results = null;
      this.error = null;
      this.loading = false;
      this.lastQuery = '';
      this.pendingFocus = false;
      this.renderResults();
      if (q.length === 1) {
        ui.toast('Type at least 2 characters.');
      }
      return;
    }

    if (q === this.lastQuery && this.results !== null && !this.error) {
      if (moveFocus) {
        this.focusFirstResult();
      }
      return;
    }

    if (q === this.lastQuery && this.loading) {
      if (moveFocus) {
        this.pendingFocus = true;
      }
      return;
    }

    this.lastQuery = q;
    this.seq++;
    var seq = this.seq;
    this.results = null;
    this.error = null;
    this.loading = true;

    if (moveFocus) {
      this.blurring = true;
      this.input.blur();
      this.blurring = false;
    }

    this.renderResults();

    HT.api.search(q).then(function (results) {
      if (seq !== self.seq) {
        return;
      }
      self.results = results || [];
      self.loading = false;
      self.renderResults();
      if (moveFocus || self.pendingFocus) {
        self.pendingFocus = false;
        self.focusFirstResult();
      }
    }).catch(function (error) {
      if (seq !== self.seq) {
        return;
      }
      self.error = error;
      self.loading = false;
      self.renderResults();
      if (moveFocus || self.pendingFocus) {
        self.pendingFocus = false;
        var retry = self.resultsEl.querySelector('.pill');
        if (retry) {
          HT.Focus.set(retry);
        } else {
          HT.Focus.set(self.go);
        }
      }
    });
  };

  SearchPage.prototype.renderResults = function () {
    var self = this;
    var current = HT.Focus.element();
    var previousKey = current && this.resultsEl.contains(current) ?
      current.getAttribute('data-key') : null;

    clear(this.resultsEl);

    if (this.loading) {
      this.resultsEl.appendChild(ui.loading('Searching\u2026'));
    } else if (this.error) {
      this.resultsEl.appendChild(ui.failure(this.error, function () {
        self.searchNow(true);
      }, 'retry:search'));
    } else if (this.results === null) {
      this.resultsEl.appendChild(ui.empty(
        'Search the videos Hacker News recommends, by words or by meaning.'
      ));
    } else if (!this.results.length) {
      this.resultsEl.appendChild(ui.empty('No results.'));
    } else {
      this.resultsEl.appendChild(h('div', { class: 'rows' }, this.results.map(function (video) {
        return ui.videoRow(video, {
          key: 'search:' + video.vid,
          onPlay: function (item) {
            self.nav.play(item);
          },
          onDetails: function (item) {
            self.nav.openDetails(item);
          }
        });
      })));
    }

    if (previousKey) {
      var again = HT.Focus.findKey(this.resultsEl, previousKey);
      if (again) {
        HT.Focus.set(again);
      }
    }
  };

  SearchPage.prototype.focusFirstResult = function () {
    var first = this.resultsEl.querySelector('.row');
    if (first) {
      HT.Focus.set(first);
      return;
    }
    var retry = this.resultsEl.querySelector('.pill');
    if (retry) {
      HT.Focus.set(retry);
      return;
    }
    HT.Focus.set(this.go);
  };

  SearchPage.prototype.closeKeyboard = function () {
    if (document.activeElement === this.input) {
      this.input.blur();
      var first = this.resultsEl.querySelector('.row');
      HT.Focus.set(first || this.go);
      return true;
    }
    return false;
  };

  SearchPage.prototype.dispose = function () {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.seq++;
    Page.prototype.dispose.call(this);
  };

  /* ----------------------------------------------------------- categories */

  var quickLinks = [
    { title: 'Recently recommended', filters: { sort: 'recent' } },
    { title: 'Longs', filters: { dur: 'xlong' } },
    { title: 'Hidden gems', filters: { gems: '1' } },
    { title: 'All videos', filters: {} }
  ];

  function CategoriesPage(nav) {
    Page.call(this, 'categories', nav);
    this.areas = null;
    this.error = null;
    this.build();
    this.load();
  }

  CategoriesPage.prototype = Object.create(Page.prototype);
  CategoriesPage.prototype.constructor = CategoriesPage;

  CategoriesPage.prototype.build = function () {
    var self = this;
    this.scrollEl.appendChild(ui.pageHead('Categories'));

    this.quickEl = h('div', { class: 'quick-links' });
    for (var i = 0; i < quickLinks.length; i++) {
      (function (link, index) {
        self.quickEl.appendChild(ui.pill(link.title, {
          key: 'quick:' + index,
          onClick: function () {
            self.nav.open(new GridPage(self.nav, {
              title: link.title,
              filters: link.filters,
              section: 'categories'
            }));
          }
        }));
      })(quickLinks[i], i);
    }
    this.scrollEl.appendChild(this.quickEl);

    this.areasEl = h('div');
    this.scrollEl.appendChild(this.areasEl);
  };

  CategoriesPage.prototype.load = function () {
    var self = this;
    this.error = null;
    clear(this.areasEl);
    this.areasEl.appendChild(ui.loading());

    HT.api.areas().then(function (areas) {
      self.areas = areas || [];
      self.render();
    }).catch(function (error) {
      self.error = error;
      self.render();
    });
  };

  CategoriesPage.prototype.render = function () {
    var self = this;
    clear(this.areasEl);

    if (this.error) {
      this.areasEl.appendChild(ui.failure(this.error, function () {
        self.load();
      }, 'retry:categories'));
      return;
    }

    if (!this.areas || !this.areas.length) {
      this.areasEl.appendChild(ui.empty('No categories right now.'));
      return;
    }

    for (var i = 0; i < this.areas.length; i++) {
      (function (area) {
        var block = h('div', { class: 'area-block' });
        block.appendChild(h('div', { class: 'area-head' }, [
          h('h2', { class: 'area-name', text: area.name }),
          h('span', {
            class: 'area-count',
            text: F.count(area.count) + ' videos'
          })
        ]));

        var wrap = h('div', { class: 'chip-wrap' });
        for (var j = 0; j < area.categories.length; j++) {
          (function (category) {
            wrap.appendChild(ui.chip(category.name, {
              key: 'cat:' + category.id,
              trailing: F.count(category.count),
              onClick: function () {
                self.nav.open(new GridPage(self.nav, {
                  title: category.name,
                  crumb: area.name,
                  filters: { cat: category.id },
                  section: 'categories'
                }));
              }
            }));
          })(area.categories[j]);
        }
        block.appendChild(wrap);
        self.areasEl.appendChild(block);
      })(this.areas[i]);
    }

    this.focusIfLost(this.quickEl.querySelector('.pill') ||
      this.areasEl.querySelector('.chip'));
  };

  /* ------------------------------------------------------------ playlists */

  function PlaylistsPage(nav) {
    Page.call(this, 'playlists', nav);
    this.playlists = null;
    this.error = null;
    this.build();
    this.load();
  }

  PlaylistsPage.prototype = Object.create(Page.prototype);
  PlaylistsPage.prototype.constructor = PlaylistsPage;

  PlaylistsPage.prototype.build = function () {
    this.scrollEl.appendChild(ui.pageHead(
      'Playlists',
      null,
      'Curated by Claude from what Hacker News recommends, each in a deliberate order.'
    ));
    this.listEl = h('div');
    this.scrollEl.appendChild(this.listEl);
  };

  PlaylistsPage.prototype.load = function () {
    var self = this;
    this.error = null;
    clear(this.listEl);
    this.listEl.appendChild(ui.loading());

    HT.api.playlists().then(function (playlists) {
      self.playlists = playlists || [];
      self.render();
    }).catch(function (error) {
      self.error = error;
      self.render();
    });
  };

  PlaylistsPage.prototype.render = function () {
    var self = this;
    clear(this.listEl);

    if (this.error) {
      this.listEl.appendChild(ui.failure(this.error, function () {
        self.load();
      }, 'retry:playlists'));
      return;
    }

    if (!this.playlists || !this.playlists.length) {
      this.listEl.appendChild(ui.empty('No playlists right now.'));
      return;
    }

    var tiers = [
      { id: 'start', title: 'Start here', blurb: 'Broad, essential lists for your first visit.' },
      { id: 'deep', title: 'Deep dives', blurb: 'One obsession each, for when you want to go down a rabbit hole.' }
    ];
    var known = {};
    var firstTile = null;

    for (var t = 0; t < tiers.length; t++) {
      var shelf = [];
      for (var i = 0; i < this.playlists.length; i++) {
        var tier = this.playlists[i].tier || 'deep';
        if (tier === tiers[t].id) {
          shelf.push(this.playlists[i]);
          known[this.playlists[i].slug] = true;
        }
      }
      if (!shelf.length) {
        continue;
      }

      var block = h('div', { class: 'tier' }, [
        h('h2', { class: 'tier-title', text: tiers[t].title }),
        h('p', { class: 'tier-blurb', text: tiers[t].blurb })
      ]);
      var grid = h('div', { class: 'tile-grid' });

      for (i = 0; i < shelf.length; i++) {
        (function (playlist) {
          var tile = h('div', {
            class: 'tile focusable',
            'data-key': 'playlist:' + playlist.slug,
            role: 'button'
          });
          var cover = ui.mosaic(playlist.cover);
          cover.appendChild(h('div', {
            class: 'badge',
            style: { right: '10px', bottom: '10px' },
            text: playlist.count + ' videos'
          }));
          tile.appendChild(cover);
          tile.appendChild(h('div', { class: 'tile-title', text: playlist.title }));
          tile.appendChild(h('div', {
            class: 'tile-sub',
            text: F.hours(playlist.minutes) + ' \u00b7 ' + playlist.count + ' videos'
          }));
          tile.addEventListener('click', function () {
            self.nav.open(new PlaylistPage(self.nav, playlist.slug));
          });
          grid.appendChild(tile);
          if (!firstTile) {
            firstTile = tile;
          }
        })(shelf[i]);
      }

      block.appendChild(grid);
      this.listEl.appendChild(block);
    }

    for (i = 0; i < this.playlists.length; i++) {
      if (!known[this.playlists[i].slug]) {
        var other = this.playlists[i];
        var otherBlock = h('div', { class: 'tier' }, [
          h('h2', { class: 'tier-title', text: F.label(other.tier || 'More') })
        ]);
        var otherGrid = h('div', { class: 'tile-grid' });
        (function (playlist) {
          var tile = h('div', {
            class: 'tile focusable',
            'data-key': 'playlist:' + playlist.slug,
            role: 'button'
          });
          var cover = ui.mosaic(playlist.cover);
          cover.appendChild(h('div', {
            class: 'badge',
            style: { right: '10px', bottom: '10px' },
            text: playlist.count + ' videos'
          }));
          tile.appendChild(cover);
          tile.appendChild(h('div', { class: 'tile-title', text: playlist.title }));
          tile.appendChild(h('div', {
            class: 'tile-sub',
            text: F.hours(playlist.minutes) + ' \u00b7 ' + playlist.count + ' videos'
          }));
          tile.addEventListener('click', function () {
            self.nav.open(new PlaylistPage(self.nav, playlist.slug));
          });
          otherGrid.appendChild(tile);
          if (!firstTile) {
            firstTile = tile;
          }
        })(other);
        otherBlock.appendChild(otherGrid);
        this.listEl.appendChild(otherBlock);
      }
    }

    if (firstTile && this.focusArmed) {
      this.maybeFocus(firstTile);
    }
    this.focusIfLost(firstTile);
  };

  /* ------------------------------------------------------------- playlist */

  function PlaylistPage(nav, slug) {
    Page.call(this, 'playlist', nav);
    this.slug = slug;
    this.playlist = null;
    this.error = null;
    this.build();
    this.load();
  }

  PlaylistPage.prototype = Object.create(Page.prototype);
  PlaylistPage.prototype.constructor = PlaylistPage;

  PlaylistPage.prototype.build = function () {
    this.scrollEl.appendChild(ui.loading());
  };

  PlaylistPage.prototype.load = function () {
    var self = this;
    clear(this.scrollEl);
    this.scrollEl.appendChild(ui.loading());

    HT.api.playlist(this.slug).then(function (playlist) {
      self.playlist = playlist;
      self.render();
    }).catch(function (error) {
      self.error = error;
      self.render();
    });
  };

  PlaylistPage.prototype.render = function () {
    var self = this;
    clear(this.scrollEl);

    if (this.error) {
      this.scrollEl.appendChild(ui.pageHead('Playlist'));
      this.scrollEl.appendChild(ui.failure(this.error, function () {
        self.load();
      }, 'retry:playlist'));
      return;
    }

    var playlist = this.playlist;
    var head = h('div', { class: 'playlist-head' }, [
      h('div', { class: 'playlist-cover' }, ui.mosaic(playlist.videos.map(function (video) {
        return video.vid;
      }))),
      h('div', { class: 'playlist-info' }, [
        h('div', { class: 'crumb', text: 'Playlists' }),
        h('h1', { class: 'playlist-title', text: playlist.title }),
        h('div', {
          class: 'playlist-meta',
          text: 'Curated by Claude \u00b7 ' + playlist.videos.length + ' videos \u00b7 ' +
            F.hours(playlist.minutes)
        }),
        h('p', {
          class: 'playlist-intro',
          text: playlist.intro || playlist.pitch || ''
        })
      ])
    ]);
    this.scrollEl.appendChild(head);

    var list = h('div', { class: 'rows' });
    for (var i = 0; i < playlist.videos.length; i++) {
      list.appendChild(ui.videoRow(playlist.videos[i], {
        key: 'video:' + playlist.videos[i].vid,
        number: i + 1,
        onPlay: function (video) {
          self.nav.play(video);
        },
        onDetails: function (video) {
          self.nav.openDetails(video);
        }
      }));
    }
    this.scrollEl.appendChild(list);

    var firstRow = list.querySelector('.row');
    if (firstRow && this.focusArmed) {
      this.maybeFocus(firstRow);
    }
    this.focusIfLost(firstRow);
  };

  /* -------------------------------------------------------------- details */

  function DetailsPage(nav, video) {
    Page.call(this, 'details', nav);
    this.video = video;
    this.details = null;
    this.related = null;
    this.detailsError = null;
    this.relatedError = null;
    this.build();
    this.load();
  }

  DetailsPage.prototype = Object.create(Page.prototype);
  DetailsPage.prototype.constructor = DetailsPage;

  DetailsPage.prototype.build = function () {
    this.headerEl = h('div');
    this.scrollEl.appendChild(this.headerEl);
    this.renderHeader();

    this.noticeEl = h('div');
    this.scrollEl.appendChild(this.noticeEl);

    this.bodyEl = h('div', { class: 'details-body' });
    this.scrollEl.appendChild(this.bodyEl);
    this.renderBody();

    this.nextEl = h('div', { class: 'details-section' });
    this.scrollEl.appendChild(this.nextEl);
    this.renderRelated();

    this.commentsEl = h('div', { class: 'details-section' });
    this.scrollEl.appendChild(this.commentsEl);
    this.renderComments();
  };

  DetailsPage.prototype.renderHeader = function () {
    var self = this;
    var video = this.video;
    clear(this.headerEl);

    var thumb = h('div', { class: 'details-thumb' }, ui.thumbnail(video));
    var info = h('div', { class: 'details-info' }, [
      h('h1', { class: 'details-title', text: video.title || '' })
    ]);

    var meta = h('div', { class: 'details-meta' }, [
      h('span', { class: 'details-channel', text: video.channel || '' })
    ]);
    var rec = F.recommendations(video.hn);
    if (rec) {
      meta.appendChild(h('span', { class: 'details-hn', text: rec }));
    }
    info.appendChild(meta);

    this.actionsEl = h('div', { class: 'action-row' });
    info.appendChild(this.actionsEl);
    this.renderActions();

    info.appendChild(h('div', {
      class: 'details-stats',
      text: [F.stats(video, ' \u00b7 '), F.label(video.content_type),
        F.label(video.shelf_life)].filter(function (part) {
        return !!part;
      }).join(' \u00b7 ')
    }));

    this.headerEl.appendChild(h('div', { class: 'details-head' }, [thumb, info]));
  };

  DetailsPage.prototype.renderActions = function () {
    var self = this;
    var video = this.video;
    var current = HT.Focus.element();
    var previousKey = current && this.actionsEl.contains(current) ?
      current.getAttribute('data-key') : null;

    clear(this.actionsEl);

    this.actionsEl.appendChild(ui.pill('Play on YouTube', {
      key: 'play',
      icon: 'play',
      selected: true,
      onClick: function () {
        self.play(video);
      }
    }));

    var liked = HT.library.isLiked(video.vid);
    this.actionsEl.appendChild(ui.pill('Like', {
      key: 'like',
      icon: liked ? 'like_filled' : 'like',
      selected: liked,
      onClick: function () {
        HT.library.like(video.vid);
        self.renderActions();
        ui.updateSavedBadges();
      }
    }));

    var disliked = HT.library.isDisliked(video.vid);
    this.actionsEl.appendChild(ui.pill('Not for me', {
      key: 'dislike',
      icon: disliked ? 'dislike_filled' : 'dislike',
      selected: disliked,
      onClick: function () {
        HT.library.dislike(video.vid);
        self.renderActions();
        ui.updateSavedBadges();
      }
    }));

    var later = HT.library.isLater(video.vid);
    this.actionsEl.appendChild(ui.pill(later ? 'Saved' : 'Watch later', {
      key: 'later',
      icon: later ? 'check' : 'later',
      selected: later,
      onClick: function () {
        HT.library.toggleLater(video.vid);
        self.renderActions();
        ui.updateSavedBadges();
      }
    }));

    if (previousKey) {
      var nodes = this.actionsEl.querySelectorAll('[data-key]');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-key') === previousKey) {
          HT.Focus.set(nodes[i]);
          break;
        }
      }
    }
  };

  DetailsPage.prototype.renderBody = function () {
    var self = this;
    var video = this.video;
    clear(this.bodyEl);

    if (video.summary) {
      this.bodyEl.appendChild(h('p', { class: 'summary', text: video.summary }));
    }
    if (video.why_hn) {
      this.bodyEl.appendChild(h('p', { class: 'why', text: video.why_hn }));
    }

    if (video.categories && video.categories.length) {
      var row = h('div', { class: 'cat-row' });
      for (var i = 0; i < video.categories.length; i++) {
        (function (category) {
          row.appendChild(ui.chip(category.name, {
            key: 'detailcat:' + category.id,
            onClick: function () {
              self.nav.open(new GridPage(self.nav, {
                title: category.name,
                crumb: category.area_name || '',
                filters: { cat: category.id },
                section: 'categories'
              }));
            }
          }));
        })(video.categories[i]);
      }
      this.bodyEl.appendChild(row);
    }
  };

  DetailsPage.prototype.renderRelated = function () {
    var self = this;
    clear(this.nextEl);
    this.nextEl.appendChild(h('h2', { class: 'section-title', text: 'Up next' }));

    if (this.relatedError) {
      this.nextEl.appendChild(ui.failure(this.relatedError, function () {
        self.loadRelated();
      }, 'retry:related'));
      return;
    }
    if (!this.related) {
      this.nextEl.appendChild(ui.loading());
      return;
    }
    if (!this.related.length) {
      this.nextEl.appendChild(ui.empty('No related videos.'));
      return;
    }

    var row = h('div', { class: 'next-row' });
    for (var i = 0; i < this.related.length; i++) {
      (function (video) {
        var card = ui.videoCard(video, {
          key: 'related:' + video.vid,
          onPlay: function (item) {
            self.nav.play(item);
          },
          onDetails: function (item) {
            self.nav.openDetails(item);
          }
        });
        card.className += ' next-card';
        row.appendChild(card);
      })(this.related[i]);
    }
    this.nextEl.appendChild(row);
  };

  DetailsPage.prototype.renderComments = function () {
    var self = this;
    clear(this.commentsEl);

    if (this.detailsError) {
      this.commentsEl.appendChild(ui.failure(this.detailsError, function () {
        self.loadDetails();
      }, 'retry:details'));
      return;
    }

    if (!this.details) {
      this.commentsEl.appendChild(ui.loading());
      return;
    }

    var comments = this.details.comments || [];
    if (!comments.length) {
      return;
    }

    this.commentsEl.appendChild(h('h2', {
      class: 'section-title',
      text: comments.length + ' comment' + (comments.length === 1 ? '' : 's') +
        ' from Hacker News'
    }));
    for (var i = 0; i < comments.length; i++) {
      this.commentsEl.appendChild(ui.commentCard(comments[i]));
    }
  };

  DetailsPage.prototype.load = function () {
    this.loadDetails();
    this.loadRelated();
  };

  DetailsPage.prototype.loadDetails = function () {
    var self = this;
    this.detailsError = null;
    this.details = null;
    this.renderComments();

    HT.api.video(this.video.vid).then(function (details) {
      self.details = details || { video: self.video, comments: [] };
      if (details && details.video) {
        self.video = details.video;
      }
      self.renderComments();
      ui.updateSavedBadges();
      self.restoreFocusAfterLoad();
    }).catch(function (error) {
      self.detailsError = error;
      self.renderComments();
      self.restoreFocusAfterLoad();
    });
  };

  DetailsPage.prototype.loadRelated = function () {
    var self = this;
    this.relatedError = null;
    this.related = null;
    this.renderRelated();

    HT.api.related(this.video.vid).then(function (related) {
      self.related = related || [];
      self.renderRelated();
    }).catch(function (error) {
      self.relatedError = error;
      self.renderRelated();
    });
  };

  DetailsPage.prototype.restoreFocusAfterLoad = function () {
    this.focusIfLost(this.el.querySelector('.pill'));
  };

  DetailsPage.prototype.onShow = function () {
    this.renderActions();
    ui.updateSavedBadges();
  };

  /* ---------------------------------------------------------------- setup */

  function SetupPage(nav) {
    Page.call(this, 'setup', nav);
    this.build();
  }

  SetupPage.prototype = Object.create(Page.prototype);
  SetupPage.prototype.constructor = SetupPage;

  SetupPage.prototype.build = function () {
    this.scrollEl.appendChild(h('div', { class: 'setup' }, [
      h('h1', { text: 'One small setup step' }),
      h('p', { text:
        'HackerTube reads its data from hackertube.org. That server does not allow ' +
        'other origins to read its API, and a Samsung TV app runs as a local file, ' +
        'so the TV cannot call it directly.' }),
      h('p', { text:
        'Deploy the tiny proxy in the proxy folder once. It only forwards /api ' +
        'requests to hackertube.org and adds the missing CORS header.' }),
      h('p', [
        document.createTextNode('From the project folder: '),
        h('code', { text: 'cd proxy && npx wrangler deploy' })
      ]),
      h('p', [
        document.createTextNode('Then build the app with the URL Wrangler prints: '),
        h('code', { text: 'npm run package -- --api https://your-worker.workers.dev' })
      ]),
      h('p', { text:
        'Install the new .wgt file from the dist folder. See README.md for the ' +
        'full install steps.' })
    ]));
  };

  HT.screens = {
    Feed: Feed,
    Page: Page,
    HomePage: HomePage,
    GridPage: GridPage,
    SearchPage: SearchPage,
    CategoriesPage: CategoriesPage,
    PlaylistsPage: PlaylistsPage,
    PlaylistPage: PlaylistPage,
    DetailsPage: DetailsPage,
    SetupPage: SetupPage
  };
})();

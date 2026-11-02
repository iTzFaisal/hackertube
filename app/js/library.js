/* The videos the viewer liked, disliked, saved for later and opened.
 * Like the website, this stays on the TV and only travels to the API to
 * shape the Home feed. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var KEY = 'hackertube.library.v1';
  var MAX_SEEN = 1000;

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function clean(value) {
    var out = [];
    if (!isArray(value)) {
      return out;
    }
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] === 'string' && value[i] && out.indexOf(value[i]) < 0) {
        out.push(value[i]);
      }
    }
    return out;
  }

  function blank() {
    return { liked: [], disliked: [], later: [], seen: [] };
  }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) {
        return blank();
      }
      var data = JSON.parse(raw) || {};
      return {
        liked: clean(data.liked),
        disliked: clean(data.disliked),
        later: clean(data.later),
        seen: clean(data.seen).slice(-MAX_SEEN)
      };
    } catch (error) {
      return blank();
    }
  }

  function persist(data) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (error) {
      /* A TV with storage disabled still works for the current session. */
    }
  }

  function remove(array, value) {
    var index = array.indexOf(value);
    if (index >= 0) {
      array.splice(index, 1);
    }
  }

  function toggle(array, value) {
    var index = array.indexOf(value);
    if (index >= 0) {
      array.splice(index, 1);
    } else {
      array.push(value);
    }
  }

  function Library() {
    var data = read();
    this.liked = data.liked;
    this.disliked = data.disliked;
    this.later = data.later;
    this.seen = data.seen;
    this.revision = 0;
    this.listeners = [];
  }

  Library.prototype.save = function () {
    persist({
      liked: this.liked,
      disliked: this.disliked,
      later: this.later,
      seen: this.seen
    });
    this.revision++;
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](this);
      } catch (error) {
        /* A listener must never break the library. */
      }
    }
  };

  Library.prototype.onChange = function (listener) {
    if (typeof listener === 'function') {
      this.listeners.push(listener);
    }
  };

  Library.prototype.isLiked = function (vid) {
    return this.liked.indexOf(vid) >= 0;
  };

  Library.prototype.isDisliked = function (vid) {
    return this.disliked.indexOf(vid) >= 0;
  };

  Library.prototype.isLater = function (vid) {
    return this.later.indexOf(vid) >= 0;
  };

  Library.prototype.isSeen = function (vid) {
    return this.seen.indexOf(vid) >= 0;
  };

  Library.prototype.like = function (vid) {
    remove(this.disliked, vid);
    toggle(this.liked, vid);
    this.save();
  };

  Library.prototype.dislike = function (vid) {
    remove(this.liked, vid);
    toggle(this.disliked, vid);
    this.save();
  };

  Library.prototype.toggleLater = function (vid) {
    toggle(this.later, vid);
    this.save();
  };

  Library.prototype.markSeen = function (vid) {
    remove(this.seen, vid);
    this.seen.push(vid);
    if (this.seen.length > MAX_SEEN) {
      this.seen.splice(0, this.seen.length - MAX_SEEN);
    }
    this.save();
  };

  /* Newest first, as the saved pages show them. */
  Library.prototype.saved = function (kind) {
    var list = this.seen;
    if (kind === 'liked') {
      list = this.liked;
    } else if (kind === 'later') {
      list = this.later;
    }
    return list.slice().reverse();
  };

  HT.Library = Library;
})();

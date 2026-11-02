/* The JSON API behind hackertube.org.
 *
 * The website calls its own /api paths, so the server never needed CORS
 * headers. A Tizen app runs from a file:// origin, so the build points this
 * at a small proxy (see ../proxy). In development, scripts/dev-server.mjs
 * proxies /api on the same origin.
 */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};

  function HttpError(status, message) {
    this.name = 'HttpError';
    this.status = status;
    this.message = message || ('HTTP ' + status);
  }
  HttpError.prototype = Object.create(Error.prototype);
  HttpError.prototype.constructor = HttpError;

  function config() {
    return window.HACKERTUBE_CONFIG || {};
  }

  function normalizeBase(value) {
    value = String(value || '').replace(/\/+$/, '');
    if (!value) {
      return '';
    }
    if (!/\/api$/i.test(value)) {
      value += '/api';
    }
    return value;
  }

  function base() {
    var configured = normalizeBase(config().apiBase);
    if (configured) {
      return configured;
    }
    if (window.location.protocol === 'file:') {
      return '';
    }
    return 'api';
  }

  function isConfigured() {
    return !!base();
  }

  function buildUrl(path, params) {
    var root = base();
    if (!root) {
      throw new HttpError(-1, 'No API proxy is configured.');
    }

    var query = [];
    if (params) {
      for (var key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
          continue;
        }
        var value = params[key];
        if (value === null || value === undefined || value === '') {
          continue;
        }
        if (Object.prototype.toString.call(value) === '[object Array]') {
          if (!value.length) {
            continue;
          }
          value = value.join(',');
        }
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      }
    }

    return root + '/' + path + (query.length ? '?' + query.join('&') : '');
  }

  function get(path, params) {
    return new Promise(function (resolve, reject) {
      var url;
      try {
        url = buildUrl(path, params);
      } catch (error) {
        reject(error);
        return;
      }

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 45000;
      xhr.setRequestHeader('Accept', 'application/json');

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          var data;
          try {
            data = JSON.parse(xhr.responseText);
          } catch (error) {
            reject(new HttpError(xhr.status, 'The API returned invalid JSON.'));
            return;
          }
          resolve(data);
          return;
        }
        reject(new HttpError(xhr.status));
      };

      xhr.onerror = function () {
        reject(new HttpError(0, 'Could not reach the API.'));
      };

      xhr.ontimeout = function () {
        reject(new HttpError(0, 'The API took too long to answer.'));
      };

      try {
        xhr.send();
      } catch (error) {
        reject(new HttpError(0, error && error.message));
      }
    });
  }

  function feed(library, seed, offset, n) {
    var seen = library.seen.slice(Math.max(0, library.seen.length - 200));
    return get('feed', {
      like: library.liked.join(','),
      dislike: library.disliked.join(','),
      seen: seen.join(','),
      seed: seed,
      offset: offset,
      n: n
    });
  }

  function list(filters, offset, n) {
    var params = {};
    var key;
    if (filters) {
      for (key in filters) {
        if (Object.prototype.hasOwnProperty.call(filters, key)) {
          params[key] = filters[key];
        }
      }
    }
    params.offset = offset;
    params.n = n;
    return get('list', params);
  }

  function search(query) {
    return get('search', { q: query }).then(function (data) {
      return (data && data.results) || [];
    });
  }

  function video(vid) {
    return get('video', { vid: vid });
  }

  function related(vid) {
    return get('related', { vid: vid, n: 20 });
  }

  function docs(vids) {
    if (!vids || !vids.length) {
      return Promise.resolve([]);
    }
    return get('docs', { vids: vids.join(',') });
  }

  function areas() {
    return get('browse');
  }

  function playlists() {
    return get('playlists');
  }

  function playlist(slug) {
    return get('playlist', { slug: slug });
  }

  HT.api = {
    HttpError: HttpError,
    isConfigured: isConfigured,
    base: base,
    feed: feed,
    list: list,
    search: search,
    video: video,
    related: related,
    docs: docs,
    areas: areas,
    playlists: playlists,
    playlist: playlist
  };
})();

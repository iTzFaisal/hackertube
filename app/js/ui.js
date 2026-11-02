/* Reusable TV components. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var h = HT.dom.h;
  var icon = HT.dom.icon;
  var toastTimer = null;

  function imageUrl(vid, size) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(vid) + '/' +
      (size || 'hq2') + '.jpg';
  }

  function saved(vid) {
    return !!(HT.library && HT.library.isLater(vid));
  }

  function makeImage(vid, cls) {
    var img = h('img', {
      src: imageUrl(vid),
      alt: '',
      'data-vid': vid,
      class: cls || ''
    });
    img.addEventListener('error', function () {
      if (!img.getAttribute('data-fallback')) {
        img.setAttribute('data-fallback', '1');
        img.src = imageUrl(vid, 'hqdefault');
      }
    });
    return img;
  }

  function thumbnail(video, extraClass) {
    var wrap = h('div', {
      class: 'thumb ' + (extraClass || ''),
      'data-thumb': video.vid
    });
    wrap.appendChild(makeImage(video.vid));

    var length = HT.format.duration(video.duration_s);
    if (length) {
      wrap.appendChild(h('div', { class: 'badge duration', text: length }));
    }

    var badge = h('div', {
      class: 'badge saved-badge' + (saved(video.vid) ? ' on' : ''),
      'data-saved': video.vid,
      'aria-label': 'In Watch later'
    }, icon('check', 20));
    wrap.appendChild(badge);

    return wrap;
  }

  function videoCard(video, opts) {
    opts = opts || {};
    var key = opts.key || ('video:' + video.vid);
    var card = h('div', {
      class: 'card focusable',
      'data-key': key,
      'data-vid': video.vid,
      'data-long': 'details',
      role: 'button'
    }, [
      thumbnail(video),
      h('div', { class: 'card-title', text: video.title || '' }),
      h('div', { class: 'card-channel', text: video.channel || '' }),
      h('div', { class: 'card-stats', text: HT.format.stats(video) })
    ]);

    card.__video = video;
    card.addEventListener('click', function () {
      if (opts.onPlay) {
        opts.onPlay(video);
      }
    });
    card.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      if (opts.onDetails) {
        opts.onDetails(video);
      }
    });
    return card;
  }

  function videoRow(video, opts) {
    opts = opts || {};
    var key = opts.key || ('video:' + video.vid);
    var row = h('div', {
      class: 'row focusable',
      'data-key': key,
      'data-vid': video.vid,
      'data-long': 'details',
      role: 'button'
    });

    if (opts.number !== null && opts.number !== undefined) {
      row.appendChild(h('div', {
        class: 'row-number',
        text: String(opts.number)
      }));
    }

    row.appendChild(thumbnail(video));

    var body = h('div', { class: 'row-body' }, [
      h('div', { class: 'row-title', text: video.title || '' }),
      h('div', {
        class: 'row-meta',
        text: [video.channel || '', HT.format.stats(video)].filter(function (part) {
          return !!part;
        }).join(' \u00b7 ')
      })
    ]);

    var bodyText = video.note || video.summary || '';
    if (bodyText) {
      body.appendChild(h('div', {
        class: 'row-text' + (video.note ? ' note' : ''),
        text: bodyText
      }));
    }
    if (video.via) {
      body.appendChild(h('span', {
        class: 'via',
        text: 'Topic match \u00b7 ' + video.via
      }));
    }

    row.appendChild(body);
    row.__video = video;
    row.addEventListener('click', function () {
      if (opts.onPlay) {
        opts.onPlay(video);
      }
    });
    row.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      if (opts.onDetails) {
        opts.onDetails(video);
      }
    });
    return row;
  }

  function chip(label, opts) {
    opts = opts || {};
    var node = h('div', {
      class: 'chip focusable' + (opts.selected ? ' selected' : ''),
      'data-key': opts.key || '',
      role: 'button'
    });

    if (opts.icon) {
      node.appendChild(icon(opts.icon, 21));
    }
    node.appendChild(h('span', { text: label }));
    if (opts.trailing !== null && opts.trailing !== undefined && opts.trailing !== '') {
      node.appendChild(h('span', { class: 'count', text: String(opts.trailing) }));
    }

    node.addEventListener('click', function () {
      if (opts.onClick) {
        opts.onClick();
      }
    });
    return node;
  }

  function pill(label, opts) {
    opts = opts || {};
    var node = h('div', {
      class: 'pill focusable' + (opts.selected ? ' selected' : '') +
        (opts.className ? ' ' + opts.className : ''),
      'data-key': opts.key || '',
      role: 'button'
    });

    if (opts.icon) {
      node.appendChild(icon(opts.icon, 24));
    }
    node.appendChild(h('span', { text: label }));

    node.addEventListener('click', function () {
      if (opts.onClick) {
        opts.onClick();
      }
    });
    return node;
  }

  function mosaic(vids) {
    var cover = (vids || []).slice(0, 4);
    var wrap = h('div', { class: 'mosaic' }, h('div', { class: 'mosaic-inner' }));

    for (var row = 0; row < 2; row++) {
      var line = h('div', { class: 'mosaic-row' });
      for (var col = 0; col < 2; col++) {
        var index = row * 2 + col;
        var cell = h('div', { class: 'mosaic-cell' });
        if (cover[index]) {
          cell.appendChild(makeImage(cover[index]));
        }
        line.appendChild(cell);
      }
      wrap.firstChild.appendChild(line);
    }
    return wrap;
  }

  function pageHead(title, crumb, subtitle) {
    var node = h('div', { class: 'page-head' });
    if (crumb) {
      node.appendChild(h('div', { class: 'crumb', text: crumb }));
    }
    node.appendChild(h('h1', { class: 'page-title', text: title }));
    if (subtitle) {
      node.appendChild(h('p', { class: 'subtitle', text: subtitle }));
    }
    return node;
  }

  function homeHead() {
    return h('div', { class: 'home-head' }, [
      h('h1', { class: 'home-word' }, [
        document.createTextNode('Hacker'),
        h('span', { text: 'Tube' })
      ]),
      h('div', { class: 'home-sub', text: 'The videos Hacker News recommends.' })
    ]);
  }

  function loading(message) {
    return h('div', { class: 'status' }, [
      h('span', { class: 'spinner' }),
      h('span', { class: 'status-text', text: message || 'Loading\u2026' })
    ]);
  }

  function empty(message) {
    return h('div', { class: 'status' }, h('span', {
      class: 'status-text',
      text: message
    }));
  }

  function errorText(error) {
    var status = error && error.status;
    if (status === -1) {
      return 'The API proxy is not set up yet. See README.md, then rebuild the app.';
    }
    if (status === 429 || status === 503) {
      return 'Lots of people on HackerTube right now. Give it a minute and try again.';
    }
    return "Couldn't reach HackerTube. Check the TV's internet connection.";
  }

  function failure(error, retry, key) {
    var node = h('div', { class: 'status error' }, [
      h('span', { class: 'status-text', text: errorText(error) })
    ]);
    if (retry) {
      node.appendChild(pill('Try again', {
        key: key || 'retry',
        onClick: retry,
        className: 'retry'
      }));
    }
    return node;
  }

  function commentCard(comment) {
    var meta = [];
    if (comment.ym) {
      meta.push(String(comment.ym).slice(0, 4));
    }
    if (comment.story) {
      meta.push('in \u201c' + comment.story + '\u201d');
    }

    var body = String(comment.text || '')
      .replace(/\[VIDEO\]/g, '\u25b6 this video')
      .replace(/\[LINK\]/g, 'link');

    var node = h('div', {
      class: 'comment focusable',
      'data-key': 'comment:' + comment.id,
      role: 'button'
    }, [
      h('div', { class: 'comment-head' }, [
        h('span', { class: 'comment-author', text: '@' + (comment.author || 'unknown') }),
        h('span', { class: 'comment-meta', text: meta.join(' \u00b7 ') })
      ]),
      h('div', { class: 'comment-text', text: body })
    ]);
    return node;
  }

  function navItem(section, onClick) {
    var node = h('div', {
      class: 'nav-item focusable',
      'data-key': 'nav:' + section.id,
      'data-section': section.id,
      role: 'button'
    }, [
      h('span', { class: 'nav-icon nav-icon-outline' }, icon(section.icon, 26)),
      h('span', { class: 'nav-icon nav-icon-filled' }, icon(section.iconFilled, 26)),
      h('span', { class: 'nav-label', text: section.label })
    ]);

    node.addEventListener('click', function () {
      HT.Focus.set(node);
      if (onClick) {
        onClick(section);
      }
    });
    return node;
  }

  function brand() {
    return h('div', { class: 'brand' }, [
      h('div', { class: 'brand-logo', text: 'H' }),
      h('div', { class: 'brand-word' }, [
        document.createTextNode('Hacker'),
        h('span', { text: 'Tube' })
      ])
    ]);
  }

  function toast(message, ms) {
    var node = document.getElementById('toast');
    if (!node) {
      return;
    }
    node.textContent = message;
    node.classList.add('show');
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(function () {
      node.classList.remove('show');
      toastTimer = null;
    }, ms || 3200);
  }

  function updateSavedBadges() {
    var nodes = document.querySelectorAll('.saved-badge[data-saved]');
    for (var i = 0; i < nodes.length; i++) {
      var vid = nodes[i].getAttribute('data-saved');
      if (HT.library && HT.library.isLater(vid)) {
        nodes[i].classList.add('on');
      } else {
        nodes[i].classList.remove('on');
      }
    }
  }

  HT.ui = {
    imageUrl: imageUrl,
    thumbnail: thumbnail,
    videoCard: videoCard,
    videoRow: videoRow,
    chip: chip,
    pill: pill,
    mosaic: mosaic,
    pageHead: pageHead,
    homeHead: homeHead,
    loading: loading,
    empty: empty,
    failure: failure,
    commentCard: commentCard,
    navItem: navItem,
    brand: brand,
    toast: toast,
    updateSavedBadges: updateSavedBadges
  };
})();

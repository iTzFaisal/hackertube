/* The same wording as hackertube.org. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function duration(seconds) {
    if (!seconds || seconds <= 0) {
      return '';
    }
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) {
      return h + ':' + pad2(m) + ':' + pad2(s);
    }
    return m + ':' + pad2(s);
  }

  function hours(minutes) {
    minutes = Number(minutes) || 0;
    if (minutes >= 60) {
      return Math.floor(minutes / 60) + ' hr ' + (minutes % 60) + ' min';
    }
    return minutes + ' min';
  }

  function oneDecimal(x) {
    var rounded = Math.round(x * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  }

  function views(n) {
    if (n === null || n === undefined) {
      return '';
    }
    n = Number(n);
    if (!n && n !== 0) {
      return '';
    }
    if (n >= 1000000000) {
      return oneDecimal(n / 1000000000) + 'B views';
    }
    if (n >= 1000000) {
      return oneDecimal(n / 1000000) + 'M views';
    }
    if (n >= 1000) {
      return Math.round(n / 1000) + 'K views';
    }
    return n + ' views';
  }

  function ago(iso) {
    if (!iso) {
      return '';
    }
    var time = Date.parse(iso);
    if (isNaN(time)) {
      return '';
    }
    var days = Math.floor((Date.now() - time) / 86400000);
    if (days < 1) {
      return 'today';
    }
    var units = [
      [365, 'year'],
      [30, 'month'],
      [7, 'week'],
      [1, 'day']
    ];
    for (var i = 0; i < units.length; i++) {
      var size = units[i][0];
      var unit = units[i][1];
      var n = Math.floor(days / size);
      if (n >= 1) {
        return n + ' ' + unit + (n > 1 ? 's' : '') + ' ago';
      }
    }
    return 'today';
  }

  function stats(video, separator) {
    var parts = [];
    var seen = views(video.views);
    var when = ago(video.published);
    if (seen) {
      parts.push(seen);
    }
    if (when) {
      parts.push(when);
    }
    return parts.join(separator || ' \u2022 ');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function recommendations(hn) {
    if (!hn) {
      return '';
    }
    var years = '';
    if (hn.first && hn.last) {
      years = hn.first + '\u2013' + hn.last;
    } else if (hn.first) {
      years = hn.first;
    }
    var months = hn.rec_months || hn.recMonths || 0;
    if (hn.recommenders > 0) {
      var text = plural(hn.recommenders, 'HN recommender');
      if (months > 0) {
        text += ' \u00b7 recommended in ' + plural(months, 'month');
      }
      return text + (years ? ', ' + years : '');
    }
    if (hn.mentions > 0) {
      return 'Cited ' + hn.mentions + '\u00d7 on HN' + (years ? ', ' + years : '');
    }
    return '';
  }

  function count(n) {
    if (n === null || n === undefined) {
      return '';
    }
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function label(value) {
    if (!value) {
      return '';
    }
    value = String(value).replace(/-/g, ' ');
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  HT.format = {
    duration: duration,
    hours: hours,
    views: views,
    ago: ago,
    stats: stats,
    recommendations: recommendations,
    count: count,
    label: label
  };
})();

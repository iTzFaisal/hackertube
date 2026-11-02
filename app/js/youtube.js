/* Hand a video to the official YouTube app.
 *
 * The old version used an implicit "view" app control with the watch URL and
 * no app id. On many TVs the system resolves that to the web browser, which is
 * exactly the sudden switch we want to avoid. This version targets the
 * YouTube app directly:
 *
 *   1. Samsung's YouTube app with a PAYLOAD data key (the most reliable);
 *   2. a "view" app control addressed to the YouTube app;
 *   3. the same two attempts for the YouTube TV app id.
 *
 * If neither app is installed, the caller shows a message. It never falls
 * back to the TV browser.
 */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var CONFIG = window.HACKERTUBE_CONFIG || {};
  var PRIMARY = CONFIG.youtubeAppId || '111299001912';
  var APP_IDS = [];
  var VIEW = 'http://tizen.org/appcontrol/operation/view';
  var DEFAULT = 'http://tizen.org/appcontrol/operation/default';
  var WATCH = 'https://www.youtube.com/watch?v=';

  APP_IDS.push(PRIMARY);
  /* Some Samsung TVs expose YouTube as "YouTube TV" under this id. */
  if (APP_IDS.indexOf('3201707014489') < 0) {
    APP_IDS.push('3201707014489');
  }

  function hasTizen() {
    return !!(window.tizen && window.tizen.application &&
      window.tizen.application.launchAppControl);
  }

  function installed(appId) {
    if (!window.tizen || !window.tizen.application ||
        !window.tizen.application.getAppInfo) {
      return true;
    }
    try {
      return !!window.tizen.application.getAppInfo(appId);
    } catch (error) {
      return false;
    }
  }

  function check(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    if (!hasTizen()) {
      callback(false);
      return;
    }
    for (var i = 0; i < APP_IDS.length; i++) {
      if (installed(APP_IDS[i])) {
        callback(true);
        return;
      }
    }
    callback(false);
  }

  function launchPayload(vid, appId, onFail) {
    var done = false;
    function fail() {
      if (done) {
        return;
      }
      done = true;
      if (onFail) {
        onFail();
      }
    }
    try {
      var payload = new window.tizen.ApplicationControlData(
        'PAYLOAD',
        [JSON.stringify({ values: 'v=' + vid })]
      );
      var control = new window.tizen.ApplicationControl(
        DEFAULT,
        null,
        null,
        null,
        [payload]
      );
      window.tizen.application.launchAppControl(
        control,
        appId,
        function () {
          done = true;
        },
        fail
      );
    } catch (error) {
      fail();
    }
  }

  function launchView(vid, appId, onFail) {
    var done = false;
    function fail() {
      if (done) {
        return;
      }
      done = true;
      if (onFail) {
        onFail();
      }
    }
    try {
      var control = new window.tizen.ApplicationControl(
        VIEW,
        WATCH + encodeURIComponent(vid)
      );
      window.tizen.application.launchAppControl(
        control,
        appId,
        function () {
          done = true;
        },
        fail
      );
    } catch (error) {
      fail();
    }
  }

  function open(vid, onFail) {
    if (!hasTizen()) {
      return false;
    }

    var ids = [];
    var i;
    for (i = 0; i < APP_IDS.length; i++) {
      if (installed(APP_IDS[i])) {
        ids.push(APP_IDS[i]);
      }
    }
    if (!ids.length) {
      /* A few firmwares report app info incorrectly. Try the main id anyway. */
      ids.push(PRIMARY);
    }

    var index = 0;
    function next() {
      if (index >= ids.length) {
        if (onFail) {
          onFail();
        }
        return;
      }
      var appId = ids[index++];
      launchPayload(vid, appId, function () {
        launchView(vid, appId, next);
      });
    }

    next();
    return true;
  }

  HT.youtube = {
    open: open,
    check: check,
    appIds: APP_IDS
  };
})();

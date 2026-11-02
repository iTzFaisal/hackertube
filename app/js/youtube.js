/* Hand a video to the YouTube app.
 *
 * There are two ways that work on Samsung TVs:
 *   1. an implicit "view" app control with the watch URL;
 *   2. Samsung's YouTube app (111299001912) with a PAYLOAD data key.
 * Try the first, fall back to the second. This mirrors the working Android TV
 * behaviour: YouTube opens its player, and Back returns to HackerTube.
 */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var APP_ID = (window.HACKERTUBE_CONFIG && window.HACKERTUBE_CONFIG.youtubeAppId) ||
    '111299001912';
  var VIEW = 'http://tizen.org/appcontrol/operation/view';
  var DEFAULT = 'http://tizen.org/appcontrol/operation/default';
  var WATCH = 'https://www.youtube.com/watch?v=';
  var available = null;
  var waiters = [];

  function hasTizen() {
    return !!(window.tizen && window.tizen.application &&
      window.tizen.application.launchAppControl);
  }

  function settle(value) {
    available = value;
    var list = waiters;
    waiters = [];
    for (var i = 0; i < list.length; i++) {
      list[i](value);
    }
  }

  function installed() {
    try {
      window.tizen.application.getAppInfo(APP_ID);
      settle(true);
    } catch (error) {
      settle(false);
    }
  }

  function check(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    if (available !== null) {
      callback(available);
      return;
    }
    if (!window.tizen || !window.tizen.application) {
      callback(false);
      return;
    }
    waiters.push(callback);
    if (waiters.length > 1) {
      return;
    }
    try {
      var control = new window.tizen.ApplicationControl(VIEW, WATCH);
      window.tizen.application.findAppControl(
        control,
        function (apps) {
          if (apps && apps.length) {
            settle(true);
          } else {
            installed();
          }
        },
        installed
      );
    } catch (error) {
      installed();
    }
  }

  function launchPayload(vid, onFail) {
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
        APP_ID,
        function () {},
        function () {
          if (onFail) {
            onFail();
          }
        }
      );
    } catch (error) {
      if (onFail) {
        onFail();
      }
    }
  }

  function open(vid, onFail) {
    if (!hasTizen()) {
      return false;
    }

    function payload() {
      launchPayload(vid, onFail);
    }

    try {
      var control = new window.tizen.ApplicationControl(
        VIEW,
        WATCH + encodeURIComponent(vid)
      );
      window.tizen.application.launchAppControl(
        control,
        null,
        function () {},
        payload
      );
      return true;
    } catch (error) {
      payload();
      return true;
    }
  }

  HT.youtube = {
    open: open,
    check: check,
    appId: APP_ID
  };
})();

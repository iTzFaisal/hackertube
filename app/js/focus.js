/* Remote-control focus.
 *
 * Tizen has no pointer, so every screen decides what is focused. This module
 * uses the geometry of the visible .focusable elements: in a direction, the
 * nearest element with the best alignment wins. That handles the sidebar,
 * wrapping chip rows, the video grid, horizontal "Up next" rows and comment
 * lists without a separate navigation table for each screen.
 */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};
  var current = null;

  function closest(node, selector) {
    while (node && node !== document) {
      var matches = node.matches || node.webkitMatchesSelector || node.msMatchesSelector;
      if (node.nodeType === 1 && matches && matches.call(node, selector)) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function isTextInput(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    var tag = node.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || node.isContentEditable;
  }

  function visible(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    if (node.disabled) {
      return false;
    }
    var rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    var style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return node.offsetParent !== null || style.position === 'fixed';
  }

  function roots() {
    var list = [];
    var sidebar = document.getElementById('sidebar');
    if (sidebar) {
      list.push(sidebar);
    }
    var page = document.querySelector('#pages .page.active');
    if (page) {
      list.push(page);
    }
    return list;
  }

  function candidates() {
    var out = [];
    var list = roots();
    for (var i = 0; i < list.length; i++) {
      var nodes = list[i].querySelectorAll('.focusable');
      for (var j = 0; j < nodes.length; j++) {
        if (visible(nodes[j])) {
          out.push(nodes[j]);
        }
      }
    }
    return out;
  }

  function decorate(node, on) {
    var box = closest(node, '.search-box');
    if (box) {
      if (on) {
        box.classList.add('focused');
      } else {
        box.classList.remove('focused');
      }
    }
  }

  function remember(node) {
    var page = closest(node, '.page');
    if (page && page.__page) {
      var key = node.getAttribute('data-key');
      if (key) {
        page.__page.lastFocus = key;
      }
    }
  }

  function ensureVisible(node) {
    var rect = node.getBoundingClientRect();
    var parent = node.parentNode;
    var pad = 24;

    while (parent && parent !== document.body && parent !== document.documentElement) {
      var style = window.getComputedStyle(parent);
      var canY = (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        parent.scrollHeight > parent.clientHeight + 1;
      var canX = (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        parent.scrollWidth > parent.clientWidth + 1;

      if (canY || canX) {
        var box = parent.getBoundingClientRect();
        if (canY) {
          if (rect.top < box.top + pad) {
            parent.scrollTop -= (box.top + pad - rect.top);
          } else if (rect.bottom > box.bottom - pad) {
            parent.scrollTop += (rect.bottom - (box.bottom - pad));
          }
          rect = node.getBoundingClientRect();
        }
        if (canX) {
          if (rect.left < box.left + pad) {
            parent.scrollLeft -= (box.left + pad - rect.left);
          } else if (rect.right > box.right - pad) {
            parent.scrollLeft += (rect.right - (box.right - pad));
          }
          rect = node.getBoundingClientRect();
        }
      }
      parent = parent.parentNode;
    }
  }

  function set(node, quiet) {
    if (!node || !visible(node)) {
      return false;
    }

    if (current === node) {
      ensureVisible(node);
      return true;
    }

    if (current) {
      current.classList.remove('focused');
      decorate(current, false);
    }

    current = node;
    node.classList.add('focused');
    decorate(node, true);

    if (!node.hasAttribute('tabindex') && !isTextInput(node)) {
      node.setAttribute('tabindex', '-1');
    }
    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      try {
        node.focus();
      } catch (ignored) {
        /* A div without tabindex in an old webview; focus state still works. */
      }
    }

    ensureVisible(node);
    if (!quiet) {
      remember(node);
    }
    return true;
  }

  function overlap(a, b) {
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }

  function score(direction, from, to) {
    var primary;
    var secondary;
    var aligned;
    var fromX = (from.left + from.right) / 2;
    var fromY = (from.top + from.bottom) / 2;
    var toX = (to.left + to.right) / 2;
    var toY = (to.top + to.bottom) / 2;

    if (direction === 'left') {
      if (to.right > from.left + 6) {
        return null;
      }
      primary = from.left - to.right;
      secondary = Math.abs(toY - fromY);
      aligned = overlap(from, to);
    } else if (direction === 'right') {
      if (to.left < from.right - 6) {
        return null;
      }
      primary = to.left - from.right;
      secondary = Math.abs(toY - fromY);
      aligned = overlap(from, to);
    } else if (direction === 'up') {
      if (to.bottom > from.top + 6) {
        return null;
      }
      primary = from.top - to.bottom;
      secondary = Math.abs(toX - fromX);
      aligned = Math.max(0, Math.min(from.right, to.right) - Math.max(from.left, to.left));
    } else {
      if (to.top < from.bottom - 6) {
        return null;
      }
      primary = to.top - from.bottom;
      secondary = Math.abs(toX - fromX);
      aligned = Math.max(0, Math.min(from.right, to.right) - Math.max(from.left, to.left));
    }

    if (primary < -6) {
      return null;
    }

    var result = Math.max(0, primary) + secondary * 3;
    if (aligned > 0) {
      result -= 40;
    }
    return result;
  }

  function move(direction) {
    if (!current || !visible(current)) {
      return first();
    }

    var from = current.getBoundingClientRect();
    var list = candidates();
    var best = null;
    var bestScore = null;
    var horizontal = direction === 'left' || direction === 'right';
    var fromComment = current.classList.contains('comment');

    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (node === current) {
        continue;
      }
      /* Comments span the whole column. Pressing left or right there should
         not jump to a card far above; up and down move through the thread. */
      if (horizontal && (fromComment || node.classList.contains('comment'))) {
        continue;
      }
      var rect = node.getBoundingClientRect();
      var value = score(direction, from, rect);
      if (value !== null && (bestScore === null || value < bestScore)) {
        best = node;
        bestScore = value;
      }
    }

    if (!best) {
      return false;
    }
    return set(best);
  }

  function first() {
    var list = candidates();
    if (list.length) {
      return set(list[0]);
    }
    return false;
  }

  function firstIn(root) {
    if (!root) {
      return null;
    }
    var nodes = root.querySelectorAll('.focusable');
    for (var i = 0; i < nodes.length; i++) {
      if (visible(nodes[i])) {
        return nodes[i];
      }
    }
    return null;
  }

  function findKey(root, key) {
    if (!root || !key) {
      return null;
    }
    var nodes = root.querySelectorAll('[data-key]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-key') === key && visible(nodes[i])) {
        return nodes[i];
      }
    }
    return null;
  }

  function release(root) {
    if (current && root && (current === root || root.contains(current))) {
      current.classList.remove('focused');
      decorate(current, false);
      current = null;
    }
  }

  function element() {
    return current;
  }

  function isInput() {
    return isTextInput(document.activeElement);
  }

  HT.Focus = {
    move: move,
    set: set,
    first: first,
    firstIn: firstIn,
    findKey: findKey,
    release: release,
    element: element,
    isInput: isInput,
    isTextInput: isTextInput,
    closest: closest,
    visible: visible,
    ensureVisible: ensureVisible
  };
})();

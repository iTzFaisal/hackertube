/* Small DOM helpers. Everything that comes from the API is inserted with
 * textContent, never with innerHTML. */
(function () {
  'use strict';

  var HT = window.HT = window.HT || {};

  function append(parent, children) {
    if (children === null || children === undefined || children === false) {
      return;
    }
    if (Object.prototype.toString.call(children) === '[object Array]') {
      for (var i = 0; i < children.length; i++) {
        append(parent, children[i]);
      }
      return;
    }
    if (typeof children === 'string' || typeof children === 'number') {
      parent.appendChild(document.createTextNode(String(children)));
      return;
    }
    if (children.nodeType) {
      parent.appendChild(children);
    }
  }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    var key;
    var value;

    if (attrs) {
      for (key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) {
          continue;
        }
        value = attrs[key];
        if (value === null || value === undefined || value === false) {
          continue;
        }

        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = String(value);
        } else if (key === 'style') {
          for (var styleKey in value) {
            if (Object.prototype.hasOwnProperty.call(value, styleKey)) {
              node.style[styleKey] = value[styleKey];
            }
          }
        } else if (key === 'on') {
          for (var eventName in value) {
            if (Object.prototype.hasOwnProperty.call(value, eventName)) {
              node.addEventListener(eventName, value[eventName]);
            }
          }
        } else if (key === 'data') {
          for (var dataKey in value) {
            if (Object.prototype.hasOwnProperty.call(value, dataKey)) {
              node.setAttribute('data-' + dataKey, String(value[dataKey]));
            }
          }
        } else {
          node.setAttribute(key, value === true ? '' : String(value));
        }
      }
    }

    append(node, children);
    return node;
  }

  function clear(node) {
    if (!node) {
      return;
    }
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function icon(name, size) {
    return HT.icons.svg(name, size || 24);
  }

  function text(value) {
    return document.createTextNode(String(value));
  }

  function contains(parent, child) {
    return !!(parent && child && (parent === child || parent.contains(child)));
  }

  HT.dom = {
    h: h,
    text: text,
    clear: clear,
    icon: icon,
    contains: contains
  };
})();

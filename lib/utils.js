'use strict';

const { Disposable} = require('atom');

const compact = a => a.filter(v => v && v !== '');

const uniq = a => a.reduce((m, v) => m.indexOf(v) === -1 ? m.concat(v) : m, []);

const flatten = a =>
  a.reduce((m, o) => m.concat(Array.isArray(o) ? flatten(o) : o), []);

const head = a => a[0];
const last = a => a[a.length - 1];
const log = v => {
  console.log(v);
  return v;
};

const truncate = (s, l) =>
  s.length > l
    ? s.slice(0, l) + '…'
    : s;

class DisposableEvent extends Disposable {
  constructor(target, event, listener) {
    const events = event.split(/\s+/g);

    if (typeof target.addEventListener === 'function') {
      super(() => events.forEach(e => target.removeEventListener(e, listener)));
      events.forEach(e => target.addEventListener(e, listener));
    } else if (typeof target.on === 'function') {
      super(() => events.forEach(e => target.off(e, listener)));
      events.forEach(e => target.on(e, listener));
    } else {
      throw new Error('The passed-in source must have either a addEventListener or on method');
    }
  }
}

function addDelegatedEventListener(object, event, selector, callback) {
  if (typeof selector === 'function') {
    callback = selector;
    selector = '*';
  }

  return new DisposableEvent(object, event, listener);

  function listener(e) {
    if (e.isPropagationStopped) { return; }

    let {target} = e;
    decorateEvent(e);
    nodeAndParents(target).forEach((node) => {
      const matched = node.matches(selector);
      if (e.isImmediatePropagationStopped || !matched) { return; }

      e.matchedTarget = node;
      callback(e);
    });
  }

  function decorateEvent(e) {
    const overriddenStop = window.Event.prototype.stopPropagation;
    e.stopPropagation = function() {
      this.isPropagationStopped = true;
      overriddenStop.apply(this, arguments);
    };

    const overriddenStopImmediate = window.Event.prototype.stopImmediatePropagation;
    e.stopImmediatePropagation = function() {
      this.isImmediatePropagationStopped = true;
      overriddenStopImmediate.apply(this, arguments);
    };
  }
}

function eachParent(node, block) {
  let parent = node.parentNode;

  while (parent) {
    block(parent);

    if (parent.nodeName === 'HTML') { break; }
    parent = parent.parentNode;
  }
}

function parents(node, selector = '*') {
  const parentNodes = [];

  eachParent(node, (parent) => {
    if (parent.matches && parent.matches(selector)) { parentNodes.push(parent); }
  });

  return parentNodes;
}

function parent(node, selector = '*') {
  return head(parents(node, selector));
}

function nodeAndParents(node, selector = '*') {
  return [node].concat(parents(node, selector));
}

function noShadowDOM() {
  return parseFloat(atom.getVersion()) >= 1.13;
}

function editorRoot(element) {
  return noShadowDOM() ? element : (element.shadowRoot || element);
}

function parseJSON(data, fallback) {
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

// get time in seconds since the date
function secondsSince(when) {
  var now = new Date();
  return (now.getTime() - when.getTime()) / 1000.0;
}

function promisifyRequest(request) {
  return request.then
    ? request
    : new Promise((resolve, reject) => {
      request.on('response', resp => resolve(resp));
      request.on('error', err => reject(err));
    });
}

function promisifyReadResponse(response) {
  return new Promise((resolve, reject) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => resolve(data));
    response.on('error', err => reject(err));
  });
}

function screenPositionForMouseEvent(editorElement, event) {
  const pixelPosition = pixelPositionForMouseEvent(editorElement, event);

  if (pixelPosition == null) { return null; }

  return editorElement.screenPositionForPixelPosition != null
    ? editorElement.screenPositionForPixelPosition(pixelPosition)
    : editorElement.getModel().screenPositionForPixelPosition(pixelPosition);
}

function screenPositionForPixelPosition(editorElement, position) {
  if (position == null) { return null; }

  position = pixelPositionInEditorCoordinates(editorElement, position);

  return editorElement.screenPositionForPixelPosition != null
    ? editorElement.screenPositionForPixelPosition(position)
    : editorElement.getModel().screenPositionForPixelPosition(position);
}

function pixelPositionInEditorCoordinates(editorElement, position) {
  const {left: x, top: y} = position;
  const scrollTarget = editorElement.getScrollTop != null
    ? editorElement
    : editorElement.getModel();

  if (editorElement.querySelector('.lines') == null) { return null; }

  let {top, left} = editorElement.querySelector('.lines').getBoundingClientRect();
  top = (y - top) + scrollTarget.getScrollTop();
  left = (x - left) + scrollTarget.getScrollLeft();
  return {top, left};
}

function pixelPositionForMouseEvent(editorElement, event) {
  const {clientX: left, clientY: top} = event;

  return pixelPositionInEditorCoordinates(editorElement, {top, left});
}

module.exports = {
  addDelegatedEventListener,
  compact,
  DisposableEvent,
  eachParent,
  editorRoot,
  flatten,
  head,
  last,
  log,
  nodeAndParents,
  noShadowDOM,
  parent,
  parents,
  parseJSON,
  pixelPositionForMouseEvent,
  promisifyReadResponse,
  promisifyRequest,
  screenPositionForMouseEvent,
  screenPositionForPixelPosition,
  secondsSince,
  truncate,
  uniq,
};

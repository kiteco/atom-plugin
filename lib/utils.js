'use strict';
const os = require('os');

const {Disposable} = require('atom');

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

const getDetails = (o, ...details) =>
  o.detail || (o.details && details.reduce((m, k) => {
    return m || o.details[k];
  }, null));

const evalPath = (o, ...path) =>
  path.reduce((m, k) => {
    if (k === '*' && m) { k = head(Object.keys(m)); }
    return m && typeof m[k] !== 'undefined' ? m[k] : undefined;
  }, o);

const detailLang = o =>
  o && o.language_details
    ? head(Object.keys(o.language_details)).toLowerCase()
    : 'python';

const detailGet = (o, ...k) => evalPath(o, 'language_details', '*', ...k);

const detailExist = (o, ...k) => detailGet(o, ...k) != null;

const detailNotEmpty = (o, ...k) => {
  const v = detailGet(o, ...k);
  return v != null && v.length > 0;
};

const getFunctionDetails = (o) => {
  const type = head(Object.keys(o.details).filter(k => o.details[k]));
  if (type === 'function') {
    return o.details.function;
  } else if (type === 'type') {
    return detailGet(o.details.type, 'constructor');
  }

  return null;
};

const merge = (a, b) => {
  const c = {};
  for (const k in a) { c[k] = a[k]; }
  for (const k in b) { c[k] = b[k]; }
  return c;
};

const truncate = (s, l) =>
  s.length > l
    ? s.slice(0, l) + '…'
    : s;

const stripLeadingSlash = str => str.replace(/^\//, '');

const parseRangeInPath = (path) =>
  stripLeadingSlash(path).split('/').map(s => s.split(':').map(Number));

const parsePositionInPath = (path) =>
  stripLeadingSlash(path).split(':').map(Number);

const parseDefinitionInPath = (path) =>
  (
    os.platform() === 'win32'
      ? stripLeadingSlash(path)
      : path
  ).split(/:(?=\d)/).map(decodeURI).map(s => /^\d+$/.test(s) ? parseInt(s, 10) : s);

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

function delayPromise(factory, timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      factory().then(resolve, reject);
    }, timeout);
  });
}

function isWithinTextOfLine(editorElement, event) {
  const pixelPosition = pixelPositionForMouseEvent(editorElement, event);
  const defaultCharWidth = editorElement.getDefaultCharWidth
    ? editorElement.getDefaultCharWidth(pixelPosition) 
    : editorElement.getModel().getDefaultCharWidth(pixelPosition);
  const screenPosition = editorElement.screenPositionForPixelPosition
    ? editorElement.screenPositionForPixelPosition(pixelPosition) 
    : editorElement.getModel().screenPositionForPixelPosition(pixelPosition);
  const lineLengthForRow = editorElement.lineLengthForScreenRow
    ? editorElement.lineLengthForScreenRow(screenPosition.row) 
    : editorElement.getModel().lineLengthForScreenRow(screenPosition.row);
  const maxLeftPixelPos = defaultCharWidth * (lineLengthForRow + 4); // extra chars for better ui
  return maxLeftPixelPos >= pixelPosition.left;
}

function bufferPositionForMouseEvent(editorElement, event) {
  return editorElement.getModel().bufferPositionForScreenPosition(screenPositionForMouseEvent(editorElement, event));
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
  top = (y - top);
  left = (x - left);
  if (parseFloat(atom.getVersion()) < 1.19) {
    top += scrollTarget.getScrollTop();
    left += scrollTarget.getScrollLeft();
  }
  return {top, left};
}

function pixelPositionForMouseEvent(editorElement, event) {
  const {clientX: left, clientY: top} = event;

  return pixelPositionInEditorCoordinates(editorElement, {top, left});
}

const stopPropagationAndDefault = f => function(e) {
  e.stopPropagation();
  e.preventDefault();
  return f && f.call(this, e);
};

const USER_ID_INDEX = 1;
const PATH_ID_INDEX = 4;

function idToDottedPath(id) {
  if (id.includes(';')) {
    const idarr = id.split(';');
    switch (idarr.length) {
      // value id
      case 5:
        //form: [language];[userID];[machineID];[colon delineated filepath];[dottedPath]
        //local example: python;7;3e51855fc9b0accd7bbe1eafebc9b967;:Users:dane:Desktop:stuff:whitelist:foo.py;Foo.foo
        //global example: python;;;;re
        //here we assume a value id... which could be global or local
        const valueIdPath = idarr[1] === ''
          ? idarr.slice(PATH_ID_INDEX).join('.') //global
          : idarr.slice(USER_ID_INDEX).join(';'); //local
        return valueIdPath;
      // symbol id
      case 6:
        //form: [language];[userID];[machineID];[colon delineated filepath];[dottedPath];[symbol]
        //local example: python;7;3e51855fc9b0accd7bbe1eafebc9b967;:Users:dane:Desktop:stuff:whitelist:foo.py;Foo;foo
        //global example: python;;;;;re
        //here we assume a symbol id

        const symbolIdPath = idarr[1] === ''
          ? idarr.slice(PATH_ID_INDEX).filter(part => part !== '').join('.') //global assumption => no userId
          : idarr.slice(USER_ID_INDEX).join(';'); //local assumption - recreate symbolId w/o language
        return symbolIdPath;
      default:
        return '';
    }
  }
  return '';
}

function copilotProtocolSupported() {
  return os.platform() !== 'darwin';
} 

module.exports = {
  addDelegatedEventListener,
  bufferPositionForMouseEvent,
  compact,
  copilotProtocolSupported,
  delayPromise,
  detailExist,
  detailGet,
  detailLang,
  detailNotEmpty,
  DisposableEvent,
  eachParent,
  editorRoot,
  flatten,
  getDetails,
  getFunctionDetails,
  head,
  idToDottedPath,
  isWithinTextOfLine,
  last,
  log,
  merge,
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
  stopPropagationAndDefault,
  truncate,
  stripLeadingSlash,
  parseRangeInPath,
  parseDefinitionInPath,
  parsePositionInPath,
  uniq,
};

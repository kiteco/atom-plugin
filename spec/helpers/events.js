const {compact} = require('../../lib/utils');

function merge(a, b) {
  const c = {};

  for (let k in a) { c[k] = a[k]; }
  for (let k in b) { c[k] = b[k]; }

  return c;
}

function mouseEvent(type, properties) {
  let defaults = {
    bubbles: true,
    cancelable: (type !== 'mousemove'),
    view: window,
    detail: 0,
    pageX: 0,
    pageY: 0,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    button: 0,
    relatedTarget: undefined,
  };

  for (let k in defaults) {
    let v = defaults[k];
    if (!(properties[k] != null)) {
      properties[k] = v;
    }
  }

  const e = new MouseEvent(type, properties);

  for (let k in properties) {
    if (e[k] !== properties[k]) {
      e[k] = properties[k];
    }
  }

  return e;
}

function keyboardEvent(type, properties) {
  let defaults = {
    bubbles: true,
    cancelable: true,
    view: window,
    detail: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    relatedTarget: undefined,
    charCode: 0,
    code: 'KeyQ',
    key: 'a',
    keyIdentifier: 'U+0041',
    keyCode: 65,
    which: 0,
    location: 0,
  };

  for (let k in defaults) {
    const v = defaults[k];
    if (properties[k] == null) {
      properties[k] = v;
    }
  }

  const e = new KeyboardEvent(type, properties);
  e.initKeyboardEvent(
    type,
    properties.bubbles,
    properties.cancelable,
    properties.view,
    properties.code,
    properties.key,
    properties.location,
    compact([
      properties.ctrlKey && 'Ctrl',
      properties.shiftKey && 'Shift',
      properties.altKey && 'Alt',
      properties.metaKey && 'Meta',
    ]).join(' '),
    properties.repeat);

  return e;
}

function touchEvent(type, touches) {
  let event = new Event(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    relatedTarget: undefined,
  });
  event.touches = event.changedTouches = event.targetTouches = touches;

  return event;
}

function objectCenterCoordinates(obj) {
  let {top, left, width, height} = obj.getBoundingClientRect();
  return {x: left + width / 2, y: top + height / 2};
}

function exists(value) {
  return value != null;
}

module.exports = {objectCenterCoordinates, mouseEvent, keyboardEvent};

['keydown', 'keyup'].forEach((key) => {
  module.exports[key] = function(obj, options = {}) {
    obj.dispatchEvent(keyboardEvent(key, options));
  };
});

['mousedown', 'mousemove', 'mouseup', 'click'].forEach((key) => {
  module.exports[key] = function(obj, options = {}) {
    let {x, y, cx, cy, btn} = options;
    delete options.x;
    delete options.y;
    delete options.cx;
    delete options.cy;
    delete options.btn;

    if (x == null && y == null) {
      let o = objectCenterCoordinates(obj);
      x = o.x;
      y = o.y;
    }

    if (cx == null && cy == null) {
      cx = x;
      cy = y;
    }

    obj.dispatchEvent(mouseEvent(key, merge(options, {
      pageX: x, pageY: y, clientX: cx, clientY: cy, button: btn,
    })));
  };
});

module.exports.mousewheel = function(obj, deltaX = 0, deltaY = 0) {
  obj.dispatchEvent(mouseEvent('mousewheel', {
    deltaX,
    deltaY,
    wheelDeltaX: deltaX,
    wheelDeltaY: deltaY,
  }));
};

['touchstart', 'touchmove', 'touchend'].forEach((key) => {
  module.exports[key] = function(obj, touches) {
    if (!Array.isArray(touches)) {
      touches = [touches];
    }

    touches.forEach((touch) => {
      if (!exists(touch.target)) {
        touch.target = obj;
      }

      if (!(exists(touch.pageX) && exists(touch.pageY))) {
        let o = objectCenterCoordinates(obj);
        touch.pageX = exists(touch.x) ? touch.x : o.x;
        touch.pageY = exists(touch.y) ? touch.y : o.y;
      }

      if (!(exists(touch.clientX) && exists(touch.clientY))) {
        touch.clientX = touch.pageX;
        touch.clientY = touch.pageY;
      }
    });

    obj.dispatchEvent(touchEvent(key, touches));
  };
});

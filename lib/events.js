'use strict';

const fs = require('fs');
const http = require('http');
const utils = require('./utils.js');
const metrics = require('./metrics.js');
const ready = require('./ready.js');
const {CompositeDisposable} = require('atom');
const {MAX_PAYLOAD_SIZE, DEBUG, CONNECT_ERROR_LOCKOUT} = require('./constants');


// Outgoing contains logic for sending events to Kite in response to
// editor actions. We track edit, selections, and focus. These events
// are sent to a http server listening on 127.0.0.1:46624.
var PENDING_EVENTS = [];
var MERGE_CALLED = false;

// setup callbacks for events we want to track for each editor instance
function observeEditor(editor) {
  const subscriptions = new CompositeDisposable();

  subscriptions.add(editor.onDidChange(onEdit.bind(null, editor)));
  subscriptions.add(editor.onDidChangeSelectionRange(onSelection.bind(null, editor)));

  subscriptions.add(editor.onDidDestroy(() => subscriptions.dispose()));
}

// send an event to Kite. Because Atom likes to fire many selection and buffer
// change events (and in strange orders), we actually accumulate all the events
// and use setTimeout with a 0ms timeout to indicate when the events have stopped
// firing. This works because nodejs is single-threaded and the setTimeout gets
// scheduled after all other pending events have been handled. Once this happens,
// we can call mergeEvents, which will pick the last event, and mark it as edit
// if any of the events that occured for that keystroke was in fact an edit.
function send(event) {
  PENDING_EVENTS.push(event);
  if (!MERGE_CALLED) {
    MERGE_CALLED = true;
    setTimeout(mergeEvents, 0);
  }
}

function reset() {
  MERGE_CALLED = false;
  PENDING_EVENTS = [];
}

// last time we sent a "could not connect..." event to mixpanel
var lastConnectError = null;

// called after a string of events have fired for a particular keystroke. We use this
// to debounce the events - pick the last event and set it to edit of any of the events
// we accumulated was in fact an edit.
function mergeEvents() {
  var event = PENDING_EVENTS[PENDING_EVENTS.length - 1];
  for (var i = 0; i < PENDING_EVENTS.length; i++) {
    if (PENDING_EVENTS[i].action === 'edit') {
      event.action = 'edit';
    }
  }
  if (DEBUG) {
    console.log(event.action, event.filename, event.selections[0]);
  }
  httpRoundTrip('/clientapi/editor/event', event).then((resp) => {
    if (resp.statusCode === 423) {
      // the path is not whitelisted, trigger a notification
      ready.ensure();
    }
  }, (err) => {
    // on connection error send a metric, but not too often or we will generate too many events
    if (lastConnectError === null || utils.secondsSince(lastConnectError) >= CONNECT_ERROR_LOCKOUT) {
      lastConnectError = new Date();
      metrics.track('could not connect to event endpoint', err);
    }
  });
  reset();
}

// sendError - sends error message to Kite
function sendError(msg) {
  var editor = atom.workspace.getActiveTextEditor();
  if (!editor) {
    return;
  }
  httpRoundTrip('/clientapi/editor/error', {
    source: 'atom',
    filename: fs.realpathSync(editor.getPath()),
    message: msg,
  });
}

// httpRoundTrip - performs a POST request and returns a promise for the result
function httpRoundTrip(endpoint, obj) {
  return new Promise((resolve, reject) => {
    var payload = JSON.stringify(obj);
    if (payload.length > MAX_PAYLOAD_SIZE) {
      console.log('unable to send message because length exceeded limit');
      reset();
      return;
    }

    var options = {
      host: '127.0.0.1',
      port: '46624',
      path: endpoint,
      method: 'POST',
    };

    var req = http.request(options, (resp) => {
      resp.on('error', (err) => {
        reject(err);
      });
      resp.on('end', () => {
        resolve(resp);
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

// callback handlers to track edit/selection/focus events
function onFocus(item) {
  // HACK(tarak): Check to see if the item is in fact a TextEditor object by
  // checking if it has the "buffer" property. This ensures we only handle focus
  // events on editor objects, instead of Settings, etc. which return DOM elements for
  // this event.
  if (item && item.buffer) {
    send(buildEvent(item, 'focus'));
  }
}
function onEdit(editor) {
  send(buildEvent(editor, 'edit'));
}
function onSelection(editor) {
  send(buildEvent(editor, 'selection'));
}
function onActivate() {
  // All event disposables returned by Atom's event methods should be stored
  // into a composite disposable for later use
  const subscriptions = new CompositeDisposable();
  // observeTextEditors takes a callback that fires whenever a new
  // editor window is created. We use this to call "observeEditor",
  // which registers edit/selection based callbacks.
  subscriptions.add(atom.workspace.observeTextEditors(observeEditor));

  // focus is tracked at the workspace level.
  subscriptions.add(atom.workspace.onDidChangeActivePaneItem(onFocus));

  // send the activate event so that kite knows the plugin is ready
  send(makeEvent('activate', '', '', 0));

  // We return the subscriptions so that the main module can dispose them
  // on deactivation
  return subscriptions;
}

// buildEvent constructs an event from the provided editor. It sets the
// "action" field of the event to the provided value.
function buildEvent(editor, action) {
  var text = editor.getText();
  var cursorPoint = editor.getCursorBufferPosition();
  // The TextBuffer class already provides position->char index conversion
  // with regard for unicode's surrogate pairs
  var buffer = editor.getBuffer();
  var cursorOffset = buffer.characterIndexForPosition(cursorPoint);

  // don't send content over 1mb
  if (text.length > 2 ** 20) {
    action = 'skip';
    text = 'file_too_large';
  }

  return makeEvent(action, editor.getPath(), text, cursorOffset);
}

function makeEvent(action, filename, text, cursor) {
  return {
    source: 'atom',
    action: action,
    filename: filename,
    text: text,
    selections: [{
      start: cursor,
      end: cursor,
    }],
  };
}

module.exports = {
  onActivate,
  sendError,
};

'use strict';

const {CompositeDisposable} = require('atom');
const {StateController} = require('kite-installer');
const {MAX_FILE_SIZE, MAX_PAYLOAD_SIZE, DEBUG, CONNECT_ERROR_LOCKOUT} = require('./constants');
const {last, promisifyRequest, secondsSince} = require('./utils');
const metrics = require('./metrics.js');

class EditorEvents {
  constructor(editor) {
    this.editor = editor;
    this.subscriptions = new CompositeDisposable();
    this.pendingEvents = [];

    this.subscriptions.add(editor.onDidChange(changes => {
      this.send(this.buildEvent(editor, 'edit'));
    }));
    this.subscriptions.add(editor.onDidChangeSelectionRange(() => {
      this.send(this.buildEvent(editor, 'selection'));
    }));
    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
      if (item === editor) {
        this.send(this.buildEvent(editor, 'focus'));
      }
    }));
  }

  dispose() {
    delete this.editor;
    this.subscriptions.dispose();
  }

  reset() {
    clearTimeout(this.timeout);
    this.pendingEvents = [];
  }

  send(event) {
    this.pendingEvents.push(event);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.mergeEvents(), 0);
  }

  mergeEvents() {
    const event = last(this.pendingEvents);

    this.pendingEvents.forEach(e => {
      if (e.action === 'edit') {
        event.action = 'edit';
      }
    });

    if (DEBUG) {
      console.log(event.action, event.filename, event.selections[0]);
    }

    const payload = JSON.stringify(event);

    if (payload.length > MAX_PAYLOAD_SIZE) {
      console.warn('unable to send message because length exceeded limit');
      return this.reset();
    }

    return promisifyRequest(StateController.client.request({
      path: '/clientapi/editor/event',
      method: 'POST',
    }, payload))
    .catch(err => {
      // on connection error send a metric, but not too often or we will generate too many events
      if (!this.lastErrorAt ||
          secondsSince(this.lastErrorAt) >= CONNECT_ERROR_LOCKOUT) {
        this.lastErrorAt = new Date();
        metrics.track('could not connect to event endpoint', err);
      }
    });
  }

  buildEvent(editor, action) {
    let text = editor.getText();
    const cursorPoint = editor.getCursorBufferPosition();
    // The TextBuffer class already provides position->char
    // index conversion with regard for unicode's surrogate pairs
    const buffer = editor.getBuffer();
    const cursorOffset = buffer.characterIndexForPosition(cursorPoint);

    // don't send content over 1mb
    if (text.length > MAX_FILE_SIZE) {
      action = 'skip';
      text = 'file_too_large';
    }

    return this.makeEvent(action, editor.getPath(), text, cursorOffset);
  }

  makeEvent(action, filename, text, cursor) {
    return {
      source: 'atom',
      action,
      filename,
      text,
      selections: [{
        start: cursor,
        end: cursor,
      }],
    };
  }

}

module.exports = EditorEvents;

'use strict';

const {CompositeDisposable} = require('atom');
const KiteAPI = require('kite-api');
const {MAX_FILE_SIZE, MAX_PAYLOAD_SIZE} = require('./constants');
const {DisposableEvent} = require('./utils');
let Kite;

class EditorEvents {
  constructor(editor) {
    if (!Kite) { Kite = require('./kite'); }
    this.editor = editor;
    this.subscriptions = new CompositeDisposable();
    this.pendingEvents = [];

    this.subscriptions.add(editor.onDidChange(changes => {
      this.send('edit').catch(() => {});
    }));
    this.subscriptions.add(editor.onDidChangeSelectionRange(() => {
      this.send('selection').catch(() => {});
    }));

    const view = atom.views.getView(this.editor);
    let editorHadFocus;

    // We need to track whether the editor view already had focus prior
    // to a mousedown event as we're now receiving a focus event for each click.
    // In case the editor already had focus we won't send the focus event to kited.
    this.subscriptions.add(new DisposableEvent(view, 'mousedown', () => {
      editorHadFocus = view.hasFocus();
    }));

    this.subscriptions.add(new DisposableEvent(view, 'focus', () => {
      if (!editorHadFocus) { this.focus().catch(() => {}); }
      editorHadFocus = null;
    }));
  }

  focus() {
    return this.send('focus');
  }

  dispose() {
    delete this.editor;
    this.subscriptions.dispose();
  }

  reset() {
    clearTimeout(this.timeout);
    this.pendingEvents = [];
  }

  send(action) {
    if (!this.pendingPromise) {
      this.pendingPromise = new Promise((resolve, reject) => {
        this.pendingPromiseResolve = resolve;
        this.pendingPromiseReject = reject;
      });
    }
    this.pendingEvents.push(action);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.mergeEvents(), 0);

    return this.pendingPromise;
  }

  mergeEvents() {
    let focus = this.pendingEvents.filter(e => e === 'focus')[0];
    let action = this.pendingEvents.some(e => e === 'edit') ? 'edit' : this.pendingEvents.pop();

    this.reset();

    const payload = JSON.stringify(this.buildEvent(action));

    if (payload.length > MAX_PAYLOAD_SIZE) {
      return this.reset();
    }

    let promise = Promise.resolve();

    if (focus && action !== focus) {
      promise = promise.then(() => KiteAPI.request({
        path: '/clientapi/editor/event',
        method: 'POST',
      }, JSON.stringify(this.buildEvent(focus))));
    }

    return promise
    .then(() => KiteAPI.request({
      path: '/clientapi/editor/event',
      method: 'POST',
    }, payload))
    .then((res) => {
      this.pendingPromiseResolve(res);
    })
    .then(KiteAPI.emitWhitelistedPathDetected(this.editor.getPath()))
    .catch(KiteAPI.emitNonWhitelistedPathDetected(this.editor.getPath()))
    .catch((err) => {
      this.pendingPromiseReject(err);
      // on connection error send a metric, but not too often or we will generate too many events
      // if (!this.lastErrorAt ||
      //     secondsSince(this.lastErrorAt) >= CONNECT_ERROR_LOCKOUT) {
      //   this.lastErrorAt = new Date();
      //   // metrics.track('could not connect to event endpoint', err);
      // }
    })
    .then(() => {
      delete this.pendingPromise;
      delete this.pendingPromiseResolve;
      delete this.pendingPromiseReject;
    });
  }

  buildEvent(action) {
    let text = this.editor.getText();
    const cursorPoint = this.editor.getCursorBufferPosition();
    // The TextBuffer class already provides position->char
    // index conversion with regard for unicode's surrogate pairs
    const buffer = this.editor.getBuffer();
    const cursorOffset = buffer.characterIndexForPosition(cursorPoint);

    // don't send content over 1mb
    if (text && text.length > MAX_FILE_SIZE) {
      action = 'skip';
      text = '';
    }

    return this.makeEvent(action, this.editor.getPath(), text, cursorOffset);
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

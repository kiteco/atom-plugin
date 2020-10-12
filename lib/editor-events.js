'use strict';

const { CompositeDisposable } = require('atom');
const KiteAPI = require('kite-api');
const { DisposableEvent } = require('./utils');
const { version: plugin_version } = require('./metrics')
let Kite;

class EditorEvents {
  constructor(editor) {
    if (!Kite) { Kite = require('./kite'); }
    this.editor = editor;
    this.subscriptions = new CompositeDisposable();
    this.pendingEvents = [];

    this.subscriptions.add(editor.onDidChange(changes => {
      this.send('edit');
    }));
    this.subscriptions.add(editor.onDidChangeSelectionRange(() => {
      this.send('selection');
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
      if (!editorHadFocus) { this.focus(); }
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

    // was resulting in unhandled Promise rejection from `this.pendingPromiseReject(err)`
    // below... so we catch it
    return this.pendingPromise.catch((err) => { });
  }

  mergeEvents() {
    if (!this.editor) { return; }

    const focus = this.pendingEvents.filter(e => e === 'focus')[0];
    const action = this.pendingEvents.some(e => e === 'edit') ? 'edit' : this.pendingEvents.pop();

    this.reset();

    const payload = JSON.stringify(this.buildEvent(action));

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
      .catch((err) => {
        this.pendingPromiseReject && this.pendingPromiseReject(err);
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

    if (text && text.length > Kite.maxFileSize) {
      action = 'skip';
      text = '';
    }

    return this.makeEvent(action, this.editor.getPath(), text, action === 'skip' ? 0 : cursorOffset);
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
        encoding: 'utf-16',
      }],
      editor_version: atom.getVersion(),
      plugin_version,
    };
  }

}

module.exports = EditorEvents;

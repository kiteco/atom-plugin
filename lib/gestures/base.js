'use strict';

const {Emitter, Range} = require('atom');

module.exports = class BaseGesture {
  constructor(editor, tokensList, options) {
    this.editor = editor;
    this.buffer = editor.getBuffer();
    this.editorElement = atom.views.getView(editor);
    this.tokensList = tokensList;
    this.options = options || {};
    this.emitter = new Emitter();
  }

  dispose() {
    this.emitter.dispose();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  isActive() {
    return this.active;
  }

  activate(token) {
    if (this.active) { this.deactivate(); }

    this.active = true;
    if (!this.paused) {
      if (token) {
        const range = Range.fromObject([
          this.buffer.positionForCharacterIndex(token.begin_bytes),
          this.buffer.positionForCharacterIndex(token.end_bytes),
        ]);
        this.emitter.emit('did-activate', {token, range});
      } else {
        this.emitter.emit('did-activate');
      }
    }
  }

  deactivate(data) {
    if (!this.active) { return; }

    this.active = false;
    if (!this.paused) { this.emitter.emit('did-deactivate', data); }
  }

  onDidActivate(listener) {
    return this.emitter.on('did-activate', listener);
  }

  onDidDeactivate(listener) {
    return this.emitter.on('did-deactivate', listener);
  }
};

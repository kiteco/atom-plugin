'use strict';

const {CompositeDisposable} = require('atom');
const {DisposableEvent} = require('../utils');
const BaseGesture = require('./base');

module.exports = class KeyboardGesture extends BaseGesture {
  constructor(editor, tokensList, options) {
    super(editor, tokensList, options);

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscriptions.dispose();
  }

  registerEvents() {
    const event = this.options.type || 'keydown';
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(new DisposableEvent(this.editorElement, 'mousemove', (e) => {
      this.lastMouseEvent = e;
    }));
    this.subscriptions.add(new DisposableEvent(this.editorElement, event, (e) => {
      if (!this.matchesKey(e)) { return; }

      if (this.lastMouseEvent) {
        const token = this.tokensList.tokenForMouseEvent(this.lastMouseEvent);

        if (token) {
          this.activate(token);
        }
      }
    }));
  }

  matchesKey(e) {
    return e.key == this.options.key &&
           e.altKey == !!this.options.altKey &&
           e.ctrlKey == !!this.options.ctrlKey &&
           e.shiftKey == !!this.options.shiftKey &&
           e.metaKey == !!this.options.metaKey;
  }
};

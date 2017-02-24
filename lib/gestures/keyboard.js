'use strict';

const BaseGesture = require('./base');
const {DisposableEvent} = require('../utils');

module.exports = class HoverGesture extends BaseGesture {
  constructor(editorElement, options = {}) {
    super();

    this.editorElement = editorElement;
    this.options = options;

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscription.dispose();
  }

  registerEvents() {
    const event = this.options.type || 'keydown';
    this.subscription = new DisposableEvent(this.editorElement, event, (e) => {
      if (!this.matchesKey(e)) { return; }

      this.activate();
    });
  }

  matchesKey(e) {
    return e.key == this.options.key &&
           e.altKey == !!this.options.altKey &&
           e.ctrlKey == !!this.options.ctrlKey &&
           e.shiftKey == !!this.options.shiftKey &&
           e.metaKey == !!this.options.metaKey;
  }
};

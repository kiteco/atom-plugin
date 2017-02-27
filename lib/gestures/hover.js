'use strict';

const MouseEventGesture = require('./mouse-event');
const {DisposableEvent, bufferPositionForMouseEvent} = require('../utils');

module.exports = class HoverGesture extends MouseEventGesture {
  constructor(editorElement, tokensList, options) {
    super(editorElement, tokensList, options);

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscription.dispose();
  }

  registerEvents() {
    this.subscription = new DisposableEvent(this.editorElement, 'mousemove', (e) => {
      if (!this.matchesModifiers(e) ||
          e.target.matches(this.options.ignoredSelector)) {
        this.deactivate();
        return;
      }

      const token = this.tokenForMouseEvent(event);

      if (token) {
        if (token !== this.lastToken) {
          this.activate(bufferPositionForMouseEvent(this.editorElement, e));
          this.lastToken = token;
        }
      } else if (this.isActive()) {
        this.deactivate();
        delete this.lastToken;
      }
    });
  }
};

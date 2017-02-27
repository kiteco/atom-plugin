'use strict';

const MouseEventGesture = require('./mouse-event');
const {DisposableEvent} = require('../utils');

module.exports = class HoverGesture extends MouseEventGesture {
  constructor(editor, tokensList, options) {
    super(editor, tokensList, options);

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscription.dispose();
  }

  registerEvents() {
    this.subscription = new DisposableEvent(this.editorElement, 'mousemove', (e) => {
      if (!this.matchesModifiers(e)) {
        this.deactivate();
        return;
      }

      if (e.target.matches(this.options.ignoredSelector)) { return; }

      const token = this.tokenForMouseEvent(event);

      if (token) {
        if (token !== this.lastToken) {
          this.activate(token);
          this.lastToken = token;
        }
      } else if (this.isActive()) {
        this.deactivate();
        delete this.lastToken;
      }
    });
  }
};

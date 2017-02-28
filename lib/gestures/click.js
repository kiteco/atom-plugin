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
    this.subscription = new DisposableEvent(this.editorElement, 'click', (e) => {
      if (!this.matchesModifiers(e)) { return; }

      if (this.options.checkToken == undefined || this.options.checkToken) {
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
      } else {
        this.activate();
      }
    });
  }
};

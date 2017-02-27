'use strict';

const BaseGesture = require('./base');

module.exports = class WordSelectionGesture extends BaseGesture {
  constructor(editor, tokensList) {
    super(editor, tokensList);

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscription.dispose();
  }

  registerEvents() {
    this.subscription = this.editor.onDidChangeSelectionRange(() => {
      const range = this.editor.getSelectedBufferRange();
      const token = this.tokensList.tokenAtRange(range);

      if (token) {
        this.activate(token);
      } else {
        this.deactivate();
      }
    });
  }
};

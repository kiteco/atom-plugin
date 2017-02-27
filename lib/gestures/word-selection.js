'use strict';

const {Point} = require('atom');
const BaseGesture = require('./base');

module.exports = class WordSelectionGesture extends BaseGesture {
  constructor(editor, tokensList) {
    super();
    this.editor = editor;
    this.tokensList = tokensList;

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
        this.activate(Point.fromObject([
          Math.floor((range.start.row + range.end.row) / 2),
          Math.floor((range.start.column + range.end.column) / 2),
        ]));
      } else {
        this.deactivate();
      }
    });
  }
};

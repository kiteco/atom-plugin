'use strict';

const BaseGesture = require('./base');

module.exports = class CursorMoveGesture extends BaseGesture {
  constructor(editor, tokensList, options) {
    super(editor, tokensList, options);

    this.registerEvents();
  }

  dispose() {
    super.dispose();
    this.subscription.dispose();
  }

  registerEvents() {
    let isEditing = false;

    this.subscription = this.editor.getBuffer().onDidChange(changes => {
      isEditing = changes != null;
    });
    this.subscription = this.editor.onDidStopChanging(() => { isEditing = false; });
    this.subscription = this.editor.onDidChangeCursorPosition(() => {
      if (isEditing) { return; }

      if (this.options.checkToken == undefined || this.options.checkToken) {
        const cursor = this.editor.getLastCursor();
        const position = cursor.getBufferPosition();
        if (cursor.selection.getBufferRange().isEmpty()) {
          const token = this.tokensList.tokenAtPosition(position);
          if (token) {
            if (token !== this.lastToken) {
              this.activate(token);
              this.lastToken = token;
            }
          } else if (this.isActive()) {
            this.deactivate();
            delete this.lastToken;
          }
        }
      } else {
        this.activate();
      }
    });
  }
};

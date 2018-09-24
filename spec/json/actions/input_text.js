'use strict';

module.exports = (action) => {
  beforeEach(() => {
    const editor = atom.workspace.getActiveTextEditor();
    if (action.properties.text) {
      if (action.properties.text.length > 1) {
        editor.insertText(action.properties.text.slice(0, -1));
        editor.insertText(action.properties.text.slice(-1));
      } else {
        editor.insertText(action.properties.text);
      }
      emitCompletionEvent();
    }

    function emitCompletionEvent() {
      const view = atom.views.getView(editor);
      const event = new CustomEvent('autocomplete-plus:activate', {bubbles: true, cancelable: true});
      view.dispatchEvent(event);
    }
  });
};

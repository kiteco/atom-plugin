const KiteAPI = require('kite-api');

module.exports = class Codenav {
  constructor(notifCenter) {
    this.notifications = notifCenter;
  }

  relatedCodeFromFile() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromFileWithEditor(textEditor));
  }

  relatedCodeFromLine() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromLineWithEditor(textEditor));
  }

  relatedCodeFromFileWithEditor(textEditor) {
    KiteAPI
      .requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), null, null)
      .catch(this.notifications.getRelatedCodeErrHandler(textEditor.getPath(), null));
  }

  relatedCodeFromLineWithEditor(textEditor) {
    const zeroBasedLineNo = textEditor.getCursorBufferPosition().row;
    const oneBasedLineNo = zeroBasedLineNo + 1;

    const requireNonEmptyLine = new Promise((resolve, reject) => {
      if (textEditor.lineTextForBufferRow(zeroBasedLineNo) === '') {
        return reject({
          data: {
            responseData: 'ErrEmptyLine',
          },
        });
      }
      return resolve();
    });

    requireNonEmptyLine
      .then(() => KiteAPI.requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), oneBasedLineNo, null))
      .catch(this.notifications.getRelatedCodeErrHandler(textEditor.getPath(), oneBasedLineNo));
  }

  requireEditor() {
    return new Promise((resolve, reject) => {
      const textEditor = atom.workspace.getActiveTextEditor();
      if (!textEditor) {
        return reject({
          data: {
            responseData: 'ErrNotTextEditor',
          },
        });
      }
      return resolve(textEditor);
    });
  }
};

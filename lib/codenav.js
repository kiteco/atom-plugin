const KiteAPI = require('kite-api');

module.exports = class Codenav {
  constructor(notifCenter) {
    this.notifications = notifCenter;
  }

  relatedCodeFromFile() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromFileWithEditor(textEditor))
      .catch(this.notifications.getRelatedCodeErrHandler());
  }

  relatedCodeFromLine() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromLineWithEditor(textEditor))
      .catch(this.notifications.getRelatedCodeErrHandler());
  }

  relatedCodeFromFileWithEditor(textEditor) {
    KiteAPI
      .requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), null, null)
      .catch(this.notifications.getRelatedCodeErrHandler());
  }

  relatedCodeFromLineWithEditor(textEditor) {
    const zeroBasedLineNo = textEditor.getCursorBufferPosition().row;
    const oneBasedLineNo = zeroBasedLineNo + 1;
    KiteAPI
      .requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), oneBasedLineNo, null)
      .catch(this.notifications.getRelatedCodeErrHandler());
  }

  requireEditor() {
    return new Promise((resolve, reject) => {
      const textEditor = atom.workspace.getActiveTextEditor();
      if (!textEditor) {
        return reject({
          data: {
            // NotificationsCenter expects a JSON string.
            responseData: JSON.stringify({ message: 'Could not get active text editor.' }),
          },
        });
      }
      return resolve(textEditor);
    });
  }
};

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
    return KiteAPI
      .requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), null, null);
  }

  relatedCodeFromLineWithEditor(textEditor) {
    const zeroBasedLineNo = textEditor.getCursorBufferPosition().row;
    const oneBasedLineNo = zeroBasedLineNo + 1;
    return KiteAPI
      .requestRelatedCode('atom', atom.packages.getApmPath(), textEditor.getPath(), oneBasedLineNo, null);
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

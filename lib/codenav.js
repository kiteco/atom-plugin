const KiteAPI = require('kite-api');

const defaultNotifTitle = 'Kite Code Finder Error';
const defaultNotifBody = 'Oops! Something went wrong with Code Finder. Please try again later.';

module.exports = class Codenav {
  constructor(notifCenter) {
    this.notifications = notifCenter;
  }

  relatedCodeFromFile() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromFileWithEditor(textEditor))
      .catch(err => this.notifications.notifyFromError(err, defaultNotifTitle, defaultNotifBody));
  }

  relatedCodeFromLine() {
    this.requireEditor()
      .then((textEditor) => this.relatedCodeFromLineWithEditor(textEditor))
      .catch(err => this.notifications.notifyFromError(err, defaultNotifTitle, defaultNotifBody));
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

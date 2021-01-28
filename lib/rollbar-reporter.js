'use strict';

const kitePkg = require('../package.json');
const { distinctID, EDITOR_UUID, OS_VERSION } = require('./metrics');

if (!atom.inSpecMode()) {
  window._rollbarConfig = {
    accessToken: '645ce0316c3c4c1c9f9e8d9edf6ca122',
    autoInstrument: false,
    payload: {
      environment: 'production',
      distinctID: distinctID(),
      editor_uuid: EDITOR_UUID,
      editor: 'atom',
      atom_version: atom.getVersion(),
      kite_plugin_version: kitePkg.version,
      os: OS_VERSION,
    },
  };

  // We still want to load the browser version for security purpose
  require('rollbar/dist/rollbar');

  class RollbarReporter {
    constructor() {
      this.subscription = atom.onDidThrowError(({ column, line, message, originalError, url }) => {
        // We're only concerned by errors that originate or involve our code
        // but not when working on it.
        if (/\/kite\//.test(originalError.stack) &&
          !/kite$/.test(atom.project.getPaths()[0] || '')) {
          window.Rollbar.error(originalError);
        }
      });
    }

    dispose() {
      this.subscription && this.subscription.dispose();
    }
  }

  module.exports = RollbarReporter;
} else {
  module.exports = class Dummy {
    dispose() { }
  };
}

'use strict';

// Contents of this plugin will be reset by Kite on start. Changes you make
// are not guaranteed to persist.

const child_process = require('child_process');
const {CompositeDisposable} = require('atom');
const {AccountManager} = require('kite-installer');
const events = require('./events.js');
const completions = require('./completions.js');
const ready = require('./ready.js');
const metrics = require('./metrics.js');

module.exports = {
  activate: function() {
    AccountManager.initClient('127.0.0.1', 46624, '');

    // We store all the subscriptions into a composite disposable to release
    // them on deactivation
    this.subscriptions = new CompositeDisposable();

    // send the activated event
    metrics.track('activated');

    // install hooks for editor events and send the activate event
    this.subscriptions.add(events.onActivate());

    // install hooks for readiness checker and check that Kite is running
    this.subscriptions.add(ready.onActivate());

    // run "apm upgrade kite"
    this.selfUpdate();

    // watch for the user checking the "check kite status" config item
    var firstObservation = true;
    // A setting new value is passed as first argument to the observer function
    this.subscriptions.add(atom.config.observe('kite.checkReadiness', (checkReadiness) => {
      // atom always fires this observer when the observer is registered
      // but we do not want to show the notification at every startup
      if (firstObservation) {
        firstObservation = false;
        return;
      }

      // only respond when the checkbox is set to true
      if (!checkReadiness) {
        return;
      }

      // the config item is just a stand-in for a button so set it back to false
      setTimeout(() => {
        atom.config.set('kite.checkReadiness', false);
      }, 500);

      // check that kite is running and show a success notification if so
      metrics.track('readiness config checkbox touched');
      ready.ensureAndNotify();
    }));

    // Allow esc key to close the login form
    this.subscriptions.add(atom.commands.add('.kite-login-panel', {
      'core:cancel'() { this.cancel(); },
    }));
  },
  deactivate: function() {
    // Release all subscriptions on deactivation
    this.subscriptions.dispose();
  },
  selfUpdate: function() {
    var apm = atom.packages.getApmPath();
    child_process.spawn(apm, ['update', 'kite']);
  },
  consumeStatusBar: function(statusbar) {
    statusbar.addRightTile({
      item: ready.getStatusItem(),
    });
  },
  completions: function() {
    return completions;
  },
};

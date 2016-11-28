const os = require('os');
const path = require('path');
const child_process = require('child_process');

const StateController = require('kite-installer').StateController;

const utils = require('./utils.js');
const metrics = require('./metrics.js');
const Login = require('./elements/login.js');

// minimum time between showing the same notification, in seconds
const NOTIFY_DELAY = 60 * 60;

var Ready = {
  onActivate () {
    atom.workspace.observeTextEditors((editor) => {
      editor.onDidChangePath(() => {
        this.ensureIfPython();
      });
    });
    atom.workspace.onDidChangeActivePaneItem((item) => {
      this.ensureIfPython();
    });

    setTimeout(this.ensure.bind(this));
  },

  // ensure checks that Kite is installed, running, reachable, authenticated,
  // and enabled in the current directory. If any of these checks fail then an
  // appropriate noficiation is displayed with a button that lets the user fix
  // the problem.
  ensure (forceNotify=false) {
    const curpath = this.currentPath();
    const doNothing = (state) => {};
    const onError = (err) => metrics.track("handleState failed", err);

    // Track message and call next after that
    const track = (message, next) => (state) => {
      metrics.track(message);
      next(state);
    };
    // Calls a notification method only when shouldNotify or forceNotify are
    // true
    const thenTryNotify = (method) => (state) =>
      (this.shouldNotify(state) || forceNotify) && this[method]();
    // Calls a notification method only when forceNotify is true
    const thenNotify = (method) => (state) => forceNotify && this[method]();

    // A map of actions to execute dependending on the state
    const checks = {
      [STATES.UNSUPPORTED]: thenTryNotify('warnNotSupported'),
      [STATES.UNINSTALLED]: thenTryNotify('warnNotInstalled'),
      [STATES.INSTALLED]: thenTryNotify('warnNotRunning'),
      [STATES.INSTALLED]: doNothing, // for now, ignore this
      [STATES.REACHABLE]: thenTryNotify('warnNotAuthenticated'),
      [STATES.AUTHENTICATED]: curpath !== null
        ? thenTryNotify('warnNotWhitelisted')(state)
        : thenNotify('notifyReady')(state),
      [STATES.WHITELISTED]: track('kite is ready', thenNotify('notifyReady'))
    };

    // Invokes the proper action dependending on the state
    const checkState = (state) => checks[state] && checks[state](state);

    // We return the promise so that a caller can use it.
    return StateController.handleState(curpath).then(checkState, onError);
  },

  // ensureAndNotify is like ensure but also shows a success notification if Kite is already running.
  ensureAndNotify () {
    this.ensure(true);
  },

  // ensureIfPython  ensure only if the currently active file extension matches that provided
  ensureIfPython () {
    var curpath = this.currentPath();
    //console.log(`curpath=${curpath} ext=${path.extname(curpath||"")}`);
    if (curpath !== null && path.extname(curpath) === ".py") {
      console.log("calling ensure");
      this.ensure();
    }
  },

  // currentPath gets the path for the current text editor
  currentPath () {
    var editor = atom.workspace.getActivePaneItem();
    if (editor === undefined || editor.buffer == undefined || editor.buffer.file == undefined) {
      return null;
    }
    return editor.buffer.file.path;
  },

  // lastRejected contains the last time the user rejected a notification for
  // the given state. It is used to prevent bugging the user too frequently with
  // notifications.
  lastRejected: {},

  // shouldNotify returns true if the user should be notified about the given
  // failure detected by ensure
  shouldNotify (state) {
    var prev = this.lastRejected[state];
    return prev === undefined || utils.secondsSince(prev) >= NOTIFY_DELAY;
  },

  warnNotSupported () {
    metrics.track("not-supported warning shown");
    atom.notifications.addError(
      "Kite doesn't support your OS", {
      description: "Sorry, the Kite autocomplete engine only supports macOS at the moment.",
      icon: "circle-slash",
      dismissable: true,
    }).onDidDismiss(() => {
      metrics.track("not-supported warning dismissed");
    });
  },

  warnNotInstalled () {
    var rejected = true;
    metrics.track("not-installed warning shown");
    var notification = atom.notifications.addWarning(
      "The Kite autocomplete engine is not installed", {
      description: "Install Kite to get Python completions, documentation, and examples.",
      icon: "circle-slash",
      dismissable: true,
      buttons: [{
        text: "Install Kite",
        onDidClick: () => {
          rejected = false;  // so that onDidDismiss knows that this was not a reject
          metrics.track("install button clicked (via not-installed warning)");
          notification.dismiss();
          this.install();
        }
      }]
    });
    notification.onDidDismiss(() => {
      if (rejected) {
        this.lastRejected[StateController.STATES.UNINSTALLED] = new Date();
        metrics.track("not-installed warning dismissed");
      }
    });
  },

  install () {
    metrics.track("download-and-install started");
    StateController.installKiteRelease().then(() => {
      metrics.track("download-and-install succeeded");
      this.launch();
    }, (err) => {
      metrics.track("download-and-install failed", err);

      // if install failed because kite is already installed then ignore
      var curState = err.data || 0;
      if (curState >= StateController.STATES.INSTALLED) {
        console.log("download-and-install failed because kite is already installed (state ${ curState })");
        return;
      }

      // show an error notification with an option to retry
      var notification = atom.notifications.addError("Unable to install Kite", {
        description: JSON.stringify(err),
        dismissable: true,
        buttons: [{
          text: "Retry",
          onDidClick: () => {
            metrics.track("retry button clicked (via download-and-install error)");
            notification.dismiss();
            this.install();
          }
        }]
      });
      notification.onDidDismiss(() => {
        metrics.track("download-and-install error dismissed");
      });
    });
  },

  warnNotRunning () {
    var rejected = true;
    metrics.track("not-running warning shown");
    var notification = atom.notifications.addWarning(
      "The Kite autocomplete engine is not running", {
      description: "Start the Kite background service to get Python completions, documentation, and examples.",
      icon: "circle-slash",
      dismissable: true,
      buttons: [{
        text: "Start Kite",
        onDidClick: () => {
          rejected = false;  // so that onDidDismiss knows that this was not a reject
          metrics.track("start button clicked (via not-running warning)");
          notification.dismiss();
          this.launch();
        }
      }]
    });
    notification.onDidDismiss(() => {
      if (rejected) {
        this.lastRejected[StateController.STATES.INSTALLED] = new Date();
        metrics.track("not-running warning dismissed");
      }
    });
  },

  launch () {
    metrics.track("launch started");
    StateController.runKiteAndWait().then(() => {
      metrics.track("launch succeeded");
      this.ensure();
    }, (err) => {
      metrics.track("launch failed", err);

      // if launch failed because kite is already running then ignore
      var curState = err.data || 0;
      if (curState >= StateController.STATES.RUNNING) {
        console.log(`launch failed because kite is already installed (state ${curState})`);
        return;
      }

      // show an error notification with an option to retry
      var notification = atom.notifications.addError("Unable to start Kite autocomplete engine", {
        description: JSON.stringify(err),
        dismissable: true,
        buttons: [{
          text: "Retry",
          onDidClick: () => {
            metrics.track("retry button clicked (via launch error)");
            notification.dismiss();
            this.launch();
          }
        }]
      });
      notification.onDidDismiss(() => {
        metrics.track("launch error dismissed");
      });
    });
  },

  // this situation is currently ignored, so this function is never called
  warnNotReachable () {
    metrics.track("not-reachable warning shown");
    atom.notifications.addError(
      "The Kite background service is running but not reachable", {
      description: "Try killing Kite from the Activity Monitor.",
      dismissable: true,
    }).onDidDismiss(() => {
      metrics.track("not-reachable warning dismissed");
      this.lastRejected[StateController.STATES.RUNNING] = new Date();
    });
  },

  warnNotAuthenticated () {
    var rejected = true;
    metrics.track("not-authenticated warning shown");
    var notification = atom.notifications.addWarning(
      "You need to login to the Kite autocomplete engine", {
      description: "Kite needs to be authenticated, so that it can access the index of your code stored on the cloud.",
      icon: "circle-slash",
      dismissable: true,
      buttons: [{
        text: "Login",
        onDidClick: () => {
          rejected = false;  // so that onDidDismiss knows that this was not a reject
          metrics.track("login button clicked (via not-authenticated warning)");
          notification.dismiss();
          this.authenticate();
        }
      }]
    });
    notification.onDidDismiss(() => {
      if (rejected) {
        this.lastRejected[StateController.STATES.REACHABLE] = new Date();
        metrics.track("not-authenticated warning dismissed");
      }
    });
  },

  authenticate () {
    var login = new Login();
    var panel = atom.workspace.addTopPanel({item: login.element});

    login.onCancel(() => {
      panel.destroy();
      login.destroy();
      metrics.track("cancel clicked in login panel");
    });

    login.onResetPassword(() => {
      metrics.track("reset password clicked in login panel");
      var url = `https://alpha.kite.com/account/resetPassword/request?email=${login.email}`;
      child_process.spawn('open', [url]);
      panel.destroy();
      login.destroy();
    });

    login.onSubmit(() => {
      var email = login.email;
      var password = login.password;
      panel.destroy();
      login.destroy();
      metrics.track("submit clicked in login panel", {email: email});

      metrics.track("authentication started", {email: email});
      StateController.authenticateUser(email, password).then(() => {
        metrics.track("authentication succeeded", {email: email});
        this.ensure();
      }, (err) => {
        metrics.track("authentication failed", err);

        // if authentication failed because kite is already authenticated then ignore
        var curState = err.data || 0;
        if (curState >= StateController.STATES.AUTHENTICATED) {
          console.log(`launch failed because kite is already installed (state ${curState})`);
          return;
        }

        // show an error notification with an option to retry
        var notification = atom.notifications.addError("Unable to login", {
          description: JSON.stringify(err),
          dismissable: true,
          buttons: [{
            text: "Retry",
            onDidClick: () => {
              metrics.track("retry button clicked (via authentication error)");
              notification.dismiss();
              this.authenticate();
            }
          }]
        });
        notification.onDidDismiss(() => {
          metrics.track("authentication error dismissed");
        });
      });
    });
  },

  warnNotWhitelisted (filepath) {
    var dir = path.dirname(filepath);
    metrics.track("not-whitelisted warning shown", {dir: dir});

    var rejected = true;
    var notification = atom.notifications.addWarning(
      "The Kite autocomplete engine is disabled for "+path.basename(filepath), {
      description: "Would you like to enable Kite for Python files in "+dir+"?",
      icon: "circle-slash",
      dismissable: true,
      buttons: [{
        text: "Enable",
        onDidClick: () => {
          rejected = false;  // so that onDidDismiss knows that this was not a reject
          metrics.track("enable button clicked (via not-whitelisted warning)", {dir: dir});
          notification.dismiss();
          this.whitelist(dir);
        }
      }]
    });
    notification.onDidDismiss(() => {
      if (rejected) {
        metrics.track("not-whitelisted warning dismissed", {dir: dir});
        this.lastRejected[StateController.STATES.AUTHENTICATED] = new Date();
      }
    });
  },

  whitelist (dirpath) {
    metrics.track("whitelisting started", {dir: dirpath});
    StateController.whitelistPath(dirpath).then(() => {
      metrics.track("whitelisting succeeded", {dir: dirpath});
      this.ensure();
    }, (err) => {
      metrics.track("whitelisting failed", {dir: dirpath});

      // if whitelist failed because dir is already whitelisted then ignore
      var curState = err.data || 0;
      if (curState >= StateController.STATES.WHITELISTED) {
        console.log("whitelist failed because dir is already whitelisted (state ${ curState })");
        return;
      }

      // show an error notification with an option to retry
      var notification = atom.notifications.addError("Unable to enable Kite for "+dirpath, {
        description: JSON.stringify(err),
        dismissable: true,
        buttons: [{
          text: "Retry",
          onDidClick: () => {
            metrics.track("retry clicked (via whitelisting-failed error)", {dir: dirpath});
            notification.dismiss();
            this.whitelist(dirpath);
          }
        }]
      });
      notification.onDidDismiss(() => {
        metrics.track("whitelisting error dismissed");
      });
    });
  },

  notifyReady () {
    metrics.track("ready notification shown");
    atom.notifications.addSuccess(
      "The Kite autocomplete engine is ready", {
      description: "We checked that the autocomplete engine is installed, running, responsive, and authenticated.",
      dismissable: true,
    }).onDidDismiss(() => {
      metrics.track("ready notification dismissed");
    });
  }
};

module.exports = Ready;

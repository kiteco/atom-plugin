'use strict';

const os = require('os');
const path = require('path');
const child_process = require('child_process');
const {CompositeDisposable} = require('atom');

const {AccountManager, StateController, utils: kiteUtils} = require('kite-installer');
const {findClosestGitRepo} = kiteUtils;

const utils = require('./utils.js');
const metrics = require('./metrics.js');
const Login = require('./elements/login.js');
const StatusItem = require('./elements/status.js');

// minimum time between showing the same notification, in seconds
const NOTIFY_DELAY = 60 * 60;

const INVALID_PASSWORD = 6;
const PASSWORD_LESS_USER = 9;

var Ready = {
  statusItem: new StatusItem(),

  getStatusItem: function() {
    return this.statusItem;
  },

  updateStatusItem: function(state) {
    switch (state) {
      case StateController.STATES.UNSUPPORTED:
        this.statusItem.setState("kite-status-error", "Kite only supports macOS at the moment.");
        break;
      case StateController.STATES.UNINSTALLED:
        this.statusItem.setState("kite-status-error", "Kite is not installed.");
        break;
      case StateController.STATES.INSTALLED:
        this.statusItem.setState("kite-status-error", "Kite is not running.");
        break;
      case StateController.STATES.RUNNING:
        this.statusItem.setState("kite-status-error", "Kite is running but not reachable.");
        break;
      case StateController.STATES.REACHABLE:
        this.statusItem.setState("kite-status-error", "Kite is not authenticated.");
        break;
      case StateController.STATES.AUTHENTICATED:
        this.statusItem.setState("kite-status-not-whitelisted", "Kite is not enabled for the current directory.");
        break;
      case StateController.STATES.WHITELISTED:
        this.statusItem.setState("kite-status-ready", "Kite is ready.");
        break;
      default:
        this.statusItem.setState("kite-status-unknown", `Kite is unknown state ${state}.`);
        break;
    }
  },

  onActivate: function() {
    // All event disposables returned by Atom's event methods should be stored
    // into a composite disposable for later use
    const subscriptions = new CompositeDisposable()
    subscriptions.add(atom.workspace.observeTextEditors((editor) => {
      editor.onDidChangePath(() => {
        this.ensureIfPython();
      });
    }));
    subscriptions.add(atom.workspace.onDidChangeActivePaneItem((item) => {
      this.ensureIfPython();
    }));

    setTimeout(() => this.ensure());
    this.statusItem.onClick(() => this.ensure());

    return subscriptions;
  },

  // ensure checks that Kite is installed, running, reachable, authenticated,
  // and enabled in the current directory. If any of these checks fail then an
  // appropriate noficiation is displayed with a button that lets the user fix
  // the problem.
  ensure: function(forceNotify) {
    forceNotify = forceNotify || false;
    var curpath = this.currentPath();
    StateController.handleState(curpath).then((state) => {
      this.updateStatusItem(state);
      switch (state) {
        case StateController.STATES.UNSUPPORTED:
          if (this.shouldNotify(state) || forceNotify) {
            this.warnNotSupported();
          }
          break;
        case StateController.STATES.UNINSTALLED:
          if (this.shouldNotify(state) || forceNotify) {
            this.warnNotInstalled();
          }
          break;
        case StateController.STATES.INSTALLED:
          if (this.shouldNotify(state) || forceNotify) {
            this.warnNotRunning();
          }
          break;
        case StateController.STATES.RUNNING:
          // for now, ignore this
          break;
        case StateController.STATES.REACHABLE:
          if (this.shouldNotify(state) || forceNotify) {
            this.warnNotAuthenticated();
          }
          break;
        case StateController.STATES.AUTHENTICATED:
          if (curpath !== null) {
            if (this.shouldNotify(state) || forceNotify) {
              this.warnNotWhitelisted(curpath);
            }
          } else if (forceNotify) {
            this.notifyReady();
          }
          break;
        case StateController.STATES.WHITELISTED:
          metrics.track("kite is ready");
          if (forceNotify) {
            this.notifyReady();
          }
          break;
      }
    }, (err) => {
      metrics.track("handleState failed", err);
    });
  },

  // ensureAndNotify is like ensure but also shows a success notification if Kite is already running.
  ensureAndNotify: function() {
    this.ensure(true);
  },

  // ensureIfPython  ensure only if the currently active file extension matches that provided
  ensureIfPython: function() {
    var curpath = this.currentPath();
    //console.log(`curpath=${curpath} ext=${path.extname(curpath||"")}`);
    if (curpath !== null && path.extname(curpath) === ".py") {
      console.log("calling ensure");
      this.ensure();
    }
  },

  // currentPath gets the path for the current text editor
  currentPath: function() {
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
  shouldNotify: function(state) {
    var prev = this.lastRejected[state];
    return prev === undefined || utils.secondsSince(prev) >= NOTIFY_DELAY;
  },

  warnNotSupported: function() {
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

  warnNotInstalled: function() {
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

  install: function() {
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

  warnNotRunning: function() {
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

  launch: function() {
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
  warnNotReachable: function() {
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

  warnNotAuthenticated: function() {
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

  authenticate: function() {
    var login = new Login();
    var panel = atom.workspace.addModalPanel({item: login.element});
    login.emailInput.focus()

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
      var password = login.password || 'password';
      metrics.track("submit clicked in login panel", {email});

      if (!email || email.trim() === '') {
        login.showError('Invalid email')
        return;
      }

      login.hideStatus()

      metrics.track("authentication started", {email});
      AccountManager.login({email, password}, (res) => {
        switch (res.statusCode) {
          case 200:
            metrics.track("authentication succeeded", {email});
            this.ensure();
            disposeUI()
            break;
          case 400:
          case 401:
            kiteUtils.handleResponseData(res, (raw) => {
              const data = JSON.parse(raw)
              console.log(data)
              switch (data.code) {
                // Password-less
                case INVALID_PASSWORD:
                  login.showError('Invalid password')
                  break;
                case PASSWORD_LESS_USER:
                  login.passwordLessForm()
                  break;
                default:
                  onUnauthorized({ type: 'unauthorized' })
                  disposeUI()
              }
            })
        }
      });

      function disposeUI () {
        panel.destroy();
        login.destroy();
      }

      function onUnauthorized (err) {
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
      }
    });
  },

  warnNotWhitelisted: function(filepath) {
    var dir = path.dirname(filepath);
    var suggested =  findClosestGitRepo(dir) || dir;
    var metricsInfo = {dir: dir, suggested: suggested};
    metrics.track("not-whitelisted warning shown", metricsInfo);

    var rejected = true;
    var notification = atom.notifications.addWarning(
      "The Kite autocomplete engine is disabled for "+path.basename(filepath), {
      description: "Would you like to enable Kite for Python files in "+suggested+"?",
      icon: "circle-slash",
      dismissable: true,
      buttons: [{
        text: "Enable",
        onDidClick: () => {
          rejected = false;  // so that onDidDismiss knows that this was not a reject
          metrics.track("enable button clicked (via not-whitelisted warning)", metricsInfo);
          notification.dismiss();
          this.whitelist(suggested);
        }
      }]
    });
    notification.onDidDismiss(() => {
      if (rejected) {
        metrics.track("not-whitelisted warning dismissed", metricsInfo);
        this.lastRejected[StateController.STATES.AUTHENTICATED] = new Date();
      }
    });
  },

  whitelist: function(dirpath) {
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

  notifyReady: function() {
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

'use strict';

const os = require('os');
const { CompositeDisposable, Emitter } = require('atom');
const KiteAPI = require('kite-api');
const { STATES } = KiteAPI;
const { fromSetting, all } = require('./conditions');
const NotificationQueue = require('./notification-queue');

class NotificationsCenter {
  get NOTIFIERS() {
    return {
      [STATES.UNSUPPORTED]: 'warnNotSupported',
      // [STATES.UNINSTALLED]: 'warnNotInstalled',
      // [STATES.INSTALLED]: 'warnNotRunning',
      [STATES.RUNNING]: 'warnNotReachable',
      [STATES.REACHABLE]: 'warnNotAuthenticated',
      // [STATES.WHITELISTED]: 'notifyReady',
    };
  }

  get NOTIFICATION_METRICS() {
    return {
      [STATES.UNSUPPORTED]: 'not-supported',
      // [STATES.UNINSTALLED]: 'not-installed',
      // [STATES.INSTALLED]: 'not-running',
      [STATES.RUNNING]: 'not-reachable',
      [STATES.REACHABLE]: 'not-authenticated',
      // [STATES.WHITELISTED]: 'ready',
    };
  }

  pauseNotifications() {
    this.paused = true;
  }

  resumeNotifications() {
    this.paused = false;
  }

  constructor(app) {
    this.app = app;
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.lastShown = {};
    this.queue = new NotificationQueue();
    this.hasSeenGoBetaNotification = false;

    this.subscriptions.add(
      app.onDidGetState(({ state, canNotify }) => {
        if (canNotify && this.shouldNotify(state)) {
          this.notify(state);
        }
      })
    );

    this.subscriptions.add(
      this.queue.onDidNotify(notification => {
        const { type, metric, key } = this.extractNotificationMetrics(notification);

        this.lastShown[key] = new Date();
        this.emit('did-notify', {
          notification: metric,
          type,
        });
      })
    );

    this.subscriptions.add(
      this.queue.onDidClickNotificationButton(({ notification, button }) => {
        const { type, metric } = this.extractNotificationMetrics(notification);

        this.emit('did-click-notification-button', {
          button: button.metric,
          notification: metric,
          type,
        });
      })
    );

    this.subscriptions.add(
      this.queue.onDidDismissNotification(notification => {
        const { type, metric } = this.extractNotificationMetrics(notification);

        this.emit('did-dismiss-notification', {
          notification: metric,
          type,
        });
      })
    );
    this.subscriptions.add(
      this.queue.onDidRejectNotification(notification => {
        const { type, metric } = this.extractNotificationMetrics(notification);

        this.emit('did-reject-notification', {
          notification: metric,
          type,
        });
      })
    );
  }

  extractNotificationMetrics(notification) {
    const options = notification.options;
    const type = options.metricType || notification.level;
    const metric = typeof options.metric === 'number' ? this.NOTIFICATION_METRICS[options.metric] : options.metric;
    const key = options.key || options.metric;

    return { type, metric, key };
  }

  onDidNotify(listener) {
    return this.emitter.on('did-notify', listener);
  }

  onDidRejectNotification(listener) {
    return this.emitter.on('did-reject-notification', listener);
  }

  onDidDismissNotification(listener) {
    return this.emitter.on('did-dismiss-notification', listener);
  }

  onDidClickNotificationButton(listener) {
    return this.emitter.on('did-click-notification-button', listener);
  }

  activateForcedNotifications() {
    this.forceNotification = true;
  }

  deactivateForcedNotifications() {
    this.forceNotification = false;
  }

  dispose() {
    this.queue.abort();
    this.subscriptions.dispose();
    this.emitter.dispose();
    delete this.app;
    delete this.subscriptions;
    delete this.emitter;
  }

  notify(state) {
    this[this.NOTIFIERS[state]] && this[this.NOTIFIERS[state]](state);
  }

  showGoBetaNotification(kite) {
    if (this.hasSeenGoBetaNotification || !atom.config.get('kite.showGoBetaNotification')) {
      return;
    }
    this.queue.addInfo(
      'Welcome to the Kite for Go Beta!',
      {
        dismissable: true,
        description: 'You\'ve got early access to our line-of-code completions for Go, powered by machine learning. If you\'d like to disable the beta, you can do so in the Copilot.',
        buttons: [
          {
            text: 'Open Copilot',
            onDidClick(dismiss) {
              kite.openCopilot();
              dismiss && dismiss();
            },
          },
          {
            text: 'Hide Forever',
            onDidClick(dismiss) {
              atom.config.set('kite.showGoBetaNotification', false);
              dismiss && dismiss();
            },
          },
        ],
      }
    );
    this.queue.onDidNotify(listener => {
      this.hasSeenGoBetaNotification = true;
    })
  }

  onboardingNotifications(hasSeenOnboarding) {
    this.queue.addInfo(
      'Kite is now integrated with Atom',
      {
        dismissable: true,
        description:
          'Kite is an AI-powered programming assistant that shows you the right information at the right time to keep you in the flow.',
        buttons: [
          {
            text: 'Learn how to use Kite',
            onDidClick(dismiss) {
              atom.applicationDelegate.openExternal('http://help.kite.com/category/43-atom-integration');
              atom.config.set('kite.showWelcomeNotificationOnStartup', false);
              dismiss && dismiss();
            },
          },
          {
            text: "Don't show this again",
            onDidClick(dismiss) {
              atom.config.set('kite.showWelcomeNotificationOnStartup', false);
              dismiss && dismiss();
            },
          },
        ],
      },
      {
        condition: all(fromSetting('kite.showWelcomeNotificationOnStartup'), () => !atom.inSpecMode()),
      }
    );
  }

  warnNotSupported(state) {
    let description = 'Sorry, the Kite engine only supports macOS and Windows at the moment.';

    switch (os.platform()) {
      case 'win32':
        const arch = KiteAPI.arch();
        if (arch !== '64bit') {
          description = `Sorry, the Kite engine only supports Windows7 and higher with a 64bit architecture.
          Your version is actually recognised as: ${arch}`;
        } else {
          description = 'Sorry, the Kite engine only supports Windows7 and higher.';
        }
        break;
      case 'darwin':
        description = 'Sorry, the Kite engine only supports OSX 10.10 (Yosemite) and higher.';
        break;
      case 'linux':
        description = 'Sorry, the Kite engine only supports Ubuntu 18.04 and higher';
        break;
    }

    this.queue.addError(
      "Kite doesn't support your OS",
      {
        description,
        icon: 'circle-slash',
      },
      {
        metric: state,
      }
    );
  }

  warnNotInstalled(state) {
    if (!this.app.wasInstalledOnce()) {
      this.queue.addWarning(
        'The Kite engine is not installed',
        {
          description: 'Install Kite to get Python completions, documentation, and examples.',
          icon: 'circle-slash',
          buttons: [
            {
              text: 'Install Kite',
              metric: 'install',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.install();
              },
            },
          ],
        },
        {
          metric: state,
        }
      );
    }
  }

  warnNotRunning(state) {
    Promise.all([
      KiteAPI.isKiteInstalled()
        .then(() => true)
        .catch(() => false),
      KiteAPI.isKiteEnterpriseInstalled()
        .then(() => true)
        .catch(() => false),
    ]).then(([kiteInstalled, kiteEnterpriseInstalled]) => {
      if (KiteAPI.hasManyKiteInstallation() || KiteAPI.hasManyKiteEnterpriseInstallation()) {
        this.queue.addWarning(
          'The Kite engine is not running',
          {
            description: 'You have multiple versions of Kite installed. Please launch your desired one.',
            icon: 'circle-slash',
          },
          {
            metric: state,
          }
        );
      } else if (kiteInstalled && kiteEnterpriseInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running',
          {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [
              {
                text: 'Start Kite',
                metric: 'start',
                onDidClick: dismiss => {
                  dismiss && dismiss();
                  this.app && this.app.start().catch(err => this.warnFailedStart(err));
                },
              },
              {
                text: 'Start Kite Enterprise',
                metric: 'startEnterprise',
                onDidClick: dismiss => {
                  dismiss && dismiss();
                  this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
                },
              },
            ],
          },
          {
            metric: state,
          }
        );
      } else if (kiteInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running',
          {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [
              {
                text: 'Start Kite',
                metric: 'start',
                onDidClick: dismiss => {
                  dismiss && dismiss();
                  this.app && this.app.start().catch(err => this.warnFailedStart(err));
                },
              },
            ],
          },
          {
            metric: state,
          }
        );
      } else if (kiteEnterpriseInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running',
          {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [
              {
                text: 'Start Kite Enterprise',
                metric: 'startEnterprise',
                onDidClick: dismiss => {
                  dismiss && dismiss();
                  this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
                },
              },
            ],
          },
          {
            metric: state,
          }
        );
      }
    });
  }

  warnFailedStart(err) {
    this.queue.addError(
      'Unable to start Kite engine',
      {
        description: JSON.stringify(err),
        buttons: [
          {
            text: 'Retry',
            metric: 'retry',
            onDidClick: dismiss => {
              dismiss && dismiss();
              this.app && this.app.start().catch(err => this.warnFailedStart(err));
            },
          },
        ],
      },
      {
        metric: 'launch',
      }
    );
  }

  warnFailedStartEnterprise(err) {
    this.queue.addError(
      'Unable to start Kite engine',
      {
        description: JSON.stringify(err),
        buttons: [
          {
            text: 'Retry',
            metric: 'retryEnterprise',
            onDidClick: dismiss => {
              dismiss && dismiss();
              this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
            },
          },
        ],
      },
      {
        metric: 'launchEnterprise',
      }
    );
  }

  warnNotReachable(state) {
    this.queue.addError(
      'The Kite background service is running but not reachable',
      {
        description: 'Try killing Kite from the Activity Monitor.',
      },
      {
        metric: state,
      }
    );
  }

  warnNotAuthenticated(state) {
    if (navigator.onLine && !document.querySelector('kite-login')) {
      this.queue.addWarning(
        'You need to login to the Kite engine',
        {
          description: ['Kite needs to be authenticated to access', 'the index of your code stored on the cloud.'].join(
            ' '
          ),
          icon: 'circle-slash',
          buttons: [
            {
              text: 'Login',
              metric: 'login',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.login();
              },
            },
          ],
        },
        {
          metric: state,
        }
      );
    }
  }

  warnUnauthorized(err) {
    this.queue.addError(
      'Unable to login',
      {
        description: JSON.stringify(err),
        buttons: [
          {
            text: 'Retry',
            metric: 'retry',
            onDidClick: dismiss => {
              dismiss && dismiss();
              this.app && this.app.login();
            },
          },
        ],
      },
      {
        metric: 'unauthorized',
      }
    );
  }

  warnOnboardingFileFailure() {
    this.queue.addWarning('We were unable to open the tutorial', {
      description:
        'We had an internal error setting up our interactive tutorial. Try again later, or email us at feedback@kite.com',
      buttons: [
        {
          text: 'OK',
          onDidClick: dismiss => dismiss && dismiss(),
        },
      ],
    });
  }

  warnKSGNotSupported() {
    this.queue.addWarning('This feature is only available for Python files.', {
      description: "Kite's Search Stack Overflow is specialized for Python.",
      buttons: [
        {
          text: 'OK',
          onDidClick: dismiss => dismiss && dismiss(),
        },
      ],
    });
  }

  notifyReady(state) {
    this.queue.addSuccess(
      'The Kite engine is ready',
      {
        description: 'We checked that the autocomplete engine is installed, running, responsive, and authenticated.',
      },
      {
        metric: state,
        metricType: 'notification',
      }
    );
  }

  shouldNotify(state) {
    return (
      this.forceNotification ||
      (this.app &&
        this.app.kite.getModule('editors').hasActiveSupportedFile() &&
        !this.lastShown[state] &&
        !this.paused)
    );
  }

  emit(...args) {
    this.emitter && this.emitter.emit(...args);
  }

  truncateLeft(string, length) {
    return string.length <= length ? string : `…${string.slice(string.length - length)}`;
  }
}

module.exports = NotificationsCenter;

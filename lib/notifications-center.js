'use strict';

const os = require('os');
const { CompositeDisposable, Emitter } = require('atom');
const KiteAPI = require('kite-api');
const { STATES } = KiteAPI;
const { fromSetting, all } = require('./conditions');
const { record } = require('./metrics');
const NotificationQueue = require('./notification-queue');

class NotificationsCenter {
  get NOTIFIERS() {
    return {
      [STATES.UNSUPPORTED]: 'warnNotSupported',
      [STATES.RUNNING]: 'warnNotReachable',
      [STATES.REACHABLE]: 'warnNotAuthenticated',
    };
  }

  get NOTIFICATION_METRICS() {
    return {
      [STATES.UNSUPPORTED]: 'not-supported',
      [STATES.RUNNING]: 'not-reachable',
      [STATES.REACHABLE]: 'not-authenticated',
    };
  }

  pauseNotifications() {
    this.paused = true;
  }

  resumeNotifications() {
    this.paused = false;
  }

  constructor(kiteApp) {
    this.app = kiteApp;
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.lastShown = {};
    this.queue = new NotificationQueue();

    this.subscriptions.add(
      this.app.onDidGetState(({ state, canNotify }) => {
        if (canNotify && this.shouldNotify(state)) {
          this.notify(state);
        }
      }),
      this.app.onWillDownload(() => {
        this.notifyInstallStart();
      }),
      this.app.onDidFailInstall(() => {
        this.warnInstallFailed();
      }),
      this.app.onKiteUninstalledAndInstallUnavailable(() => {
        if (!atom.config.get('kite.installPausedNotifShown')) {
          atom.config.set('kite.installPausedNotifShown', true);
          this.showInstallPausedNotif();
        }
      }),
      this.app.onKiteUninstalledAndInstallAvailable(installFn => {
        if (atom.config.get('kite.installPausedNotifShown')) {
          atom.config.set('kite.installPausedNotifShown', undefined);
          this.showInstallUnpausedNotif(installFn);
          return;
        }
        this.warnNotInstalled(installFn);
      }),
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

  showInstallPausedNotif() {
    this.queue.addInfo(
      'Temporarily Unable to Install',
      {
        dismissable: true,
        description:
          'Kite requires the Kite Engine application to function. ' +
          'Unfortunately the Kite Engine is unavailable to download for the next few weeks. ' +
          'This plugin will let you know when it is available.',
        buttons: [
          {
            text: 'Don\'t show again',
            onDidClick(dismiss) {
              dismiss && dismiss();
            },
          },
          {
            text: 'Learn more',
            onDidClick(dismiss) {
              atom.applicationDelegate.openExternal('https://kite.com/kite-is-temporarily-unavailable/?source=atom');
              dismiss && dismiss();
            },
          },
        ],
      }
    );
  }

  showInstallUnpausedNotif(install) {
    this.queue.addInfo(
      'Kite is Installable Again',
      {
        dismissable: true,
        description:
          'The Kite Enngine application is installable again. ' +
          'Kite requires the Kite Engine desktop application to provide completions and documentation. ' +
          'Please install it to use Kite.',
        buttons: [
          {
            text: 'Install',
            onDidClick(dismiss) {
              if (!install) {
                atom.applicationDelegate.openExternal('https://www.kite.com/install/?utm_medium=editor&utm_source=atom');
              } else {
                install();
              }
              dismiss && dismiss();
            },
          },
          {
            text: 'Learn More',
            onDidClick(dismiss) {
              atom.applicationDelegate.openExternal('https://www.kite.com/copilot/');
              dismiss && dismiss();
            },
          },
        ],
      }
    );
  }

  onboardingNotifications() {
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

  warnNotInstalled(install) {
    this.queue.addWarning(
      'The Kite engine is not installed',
      {
        description:
        'Kite requires the Kite Copilot desktop application to provide completions and documentation.'
          + '\n\nPlease install it to use Kite.',
        icon: 'circle-slash',
        buttons: [
          {
            text: 'Install Kite',
            onDidClick: dismiss => {
              dismiss && dismiss();
              if (!install) {
                open('https://www.kite.com/install/?utm_medium=editor&utm_source=atom');
              } else {
                install();
              }
            },
          },
          {
            text: 'Learn More',
            onDidClick: dismiss => {
              dismiss && dismiss();
              open('https://www.kite.com/copilot/');
            },
          },
        ],
      },
    );
  }

  notifyInstallStart() {
    this.queue.addInfo('Installing Kite', {
      description:
      'Kite ships with a standalone application called the Copilot that can show you documentation while you code.'
        + '\n\nThe Copilot will launch automatically after Kite is finished installing.',
      buttons: [
        {
          text: 'OK',
          onDidClick: dismiss => dismiss && dismiss(),
        },
        {
          text: 'Learn More',
          onDidClick: dismiss => {
            dismiss && dismiss();
            open('https://www.kite.com/copilot/');
          },
        },
      ],
    });
  }

  warnInstallFailed() {
    this.queue.addError(
      'Kite Installation Failed',
      {
        description:
        'There was an error installing the Kite Copilot, which is required for Kite to provide completions and documentation.'
          + '\n\nPlease install it to use Kite.',
        icon: 'circle-slash',
        buttons: [
          {
            text: 'Install Kite',
            onDidClick: dismiss => {
              dismiss && dismiss();
              open('https://www.kite.com/install/?utm_medium=editor&utm_source=atom');
            },
          },
        ],
      },
    );
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

  notifyFromError(err, defaultTitle, defaultBody) {
    const tryNotifyFillDefault = (title, body) => {
      // Must contain some title and some body
      if ((!title && !defaultTitle) || (!defaultBody && !body)) {
        return;
      }
      this.queue.addWarning(title || defaultTitle, {
        description: body || defaultBody,
        buttons: [
          {
            text: 'OK',
            onDidClick: dismiss => dismiss && dismiss(),
          },
        ],
      });
    };

    if (!err) {
      return;
    }
    if (!err.data) {
      tryNotifyFillDefault(null, null);
      return;
    }

    const { state, responseData } = err.data;
    if (!responseData) {
      tryNotifyFillDefault(null, null);
      return;
    }

    if (state && state <= KiteAPI.STATES.UNREACHABLE) {
      this.warnNotRunning(state);
      return;
    }

    try {
      const { notification: notif, message } = JSON.parse(responseData);
      if (notif) {
        this.queue.addWarning(notif.title, {
          description: notif.body,
          buttons: notif.buttons.map(button => {
            return {
              text: button.text,
              onDidClick: function(btn) {
                switch (btn.action) {
                  case 'open':
                    return (dismiss) => {
                      atom.applicationDelegate.openExternal(btn.link);
                      dismiss();
                    };
                  case 'dismiss':
                    // fallthrough
                  default:
                    return (dismiss) => dismiss && dismiss();
                }
              }(button),
            };
          }),
        });
      } else if (message) {
        tryNotifyFillDefault(null, message);
      } else {
        tryNotifyFillDefault(null, null);
      }
    } catch (e) {
      tryNotifyFillDefault(null, null);
    }
  }

  shouldNotify(state) {
    return this.forceNotification || (!this.lastShown[state] && !this.paused);
  }

  emit(...args) {
    this.emitter && this.emitter.emit(...args);
  }

  truncateLeft(string, length) {
    return string.length <= length ? string : `…${string.slice(string.length - length)}`;
  }
}

module.exports = NotificationsCenter;

'use strict';

const os = require('os');
const {CompositeDisposable, Emitter} = require('atom');
const KiteAPI = require('kite-api');
const Logger = require('kite-connector/lib/logger');
const {STATES} = KiteAPI;
const DataLoader = require('./data-loader');
const {fromSetting, all} = require('./conditions');
const toSentence = a => `${a.slice(0, -1).join(', ')} and ${a.pop()}`;
const KiteNotification = require('./kite-notification');
const NotificationQueue = require('./notification-queue');
const metrics = require('./metrics');

class NotificationsCenter {
  get NOTIFIERS() {
    return {
      [STATES.UNSUPPORTED]: 'warnNotSupported',
      // [STATES.UNINSTALLED]: 'warnNotInstalled',
      // [STATES.INSTALLED]: 'warnNotRunning',
      [STATES.RUNNING]: 'warnNotReachable',
      [STATES.REACHABLE]: 'warnNotAuthenticated',
      // [STATES.AUTHENTICATED]: 'warnNotWhitelisted',
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
      // [STATES.AUTHENTICATED]: 'not-whitelisted',
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

    this.subscriptions.add(app.onDidGetState(({ state, canNotify }) => {
      if (canNotify && this.shouldNotify(state)) { this.notify(state); }
    }));

    this.subscriptions.add(app.onDidGetUnauthorized(err => {
      this.warnUnauthorized(err);
    }));

    this.subscriptions.add(app.onDidFailWhitelist(err => {
      this.warnWhitelistFailure(err);
    }));

    this.subscriptions.add(this.queue.onDidNotify(notification => {
      const {type, metric, key} = this.extractNotificationMetrics(notification);

      this.lastShown[key] = new Date();
      this.emit('did-notify', {
        notification: metric, type,
      });
    }));

    this.subscriptions.add(this.queue.onDidClickNotificationButton(({notification, button}) => {
      const {type, metric} = this.extractNotificationMetrics(notification);

      this.emit('did-click-notification-button', {
        button: button.metric,
        notification: metric,
        type,
      });
    }));

    this.subscriptions.add(this.queue.onDidDismissNotification(notification => {
      const {type, metric} = this.extractNotificationMetrics(notification);

      this.emit('did-dismiss-notification', {
        notification: metric, type,
      });
    }));
    this.subscriptions.add(this.queue.onDidRejectNotification(notification => {
      const {type, metric} = this.extractNotificationMetrics(notification);

      this.emit('did-reject-notification', {
        notification: metric, type,
      });
    }));
  }

  extractNotificationMetrics(notification) {
    const options = notification.options;
    const type = options.metricType || notification.level;
    const metric = typeof options.metric === 'number'
      ? this.NOTIFICATION_METRICS[options.metric]
      : options.metric;
    const key = options.key || options.metric;

    return {type, metric, key};
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
    this.preventBlacklistOnDismiss = true;
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

  startupNotifications() {
    this.queue.addInfo('Welcome to Kite for Atom', {
      dismissable: true,
      buttons: [{
        text: 'Learn how to use Kite',
        onDidClick(dismiss) {
          atom.applicationDelegate.openExternal('http://help.kite.com/category/43-atom-integration');
          dismiss && dismiss();
        },
      }, {
        text: "Don't show this again",
        onDidClick(dismiss) {
          atom.config.set('kite.showWelcomeNotificationOnStartup', false);
          dismiss && dismiss();
        },
      }],
    }, {
      condition: all(
        fromSetting('kite.showWelcomeNotificationOnStartup'),
        () => !atom.inSpecMode()),
    });

    this.queue.add(() => {
      if (!atom.config.get('kite.showEditorVacanciesNotificationOnStartup')) {
        return null;
      }
      metrics.featureRequested('editor_vacancy_notification');

      return DataLoader.getPlugins()
      .then(({plugins}) => {
        const vacancies = plugins
        .filter(p => !p.encountered && p.editors.length && !p.editors.some(e => e.plugin_installed));

        const buttons = [{
          text: 'Show me',
          onDidClick(dismiss) {
            metrics.featureRequested('editor_vacancy_notification_install');
            atom.applicationDelegate.openExternal('kite://settings/plugins');
            metrics.featureFulfilled('editor_vacancy_notification_install');
            dismiss && dismiss();
          },
        }, {
          text: 'Never ask again',
          onDidClick(dismiss) {
            metrics.featureRequested('editor_vacancy_notification_disabled');
            atom.config.set('kite.showEditorVacanciesNotificationOnStartup', false);
            metrics.featureFulfilled('editor_vacancy_notification_disabled');
            dismiss && dismiss();
          },
        }];

        const onDidDismiss = res => {
          // res is the text of the button when it's an action that leads
          // to the notification dismissal
          if (!res) {
            metrics.featureRequested('editor_vacancy_notification_dismiss');
            metrics.featureFulfilled('editor_vacancy_notification_dismiss');
          }
        };

        // If we have some editors in vacancies we'll display the notification as
        // there's no other conditions
        metrics.featureFulfilled('editor_vacancy_notification');

        if (vacancies.length === 1) {
          const [plugin] = vacancies;
          return new KiteNotification(
            'info',
            `Kite is available for ${plugin.name}`,
            {
              description: `Would you like to install Kite for ${plugin.name}?`,
              dismissable: true,
              buttons,
            }, {onDidDismiss});
        } else if (vacancies.length > 1) {
          return new KiteNotification(
            'info',
            'Kite supports other editors on your system',
            {
              description: `Kite also supports ${toSentence(vacancies.map(v => v.name))}.
Would you like to install Kite for these editors?`,
              dismissable: true,
              buttons,
            }, {onDidDismiss});
        } else {
          return null;
        }
      })
      .catch(err => {});
    });

    this.queue.addModal({
      content: `
        <p>Kite can periodically send information to our servers about the status
        of the Kite application to ensure that is is running correctly.</p>
        <p>Click <i>"Yes"</i> to opt-in and <i>"No"</i> to disable this.</p>
      `,
      buttons: [
        {
          text: 'Yes',
          className: 'primary',
          onDidClick(modal) {
            atom.config.set('kite.editorMetricsEnabled', 'yes');
            modal.destroy();
          },
        }, {
          text: 'No',
          onDidClick(modal) {
            atom.config.set('kite.editorMetricsEnabled', 'no');
            modal.destroy();
          },
        },
      ],
    }, {
      condition: fromSetting('kite.editorMetricsEnabled', 'not specified'),
    });
  }

  notifyErrorRescueVersionChange(version) {
    DataLoader.getAutocorrectModelInfo(version).then(data => {
      const [example] = data.examples;
      this.queue.addInfo(
        `#### Kite Error Rescue has just been updated\n${example.synopsis}`, {
          dismissable: true,
          detail: `${example.old.map(d => d.text).join('\n')}\n${example.new.map(d => d.text).join('\n')}`,
          buttons: [{
            text: 'Learn more',
            onDidClick(dismiss) {
              const Kite = require('./kite');

              dismiss && dismiss();
              Kite.toggleErrorRescueSidebar(true);
            },
          }],
        });
    });
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
    }

    this.queue.addError(
      "Kite doesn't support your OS", {
        description,
        icon: 'circle-slash',
      }, {
        metric: state,
      });
  }

  warnNotInstalled(state) {
    if (!this.app.wasInstalledOnce()) {
      this.queue.addWarning(
        'The Kite engine is not installed', {
          description: 'Install Kite to get Python completions, documentation, and examples.',
          icon: 'circle-slash',
          buttons: [{
            text: 'Install Kite',
            metric: 'install',
            onDidClick: dismiss => {
              dismiss && dismiss();
              this.app && this.app.install();
            },
          }],
        }, {
          metric: state,
        });
    }
  }

  warnNotRunning(state) {
    Promise.all([
      KiteAPI.isKiteInstalled().then(() => true).catch(() => false),
      KiteAPI.isKiteEnterpriseInstalled().then(() => true).catch(() => false),
    ]).then(([kiteInstalled, kiteEnterpriseInstalled]) => {
      if (KiteAPI.hasManyKiteInstallation() ||
          KiteAPI.hasManyKiteEnterpriseInstallation()) {
        this.queue.addWarning(
          'The Kite engine is not running', {
            description: 'You have multiple versions of Kite installed. Please launch your desired one.',
            icon: 'circle-slash',
          }, {
            metric: state,
          });
      } else if (kiteInstalled && kiteEnterpriseInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running', {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [{
              text: 'Start Kite',
              metric: 'start',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.start().catch(err => this.warnFailedStart(err));
              },
            }, {
              text: 'Start Kite Enterprise',
              metric: 'startEnterprise',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
              },
            }],
          }, {
            metric: state,
          });
      } else if (kiteInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running', {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [{
              text: 'Start Kite',
              metric: 'start',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.start().catch(err => this.warnFailedStart(err));
              },
            }],
          }, {
            metric: state,
          });
      } else if (kiteEnterpriseInstalled) {
        this.queue.addWarning(
          'The Kite engine is not running', {
            description: 'Start the Kite background service to get Python completions, documentation, and examples.',
            icon: 'circle-slash',
            buttons: [{
              text: 'Start Kite Enterprise',
              metric: 'startEnterprise',
              onDidClick: dismiss => {
                dismiss && dismiss();
                this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
              },
            }],
          }, {
            metric: state,
          });
      }
    });
  }

  warnFailedStart(err) {
    this.queue.addError(
      'Unable to start Kite engine', {
        description: JSON.stringify(err),
        buttons: [{
          text: 'Retry',
          metric: 'retry',
          onDidClick: dismiss => {
            dismiss && dismiss();
            this.app && this.app.start().catch(err => this.warnFailedStart(err));
          },
        }],
      }, {
        metric: 'launch',
      });
  }

  warnFailedStartEnterprise(err) {
    this.queue.addError(
      'Unable to start Kite engine', {
        description: JSON.stringify(err),
        buttons: [{
          text: 'Retry',
          metric: 'retryEnterprise',
          onDidClick: dismiss => {
            dismiss && dismiss();
            this.app && this.app.startEnterprise().catch(err => this.warnFailedStartEnterprise(err));
          },
        }],
      }, {
        metric: 'launchEnterprise',
      });
  }

  warnNotReachable(state) {
    this.queue.addError(
      'The Kite background service is running but not reachable', {
        description: 'Try killing Kite from the Activity Monitor.',
      }, {
        metric: state,
      });
  }

  warnNotAuthenticated(state) {
    if (navigator.onLine && !document.querySelector('kite-login')) {
      this.queue.addWarning(
        'You need to login to the Kite engine', {
          description: [
            'Kite needs to be authenticated to access', 'the index of your code stored on the cloud.',
          ].join(' '),
          icon: 'circle-slash',
          buttons: [{
            text: 'Login',
            metric: 'login',
            onDidClick: dismiss => {
              dismiss && dismiss();
              this.app && this.app.login();
            },
          }],
        }, {
          metric: state,
        });
    }
  }

  warnUnauthorized(err) {
    this.queue.addError(
      'Unable to login', {
        description: JSON.stringify(err),
        buttons: [{
          text: 'Retry',
          metric: 'retry',
          onDidClick: dismiss => {
            dismiss && dismiss();
            this.app && this.app.login();
          },
        }],
      }, {
        metric: 'unauthorized',
      });
  }

  dismissActiveWhitelistNotification() {
    if (this.queue.activeNotification &&
    this.queue.activeNotification.options.metric === STATES.AUTHENTICATED) {
      this.preventBlacklistOnDismiss = true;
      this.queue.activeNotification.dismiss();
    }
  }

  warnNotWhitelisted(editor, root) {
    const editorPath = editor.getPath();
    const done = () => {
      this.preventBlacklistOnDismiss = false;
    };

    if (this.lastShown[editorPath]) { return; }

    this.dismissActiveWhitelistNotification();

    this.queue.addWarning(
      `The Kite engine is disabled for ${editorPath}`, {
        description: 'Would you like to enable Kite for Python files in:',
        icon: 'circle-slash',
        dismissable: true,
        buttons: [{
          text: 'Settings',
          metric: 'whitelist settings',
          className: 'btn btn-default pull-right',
          onDidClick: dismiss => {
            done();
            dismiss && dismiss();
            const path = encodeURI(editorPath);
            const url = `kite://settings/permissions?filename=${path}&action=blacklist`;
            atom.applicationDelegate.openExternal(url);
          },
        }, {
          text: this.truncateLeft(root, 25),
          metric: 'enable root',
          onDidClick: dismiss => {
            done();
            dismiss && dismiss();
            this.app && this.app.whitelist(root);
          },
        }, {
          text: 'Browse…',
          metric: 'pick directory',
          onDidClick: dismiss => {
            atom.applicationDelegate.pickFolder((res) => {
              let p;
              if (res && Array.isArray(res)) { [p] = res; } else { p = res; }

              if (p) {
                done();
                dismiss && dismiss();
                this.app && this.app.whitelist(p);
              }
            });
          },
        }],
      }, {
        condition: () => {
          const e = atom.workspace.getActiveTextEditor();
          return e && e.getPath() === editorPath && !this.lastShown[editorPath];
        },
        metric: STATES.AUTHENTICATED,
        key: editorPath,
        onDidDismiss: () => {
          if (!this.preventBlacklistOnDismiss) {
            this.app && this.app.blacklist(editorPath, true);
          } else {
            delete this.lastShown[editorPath];
          }
          done();
        },
      }).catch(err => {});
  }

  warnWhitelistFailure(err) {
    const state = err.data || 0;
    const dirpath = err.path;

    if (state >= STATES.WHITELISTED) {
      Logger.warn(`whitelist failed because dir is already whitelisted (state ${state})`);
      return;
    }

    // show an error notification with an option to retry
    this.queue.addError(
      `Unable to enable Kite for ${dirpath}`, {
        description: JSON.stringify(err),
        buttons: [{
          text: 'Retry',
          metric: 'retry',
          onDidClick: dismiss => {
            dismiss && dismiss();
            this.app && this.app.whitelist(dirpath);
          },
        }],
      }, {
        metric: 'whitelisting-failed',
      });
  }

  notifyReady(state) {
    this.queue.addSuccess(
      'The Kite engine is ready', {
        description: 'We checked that the autocomplete engine is installed, running, responsive, and authenticated.',
      }, {
        metric: state,
        metricType: 'notification',
      });
  }

  shouldNotify(state) {
    return this.forceNotification ||
          ((this.app && this.app.hasActiveSupportedFile()) &&
           !this.lastShown[state] &&
           !this.paused);
  }

  emit(...args) {
    this.emitter && this.emitter.emit(...args);
  }

  truncateLeft(string, length) {
    return string.length <= length
      ? string
      : `…${string.slice(string.length - length)}`;
  }
}

module.exports = NotificationsCenter;

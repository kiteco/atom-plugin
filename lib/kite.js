'use strict';

// Contents of this plugin will be reset by Kite on start.
// Changes you make are not guaranteed to persist.

let child_process, CompositeDisposable, TextEditor, AccountManager,
  Logger, completions, KiteSignature, metrics, KiteApp,
  KiteStatus, KiteStatusPanel, NotificationsCenter,
  RollbarReporter, OverlayManager, KiteEditors, DataLoader,
  DisposableEvent, Disposable, KiteAPI, VirtualCursor, NodeClient, KiteConnect, Status;

module.exports = {
  getModule(name) {
    return this.modules && this.modules[name];
  },

  hasModule(name) {
    return this.modules && !!this.modules[name];
  },

  registerModule(name, mod) {
    if (!name) {
      throw new Error('module name is mandatory');
    }
    if (this.modules && name in this.modules) {
      throw new Error(`a module with name '${name}' has already been registered`);
    }
    if (typeof mod != 'object' || !mod.init || !mod.dispose) {
      throw new Error('module must be an object with init and dispose method');
    }

    this.modules = this.modules || {};
    this.modules[name] = mod;

    this.requestModuleInit(mod);
  },

  disposeModules() {
    this.modules && Object.values(this.modules).forEach(mod => mod.dispose());
    delete this.modules;
  },

  requestModuleInit(mod) {
    this.modulesToActivate = this.modulesToActivate || [];

    this.modulesToActivate.push(mod);

    if (this.activationRequested) { return; }

    this.activationRequested = true;
    requestAnimationFrame(() => {
      this.modulesToActivate.forEach(mod => mod.init(this));
      delete this.modulesToActivate;
      delete this.activationRequested;
    });
  },

  activate() {
    // Lazy load all the things, at least all the things we need during activation
    // In terms of performance it means that all these requires won't be measured
    // in the package loading time but in the activation time.
    if (!AccountManager) {
      require('./elements/kite-links');

      ({CompositeDisposable, Disposable} = require('atom'));
      ({AccountManager, Logger} = require('kite-installer'));

      KiteApp = require('./kite-app');
      KiteAPI = require('kite-api');
      KiteConnect = require('kite-connector');
      NodeClient = require('kite-connector/lib/clients/node');
      NotificationsCenter = require('./notifications-center');
      RollbarReporter = require('./rollbar-reporter');
      metrics = require('./metrics.js');
      DataLoader = require('./data-loader');
      KiteEditors = require('./editors');
      Status = require('./status');
    }

    metrics.featureRequested('starting');

    // April 2018
    if (atom.config.get('kite.showDocsNotificationOnStartup') != undefined) {
      atom.config.set('kite.showWelcomeNotificationOnStartup',
          atom.config.get('kite.showDocsNotificationOnStartup'));
      atom.config.unset('kite.showDocsNotificationOnStartup');
    }

    // We store all the subscriptions into a composite disposable to release
    // them on deactivation
    this.subscriptions = new CompositeDisposable();

    if (!atom.inSpecMode()) {
      this.subscriptions.add(atom.config.observe('kite.developerMode', value => {
        if (value && KiteConnect.client instanceof NodeClient) {
          KiteConnect.toggleRequestDebug();
        } else if (!value && !(KiteConnect.client instanceof NodeClient)) {
          KiteConnect.toggleRequestDebug();
        }
      }));
    }

    this.registerModule('editors', new KiteEditors());
    this.registerModule('status', new Status());

    this.subscriptions.add(KiteAPI.onDidDetectNonWhitelistedPath(path => {
      this.getEditorsForPath(path).forEach(e => {
        DataLoader.shouldOfferWhitelist(e)
        .then(res => {
          if (res) {
            this.notifications.warnNotWhitelisted(e, res);
          }
        })
        .catch(err => console.error(err));
      });
    }));

    if (!KiteSignature) { KiteSignature = require('./signatures'); }

    this.registerModule('signatures', new KiteSignature());

    // run "apm upgrade kite"
    this.selfUpdate();

    this.app = new KiteApp(this);
    this.notifications = new NotificationsCenter(this.app);
    this.reporter = new RollbarReporter();

    // All these objects have a dispose method so we can just
    // add them to the subscription.
    this.subscriptions.add(this.app);
    this.subscriptions.add(this.notifications);
    this.subscriptions.add(this.reporter);

    this.getStatusPanel().setApp(this.app);

    const clickListener = () => {
      metrics.featureRequested('status_panel');
      this.getStatusPanel().show(this.getStatusItem()).then(() => {
        metrics.featureFulfilled('status_panel');
      });
    };
    const item = this.getStatusItem();
    item.addEventListener('click', clickListener);
    this.subscriptions.add(new Disposable(() => {
      item.removeEventListener('click', clickListener);
    }));

    // We listen to any opened URI to catch when the user open the settings
    // panel and pick the kite settings
    this.subscriptions.add(atom.workspace.onDidOpen(e => {
      if (e.uri === 'atom://config' && !this.settingsViewSubscription) {
        if (!DisposableEvent) { ({DisposableEvent} = require('./utils')); }

        const settingsView = e.item;

        this.settingsViewSubscription = new DisposableEvent(settingsView.element, 'mouseup', () => {
          setTimeout(() => {
            const kiteSettings = settingsView.panelsByName['kite'];
            if (kiteSettings && kiteSettings.element.style.display !== 'none') {
              metrics.featureRequested('settings');
              metrics.featureFulfilled('settings');
            }
          }, 100);
        });

        this.subscriptions.add(this.settingsViewSubscription);
      }
    }));

    // Whenever an action is accomplished through the kite app
    // we need to check again the state of the app
    this.subscriptions.add(this.app.onDidInstall(() => this.connect('onDidInstall')));
    this.subscriptions.add(this.app.onDidStart(() => this.connect('onDidStart')));
    this.subscriptions.add(this.app.onDidAuthenticate(() => this.connect('onDidAuthenticate')));
    this.subscriptions.add(this.app.onDidWhitelist(() => this.connect('onDidWhitelist')));

    // CONFIG

    // little thing to take out legacy config name value so it won't show up on settings
    atom.config.unset('kite.actionWhenKiteFixesCode');
    /*
    this.subscriptions.add(atom.config.onDidChange('kite.actionWhenErrorRescueFixesCode', ({oldValue}) => {
      if (oldValue === ERROR_RESCUE_SHOW_SIDEBAR) {
        metrics.sendFeatureMetric('atom_autocorrect_show_panel_disabled');
      } else {
        metrics.sendFeatureMetric('atom_autocorrect_show_panel_enabled');
      }
    }));*/

    this.subscriptions.add(atom.config.observe('kite.loggingLevel', (level) => {
      Logger.LEVEL = Logger.LEVELS[level.toUpperCase()];
    }));

    this.subscriptions.add(atom.config.observe('core.useTreeSitterParsers', (using) => {
      if (using) {
        const notif = atom.notifications.addWarning('Kite is not configured properly', {
          description: 'You must turn off Atom\'s tree-sitter parser for Kite to show you information on how to call functions. <a href="https://help.kite.com/article/80-why-do-i-need-to-turn-off-tree-sitter">Learn more</a>\n\nRestart will occur after a few seconds.',
          dismissable: true,
          buttons: [{
            text: 'Turn off and restart',
            onDidClick() {
              atom.config.set('core.useTreeSitterParsers', false);
              notif.dismiss();
              setTimeout(() => {
                atom.reload();
              }, 1500);
            },
          }],
        });
      }
    }));

    // COMMANDS

    this.subscriptions.add(atom.commands.add('atom-text-editor[data-grammar="source python"]', {
      // Allow esc key to close expand view
      'core:cancel': () => {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismiss();
      },
      'kite:docs-at-cursor': () => { this.expandAtCursor(); },
    }));

    // This listens to the save-all command and add a temporary flag
    // so that we can detect when a save hook is triggered by save-all
    // versus save
    this.subscriptions.add(atom.commands.onDidDispatch((e) => {
      if (e.type === 'window:save-all') {
        metrics.sendFeatureMetric('atom_save_all_triggered');
        this.saveAllTriggered = true;
        setTimeout(() => {
          delete this.saveAllTriggered;
        }, 50);
      }
    }));

    this.subscriptions.add(atom.commands.add('atom-overlay kite-expand', {
      'core:cancel'() { this.remove(); },
    }));

    this.subscriptions.add(atom.commands.add('atom-text-editor:not([mini])', {
      'core:cancel': () => { this.getModule('signatures').hideOverlay(); },
    }));

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'kite:permissions': () => this.openPermissions(),
      'kite:tutorial': () => this.openKiteTutorial(true),
      'kite:general-settings': () => this.openSettings(),
      'kite:open-copilot': () => this.openCopilot(),
      'kite:editor-plugin-settings': () =>
        atom.applicationDelegate.openExternal('atom://settings-view/show-package?package=kite'),
      'kite:help-docs': () =>
        atom.applicationDelegate.openExternal('https://help.kite.com/category/43-atom-integration'),
      'kite:status': () => {
        metrics.featureRequested('status_panel');
        this.getStatusPanel().show(this.getStatusItem()).then(() => {
          metrics.featureFulfilled('status_panel');
        });
      },
    }));

    // START

    this.patchCompletions();

    // onboarding handling
    //open kite onboarding if flag indicates so
    if (atom.config.get('kite.showWelcomeNotificationOnStartup')) {
      this.openKiteTutorial();
    }

    this.notifications.startupNotifications();
    // setTimeout(() => this.startupNotifications(), 500);

    // Store the last expand at cursor highlight. This is necessary
    // for navigable panel to turn it red when no data comes back.
    this.lastExpandAtCursorHighlight = null;

    // We try to connect at startup
    this.app.connect('activation').then(state => {
      if (state === KiteApp.STATES.UNINSTALLED && !this.app.wasInstalledOnce()) {
        this.app.installFlow();
      } else if (state !== KiteApp.STATES.UNINSTALLED) {
        this.app.saveUserID();

        if (state === KiteApp.STATES.NOT_RUNNING && atom.config.get('kite.startKiteAtStartup')) {
          this.app.start().then(() => this.app.connect('activation'));
        }
      }
    });

    metrics.featureFulfilled('starting');
  },

  connect(src) {
    return this.app.connect(src);
  },

  getEditorsForPath(path) {
    return atom.workspace.getPaneItems().filter(i => i && i.getURI && i.getURI() === path);
  },

  deactivate() {
    this.disposeModules();

    // Release all subscriptions on deactivation
    metrics.featureRequested('stopping');
    this.subscriptions.dispose();
    metrics.featureFulfilled('stopping');
  },

  selfUpdate() {
    if (!child_process) { child_process = require('child_process'); }
    const apm = atom.packages.getApmPath();

    child_process.spawn(apm, ['update', 'kite']);
  },

  consumeStatusBar(statusbar) {
    statusbar.addRightTile({item: this.getStatusItem()});
  },

  activateAndShowItem(item) {
    if (item) {
      const dock = atom.workspace.paneContainerForURI(item.getURI());
      const pane = atom.workspace.paneForURI(item.getURI());

      if (pane && dock) {
        dock.show();
        pane.setActiveItem(item);
      }
    }
  },

  expandAtCursor(editor) {
    editor = editor || atom.workspace.getActiveTextEditor();

    if (!editor) { return; }

    const position = editor.getLastCursor().getBufferPosition();

    this.highlightWordAtPosition(editor, position);

    if (!editor.getPath()) { return; }

    DataLoader.getHoverDataAtPosition(editor, position).then(data => {
      const [symbol] = data.symbol;

      if (symbol && symbol.id) {
        atom.applicationDelegate.openExternal(`kite://docs/${symbol.id}`);
      }
    });
  },

  highlightWordAtPosition(editor, position, cls = '') {
    if (!VirtualCursor) { VirtualCursor = require('./virtual-cursor'); }

    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });
    const marker = editor.markBufferRange(range, {
      invalidate: 'touch',
    });
    const decoration = editor.decorateMarker(marker, {
      type: 'highlight',
      class: `expand-at-cursor-highlight ${cls}`,
      item: this,
    });

    // Timed for all transition to be finished by then
    setTimeout(() => decoration.destroy(), 800);
  },

  getStatusItem() {
    return this.getModule('status').getElement();
  },

  getStatusPanel() {
    if (this.statusPanel) { return this.statusPanel; }
    if (!KiteStatusPanel) { KiteStatusPanel = require('./elements/kite-status-panel'); }

    this.statusPanel = new KiteStatusPanel();
    return this.statusPanel;
  },

  completions() {
    if (!completions) { completions = require('./completions'); }
    return completions;
  },

  openPermissions() {
    const url = 'kite://settings/permissions';
    atom.applicationDelegate.openExternal(url);
  },

  openSettings() {
    const url = 'kite://settings';
    atom.applicationDelegate.openExternal(url);
  },

  openKiteTutorial(fromCommand) {
    if (fromCommand) {
      KiteAPI.getOnboardingFilePath().then(path => {
        atom.workspace.open(path);
      })
      .catch((err) => {
        this.notifications.warnOnboardingFileFailure();
      });
    } else {
      KiteAPI.isKiteLocal().then(isLocal => {
        if (isLocal) {
          // then attempt live onboarding
          KiteAPI.getKiteSetting('has_done_onboarding')
          .then(hasDone => {
            if (!hasDone) {
              KiteAPI.getOnboardingFilePath().then(path => {
                atom.workspace.open(path);
                this.notifications.onboardingNotifications();
                KiteAPI.setKiteSetting('has_done_onboarding', true);
              })
              .catch((err) => {
                this.notifications.warnOnboardingFileFailure();
              });
            } else {
              // do welcome notification without onboarding reference
              this.notifications.onboardingNotifications(true);
            }
          });
        } else {
          // do welcome notification without onboarding reference
          this.notifications.onboardingNotifications(true);
        }
      });
    }
  },

  openCopilot() {
    const url = 'kite://home';
    atom.applicationDelegate.openExternal(url);
  },

  errorRescueVersion() {
    const version = localStorage.getItem('kite.autocorrect_model_version');
    return version ? parseInt(version, 10) : version;
  },

  isSaveAll() {
    return this.saveAllTriggered;
  },

  patchCompletions() {
    atom.packages.activatePackage('autocomplete-python')
    .then(acp => {
      const safeProvider = acp.mainModule.provider.getSuggestions;
      acp.mainModule.provider.getSuggestions = (options) => {
        const {prefix} = options;
        const res = safeProvider.call(acp.mainModule.provider, options);

        return res && res.then
          ? res.then(res => /\($/.test(prefix) ? [] : res)
          : /\($/.test(prefix) ? [] : res;
      };
    }).catch(() => {});

    atom.packages.activatePackage('autocomplete-plus')
    .then(autocompletePlus => {
      const acp = autocompletePlus.mainModule;
      const manager = acp.autocompleteManager;

      if (!manager) {
        return;
      }

      const list = manager.suggestionList;
      const listElement = list.suggestionListElement
        ? list.suggestionListElement
        : atom.views.getView(list);
      const element = listElement.element
        ? listElement.element
        : listElement;

      this.getModule('signatures').setListElement(element);

      const safeUpdate = listElement && listElement.updateDescription;
      const safeDisplay = manager && manager.displaySuggestions;
      const safeShowOrHide = manager && manager.showOrHideSuggestionListForBufferChanges;
      const safeConfirm = manager && manager.confirm;
      // const safeCursorMoved = manager && manager.cursorMoved;

      if (safeDisplay) {

        let confirmed;

        this.subscriptions.add(new Disposable(() => {
          listElement.updateDescription = safeUpdate;
          manager.displaySuggestions = safeDisplay;
          manager.showOrHideSuggestionListForBufferChanges = safeShowOrHide;
          manager.confirm = safeConfirm;
        }));

        manager.confirm = (suggestion) => {
          confirmed = true;
          requestAnimationFrame(() => confirmed = false);
          return safeConfirm.call(manager, suggestion);
        };

        manager.showOrHideSuggestionListForBufferChanges = (options) => {
          if (confirmed) {
            // autocomplete-plus operates on the last change, so do we
            const change = options.changes[options.changes.length - 1];

            // we know we have confirmed a suggestion for a 1 char entry with a
            // 1 char trigger, we cancel the new suggestion request and hide
            // the suggestions using the same routine than autocomplete-plus
            if (change.oldText.length === 1 && change.newText.length === 1) {
              manager.cancelNewSuggestionsRequest();
              manager.hideSuggestionList();
            } else {
              safeShowOrHide.call(manager, options);
            }
          } else {
            safeShowOrHide.call(manager, options);
          }
        };
      }

      if (safeUpdate) {
        listElement.updateDescription = (item) => {
          safeUpdate.call(listElement, item);

          if (!item) {
            if (listElement.model && listElement.model.items) {
              item = listElement.model.items[listElement.selectedIndex];
            }
          }

          if (item && item.descriptionHTML) {
            listElement.descriptionContainer.classList.add('kite-completions');
            listElement.descriptionContent.innerHTML = item.descriptionHTML;

            if (typeof listElement.setDescriptionMoreLink === 'function') {
              listElement.setDescriptionMoreLink(item);
            }
          }
        };

        if (!listElement.ol) { listElement.renderList(); }
      } else {
        listElement.descriptionContainer.classList.remove('kite-completions');
      }
    });
  },
};

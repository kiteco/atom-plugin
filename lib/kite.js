'use strict';

// Contents of this plugin will be reset by Kite on start.
// Changes you make are not guaranteed to persist.

let child_process, CompositeDisposable, TextEditor, AccountManager,
  StateController, Logger, completions, metrics, KiteApp,
  KiteStatus, KiteStatusPanel, KiteAPI, KiteSidebar, KiteErrorRescueSidebar, NotificationsCenter,
  RollbarReporter, OverlayManager, KiteEditor, DataLoader,
  DisposableEvent, KiteSearch, EditorEvents,
  ERROR_RESCUE_SHOW_SIDEBAR, VirtualCursor, NotificationQueue, KiteNotification, fromSetting, all;

const toSentence = a => `${a.slice(0, -1).join(', ')} and ${a.pop()}`;

const Kite = module.exports = {
  activate() {
    // Lazy load all the things, at least all the things we need during activation
    // In terms of performance it means that all these requires won't be measured
    // in the package loading time but in the activation time.
    if (!AccountManager) {
      require('./elements/kite-links');

      ({CompositeDisposable, TextEditor} = require('atom'));
      ({AccountManager, StateController, Logger} = require('kite-installer'));
      ({fromSetting, all} = require('./conditions'));
      // ({ERROR_RESCUE_SHOW_SIDEBAR} = require('./constants'));
      KiteApp = require('./kite-app');
      KiteAPI = require('kite-api');
      NotificationsCenter = require('./notifications-center');
      RollbarReporter = require('./rollbar-reporter');
      NotificationQueue = require('./notification-queue');
      KiteNotification = require('./kite-notification');
      metrics = require('./metrics.js');

      if (!atom.inSpecMode()) {
        KiteAPI.toggleRequestDebug();
      }
    }

    metrics.featureRequested('starting');

    // Deal with legacy setting names
    // These bits of code can eventually be removed in half a year, or so as it
    // won’t affect anyone then.
    // April 2018
    if (atom.config.get('kite.activeSearchPosition') != undefined) {
      atom.config.set('kite.searchIconPosition',
          atom.config.get('kite.activeSearchPosition'));
      atom.config.unset('kite.activeSearchPosition');
    }

    // April 2018
    if (atom.config.get('kite.showDocsNotificationOnStartup') != undefined) {
      atom.config.set('kite.showWelcomeNotificationOnStartup',
          atom.config.get('kite.showDocsNotificationOnStartup'));
      atom.config.unset('kite.showDocsNotificationOnStartup');
    }

    // We store all the subscriptions into a composite disposable to release
    // them on deactivation
    this.subscriptions = new CompositeDisposable();

    // This helps to track to which editor we've actually
    // subscribed
    this.pathSubscriptionsByEditorID = {};
    this.whitelistedEditorIDs = {};
    this.kiteEditorByEditorID = {};
    this.eventsByEditorID = {};

    // run "apm upgrade kite"
    this.selfUpdate();

    this.app = new KiteApp(this);
    this.notifications = new NotificationsCenter(this.app);
    this.reporter = new RollbarReporter();
    this.notificationQueue = new NotificationQueue();

    // All these objects have a dispose method so we can just
    // add them to the subscription.
    this.subscriptions.add(this.app);
    this.subscriptions.add(this.notifications);
    this.subscriptions.add(this.reporter);

    this.getStatusItem().setApp(this.app);
    this.getStatusPanel().setApp(this.app);
    this.getSearchItem().setApp(this.app);

    this.subscriptions.add(this.getStatusItem().onDidClick(status => {
      metrics.featureRequested('status_panel');
      this.getStatusPanel().show(this.getStatusItem()).then(() => {
        metrics.featureFulfilled('status_panel');
      });
    }));

    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
      if (item instanceof TextEditor) {
        const statusItem = this.getStatusItem();
        statusItem.preventUpdatesOnGetState();
        this.checkTextEditor(item).then(([state, supported]) => {
          statusItem.setState(state, supported, item);
          statusItem.resumeUpdatesOnGetState();
        });
      } else {
        this.getSearchItem().hide();
      }
    }));

    // if supported files were open before Kite gets ready we
    // need to subscribe to these editors as well
    this.subscriptions.add(this.app.onKiteReady(() => {
      atom.workspace.getTextEditors()
      .filter(e => this.app.isGrammarSupported(e))
      .forEach(e => {
        if (!DisposableEvent) { ({DisposableEvent} = require('./utils')); }

        const v = atom.views.getView(e);
        const sub = new DisposableEvent(v, 'focus', (evt) => {
          this.checkTextEditor(e);
          sub.dispose();
        });
      });
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

    this.subscriptions.add(atom.config.observe('kite.sidebarPosition', (position) => {
      if (this.isSidebarVisible()) {
        const pane = atom.workspace.paneForURI(this.sidebar.getURI());
        const wasActiveItem = pane.getActiveItem() === this.sidebar;
        const dock = position === 'left'
        ? atom.workspace.getLeftDock()
        : atom.workspace.getRightDock();

        pane.removeItem(this.sidebar);

        if (!dock.isVisible()) {
          dock.show();
        }
        dock.getActivePane().addItem(this.sidebar);

        if (dock.getActivePaneItem() !== this.sidebar && wasActiveItem) {
          dock.getActivePane().activateItem(this.sidebar);
        }
      }
    }));

    // COMMANDS

    this.subscriptions.add(atom.commands.add('atom-text-editor[data-grammar="source python"]', {
      // Allow esc key to close expand view
      'core:cancel': () => {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismiss();
      },
      'kite:search': () => { this.getSearchItem().expand(); },
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

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'kite:permissions': () => this.openPermissions(),
      'kite:general-settings': () => this.openSettings(),
      'kite:open-copilot': () => this.openCopilot(),
      'kite:editor-plugin-settings': () =>
        atom.applicationDelegate.openExternal('atom://settings-view/show-package?package=kite'),
      'kite:help': () =>
        atom.applicationDelegate.openExternal('https://help.kite.com/category/43-atom-integration'),
      'kite:status': () => {
        metrics.featureRequested('status_panel');
        this.getStatusPanel().show(this.getStatusItem()).then(() => {
          metrics.featureFulfilled('status_panel');
        });
      },
      'kite:open-sidebar': () => this.toggleSidebar(true),
      'kite:close-sidebar': () => this.toggleSidebar(false),
      // 'kite:open-error-rescue-sidebar': () => this.toggleErrorRescueSidebar(true),
      // 'kite:close-error-rescue-sidebar': () => this.toggleErrorRescueSidebar(false),
    }));

    // START

    // Prior to Atom 1.26 there's no CSS variables that store the font details (family, size, etc.)
    // in that case we just create one that works the same.
    if (parseFloat(atom.getVersion()) <= 1.25) {
      this.createGlobalTextEditorStyleSheet();
    }

    // if (atom.inDevMode() || atom.project.getPaths().includes(path.resolve(__dirname, '..'))) {
    //   this.registerErrorRescueUICommand();
    // }

    if (this.useSidebar() && atom.config.get('kite.openSidebarOnStartup')) {
      this.toggleSidebar(true);
    }

    this.patchCompletions();

    this.pollingInterval = setInterval(() => {
      if (atom.workspace.getActiveTextEditor()) {
        this.checkTextEditor(atom.workspace.getActiveTextEditor(), 'pollingInterval');
      } else {
        this.connect('pollingInterval');
      }
    }, atom.config.get('kite.pollingInterval'));

    // We monitor kited health
    setInterval(checkHealth, 60 * 1000 * 10);
    checkHealth();

    this.startupNotifications();
    // setTimeout(() => this.startupNotifications(), 500);

    // Store the last expand at cursor highlight. This is necessary
    // for navigable panel to turn it red when no data comes back.
    this.lastExpandAtCursorHighlight = null;

    // We try to connect at startup
    this.app.connectWithLanguages('activation').then(state => {
      if (state === KiteApp.STATES.UNSUPPORTED) {
        if (!StateController.isOSSupported()) {
        } else if (!StateController.isOSVersionSupported()) {
        }
      }

      if (state === KiteApp.STATES.UNINSTALLED && !this.app.wasInstalledOnce()) {
        this.app.installFlow();
      } else if (state !== KiteApp.STATES.UNINSTALLED) {
        this.app.saveUserID();
      }

      if (atom.workspace.getActiveTextEditor()) {
        this.checkTextEditor(atom.workspace.getActiveTextEditor());
      }
    });

    metrics.featureFulfilled('starting');

    function checkHealth() {
      StateController.handleState().then(state => {
        switch (state) {
          case 0: return metrics.trackHealth('unsupported');
          case 1: return metrics.trackHealth('uninstalled');
          case 2: return metrics.trackHealth('installed');
          case 3: return metrics.trackHealth('running');
          case 4: return metrics.trackHealth('reachable');
          case 5: return metrics.trackHealth('authenticated');
          default:
            return null;
        }
      });
    }
  },

  connect(src) {
    return this.app.connect(src);
  },

  startupNotifications() {
    this.notificationQueue.addInfo('Welcome to Kite for Atom', {
      dismissable: true,
      buttons: [{
        text: 'Learn how to use Kite',
        onDidClick(dismiss) {
          atom.applicationDelegate.openExternal('http://help.kite.com/category/43-atom-integration');
          dismiss();
        },
      }, {
        text: "Don't show this again",
        onDidClick(dismiss) {
          atom.config.set('kite.showWelcomeNotificationOnStartup', false);
          dismiss();
        },
      }],
    }, {
      condition: all(
        fromSetting('kite.showWelcomeNotificationOnStartup'),
        () => !atom.inSpecMode()),
    });

    this.notificationQueue.add(() => {
      if (!DataLoader) { DataLoader = require('./data-loader'); }

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
            dismiss();
          },
        }, {
          text: 'Never ask again',
          onDidClick(dismiss) {
            metrics.featureRequested('editor_vacancy_notification_disabled');
            atom.config.set('kite.showEditorVacanciesNotificationOnStartup', false);
            metrics.featureFulfilled('editor_vacancy_notification_disabled');
            dismiss();
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

    this.notificationQueue.addModal({
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
  },

  registerEditorEvents(editor) {
    if (!EditorEvents) { EditorEvents = require('./editor-events'); }

    if (!this.eventsByEditorID[editor.id]) {
      const evt = this.eventsByEditorID[editor.id] = new EditorEvents(editor);
      if (editor === atom.workspace.getActiveTextEditor()) {
        evt.focus();
      }
    }
  },

  checkTextEditor(editor, src) {
    //src and from act to pass into connect the named of the context in which
    //the function was called, so that connect can handle error state appropriately
    const check = (editor, from) => this.app.connect(from).then(state => {
      const supported = this.app.isGrammarSupported(editor);
      // we only subscribe to the editor if it's a
      // python file and we're authenticated

      if (supported) {
        this.registerEditorEvents(editor);
        if (state >= KiteApp.STATES.AUTHENTICATED) {
          this.getSearchItem().show();

          return this.subscribeToEditor(editor)
          .then(() => [
            this.isEditorWhitelisted(editor) ? KiteApp.STATES.WHITELISTED : state,
            supported,
          ])
          .catch(err => {
            console.log(err);
            return [state, supported];
          });
        } else {
          this.getSearchItem().hide();
          this.unsubscribeFromEditor(editor);
          return Promise.resolve([state, supported]);
        }
      } else {
        this.getSearchItem().hide();
        this.unsubscribeFromEditor(editor);
        return Promise.resolve([state, supported]);
      }
    });

    if (!this.pathSubscriptionsByEditorID[editor.id]) {
      const sub = new CompositeDisposable();
      const dispose = () => {
        sub.dispose();
        delete this.pathSubscriptionsByEditorID[editor.id];
        this.subscriptions.remove(sub);
      };
      this.subscriptions.add(sub);

      sub.add(editor.onDidChangePath(() => {
        check(editor);
        dispose();
      }));

      sub.add(editor.onDidDestroy(() => dispose()));
      this.pathSubscriptionsByEditorID[editor.id] = sub;
    }
    return editor.getPath()
      ? check(editor, src)
      : Promise.reject();
  },

  handle403Response(editor, resp) {
    if (!DataLoader) { DataLoader = require('./data-loader'); }

    const status = this.getStatusItem();
    if (resp.statusCode === 403) {
      delete this.whitelistedEditorIDs[editor.id];
      status.setState(KiteApp.STATES.AUTHENTICATED, true, editor);
      DataLoader.shouldOfferWhitelist(editor)
      .then(res => {
        if (res) {
          this.notifications.warnNotWhitelisted(editor, res);
        }
        // if (res && this.notifications.shouldNotify(editor.getPath())) {}
      })
      .catch(err => console.error(err));
    } else {
      this.whitelistedEditorIDs[editor.id] = true;
      status.setState(KiteApp.STATES.WHITELISTED, true, editor);
    }
  },

  deactivate() {
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

  useSidebar() {
    return true;
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

  toggleSidebar(visible) {
    if (visible == null) { visible = !this.isSidebarVisible(); }
    if (!KiteSidebar) { KiteSidebar = require('./elements/kite-sidebar'); }

    if (this.isSidebarVisible() && !visible) {
      const pane = atom.workspace.paneForURI(this.sidebar.getURI());
      const item = pane.itemForURI(this.sidebar.getURI());
      pane.removeItem(item);
    } else if (!this.isSidebarVisible() && visible) {
      const position = atom.config.get('kite.sidebarPosition');

      this.sidebar = new KiteSidebar();
      this.sidebar.Kite = this;

      atom.workspace.open(this.sidebar, {
        searchAllPanes: true,
        activatePane: false,
        activateItem: false,
        location: position,
      }).then(() => {
        const dock = atom.workspace.paneContainerForURI(this.sidebar.getURI());
        const pane = atom.workspace.paneForURI(this.sidebar.getURI());
        if (dock.getActivePaneItem() !== this.sidebar) {
          pane.activateItem(this.sidebar);
        }
        dock.show();
      });
    } else if (this.isSidebarVisible() && visible) {
      this.activateAndShowItem(this.sidebar);
    }
  },

  createGlobalTextEditorStyleSheet() {
    const listener = () => {
      const styleSheetSource = `atom-workspace {
        --editor-font-size: ${atom.config.get('editor.fontSize')}px;
        --editor-font-family: ${atom.config.get('editor.fontFamily')};
        --editor-line-height: ${atom.config.get('editor.lineHeight')};
      }`;
      atom.styles.addStyleSheet(styleSheetSource, {sourcePath: 'kite-global-text-editor-styles', priority: -1});
    };

    atom.config.observe('editor.fontSize', listener);
    atom.config.observe('editor.fontFamily', listener);
    atom.config.observe('editor.lineHeight', listener);
  },

  mustOpenErrorRescueSidebar() {
    return atom.config.get('kite.actionWhenErrorRescueFixesCode') === ERROR_RESCUE_SHOW_SIDEBAR;
  },

  toggleErrorRescueSidebar(visible) {
    if (visible == null) { visible = !this.isErrorRescueSidebarVisible(); }
    if (!KiteErrorRescueSidebar) { KiteErrorRescueSidebar = require('./elements/kite-error-rescue-sidebar'); }

    if (this.isErrorRescueSidebarVisible() && !visible) {
      const pane = atom.workspace.paneForURI(this.errorRescueSidebar.getURI());
      if (pane) {
        const item = pane.itemForURI(this.errorRescueSidebar.getURI());
        pane.removeItem(item);
      }
    } else if (!this.isErrorRescueSidebarVisible() && visible) {
      const position = atom.config.get('kite.sidebarPosition');
      this.errorRescueSidebar = new KiteErrorRescueSidebar();
      this.errorRescueSidebar.Kite = this;

      atom.workspace.open(this.errorRescueSidebar, {
        searchAllPanes: true,
        activatePane: false,
        activateItem: false,
        location: position,
      }).then(() => {
        const dock = atom.workspace.paneContainerForURI(this.errorRescueSidebar.getURI());
        const pane = atom.workspace.paneForURI(this.errorRescueSidebar.getURI());
        if (dock.getActivePaneItem() !== this.errorRescueSidebar) {
          pane.activateItem(this.errorRescueSidebar);
        }
        dock.show();
        metrics.featureApplied('autocorrect', '_panel_open');
      });
    } else if (this.isErrorRescueSidebarVisible() && visible) {
      this.activateAndShowItem(this.errorRescueSidebar);
    }
  },

  openSidebarAtRange(editor, range) {
    if (!this.isSidebarVisible()) {
      this.toggleSidebar(true);
    }
    this.activateAndShowItem(this.sidebar);
    this.sidebar.showDataAtRange(editor, range);
  },

  expandAtCursor(editor) {
    editor = editor || atom.workspace.getActiveTextEditor();

    if (!editor) { return; }

    const position = editor.getLastCursor().getBufferPosition();

    this.highlightWordAtPosition(editor, position);

    if (!editor.getPath()) { return; }

    metrics.featureRequested('expand_panel');
    metrics.featureRequested('documentation');

    if (this.useSidebar()) {
      if (!this.isSidebarVisible()) {
        this.toggleSidebar(true);
      }
      this.activateAndShowItem(this.sidebar);
      this.sidebar.showDataAtPosition(editor, position);
    } else {
      if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }

      OverlayManager.showExpandAtPosition(editor, position);
    }
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

  isSidebarVisible() {
    return this.sidebar && this.sidebar.parentNode;
  },

  isErrorRescueSidebarVisible() {
    return this.errorRescueSidebar && this.errorRescueSidebar.parentNode;
  },

  getStatusItem() {
    if (this.status) { return this.status; }
    if (!KiteStatus) { KiteStatus = require('./elements/kite-status'); }

    this.status = new KiteStatus();
    this.status.Kite = this;
    return this.status;
  },

  setStatusLabel(kiteEditor) {
    this.getStatusItem().setStatusLabel(kiteEditor);
  },

  getStatusPanel() {
    if (this.statusPanel) { return this.statusPanel; }
    if (!KiteStatusPanel) { KiteStatusPanel = require('./elements/kite-status-panel'); }

    this.statusPanel = new KiteStatusPanel();
    return this.statusPanel;
  },

  getSearchItem() {
    if (this.search) { return this.search; }
    if (!KiteSearch) { KiteSearch = require('./elements/kite-search'); }

    this.search = new KiteSearch();
    return this.search;
  },

  completions() {
    if (!completions) { completions = require('./completions'); }
    return completions;
  },

  subscribeToEditor(editor) {
    if (!KiteEditor) { KiteEditor = require('./kite-editor'); }
    let kiteEditor;
    // We don't want to subscribe twice to the same editor
    if (!this.hasEditorSubscription(editor)) {
      kiteEditor = new KiteEditor(editor);
      this.kiteEditorByEditorID[editor.id] = kiteEditor;

      this.subscriptions.add(kiteEditor);
      return kiteEditor.initialize();
    } else {
      if (!DataLoader) { DataLoader = require('./data-loader'); }
      return DataLoader.isEditorAuthorized(editor).catch(() => {});
    }

  },

  unsubscribeFromEditor(editor) {
    if (!this.hasEditorSubscription(editor)) { return; }
    const kiteEditor = this.kiteEditorByEditorID[editor.id];
    kiteEditor.dispose();
    this.subscriptions.remove(kiteEditor);
    delete this.kiteEditorByEditorID[editor.id];
  },

  kiteEditorForEditor(editor) {
    return editor ? this.kiteEditorByEditorID[editor.id] : null;
  },

  hasEditorSubscription(editor) {
    return this.kiteEditorForEditor(editor) != null;
  },

  isEditorWhitelisted(editor) {
    return this.whitelistedEditorIDs[editor.id];
  },

  openPermissions() {
    const url = 'kite://settings/permissions';
    atom.applicationDelegate.openExternal(url);
  },

  openSettings() {
    const url = 'kite://settings';
    atom.applicationDelegate.openExternal(url);
  },

  openCopilot() {
    const path = '/clientapi/sidebar/open';
    StateController.client.request({path});
  },

  errorRescueVersion() {
    const version = localStorage.getItem('kite.autocorrect_model_version');
    return version ? parseInt(version, 10) : version;
  },

  isSaveAll() {
    return this.saveAllTriggered;
  },

  patchCompletions() {
    atom.packages.activatePackage('autocomplete-plus')
    .then(autocompletePlus => {
      const acp = autocompletePlus.mainModule;
      const manager = acp.autocompleteManager || acp.getAutocompleteManager();
      const list = manager.suggestionList;
      const listElement = list.suggestionListElement
        ? list.suggestionListElement
        : atom.views.getView(list);

      const safeUpdate = listElement && listElement.updateDescription;
      const safeDisplay = manager && manager.displaySuggestions;

      if (safeDisplay) {
        const element = listElement.element
          ? listElement.element
          : listElement;

        manager.displaySuggestions = (suggestions, options) => {
          if (element.querySelector('kite-signature')) {
            if (parseFloat(autocompletePlus.metadata.version) >= 2.36) {
              manager.showSuggestionList(manager.getUniqueSuggestions(suggestions, s => s.text), options);
            } else {
              manager.showSuggestionList(manager.getUniqueSuggestions(suggestions), options);
            }
          } else {
            safeDisplay.call(manager, suggestions, options);
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

          if (listElement.descriptionContainer.style.display === 'none' &&
              item && item.descriptionHTML) {
            listElement.descriptionContainer.style.display = 'block';
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

  registerErrorRescueUICommand() {
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'kite:test-error-rescue-ui': () => {
        Kite.toggleErrorRescueSidebar();
        requestAnimationFrame(() => {
          Kite.errorRescueSidebar.renderDiffs([
            [
              {
                timestamp: new Date(),
                diffs: [{
                  inserted: [{
                    text: 'for x in list:',
                    line: 0,
                    emphasis: [{
                      start_bytes: 13,
                      end_bytes: 14,
                      start_runes: 13,
                      end_runes: 14,
                    }],
                  }],
                  deleted: [{
                    text: 'for x in list',
                    line: 0,
                    emphasis: [{
                      start_bytes: 4,
                      end_bytes: 5,
                      start_runes: 4,
                      end_runes: 5,
                    }],
                  }],
                  new_buffer_offset_bytes: 20,
                }],
              }, {
                timestamp: new Date(),
                diffs: [{
                  inserted: [{
                    text: 'for x in list:',
                    line: 0,
                    emphasis: [{
                      start_bytes: 13,
                      end_bytes: 14,
                      start_runes: 13,
                      end_runes: 14,
                    }],
                  }],
                  deleted: [{
                    text: 'for x in list',
                    line: 0,
                    emphasis: [{
                      start_bytes: 4,
                      end_bytes: 5,
                      start_runes: 4,
                      end_runes: 5,
                    }],
                  }],
                  new_buffer_offset_bytes: 20,
                }],
              },
            ],
            'dummy.py',
          ]);
          Kite.errorRescueSidebar.showFirstRunExperience();
          Kite.errorRescueSidebar.renderModelInfo({
            'date_shipped': 'Tue Mar 20 2018 13:04:11 GMT+0100 (CET)',
            'examples': [{
              'synopsis': 'Some string',
              'old': [{
                'text': 'for x in list:',
                'emphasis': [{
                  'start_bytes': 13,
                  'end_bytes': 14,
                  'start_runes': 13,
                  'end_runes': 14,
                }],
              }],
              'new': [{
                'text': 'for x in list',
                'emphasis': [{
                  'start_bytes': 12,
                  'end_bytes': 13,
                  'start_runes': 12,
                  'end_runes': 13,
                }],
              }],
            }],
          });
          Kite.errorRescueSidebar.tabIcon = 'info';
          Kite.errorRescueSidebar.emitter.emit('did-change-icon');
        });
      },
    }));
  },
};

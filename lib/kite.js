'use strict';

// Contents of this plugin will be reset by Kite on start.
// Changes you make are not guaranteed to persist.

let child_process, CompositeDisposable, TextEditor, Range, AccountManager,
  StateController, Logger, completions, metrics, KiteApp, KiteTour,
  KiteStatus, KiteStatusPanel, KiteSidebar, NotificationsCenter, MetricsCenter,
  RollbarReporter, OverlayManager, KiteEditor, DataLoader, symbolId,
  DisposableEvent, KiteActiveSearch, EditorEvents, idIsEmpty, BrowserClient;

module.exports = {
  activate() {
    if (!AccountManager) {
      require('./elements/kite-localtoken-anchor');
      require('./elements/kite-links');

      ({idIsEmpty} = require('./kite-data-utils'));
      ({CompositeDisposable, TextEditor, Range} = require('atom'));
      ({AccountManager, StateController, BrowserClient, Logger} = require('kite-installer'));
      KiteApp = require('./kite-app');
      NotificationsCenter = require('./notifications-center');
      MetricsCenter = require('./metrics-center');
      RollbarReporter = require('./rollbar-reporter');
      metrics = require('./metrics.js');

      if (!atom.inSpecMode()) {
        StateController.client = new BrowserClient('127.0.0.1', 46624, '', false);
        AccountManager.client = new BrowserClient('127.0.0.1', 46624, '', false);
      }
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

    // send the activated event
    metrics.track('activated');

    // install hooks for editor events and send the activate event
    // this.subscriptions.add(events.onActivate());

    // run "apm upgrade kite"
    this.selfUpdate();

    this.app = new KiteApp(this);
    this.notifications = new NotificationsCenter(this.app);
    this.metrics = new MetricsCenter(this.app);
    this.reporter = new RollbarReporter();

    // All these objects have a dispose method so we can just
    // add them to the subscription.
    this.subscriptions.add(this.app);
    this.subscriptions.add(this.notifications);
    this.subscriptions.add(this.metrics);
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
      .map(e => {
        this.registerEditorEvents(e);
        return e;
      })
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
    this.subscriptions.add(this.app.onDidInstall(() => this.connect()));

    this.subscriptions.add(this.app.onDidStart(() => this.connect()));

    this.subscriptions.add(this.app.onDidAuthenticate(() => {
      this.connect();
      // this.app.saveUserID();
    }));

    this.subscriptions.add(this.app.onDidWhitelist(() => {
      this.connect();
      // this.app.saveUserID();
    }));

    const Kite = this;
    const tokenMethod = (action) => () => {
      const editor = atom.workspace.getActiveTextEditor();
      const kiteEditor = this.kiteEditorForEditor(editor);

      if (editor && kiteEditor && this.lastEvent) {
        const token = kiteEditor.tokenForMouseEvent(this.lastEvent);
        token && action(this.lastEvent, token, kiteEditor);
      }
    };

    // Allow esc key to close expand view
    this.subscriptions.add(atom.commands.add('atom-text-editor[data-grammar="source python"]', {
      'kite:active-search'() { Kite.getSearchItem().expand(); },
      'core:cancel'() {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismiss();
      },
      'kite:expand-at-cursor'() { Kite.expandAtCursor(); },
      'kite:open-in-web'() {
        const editor = atom.workspace.getActiveTextEditor();
        const editorElement = atom.views.getView(editor);
        let overlay;
        if (overlay = editorElement.querySelector('kite-expand')) {
          overlay.openInWeb();
        } else if (overlay = editorElement.querySelector('kite-signature')) {
          overlay.openInWeb();
        } else if (Kite.isSidebarVisible()) {
          Kite.sidebar.openInWeb();
        } else {
          if (!DataLoader) { DataLoader = require('./data-loader'); }
          const position = editor.getLastCursor().getBufferPosition();
          DataLoader.openInWebAtPosition(editor, position);
        }
      },
      'kite:open-in-web-from-menu': tokenMethod((event, token) => {
        if (!DataLoader) { DataLoader = require('./data-loader'); }
        if (!symbolId) { ({symbolId} = require('./kite-data-utils')); }

        DataLoader.openInWebForId(symbolId(token.Symbol || token.symbol));
        metrics.track('Context menu Open in web clicked');
      }),
      'kite:expand-from-menu': tokenMethod((event, token, kiteEditor) => {
        const range = new Range(
          kiteEditor.buffer.positionForCharacterIndex(token.begin_bytes),
          kiteEditor.buffer.positionForCharacterIndex(token.end_bytes)
        );

        kiteEditor.expandRange(range);
        metrics.track('Context menu See info clicked');
      }),
      'kite:go-to-definition-from-menu': tokenMethod((event, token, kiteEditor) => {
        kiteEditor.openTokenDefinition(token).then(res => {
          if (res) {
            metrics.track('Context menu Go to definition clicked (with definition in report)');
          } else {
            metrics.track('Context menu Go to definition clicked (without definition in report)');
          }
        });
      }),
      'kite:find-usages-from-menu': tokenMethod((event, token) => {

      }),
    }));

    this.subscriptions.add(atom.commands.add('kite-sidebar', {
      'kite:open-in-web'() {
        this.openInWeb();
      },
    }));

    const shouldDisplay = e => this.shouldDisplayMenu(e);
    const shouldDisplayWithId = e => this.shouldDisplayMenuWithId(e);
    this.subscriptions.add(atom.contextMenu.add({
      'atom-text-editor': [
        {
          label: 'Kite: Go to definition',
          command: 'kite:go-to-definition-from-menu',
          shouldDisplay,
        }, {
          label: 'Kite: Open in web',
          command: 'kite:open-in-web-from-menu',
          shouldDisplayWithId,
        }, {
          label: 'Kite: See info',
          command: 'kite:expand-from-menu',
          shouldDisplay,
        // }, {
        //   label: 'Kite: Find Usages',
        //   command: 'kite:find-usages-from-menu',
        //   shouldDisplay,
        }, {
          type: 'separator',
        },
      ],
    }));

    this.subscriptions.add(atom.config.observe('kite.loggingLevel', (level) => {
      Logger.LEVEL = Logger.LEVELS[level.toUpperCase()];
    }));

    this.subscriptions.add(atom.config.observe('kite.displayExpandViewAs', (display) => {
      if (!this.expandDisplay) { return; }

      this.expandDisplay = display;
      if (display === 'sidebar') {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }

        OverlayManager.dismiss();
        if (atom.config.get('kite.openSidebarOnStartup')) {
          this.toggleSidebar(true);
        }
      } else {
        this.toggleSidebar(false);
      }
    }));

    this.subscriptions.add(atom.config.observe('kite.sidebarPosition', (position) => {
      if (this.isSidebarVisible() && !this.isUsingDockForSidebar()) {
        this.sidebarPanel.destroy();

        this.sidebarPanel = position === 'left'
          ? atom.workspace.addLeftPanel({item: this.sidebar})
          : atom.workspace.addRightPanel({item: this.sidebar});
      }
    }));

    this.subscriptions.add(atom.commands.add('atom-overlay kite-expand', {
      'core:cancel'() { this.remove(); },
    }));

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'kite:open-permissions': () => this.openPermissions(),
      'kite:open-settings': () => this.openSettings(),
      'kite:open-sidebar': () => this.toggleSidebar(true),
      'kite:close-sidebar': () => this.toggleSidebar(false),
      'kite:toggle-sidebar': () => this.toggleSidebar(),
    }));

    this.expandDisplay = atom.config.get('kite.displayExpandViewAs');
    if (this.useSidebar() &&
        atom.config.get('kite.openSidebarOnStartup')) {
      this.toggleSidebar(true);
    }

    if (atom.config.get('kite.showKiteTourOnStatup') != undefined) {
      atom.config.set('kite.showKiteTourOnStartup', atom.config.get('kite.showKiteTourOnStatup'));
      atom.config.unset('kite.showKiteTourOnStatup');
    }

    if (atom.config.get('kite.showKiteTourOnStartup')) {
      if (!KiteTour) { KiteTour = require('./elements/kite-tour'); }

      setTimeout(() => {
        const pane = atom.workspace.getActivePane();
        atom.views.addViewProvider(KiteTour, m => m);
        pane.addItem(new KiteTour(), { index: 0 });
        pane.activateItemAtIndex(0);
        atom.config.set('kite.showKiteTourOnStartup', false);
      }, 100);
    }

    this.patchCompletions();

    this.pollingInterval = setInterval(() => {
      if (atom.workspace.getActiveTextEditor()) {
        this.checkTextEditor(atom.workspace.getActiveTextEditor());
      } else {
        this.connect();
      }
    }, atom.config.get('kite.pollingInterval'));

    // We try to connect at startup
    return this.app.connectWithLanguages().then(state => {
      if (state === KiteApp.STATES.UNSUPPORTED) {
        if (!StateController.isOSSupported()) {
          metrics.track('OS unsupported');
        } else if (!StateController.isOSVersionSupported()) {
          metrics.track('OS version unsupported');
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
  },

  connect() {
    return this.app.connect();
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

  checkTextEditor(editor) {
    this.registerEditorEvents(editor);
    const check = (editor) => this.app.connect().then(state => {
      const supported = this.app.isGrammarSupported(editor);
      // we only subscribe to the editor if it's a
      // python file and we're authenticated

      if (supported) {
        if (state >= KiteApp.STATES.AUTHENTICATED) {
          this.getSearchItem().show();

          return this.subscribeToEditor(editor)
          .then(() => [KiteApp.STATES.WHITELISTED, supported])
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
      ? check(editor)
      : Promise.reject();
  },

  handle403Response(editor, resp, treat404As403) {
    if (!DataLoader) { DataLoader = require('./data-loader'); }

    const status = this.getStatusItem();
    // for the moment a 404 response is sent for non-whitelisted file by
    // the tokens endpoint
    if ((resp.statusCode === 403 || (treat404As403 && resp.statusCode === 404))) {
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
    metrics.track('deactivated');
    this.subscriptions.dispose();
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
    return this.expandDisplay === 'sidebar';
  },

  toggleSidebar(visible) {
    if (visible == null) { visible = !this.isSidebarVisible(); }
    if (!KiteSidebar) { KiteSidebar = require('./elements/kite-sidebar'); }

    if (this.isSidebarVisible() && !visible) {
      this.sidebarPanel.destroy();
      delete this.sidebar;
      delete this.sidebarPanel;
      const editor = atom.workspace.getActiveTextEditor();
      if (editor) {
        const view = atom.views.getView(editor);
        view.focus();
      }
    } else if (!this.isSidebarVisible() && visible) {
      const position = atom.config.get('kite.sidebarPosition');
      const width = atom.config.get('kite.sidebarWidth');

      this.sidebar = new KiteSidebar();
      this.sidebar.Kite = this;

      this.sidebar.style.width = `${width}px`;

      if (this.isUsingDockForSidebar()) {
        atom.workspace.open(this.sidebar, {
          searchAllPanes: true,
          activatePane: false,
          activateItem: false,
          location: position,
        }).then(() => {
          atom.workspace.paneContainerForURI(this.sidebar.getURI()).show();
        });
      } else {
        this.sidebarPanel = position === 'left'
          ? atom.workspace.addLeftPanel({item: this.sidebar})
          : atom.workspace.addRightPanel({item: this.sidebar});
      }
    }
  },

  isUsingDockForSidebar() {
    return atom.workspace.getRightDock &&
           atom.config.get('kite.useDockForSidebar');
  },

  openSidebarAtRange(editor, range) {
    if (!this.isSidebarVisible()) {
      this.toggleSidebar(true);
    }

    this.sidebar.showDataAtRange(editor, range);
  },

  expandAtCursor(editor) {
    editor = editor || atom.workspace.getActiveTextEditor();

    if (!editor) { return; }

    const position = editor.getLastCursor().getBufferPosition();

    if (!editor.getPath()) { return; }

    metrics.featureRequested('expand_panel');
    metrics.featureRequested('documentation');

    if (this.useSidebar()) {
      if (!this.isSidebarVisible()) {
        this.toggleSidebar(true);
      }
      this.sidebar.showDataAtPosition(editor, position);
    } else {
      if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }

      OverlayManager.showExpandAtPosition(editor, position);
    }
  },

  isSidebarVisible() {
    return this.sidebar && this.sidebar.parentNode;
  },

  shouldDisplayMenu(event) {
    this.lastEvent = event;
    setTimeout(() => delete this.lastEvent, 10);
    const token = this.tokenForMouseEvent(event);
    return token;
  },

  shouldDisplayMenuWithId(event) {
    this.lastEvent = event;
    setTimeout(() => delete this.lastEvent, 10);
    const token = this.tokenForMouseEvent(event);
    return token && !idIsEmpty(token.id);
  },

  tokenForMouseEvent(event) {
    const editor = atom.workspace.getActiveTextEditor();
    const kiteEditor = this.kiteEditorForEditor(editor);
    return kiteEditor && kiteEditor.tokenForMouseEvent(event);
  },

  getStatusItem() {
    if (this.status) { return this.status; }
    if (!KiteStatus) { KiteStatus = require('./elements/kite-status'); }

    this.status = new KiteStatus();
    return this.status;
  },


  getStatusPanel() {
    if (this.statusPanel) { return this.statusPanel; }
    if (!KiteStatusPanel) { KiteStatusPanel = require('./elements/kite-status-panel'); }

    this.statusPanel = new KiteStatusPanel();
    return this.statusPanel;
  },

  getSearchItem() {
    if (this.search) { return this.search; }
    if (!KiteActiveSearch) { KiteActiveSearch = require('./elements/kite-active-search'); }

    this.search = new KiteActiveSearch();
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
      kiteEditor = this.kiteEditorByEditorID[editor.id];
      return kiteEditor.updateTokens();
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
    const url = 'http://localhost:46624/settings/permissions';
    atom.applicationDelegate.openExternal(url);
  },

  openSettings() {
    const url = 'http://localhost:46624/settings';
    atom.applicationDelegate.openExternal(url);
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
            manager.showSuggestionList(manager.getUniqueSuggestions(suggestions), options);
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

  trackCompletions() {
    atom.packages.activatePackage('autocomplete-plus')
    .then(autocompletePlus => {
      const { getSuggestions } = completions;
      completions.getSuggestions = (...args) => {
        return getSuggestions.apply(completions, args)
          .then(suggestions => {
            completions.lastSuggestions = suggestions;
            return suggestions;
          }).catch(err => {
            completions.lastSuggestions = [];
            throw err;
          });
      };

      const acp = autocompletePlus.mainModule;
      const autocompleteManager = acp.autocompleteManager || acp.getAutocompleteManager();

      if (!autocompleteManager || !autocompleteManager.confirm || !autocompleteManager.displaySuggestions) { return; }

      const safeConfirm = autocompleteManager.confirm;
      const safeDisplaySuggestions = autocompleteManager.displaySuggestions;
      autocompleteManager.displaySuggestions = (suggestions, options) => {
        this.trackSuggestions(suggestions, autocompleteManager.editor);
        return safeDisplaySuggestions.call(autocompleteManager, suggestions, options);
      };

      autocompleteManager.confirm = suggestion => {
        this.trackUsedSuggestion(suggestion, autocompleteManager.editor);
        return safeConfirm.call(autocompleteManager, suggestion);
      };
    });
  },

  trackSuggestions(suggestions, editor) {
    if (/\.py$/.test(editor.getPath())) {
      let hasKiteSuggestions = suggestions.some(s => s.provider === completions);

      if (hasKiteSuggestions) {
        this.track('Atom shows Kite completions');
      } else {
        this.track('Atom shows no Kite completions');
      }
    }
  },

  trackUsedSuggestion(suggestion, editor) {
    if (/\.py$/.test(editor.getPath())) {
      if (completions.lastSuggestions &&
          completions.lastSuggestions.includes(suggestion)) {
        this.track('used completion returned by Kite', {
          text: suggestion.text,
          hasDocumentation: this.hasDocumentation(suggestion),
        });
      } else {
        this.track('used completion not returned by Kite', {
          text: suggestion.text,
          hasDocumentation: this.hasDocumentation(suggestion),
        });
      }
    }
  },

  hasDocumentation(suggestion) {
    return (suggestion.description != null && suggestion.description !== '') ||
    (suggestion.descriptionMarkdown != null && suggestion.descriptionMarkdown !== '');
  },

  hasSameSuggestion(suggestion, suggestions) {
    return suggestions.some(s => s.text === suggestion.text);
  },

  track(msg, data) {
    metrics.track(msg, data);
  },
};

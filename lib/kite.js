'use strict';

// Contents of this plugin will be reset by Kite on start.
// Changes you make are not guaranteed to persist.

const child_process = require('child_process');
const {CompositeDisposable, TextEditor, Range} = require('atom');
const {AccountManager, StateController, Logger} = require('kite-installer');
const completions = require('./completions.js');
const metrics = require('./metrics.js');

const KiteApp = require('./kite-app');
const KiteStatus = require('./elements/kite-status');
const KiteSidebar = require('./elements/kite-sidebar');
const NotificationsCenter = require('./notifications-center');
const MetricsCenter = require('./metrics-center');
const RollbarReporter = require('./rollbar-reporter');
const OverlayManager = require('./overlay-manager');
const KiteEditor = require('./kite-editor');
const DataLoader = require('./data-loader');
const {symbolId} = require('./kite-data-utils');

module.exports = {
  activate() {
    AccountManager.initClient(
      StateController.client.hostname,
      StateController.client.port,
      ''
    );

    // We store all the subscriptions into a composite disposable to release
    // them on deactivation
    this.subscriptions = new CompositeDisposable();

    // This helps to track to which editor we've actually
    // subscribed
    this.subscriptionsByEditorID = {};
    this.pathSubscriptionsByEditorID = {};
    this.whitelistedEditorIDs = {};
    this.kiteEditorByEditorID = {};

    // send the activated event
    metrics.track('activated');

    // install hooks for editor events and send the activate event
    // this.subscriptions.add(events.onActivate());

    // run "apm upgrade kite"
    this.selfUpdate();

    this.app = new KiteApp();
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

    this.subscriptions.add(this.getStatusItem().onDidClick(status => {
      if (status === 'whitelisted' && this.useSidebar()) {
        this.toggleSidebar();
      } else {
        this.notifications.activateForcedNotifications();
        this.connect().then(() => {
          this.notifications.deactivateForcedNotifications();
        });
      }
    }));

    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
      if (item instanceof TextEditor) {
        this.checkTextEditor(item);
      }
    }));

    // if supported files were open before Kite gets ready we
    // need to subscribe to these editors as well
    this.subscriptions.add(this.app.onKiteReady(() => {
      atom.workspace.getTextEditors()
      .filter(e => this.app.isGrammarSupported(e))
      .forEach(e => this.subscribeToEditor(e));
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
      'core:cancel'() { OverlayManager.dismiss(); },
      'kite:expand-at-cursor'() { Kite.expandAtCursor(); },
      'kite:open-in-web'() {
        const editor = atom.workspace.getActiveTextEditor();
        const editorElement = atom.views.getView(editor);
        let overlay;
        if (overlay = editorElement.querySelector('kite-expand')) {
          overlay.openInWeb();
        } else if (Kite.isSidebarVisible()) {
          Kite.sidebar.openInWeb();
        } else {
          const position = editor.getLastCursor().getBufferPosition();
          DataLoader.openInWebAtPosition(editor, position);
        }
      },
      'kite:open-in-web-from-menu': tokenMethod((event, token) => {
        DataLoader.openInWebForId(symbolId(token.Symbol));
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
    this.subscriptions.add(atom.contextMenu.add({
      'atom-text-editor': [
        {
          label: 'Kite: Go to definition',
          command: 'kite:go-to-definition-from-menu',
          shouldDisplay,
        }, {
          label: 'Kite: Open in web',
          command: 'kite:open-in-web-from-menu',
          shouldDisplay,
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
        OverlayManager.dismiss();
        if (atom.config.get('kite.openSidebarOnStartup')) {
          this.toggleSidebar(true);
        }
      } else {
        this.toggleSidebar(false);
      }
    }));

    this.subscriptions.add(atom.config.observe('kite.sidebarPosition', (position) => {
      if (this.isSidebarVisible()) {
        this.sidebarPanel.destroy();

        this.sidebarPanel = position === 'left'
          ? atom.workspace.addLeftPanel({item: this.sidebar})
          : atom.workspace.addRightPanel({item: this.sidebar});
      }
    }));

    this.subscriptions.add(atom.commands.add('kite-expand', {
      'core:cancel'() { this.remove(); },
    }));

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'kite:open-sidebar': () => this.toggleSidebar(true),
      'kite:close-sidebar': () => this.toggleSidebar(false),
      'kite:toggle-sidebar': () => this.toggleSidebar(),
    }));

    this.expandDisplay = atom.config.get('kite.displayExpandViewAs');
    if (this.useSidebar() &&
        atom.config.get('kite.openSidebarOnStartup')) {
      this.toggleSidebar(true);
    }

    if (!atom.packages.getLoadedPackage('autocomplete-python') && !atom.inSpecMode()) {
      this.trackCompletions();
    }

    // We try to connect at startup
    return this.connect().then(state => {
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
    });
  },

  connect() {
    const editor = atom.workspace.getActiveTextEditor();
    return editor
      ? this.checkTextEditor(atom.workspace.getActiveTextEditor())
      : this.app.connect();
  },

  checkTextEditor(editor) {
    const check = (editor) => this.app.checkPath(editor.getPath()).then(state => {
      // we only subscribe to the editor if it's a
      // python file in a whitelisted directory
      if (this.app.isGrammarSupported(editor)) {
        if (state >= KiteApp.STATES.AUTHENTICATED) {
          this.subscribeToEditor(editor);
        } else {
          this.unsubscribeFromEditor(editor);
        }

        if (state == KiteApp.STATES.WHITELISTED) {
          this.whitelistedEditorIDs[editor.id] = true;
        } else {
          delete this.whitelistedEditorIDs[editor.id];
        }
      } else {
        this.unsubscribeFromEditor(editor);
      }
      return state;
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
      : Promise.resolve();
  },

  checkTextEditorWhitelistState(editor) {
    return this.app.pathInWhitelist(editor.getPath())
    .then(() => { this.whitelistedEditorIDs[editor.id] = true; })
    .catch(() => { delete this.whitelistedEditorIDs[editor.id]; });
  },

  deactivate() {
    // Release all subscriptions on deactivation
    metrics.track('deactivated');
    this.subscriptions.dispose();
    delete this.subscriptionsByEditorID;
  },

  selfUpdate() {
    var apm = atom.packages.getApmPath();
    child_process.spawn(apm, ['update', 'kite']);
  },

  consumeStatusBar(statusbar) {
    statusbar.addRightTile({item: this.getStatusItem()});
  },

  useSidebar() {
    return this.expandDisplay === 'sidebar';
  },

  toggleSidebar(visible) {
    if (visible == null) {
      visible = !this.isSidebarVisible();
    }

    if (this.isSidebarVisible() && !visible) {
      this.sidebarPanel.destroy();
      delete this.sidebar;
      delete this.sidebarPanel;
    } else if (!this.isSidebarVisible() && visible) {
      const position = atom.config.get('kite.sidebarPosition');
      const width = atom.config.get('kite.sidebarWidth');

      this.sidebar = new KiteSidebar();

      this.sidebar.style.width = `${width}px`;

      this.sidebarPanel = position === 'left'
        ? atom.workspace.addLeftPanel({item: this.sidebar})
        : atom.workspace.addRightPanel({item: this.sidebar});
    }
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

    if (this.useSidebar()) {
      if (!this.isSidebarVisible()) {
        this.toggleSidebar(true);
      }
      this.sidebar.showDataAtPosition(editor, position);
    } else {
      OverlayManager.showExpandAtPosition(editor, position);
    }
  },

  isSidebarVisible() {
    return !!this.sidebar;
  },

  shouldDisplayMenu(event) {
    this.lastEvent = event;
    setTimeout(() => delete this.lastEvent, 10);
    return this.tokenForMouseEvent(event) != null;
  },

  tokenForMouseEvent(event) {
    const editor = atom.workspace.getActiveTextEditor();
    const kiteEditor = this.kiteEditorForEditor(editor);
    return kiteEditor && kiteEditor.tokenForMouseEvent(event);
  },

  getStatusItem() {
    if (this.status) { return this.status; }

    this.status = new KiteStatus();
    return this.status;
  },

  completions() {
    return completions;
  },

  subscribeToEditor(editor) {
    // We don't want to subscribe twice to the same editor
    if (this.hasEditorSubscription(editor)) { return; }

    const kiteEditor = new KiteEditor(editor);
    this.kiteEditorByEditorID[editor.id] = kiteEditor;

    this.subscriptions.add(kiteEditor);
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

      const autocompleteManager = autocompletePlus.mainModule.getAutocompleteManager();

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

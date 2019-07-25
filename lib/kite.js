'use strict';

// Contents of this plugin will be reset by Kite on start.
// Changes you make are not guaranteed to persist.

let child_process,
  CompositeDisposable,
  AccountManager,
  Logger,
  completions,
  metrics,
  KiteApp,
  KiteStatusPanel,
  NotificationsCenter,
  RollbarReporter,
  OverlayManager,
  KiteEditors,
  DataLoader,
  DisposableEvent,
  Disposable,
  KiteAPI,
  VirtualCursor,
  NodeClient,
  KiteConnect,
  Status;

const Kite = (module.exports = {
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

    if (this.activationRequested) {
      return;
    }

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

      ({ CompositeDisposable, Disposable } = require('atom'));
      ({ AccountManager, Logger } = require('kite-installer'));

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

    // We store all the subscriptions into a composite disposable to release
    // them on deactivation
    this.subscriptions = new CompositeDisposable();

    if (!atom.inSpecMode()) {
      this.subscriptions.add(
        atom.config.observe('kite.developerMode', value => {
          if (value && KiteConnect.client instanceof NodeClient) {
            KiteConnect.toggleRequestDebug();
          } else if (!value && !(KiteConnect.client instanceof NodeClient)) {
            KiteConnect.toggleRequestDebug();
          }
        })
      );
    }

    this.registerModule('editors', new KiteEditors());
    this.registerModule('status', new Status());

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
      this.getStatusPanel()
        .show(this.getStatusItem())
        .then(() => {
          metrics.featureFulfilled('status_panel');
        });
    };
    const item = this.getStatusItem();
    item.addEventListener('click', clickListener);
    this.subscriptions.add(
      new Disposable(() => {
        item.removeEventListener('click', clickListener);
      })
    );

    // We listen to any opened URI to catch when the user open the settings
    // panel and pick the kite settings
    this.subscriptions.add(
      atom.workspace.onDidOpen(e => {
        if (e.uri === 'atom://config' && !this.settingsViewSubscription) {
          if (!DisposableEvent) {
            ({ DisposableEvent } = require('./utils'));
          }

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
      })
    );

    // Whenever an action is accomplished through the kite app
    // we need to check again the state of the app
    this.subscriptions.add(this.app.onDidInstall(() => this.connect('onDidInstall')));
    this.subscriptions.add(this.app.onDidStart(() => this.connect('onDidStart')));

    // CONFIG

    // Removing old configuration options
    const kiteCfg = atom.config.getAll('kite');
    const validKeys = [
      'showWelcomeNotificationOnStartup',
      'enableCompletions',
      'enableHoverUI',
      'enableSnippets',
      'maxVisibleSuggestionsAlongSignature',
      'loggingLevel',
      'pollingInterval',
      'developerMode',
      'startKiteAtStartup',
    ];
    if (kiteCfg.length) {
      const kiteCfgKeys = Object.keys(kiteCfg[0].value);
      kiteCfgKeys.forEach(k => {
        if (validKeys.indexOf(k) === -1) {
          atom.config.unset(`kite.${k}`);
        }
      });
    }

    this.subscriptions.add(
      atom.config.observe('kite.loggingLevel', level => {
        Logger.LEVEL = Logger.LEVELS[level.toUpperCase()];
      })
    );

    this.subscriptions.add(
      atom.config.observe('core.useTreeSitterParsers', using => {
        if (using) {
          const notif = atom.notifications.addWarning('Kite is not configured properly', {
            description:
              'You must turn off Atom\'s tree-sitter parser for Kite to show you information on how to call functions. <a href="https://help.kite.com/article/80-why-do-i-need-to-turn-off-tree-sitter">Learn more</a>\n\nRestart will occur after a few seconds.',
            dismissable: true,
            buttons: [
              {
                text: 'Turn off and restart',
                onDidClick() {
                  atom.config.set('core.useTreeSitterParsers', false);
                  notif.dismiss();
                  setTimeout(() => {
                    atom.reload();
                  }, 1500);
                },
              },
            ],
          });
        }
      })
    );

    // COMMANDS

    this.subscriptions.add(
      atom.commands.add('atom-text-editor[data-grammar="source python"]', {
        // Allow esc key to close expand view
        'core:cancel': () => {
          if (!OverlayManager) {
            OverlayManager = require('./overlay-manager');
          }
          OverlayManager.dismiss();
        },
        'kite:docs-at-cursor': () => {
          this.expandAtCursor();
        },
      })
    );

    this.subscriptions.add(
      atom.commands.add('atom-overlay kite-expand', {
        'core:cancel'() {
          this.remove();
        },
      })
    );

    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'kite:tutorial': () => this.openKiteTutorial(true),
        'kite:engine-settings': () => this.openSettings(),
        'kite:open-copilot': () => this.openCopilot(),
        'kite:package-settings': () =>
          atom.applicationDelegate.openExternal('atom://settings-view/show-package?package=kite'),
        'kite:help': () => atom.applicationDelegate.openExternal('https://help.kite.com/category/43-atom-integration'),
        'kite:status': () => {
          metrics.featureRequested('status_panel');
          this.getStatusPanel()
            .show(this.getStatusItem())
            .then(() => {
              metrics.featureFulfilled('status_panel');
            });
        },
      })
    );

    // START

    this.patchCompletions();

    // onboarding handling
    //open kite onboarding if flag indicates so
    if (atom.config.get('kite.showWelcomeNotificationOnStartup')) {
      this.openKiteTutorial();
    }

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
    if (!child_process) {
      child_process = require('child_process');
    }
    const apm = atom.packages.getApmPath();

    child_process.spawn(apm, ['update', 'kite']);
  },

  consumeStatusBar(statusbar) {
    statusbar.addRightTile({ item: this.getStatusItem() });
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

    if (!editor) {
      return;
    }

    const position = editor.getLastCursor().getBufferPosition();

    this.highlightWordAtPosition(editor, position);

    if (!editor.getPath()) {
      return;
    }

    DataLoader.getHoverDataAtPosition(editor, position).then(data => {
      const [symbol] = data.symbol;

      if (symbol && symbol.id) {
        atom.applicationDelegate.openExternal(`kite://docs/${symbol.id}`);
      }
    });
  },

  highlightWordAtPosition(editor, position, cls = '') {
    if (!VirtualCursor) {
      VirtualCursor = require('./virtual-cursor');
    }

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
    if (this.statusPanel) {
      return this.statusPanel;
    }
    if (!KiteStatusPanel) {
      KiteStatusPanel = require('./elements/kite-status-panel');
    }

    this.statusPanel = new KiteStatusPanel();
    return this.statusPanel;
  },

  completions() {
    if (!completions) {
      completions = require('./completions');
    }
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
      KiteAPI.getOnboardingFilePath('atom')
        .then(path => {
          atom.workspace.open(path);
        })
        .catch(err => {
          this.notifications.warnOnboardingFileFailure();
        });
    } else {
      KiteAPI.isKiteLocal().then(isLocal => {
        if (isLocal) {
          // then attempt live onboarding
          KiteAPI.getKiteSetting('has_done_onboarding').then(hasDone => {
            if (!hasDone) {
              KiteAPI.getOnboardingFilePath('atom')
                .then(path => {
                  atom.workspace.open(path);
                  KiteAPI.setKiteSetting('has_done_onboarding', true);
                })
                .catch(err => {
                  this.notifications.onboardingNotifications();
                });
            } else {
              // do welcome notification without onboarding reference
              this.notifications.onboardingNotifications();
            }
          });
        } else {
          // do welcome notification without onboarding reference
          this.notifications.onboardingNotifications();
        }
      });
    }
  },

  openCopilot() {
    const url = 'kite://home';
    atom.applicationDelegate.openExternal(url);
  },

  isSaveAll() {
    return this.saveAllTriggered;
  },

  patchCompletions() {
    atom.packages
      .activatePackage('autocomplete-python')
      .then(acp => {
        const safeProvider = acp.mainModule.provider.getSuggestions;
        acp.mainModule.provider.getSuggestions = options => {
          const { prefix } = options;
          const res = safeProvider.call(acp.mainModule.provider, options);

          return res && res.then ? res.then(res => (/\($/.test(prefix) ? [] : res)) : /\($/.test(prefix) ? [] : res;
        };
      })
      .catch(() => {});

    atom.packages.activatePackage('autocomplete-plus').then(autocompletePlus => {
      const acp = autocompletePlus.mainModule;
      const manager = acp.autocompleteManager || acp.getAutocompleteManager();
      const list = manager.suggestionList;
      const listElement = list.suggestionListElement ? list.suggestionListElement : atom.views.getView(list);
      // Override Atom's snippets package to trigger completions request
      // on tab stop, using autocomplete-plus's requestNewSuggestions function.
      if (atom.config.get('kite.enableSnippets')) {
        atom.packages.activatePackage('snippets').then(snippetsPkg => {
          const snippets = snippetsPkg.mainModule;
          const safeGoToNextTabStop = snippets && snippets.goToNextTabStop;
          const safeGoToPreviousTabStop = snippets && snippets.goToPreviousTabStop;

          this.subscriptions.add(
            new Disposable(() => {
              snippets.goToNextTabStop = safeGoToNextTabStop;
              snippets.goToPreviousTabStop = safeGoToPreviousTabStop;
            })
          );

          this.subscriptions.add(
            atom.commands.add('atom-text-editor[data-grammar="source python"]', {
              'autocomplete-plus:confirm': event => {
                // In the event that the sig panel is active,
                // but the suggestion list is not, we want to have tab and enter
                // defer to the next layer of events, i.e. next tab stop
                // and line break respectively. Without this, tab will just close
                // the sig panel.
                if (!list.items) {
                  event.abortKeyBinding();
                }
              },
            })
          );

          // Fetch suggestion after the next tab stop is visited.
          snippets.goToNextTabStop = editor => {
            let nextTabStopVisited = false;
            for (const expansion of snippets.getExpansions(editor)) {
              if (expansion && expansion.goToNextTabStop()) {
                nextTabStopVisited = true;
              }
            }
            manager.requestNewSuggestions();
            return nextTabStopVisited;
          };

          // Fetch suggestion after visting the previous tab stop.
          snippets.goToPreviousTabStop = editor => {
            let previousTabStopVisited = false;
            for (const expansion of snippets.getExpansions(editor)) {
              if (expansion && expansion.goToPreviousTabStop()) {
                previousTabStopVisited = true;
              }
            }
            manager.requestNewSuggestions();
            return previousTabStopVisited;
          };
        });
      }

      const safeUpdate = listElement && listElement.updateDescription;
      const safeDisplay = manager && manager.displaySuggestions;
      const safeShowOrHide = manager && manager.showOrHideSuggestionListForBufferChanges;
      const safeConfirm = manager && manager.confirm;
      const safeReplaceTextWithMatch = manager && manager.replaceTextWithMatch;
      const safeCursorMoved = manager && manager.cursorMoved;
      const safeHide = manager && manager.hideSuggestionList;

      if (safeDisplay) {
        const element = listElement.element ? listElement.element : listElement;

        let confirmed;
        let wasSnippetConfirmed;

        this.subscriptions.add(
          new Disposable(() => {
            listElement.updateDescription = safeUpdate;
            manager.displaySuggestions = safeDisplay;
            manager.showOrHideSuggestionListForBufferChanges = safeShowOrHide;
            manager.confirm = safeConfirm;
            manager.replaceTextWithMatch = safeReplaceTextWithMatch;
            manager.cursorMoved = safeCursorMoved;
            manager.hideSuggestionList = safeHide;
          })
        );

        manager.confirm = suggestion => {
          confirmed = true;
          wasSnippetConfirmed = suggestion.className === 'kite-completion' && typeof suggestion.snippet !== 'undefined';
          requestAnimationFrame(() => (confirmed = false));
          if (atom.config.get('kite.enableSnippets')) {
            // Patch ACP's confirm so that it doesn't clear selections upon confirmation.
            // Fixes undo not re-highlighting placeholders in a snippet
            // when a suggestion is inserted directly into the buffer.
            // Based on https://github.com/atom/autocomplete-plus/blob/master/lib/autocomplete-manager.js#L538
            if (manager.editor === null || suggestion === null || !!manager.disposed) {
              return;
            }
            const apiVersion = manager.providerManager.apiVersionForProvider(suggestion.provider);
            const triggerPosition = manager.editor.getLastCursor().getBufferPosition();
            manager.hideSuggestionList();
            manager.replaceTextWithMatch(suggestion);
            if (apiVersion > 1) {
              if (suggestion.provider && suggestion.provider.onDidInsertSuggestion) {
                suggestion.provider.onDidInsertSuggestion({ editor: manager.editor, suggestion, triggerPosition });
              }
            } else {
              if (suggestion.onDidConfirm) {
                suggestion.onDidConfirm();
              }
            }
          } else {
            safeConfirm.call(manager, suggestion);
          }
        };

        manager.replaceTextWithMatch = suggestion => {
          if (atom.config.get('kite.enableSnippets') && suggestion.className === 'kite-completion') {
            // Tweak behavior of ACP text replacement
            // Based on https://github.com/atom/autocomplete-plus/blob/master/lib/autocomplete-manager.js#L613
            const editor = manager.editor;
            if (!editor) {
              return;
            }
            const cursor = editor.getLastCursor();
            const replacementRange = suggestion.replacementRange;
            if (!cursor || !replacementRange) {
              return;
            }
            editor.transact(() => {
              // Move cursor to end position
              cursor.setBufferPosition(replacementRange.end);
              // Select up to and including the start position
              cursor.selection.selectToBufferPosition(replacementRange.begin);
              // Insert suggestion
              if (suggestion.snippet && manager.snippetsManager) {
                manager.snippetsManager.insertSnippet(suggestion.snippet, editor, cursor);
                manager.requestNewSuggestions();
              } else {
                cursor.selection.insertText(suggestion.text ? suggestion.text : suggestion.snippet, {
                  autoIndentNewline: editor.shouldAutoIndent(),
                  autoDecreaseIndent: editor.shouldAutoIndent(),
                });
              }
            });
          } else {
            safeReplaceTextWithMatch.call(manager, suggestion);
          }
        };

        manager.hideSuggestionList = () => {
          const editor = atom.workspace.getActiveTextEditor();
          if (typeof editor !== 'undefined') {
            const position = editor.getCursorBufferPosition();
            if (
              completions.isSignaturePanelVisible() &&
              (completions.isInsideFunctionCall(editor, position) ||
                completions.isOnFunctionCallBrackets(editor, position))
            ) {
              manager.suggestionList.changeItems(null);
              element.querySelector('.suggestion-description').style.display = 'none';
            } else {
              safeHide.call(manager);
            }
          }
        };

        manager.cursorMoved = event => {
          const editor = event.cursor.editor;
          const position = event.newBufferPosition;

          if (
            completions &&
            (completions.isInsideFunctionCall(editor, position) ||
              completions.isOnFunctionCallBrackets(editor, position)) &&
            completions.isSignaturePanelVisible()
          ) {
            completions.loadSignature({ editor, position }).then(shown => {
              if (!shown) {
                safeHide.call();
              }
            });
            // refresh sig
          } else {
            safeCursorMoved.call(manager, event);
          }
        };

        manager.showOrHideSuggestionListForBufferChanges = options => {
          if (confirmed) {
            // autocomplete-plus operates on the last change, so do we
            const change = options.changes[options.changes.length - 1];

            // we know we have confirmed a suggestion for a 1 char entry with a
            // 1 char trigger, we cancel the new suggestion request and hide
            // the suggestions using the same routine than autocomplete-plus
            if (
              (change.oldText.length === 1 && change.newText.length === 1) ||
              // If a non-snippet is inserted, don't fetch suggestions post-insertion.
              // Fix case where a user wants to insert a value but then we fetch suggestions, returning the same value.
              (atom.config.get('kite.enableSnippets') && !wasSnippetConfirmed)
            ) {
              manager.cancelNewSuggestionsRequest();
              manager.hideSuggestionList();
            } else {
              safeShowOrHide.call(manager, options);
            }
          } else {
            safeShowOrHide.call(manager, options);
          }
        };
        // this line below is needed to update the manager's callback reference for onDidChangeText from the
        // original showOrHideSuggestionListForBufferChanges, since that was bound
        // see https://github.com/atom/autocomplete-plus/blob/master/lib/autocomplete-manager.js#L106
        manager.buffer && manager.buffer.onDidChangeText(manager.showOrHideSuggestionListForBufferChanges);

        manager.displaySuggestions = (suggestions, options) => {
          if (element.querySelector('kite-signature')) {
            const desc = element.querySelector('.suggestion-description');
            if (desc) {
              if (suggestions.length === 0) {
                desc.style.display = 'none';
              } else {
                desc.style.display = '';
              }
            }
            // Fix case where shouldDisplaySuggestion is ignored when suggestion hiding methods are invoked,
            // unless a snippet is confirmed. This is because cursorMoved is called after snippet confirmation
            // causing shouldDisplaySuggestions to be false when we want it to be true.
            if (atom.config.get('kite.enableSnippets') && (!manager.shouldDisplaySuggestions && !wasSnippetConfirmed)) {
              return;
            }
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
        listElement.updateDescription = item => {
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

        if (!listElement.ol) {
          listElement.renderList();
        }
      } else {
        listElement.descriptionContainer.classList.remove('kite-completions');
      }
    });
  },
});

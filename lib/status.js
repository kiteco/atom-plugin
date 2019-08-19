'use strict';

const { CompositeDisposable, Disposable, TextEditor } = require('atom');
const KiteAPI = require('kite-api');
const urls = require('kite-api/lib/url-helpers');
const { MAX_FILE_SIZE } = require('./constants');
require('./elements/kite-logo');

const { STATES } = KiteAPI;

const TOOLTIPS = {
  [STATES.UNSUPPORTED]: 'Kite only supports macOS, Windows, and Ubuntu at the moment.',
  [STATES.UNINSTALLED]: 'Kite is not installed.',
  [STATES.INSTALLED]: 'Kite is not running.',
  [STATES.RUNNING]: 'Kite is running but not reachable.',
  [STATES.READY]: 'Kite is ready.',
  sizeExceedsLimit: 'The current file is too large for Kite to handle',
  noIndex: 'Kite is ready, but no index available',
  indexing: 'Kite engine is indexing your code',
  syncing: 'Kite engine is syncing your code',
};

const STATUSES = {
  [STATES.UNSUPPORTED]: 'unsupported',
  [STATES.UNINSTALLED]: 'uninstalled',
  [STATES.INSTALLED]: 'installed',
  [STATES.RUNNING]: 'running',
  [STATES.READY]: 'ready',
};

const LABELS = {
  [STATES.UNSUPPORTED]: '',
  [STATES.UNINSTALLED]: 'Kite: not installed',
  [STATES.INSTALLED]: 'Kite: not running',
  [STATES.RUNNING]: '',
  [STATES.NOINDEX]: 'Kite: ready (unindexed)',
  [STATES.READY]: '',
};

module.exports = class Status {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'kite-status';
    this.element.setAttribute('status', 'unknown');
    this.element.innerHTML = `<kite-logo small class="badge"></kite-logo>
                      <kite-logo sync></kite-logo>
                      <span class="text"></span>`;
    this.element.classList.add('inline-block');
    this.tooltipText = '';
    this.statusText = this.element.querySelector('.text');
  }

  init(K) {
    this.subscriptions = new CompositeDisposable();
    this.editors = K.getModule('editors');

    if (!this.editors) {
      return;
    }

    this.subscriptions.add(
      atom.tooltips.add(this.element, {
        title: () => this.tooltipText,
      })
    );

    this.subscriptions.add(
      atom.workspace.onDidChangeActivePaneItem(item => {
        if (item instanceof TextEditor && this.editors.isGrammarSupported(item)) {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      })
    );

    if (this.editors.isGrammarSupported(atom.workspace.getActiveTextEditor())) {
      this.startPolling();
    }
  }

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
  }

  getElement() {
    return this.element;
  }

  startPolling() {
    const interval = setInterval(() => this.pollStatus(), atom.config.get('kite.pollingInterval'));
    this.pollingDisposable = new Disposable(() => {
      clearInterval(interval);
    });
    this.subscriptions.add(this.pollingDisposable);
    return this.pollStatus();
  }

  stopPolling() {
    if (this.pollingDisposable) {
      this.subscriptions.remove(this.pollingDisposable);
      this.pollingDisposable.dispose();
    }
    return this.pollStatus();
  }

  pollStatus() {
    if (this.isPolling) {
      return this.pollPromise;
    }

    this.isPolling = true;
    if (this.editors.hasActiveSupportedFile()) {
      const editor = atom.workspace.getActiveTextEditor();
      this.pollPromise = KiteAPI.requestJSON({
        path: urls.statusPath(editor.getPath()),
      })
        .then(o => {
          this.element.removeAttribute('is-syncing');
          this.element.removeAttribute('is-indexing');
          this.element.removeAttribute('noIndex');
          this.statusText.innerHTML = LABELS[STATES.READY];
          this.element.setAttribute('status', STATUSES[STATES.READY]);
          if (o.status === 'indexing') {
            this.element.setAttribute('is-indexing', '');
            this.tooltipText = TOOLTIPS.indexing;
          } else if (o.status === 'syncing') {
            this.element.setAttribute('is-syncing', '');
            this.tooltipText = TOOLTIPS.syncing;
          } else if (o.status === 'noIndex') {
            this.element.setAttribute('noIndex', '');
            this.tooltipText = TOOLTIPS.noIndex;
            this.statusText.innerHTML = LABELS[STATES.NOINDEX];
          } else {
            if (this.fileExceedsMaxSize(editor)) {
              this.tooltipText = TOOLTIPS.sizeExceedsLimit;
            } else {
              this.tooltipText = TOOLTIPS[STATES.READY];
            }
          }
        })
        .catch(err => {
          const { state } = err.data;

          this.element.removeAttribute('is-syncing');
          this.element.removeAttribute('is-indexing');
          this.element.removeAttribute('noIndex');

          if (state != undefined) {
            this.tooltipText = TOOLTIPS[state];
            this.statusText.innerHTML = LABELS[state];
            this.element.setAttribute('status', STATUSES[state]);
          } else {
            this.element.setAttribute('status', 'unsupported');
            this.statusText.innerHTML = '';
            this.tooltipText = '';
          }
        });
    } else {
      this.element.removeAttribute('is-syncing');
      this.element.removeAttribute('is-indexing');
      this.element.removeAttribute('nodindex');
      this.element.setAttribute('status', 'unsupported');
      this.tooltipText = '';
      this.statusText.innerHTML = '';
      this.pollPromise = Promise.resolve();
    }

    this.pollPromise = this.pollPromise.then(() => {
      this.isPolling = false;
    });

    return this.pollPromise;
  }

  fileExceedsMaxSize(editor) {
    return editor.getBuffer().getLength() > MAX_FILE_SIZE;
  }
};

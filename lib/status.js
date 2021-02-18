'use strict';

const { CompositeDisposable, Disposable, TextEditor } = require('atom');
const KiteAPI = require('kite-api');
const urls = require('kite-api/lib/url-helpers');
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
  initializing: 'Kite engine is warming up',
  syncing: 'Kite engine is syncing your code',
  installing: 'Installing components. Kite will launch automatically when ready.',
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
  installing: 'Kite: installing components',
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

  init(kite) {
    this.Kite = kite;
    this.subscriptions = new CompositeDisposable();
    this.editors = this.Kite.getModule('editors');

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
        this.stopPolling();
        this.startPolling();
      })
    );

    this.startPolling();
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
    const editor = atom.workspace.getActiveTextEditor();
    this.pollPromise = KiteAPI.requestJSON({
      path: urls.statusPath(editor && editor.getPath()),
    })
      .then(o => {
        this._removeStatusAttributes();

        this.statusText.innerHTML = LABELS[STATES.READY];
        this.element.setAttribute('status', STATUSES[STATES.READY]);

        if (o) {
          this.element.setAttribute(o.status, '');
          this.tooltipText = o.long;
          this.statusText.innerHTML = o.short;
        } else {
          if (editor.getBuffer().getLength() >= this.Kite.maxFileSize) {
            this.tooltipText = TOOLTIPS.sizeExceedsLimit;
          } else {
            this.tooltipText = TOOLTIPS[STATES.READY];
          }
        }
      })
      .catch(err => {
        const { state } = err.data;

        this._removeStatusAttributes();

        if (state != undefined) {
          if (state === STATES.UNINSTALLED && this.Kite.installing) {
            this.tooltipText = TOOLTIPS['installing'];
            this.statusText.innerHTML = LABELS['installing'];
            this.element.setAttribute('status', STATUSES[state]);
          } else {
            this.tooltipText = TOOLTIPS[state];
            this.statusText.innerHTML = LABELS[state];
            this.element.setAttribute('status', STATUSES[state]);
          }
        } else {
          this.element.setAttribute('status', 'unsupported');
          this.statusText.innerHTML = '';
          this.tooltipText = '';
        }
      });


    this.pollPromise = this.pollPromise.then(() => {
      this.isPolling = false;
    });

    return this.pollPromise;
  }

  _removeStatusAttributes() {
    this.element.removeAttribute('syncing');
    this.element.removeAttribute('initializing');
    this.element.removeAttribute('indexing');
    this.element.removeAttribute('noIndex');
  }
};

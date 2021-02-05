'use strict';

require('./kite-logo');

const { CompositeDisposable, TextEditor } = require('atom');
const { DisposableEvent, addDelegatedEventListener, parent, delayPromise } = require('../utils');
const KiteAPI = require('kite-api');
const { retryPromise } = require('kite-api/lib/utils');
const LinkScheme = require('../link-scheme');
const DataLoader = require('../data-loader');

const { STATES } = KiteAPI;

class KiteStatusPanel extends HTMLElement {
  constructor(kite) {
    super();
    this.Kite = kite;
  }

  static initClass() {
    customElements.define('kite-status-panel', this);
    return this;
  }

  setDeps(app, notifCenter) {
    this.app = app;
    this.notifCenter = notifCenter;
  }

  hide() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
      this.subscriptions.dispose();
    }
  }

  pendingStatus(label) {
    const status = this.querySelector('.status');

    if (status) {
      status.innerHTML = `
      ${label}
      <span class='loading loading-spinner-small inline-block'></span>
      `;
    }
  }

  show(target) {
    return this.renderCurrent().then(() => {
      document.body.appendChild(this);

      this.setPosition(target);

      this.scheme = new LinkScheme('kite-atom-internal', this);

      this.subscriptions = new CompositeDisposable();

      const links = this.querySelector('kite-links');
      if (links) {
        const linksCb = links.onDidClickActionLink(() => {
          this.hide();
        });
        linksCb && this.subscriptions.disposed && this.subscriptions.add(linksCb);
      }

      this.subscriptions.add(this.scheme);

      this.subscriptions.add(this.scheme.onDidClickLink(opts => this.handleAction(opts)));

      this.subscriptions.add(
        atom.workspace.onDidChangeActivePaneItem(item => {
          if (item instanceof TextEditor) {
            this.renderCurrent().then(() => this.setPosition(target));
          }
        })
      );

      this.subscriptions.add(
        addDelegatedEventListener(this, 'click', '.kite-warning-box [data-method="post"]', e => {
          const link = e.target;
          const box = parent(link, '.kite-warning-box');

          link.innerHTML = "<span class='loading loading-spinner-tiny inline-block'></span>";
          link.style.pointerEvents = 'none';

          KiteAPI.request({
            path: '/api/account/resendVerification',
            method: link.getAttribute('data-method'),
          })
            .then(() => {
              box.classList.remove('kite-warning-box');
              box.classList.add('kite-info-box');
              box.textContent = link.getAttribute('data-confirmation');
            })
            .catch(() => {
              box.innerHTML = link.getAttribute('data-failure');
            });
        })
      );

      this.subscriptions.add(
        new DisposableEvent(window, 'resize', () => {
          this.setPosition(target);
        })
      );

      this.subscriptions.add(
        new DisposableEvent(document.body, 'click', e => {
          const { top, left, right, bottom } = this.getBoundingClientRect();
          const { pageX, pageY } = e;

          if (!this.starting && (pageX < left || pageX > right || pageY < top || pageY > bottom)) {
            this.hide();
          }
        })
      );
    });
  }

  pauseNotifications() {
    this.notifCenter && this.notifCenter.pauseNotifications();
  }

  resumeNotifications() {
    this.notifCenter && this.notifCenter.resumeNotifications();
  }

  handleAction({ url }) {
    this.pauseNotifications();

    let promise;
    switch (url.host) {
      case 'open-account-web':
        atom.applicationDelegate.openExternal('http://localhost:46624/clientapi/desktoplogin?d=/settings/account');
        this.hide();
        break;
      case 'open-copilot-settings':
        this.app.copilotSettings();
        this.hide();
        break;
      case 'open-copilot-permissions':
        atom.applicationDelegate.openExternal(`kite://settings/permissions${url.path || ''}`);
        break;
      case 'install':
        open('https://www.kite.com/install/?utm_medium=editor&utm_source=atom');
        break;
      case 'start':
        this.pendingStatus('Launching Kite');
        this.starting = true;
        promise = this.app
          .start()
          .then(() => retryPromise(() => KiteAPI.isUserAuthenticated(), 10, 500))
          .then(() => {
            this.starting = false;
          })
          .catch(() => {
            this.starting = false;
          })
          .then(() => this.renderCurrent());
        break;
      case 'login':
        this.app.login();
        this.hide();
        break;
    }

    if (promise) {
      promise
        .then(() => this.renderCurrent())
        .then(() => this.resumeNotifications())
        .catch(err => console.error(err));
    } else {
      this.resumeNotifications();
    }
  }

  setPosition(target) {
    if (!target) {
      return;
    }

    const box = target.getBoundingClientRect();

    this.style.cssText = `
    top: ${Math.round(box.top - 20)}px;
    left: ${Math.round(box.right)}px;
    `;
  }

  renderCurrent() {
    if (this.starting) {
      return Promise.resolve();
    }
    const editor = atom.workspace.getActiveTextEditor();
    const promises = [
      KiteAPI.checkHealth(),
      DataLoader.getUserAccountInfo().catch(() => { }),
      DataLoader.getStatus(editor),
      DataLoader.isUserAuthenticated().catch(() => { }),
      Promise.resolve(this.Kite.maxFileSize),
    ];

    return Promise.all(promises).then(data => {
      this.render(...data);
    });
  }

  render(state, account, syncStatus, isUserAuthenticated, maxFileSize) {
    this.innerHTML = `
      ${this.renderSubscription(status)}
      ${this.renderLinks(account)}
      ${this.renderStatus(state, syncStatus, isUserAuthenticated, maxFileSize)}
    `;
  }

  renderLinks(account) {
    return `
    <kite-links emit-action="true">
    <ul class="links ${account ? 'has-account' : 'no-account'}">
      <li><a class="icon icon-search" href="kite-atom-internal://open-search-docs">Search Python Docs</a></li>
      <li><a class="icon icon-question" href="kite-atom-internal://open-kite-plugin-help">Help</a></li>
    </ul>
    <ul class="links ${account ? 'has-account' : 'no-account'}">
      <li><a class="icon icon-settings" href="kite-atom-internal://open-settings">Atom Plugin Settings</a></li>
      <li><a class="icon icon-settings"
             href="kite-atom-internal://open-copilot-settings">Kite Engine Settings</a></li>
    </ul>
    </kite-links>
    `;
  }

  renderStatus(state, syncStatus, isUserAuthenticated, maxFileSize) {
    const dot = (cls = '') => `<div class="dot ${cls}">•</div>`;
    let content = '';
    switch (state) {
      case STATES.UNSUPPORTED:
        content = `
          <div class="center-aligned-line text-danger">
            Kite engine is not available on your system
            ${dot('text-danger')}
          </div>
        `;
        break;
      case STATES.UNINSTALLED:
        if (this.Kite.installing) {
          content = `
            <div class="center-aligned-line text-danger">
              <div class="text-container">
                <div class="text-line">Installing components</div>
                <div class="text-line">Kite will launch automatically when ready</div>
              </div>
              ${dot('text-danger')}
            </div>
          `;
        } else {
          content = `
            <div class="center-aligned-line text-danger">
              Kite engine is not installed
              ${dot('text-danger')}
            </div>
            <a href="kite-atom-internal://install" class="btn btn-error">
              Install now
            </a>
          `;
        }
        break;
      case STATES.INSTALLED:
        content = `
            <div class="center-aligned-line text-danger">
              Kite engine is not running
              ${dot('text-danger')}
            </div>
            <a href="kite-atom-internal://start" class="btn btn-error">
              Launch now
            </a>
          `;
        break;
      case STATES.RUNNING:
        content = `
          <div class="center-aligned-line text-danger">
            Kite engine is not reachable
            ${dot('text-danger')}
          </div>
        `;
        break;
      case STATES.READY:
        let buttonLink = '';
        const editor = atom.workspace.getActiveTextEditor();
        switch (true) {
          case !editor:
            // fallthrough
          case !this.Kite.getModule('editors').isGrammarSupported(editor):
            content = `
              <div class="center-aligned-line">
                <div>Open a supported file to see Kite's status</div>
                ${dot()}
              </div>
            `;
            break;
          case editor && editor.getText().length >= maxFileSize:
            content = `
              <div class="center-aligned-line text-warning">
                The current file is too large for Kite to handle
                ${dot('text-warning')}
              </div>
            `;
            break;
          case syncStatus && syncStatus.long !== undefined:
            if (syncStatus.button && syncStatus.button.action == 'open') {
              buttonLink = `
                <a href="${syncStatus.button.link}" class="btn btn-left">
                  ${syncStatus.button.text}
                </a>
              `;
            }
            // The long status is split at periods. Each line will get their own row
            // So it's best not to have more than two sentences in the long status
            const textLines = syncStatus.long
              .split('.')
              .filter(content => content !== '')
              .map(content => `<div class="text-line">${content}</div>`)
              .join('');
            const color = keywordToColorClass(syncStatus.long);
            content = `
              <div class="center-aligned-line">
                ${buttonLink}
                <div class="${color} text-container">
                  ${textLines}
                </div>
                ${dot(color)}
              </div>
            `;
            break;
        }

        // If there's another button, don't render the log in button to keep the UI simple
        if (!isUserAuthenticated && buttonLink === '') {
          content = `
          <div>
            Kite engine is not logged in
            <a href="kite-atom-internal://open-copilot-settings" class="btn">Login now</a>
          </div>
          ${content}`;
        }

        break;
    }

    return `<div class="status">${content}</div>`;
  }

  renderSubscription(status) {
    return `<div class="split-line subscription">
      <div class="left"><kite-logo small></kite-logo></div>
      <div class="right">${status.state >= STATES.READY ? '<a href="kite-atom-internal://open-account-web">Account</a>' : ''
}</div>
    </div>`;
  }
}

function keywordToColorClass(text) {
  text = text.toLowerCase();
  switch (true) {
    case text.includes('ready'):
      return 'ready';
    case text.includes('locked'):
      return 'text-danger';
    default:
      return 'text-warning';
  }
}

module.exports = KiteStatusPanel.initClass();

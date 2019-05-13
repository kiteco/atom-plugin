'use strict';

require('./kite-logo');

const {CompositeDisposable, TextEditor} = require('atom');
const {DisposableEvent, addDelegatedEventListener, parent, delayPromise} = require('../utils');
const KiteAPI = require('kite-api');
const {retryPromise} = require('kite-api/lib/utils');
const LinkScheme = require('../link-scheme');
const DataLoader = require('../data-loader');
const {MAX_FILE_SIZE} = require('../constants');

const {STATES} = KiteAPI;
const dot = '<span class="dot">•</span>';

class KiteStatusPanel extends HTMLElement {
  static initClass() {
    customElements.define('kite-status-panel', this);
    return this;
  }

  setApp(app) {
    this.app = app;
  }

  hide() {
    if (this.parentNode) {
      this.parentNode.removeChild((this));
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

      this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
        if (item instanceof TextEditor) {
          this.renderCurrent().then(() => this.setPosition(target));
        }
      }));

      this.subscriptions.add(addDelegatedEventListener(this, 'click', '.kite-warning-box [data-method="post"]', (e) => {
        const link = e.target;
        const box = parent(link, '.kite-warning-box');

        link.innerHTML = '<span class=\'loading loading-spinner-tiny inline-block\'></span>';
        link.style.pointerEvents = 'none';

        KiteAPI.request({
          path: '/api/account/resendVerification',
          method: link.getAttribute('data-method'),
        })
        .then(resp => {
          box.classList.remove('kite-warning-box');
          box.classList.add('kite-info-box');
          box.textContent = link.getAttribute('data-confirmation');
        })
        .catch(err => {
          box.innerHTML = link.getAttribute('data-failure');
        });
      }));

      this.subscriptions.add(new DisposableEvent(window, 'resize', e => {
        this.setPosition(target);
      }));

      this.subscriptions.add(new DisposableEvent(document.body, 'click', e => {
        const {top, left, right, bottom} = this.getBoundingClientRect();
        const {pageX, pageY} = e;

        if (!this.starting && !this.installing && (pageX < left || pageX > right || pageY < top || pageY > bottom)) {
          this.hide();
        }
      }));
    });
  }

  pauseNotifications() {
    this.app.kite && this.app.kite.notifications.pauseNotifications();
  }

  resumeNotifications() {
    this.app.kite && this.app.kite.notifications.resumeNotifications();
  }

  handleAction({url}) {
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
        this.pendingStatus('Installing Kite');

        this.installing = true;
        promise = this.app.install()
        .then(() => this.app.start())
        .then(() => retryPromise(() => KiteAPI.isUserAuthenticated(), 10, 500))
        .catch(err => {
          if (err.data !== 4) {
            throw err;
          }
        })
        .then(() => { this.installing = false; })
        .catch(() => { this.installing = false; })
        .then(() => this.renderCurrent());
        break;
      case 'start':
        this.pendingStatus('Launching Kite');
        this.starting = true;
        promise = this.app.start()
        .then(() => retryPromise(() => KiteAPI.isUserAuthenticated(), 10, 500))
        .then(() => { this.starting = false; })
        .catch(() => { this.starting = false; })
        .then(() => this.renderCurrent());
        break;
      case 'start-enterprise':
        this.pendingStatus('Launching Kite');
        this.starting = true;
        promise = this.app.startEnterprise()
        .then(() => delayPromise(() => Promise.resolve(), 3000))
        .then(() => { this.starting = false; })
        .catch(() => { this.starting = false; })
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
    if (!target) { return; }

    const box = target.getBoundingClientRect();

    this.style.cssText = `
    top: ${Math.round(box.top - 20)}px;
    left: ${Math.round(box.right)}px;
    `;
  }

  renderCurrent() {
    if (this.installing || this.starting) { return Promise.resolve(); }
    const editor = atom.workspace.getActiveTextEditor();
    const promises = [
      KiteAPI.checkHealth().then(state => {
        return Promise.all([
          KiteAPI.isKiteInstalled().then(() => true, () => false),
          KiteAPI.isKiteEnterpriseInstalled().then(() => true, () => false),
        ]).then(([kiteInstalled, kiteEnterpriseInstalled]) => {
          return {
            state,
            kiteInstalled,
            kiteEnterpriseInstalled,
          };
        });
      }),
      DataLoader.getUserAccountInfo().catch(() => {}),
      DataLoader.getStatus(editor),
      DataLoader.isUserAuthenticated().catch(() => {}),
    ];

    return Promise.all(promises).then(data => {
      this.render(...data);
    });
  }

  render(status, account, syncStatus, isUserAuthenticated) {
    this.innerHTML = `
      ${this.renderSubscription(status)}
      ${this.renderLinks(account)}
      ${this.renderStatus(status, syncStatus, isUserAuthenticated)}
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

  renderStatus(status, syncStatus, isUserAuthenticated) {
    let content = '';
    switch (status.state) {
      case STATES.UNSUPPORTED:
        content = `<div class="text-danger">Kite engine is not available on your system ${dot}</div>`;
        break;

      case STATES.UNINSTALLED:
        content = `
          <div class="text-danger">Kite engine is not installed ${dot}</div>
          <a href="https://kite.com/download" class="btn btn-error">Install now</a>
        `;
        break;
      case STATES.INSTALLED: {
        if (KiteAPI.hasManyKiteInstallation() || KiteAPI.hasManyKiteEnterpriseInstallation()) {
          content = `<div class="text-danger">Kite engine is not running ${dot}<br/>
          You have multiple versions of Kite installed. Please launch your desired one.</div>`;
        } else if (status.kiteInstalled && status.kiteEnterpriseInstalled) {
          content = `
          <div class="text-danger">Kite engine is not running ${dot}<br/>
          Which version of kite do you want to launch?</div>
          <a href="kite-atom-internal://start-enterprise"
             class="btn btn-purple">Launch Kite Enterprise</a><br/>
          <a href="kite-atom-internal://start" class="btn btn-info">Launch Kite cloud</a>`;
        } else if (status.kiteInstalled) {
          content = `<div class="text-danger">Kite engine is not running ${dot}</div>
          <a href="kite-atom-internal://start" class="btn btn-error">Launch now</a>`;
        } else {
          content = `<div class="text-danger">Kite engine is not running ${dot}</div>
          <a href="kite-atom-internal://start-enterprise" class="btn btn-error">Launch now</a>`;
        }
        break;
      }
      case STATES.RUNNING:
        content = `
          <div class="text-danger">Kite engine is not reachable</div>
        `;
        break;
      case STATES.READY:
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
          content = `<div>Open a supported file to see Kite's status ${dot}</div>`;
        } else if (!this.app.kite.getModule('editors').isGrammarSupported(editor)) {
          content = `<div>Open a supported file to see Kite's status ${dot}</div>`;
        } else {
          if (editor && editor.getText().length >= MAX_FILE_SIZE) {
            content = `
            <div class="text-warning">The current file is too large for Kite to handle ${dot}</div>`;
          } else {
            switch (syncStatus.status) {
              case '':
              case 'ready':
                content = `<div class="ready">Kite engine is ready and working ${dot}</div>`;
                break;

              case 'indexing':
                content = `<div class="ready">Kite engine is indexing your code ${dot}</div>`;
                break;

              case 'syncing':
                content = `<div class="ready">Kite engine is syncing your code ${dot}</div>`;
                break;
            }
          }
        }

        if (!isUserAuthenticated) {
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
      <div class="right">${
        status.state >= STATES.READY
        ? '<a href="kite-atom-internal://open-account-web">Account</a>'
        : ''
      }</div>
    </div>`;
  }
}

module.exports = KiteStatusPanel.initClass();

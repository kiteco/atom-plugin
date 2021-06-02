'use strict';

let Emitter, Logger, promisifyReadResponse,
  localconfig, KiteAPI;

const ensureKiteDeps = () => {
  if (!KiteAPI) {
    KiteAPI = require('kite-api');
    Logger = require('kite-connector/lib/logger');
  }
};

const ensureUtils = () => {
  if (!promisifyReadResponse) {
    ({ promisifyReadResponse } = require('./utils'));
  }
};

const ATTEMPTS = 30;
const INTERVAL = 2500;

class KiteApp {
  static get STATES() {
    ensureKiteDeps();
    return KiteAPI.STATES;
  }

  constructor(kite) {
    if (!Emitter) { ({Emitter} = require('atom')); }
    this.emitter = new Emitter();
    this.Kite = kite;
  }

  onDidGetState(listener) {
    return this.emitter.on('did-get-state', listener);
  }

  onDidChangeState(listener) {
    return this.emitter.on('did-change-state', listener);
  }

  onKiteReady(listener) {
    return this.emitter.on('kite-ready', listener);
  }

  onKiteUninstalledAndInstallUnavailable(listener) {
    return this.emitter.on('kite-install-unavailable', listener);
  }

  onKiteUninstalledAndInstallAvailable(listener) {
    return this.emitter.on('kite-install-available', listener);
  }

  onWillDownload(listener) {
    return this.emitter.on('will-download', listener);
  }

  onDidDownload(listener) {
    return this.emitter.on('did-download', listener);
  }

  onDidFailDownload(listener) {
    return this.emitter.on('did-fail-download', listener);
  }

  onDidSkipInstall(listener) {
    return this.emitter.on('did-skip-install', listener);
  }

  onWillInstall(listener) {
    return this.emitter.on('will-install', listener);
  }

  onDidInstall(listener) {
    return this.emitter.on('did-install', listener);
  }

  onDidFailInstall(listener) {
    return this.emitter.on('did-fail-install', listener);
  }

  onWillStart(listener) {
    return this.emitter.on('will-start', listener);
  }

  onDidStart(listener) {
    return this.emitter.on('did-start', listener);
  }

  onDidFailStart(listener) {
    return this.emitter.on('did-fail-start', listener);
  }

  onDidShowLogin(listener) {
    return this.emitter.on('did-show-login', listener);
  }

  onDidSubmitLogin(listener) {
    return this.emitter.on('did-submit-login', listener);
  }

  onDidShowLoginError(listener) {
    return this.emitter.on('did-show-login-error', listener);
  }

  onDidShowSignupError(listener) {
    return this.emitter.on('did-show-signup-error', listener);
  }

  onDidCancelLogin(listener) {
    return this.emitter.on('did-cancel-login', listener);
  }

  onDidResetPassword(listener) {
    return this.emitter.on('did-reset-password', listener);
  }

  onWillAuthenticate(listener) {
    return this.emitter.on('will-authenticate', listener);
  }

  onDidAuthenticate(listener) {
    return this.emitter.on('did-authenticate', listener);
  }

  onDidFailAuthenticate(listener) {
    return this.emitter.on('did-fail-authenticate', listener);
  }

  onDidGetUnauthorized(listener) {
    return this.emitter.on('did-get-unauthorized', listener);
  }

  reset() {
    delete this.previousState;
    delete this.ready;
  }

  dispose() {
    this.emitter.dispose();
  }

  connect(src) {
    ensureKiteDeps();
    return KiteAPI.checkHealth().then(state => {
      //hack around false positive login notifications
      //basic idea is to create a 'canNotify' predicate based on the source of the connect
      //call and a comparison between a current polled state and a previous one
      let canNotify = false;
      if (state === KiteAPI.STATES.RUNNING || state === KiteAPI.STATES.REACHABLE) {
        if ((this.previousPolledState && this.previousPolledState === state) &&
              (src === 'activation' || src === 'pollingInterval')) {
          canNotify = true;
        }
      } else {
        canNotify = true;
      }
      this.emitter.emit('did-get-state', { state, canNotify });

      if (state !== this.previousState) {
        this.emitter.emit('did-change-state', state);
        this.previousState = state;

        if (state === KiteAPI.STATES.READY && !this.ready) {
          this.emitter.emit('kite-ready');
          this.ready = true;
        }
      }
      // only set this.previousPolledState under certain callers of connect
      if (src === 'activation' || src === 'pollingInterval') {
        this.previousPolledState = state;
      }

      if (src === 'activation' && state === KiteAPI.STATES.UNINSTALLED) {
        const installFn = () => {
          this.emitter.emit('will-download');
          this.Kite.installing = true;
          KiteAPI.downloadKiteRelease({
            install: true,
            launchCopilot: true,
            channel: 'atom',
            onRemove: () => {
              this.Kite.installing = false;
            },
          }).catch(e => {
            console.error(e);
            this.emitter.emit('did-fail-install');
          });
        };

        KiteAPI.canDownloadKite().then(canDownload => {
          if (!canDownload) {
            this.emitter.emit('kite-install-unavailable');
            return;
          }

          this.emitter.emit('kite-install-available', installFn);
        }).catch(console.log);
      }

      return state;
    });
  }

  start() {
    ensureKiteDeps();

    this.emitter.emit('will-start');
    return KiteAPI.runKiteAndWait(ATTEMPTS, INTERVAL)
      .then(() => this.emitter.emit('did-start'))
      .catch(err => {
        this.emitter.emit('did-fail-start', err);
        throw err;
      });
  }

  login() {
    atom.applicationDelegate.openExternal('kite://home');
  }

  copilotSettings() {
    atom.applicationDelegate.openExternal('kite://settings');
  }

  saveUserID() {
    ensureKiteDeps();
    ensureUtils();

    return KiteAPI.request({
      path: '/clientapi/user',
      method: 'GET',
    })
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error('Unable to reach user endpoint');
        }
        return promisifyReadResponse(resp);
      })
      .then(data => {
        data = JSON.parse(data);
        if (data.id !== undefined) {
          if (!localconfig) { localconfig = require('./localconfig'); }
          localconfig.set('distinctID', data.id);
        }
      })
      .catch(err => {});
  }
}

module.exports = KiteApp;

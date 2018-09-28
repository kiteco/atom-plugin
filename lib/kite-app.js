'use strict';

let os, path, Emitter, Logger, Errors, Metrics,
  KiteLogin, Plan, parseJSON, promisifyReadResponse, localconfig,
  errors, flatten, compact, DataLoader, NodeClient, KiteAPI;

const ensureKiteDeps = () => {
  if (!KiteAPI) {
    ({Errors, Metrics} = require('kite-installer'));
    KiteAPI = require('kite-api');
    Logger = require('kite-connector/lib/logger');
    NodeClient = require('kite-connector/lib/clients/node');
    errors = Errors();
  }
};

const ensureUtils = () => {
  if (!promisifyReadResponse) {
    ({parseJSON, promisifyReadResponse, flatten, compact} = require('./utils'));
  }
};

const ATTEMPTS = 30;
const INTERVAL = 2500;
const INVALID_PASSWORD = 6;
const PASSWORD_LESS_USER = 9;

const EXTENSIONS_BY_LANGUAGES = {
  python: [
    'py',
  ],
  javascript: [
    'js',
  ],
};

const catchResponse = err => {
  if (err.data && err.data.response) {
    return err.data.response;
  } else {
    throw err;
  }
};

class KiteApp {
  static get STATES() {
    ensureKiteDeps();
    return KiteAPI.STATES;
  }

  constructor(kite) {
    if (!Emitter) { ({Emitter} = require('atom')); }
    this.emitter = new Emitter();
    this.kite = kite;
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

  onWillWhitelist(listener) {
    return this.emitter.on('will-whitelist', listener);
  }

  onDidWhitelist(listener) {
    return this.emitter.on('did-whitelist', listener);
  }

  onDidFailWhitelist(listener) {
    return this.emitter.on('did-fail-whitelist', listener);
  }

  onWillBlacklist(listener) {
    return this.emitter.on('will-blacklist', listener);
  }

  onDidBlacklist(listener) {
    return this.emitter.on('did-blacklist', listener);
  }

  onDidFailBlacklist(listener) {
    return this.emitter.on('did-fail-blacklist', listener);
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
    if (!Plan) { Plan = require('./plan'); }
    return KiteAPI.checkHealth().then(state => {
      if (state >= KiteAPI.STATES.INSTALLED) {
        localStorage.setItem('kite.wasInstalled', true);
      }

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

        if (state === KiteAPI.STATES.AUTHENTICATED && !this.ready) {
          this.emitter.emit('kite-ready');
          this.ready = true;
        }
      }
      //only set this.previousPolledState under certain callers of connect
      if (src === 'activation' || src === 'pollingInterval') {
        this.previousPolledState = state;
      }

      return state >= KiteAPI.STATES.REACHABLE
        ? Plan.queryPlan().then(() => state) :
        state;
    });
  }

  connectWithLanguages(src) {
    if (!DataLoader) { DataLoader = require('./data-loader'); }

    return this.connect(src).then(state => {
      if (state >= KiteAPI.STATES.REACHABLE) {
        return DataLoader.getSupportedLanguages()
        .then(languages => [state, languages])
        .catch(() => [state, ['python']]);
      } else {
        return [state, ['python']];
      }
    }).then(([s, l]) => {
      this.supportedLanguages = l;
      return s;
    });
  }

  installFlow() {
    ensureKiteDeps();

    return Promise.all([
      KiteAPI.canInstallKite(),
      localStorage.getItem('kite.no-admin-privileges')
        ? Promise.reject('User does not have admin privileges')
        : Promise.resolve(),
    ]).then(([values]) => {
      Metrics.Tracker.name = 'atom';
      Metrics.Tracker.props = {};
      Metrics.Tracker.props.lastEvent = event;

      this.showInstallFlow({});
    }, (err) => {
      Logger.error('rejected with data:', err);
    });
  }

  showInstallFlow(variant) {
    ensureKiteDeps();

    if (!errors) { errors = Errors(); }
    const {
      install: {
        Install,
        atom: atomInstall,
      },
    } = require('kite-installer');

    const {defaultFlow} = atomInstall();

    const install = new Install(defaultFlow(), {
      path: atom.project.getPaths()[0] || os.homedir(),
    }, {
      failureStep: 'termination',
      title: 'Kite Install',
    });

    const initialClient = KiteAPI.Account.client;

    KiteAPI.Account.client = new NodeClient('alpha.kite.com', -1, '', true);

    errors.trackUncaught();
    atom.workspace.getActivePane().addItem(install);
    atom.workspace.getActivePane().activateItem(install);

    install.start()
    .then(result => console.log(result))
    .catch(err => console.error(err))
    .then(() => {
      KiteAPI.Account.client = initialClient;
    });

    return install;
  }

  install() {
    ensureKiteDeps();

    this.emitter.emit('will-download');
    return KiteAPI.downloadKiteRelease({
      install: true,
      onDownload: () => this.emitter.emit('did-download'),
      onInstallStart: () => this.emitter.emit('will-install'),
    })
    .then(() => this.emitter.emit('did-install'))
    .catch(err => {
      switch (err.type) {
        case 'bad_status':
        case 'curl_error':
          this.emitter.emit('did-fail-download', err);
          break;
        default:
          this.emitter.emit('did-fail-install', err);
      }
      throw err;
    });
  }

  wasInstalledOnce() {
    return localStorage.getItem('kite.wasInstalled') === 'true';
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

  startEnterprise() {
    ensureKiteDeps();

    this.emitter.emit('will-start');
    return KiteAPI.runKiteEnterpriseAndWait(ATTEMPTS, INTERVAL)
    .then(() => this.emitter.emit('did-start'))
    .catch(err => {
      this.emitter.emit('did-fail-start', err);
      throw err;
    });
  }

  login() {
    if (!KiteLogin) { KiteLogin = require('./elements/kite-login'); }

    const login = new KiteLogin();
    const panel = atom.workspace.addModalPanel({item: login});

    this.emitter.emit('did-show-login', {login, panel});

    login.onDidCancel(() => panel.destroy());
    login.onDidResetPassword(() => {
      const url = `https://kite.com/reset-password?email=${login.email}`;

      atom.applicationDelegate.openExternal(url);
      this.emitter.emit('did-reset-password');
      panel.destroy();
    });

    login.onDidSubmitLogin((data) => {
      this.emitter.emit('did-submit-login');

      this.authenticate(data)
      .then(() => {
        panel.destroy();
      })
      .catch(err => {
        if (err.message === 'Passwordless Form') {
          login.passwordLessForm();
        } else {
          login.showError(err.message);
          this.emitter.emit('did-show-login-error');
        }
      });
    });

    login.onDidSubmitSignup((data) => {
      this.emitter.emit('did-submit-signup');

      KiteAPI.Account.createAccount(data)
      .catch(catchResponse)
      .then(resp => Promise.all([
        resp,
        promisifyReadResponse(resp).then(d => JSON.parse(d)),
      ]))
      .then(([resp, data]) => {
        if (resp.statusCode !== 200) {
          login.showError(data.message);
          this.emitter.emit('did-show-signup-error');
        } else {
          panel.destroy();
        }
      })
      .catch(err => {
        console.log(err);
      });
    });
  }

  authenticate(data) {
    ensureKiteDeps();
    ensureUtils();

    this.emitter.emit('will-authenticate', data);
    return KiteAPI.login(data)
    .catch(catchResponse)
    .then(resp => {
      Logger.logResponse(resp);
      switch (resp.statusCode) {
        case 200:
          this.emitter.emit('did-authenticate', data);
          break;
        case 400:
        case 401:
          return promisifyReadResponse(resp).then(data => {
            data = parseJSON(data);
            switch (data.code) {
              case INVALID_PASSWORD:
                throw new Error('Invalid Password');
              case PASSWORD_LESS_USER:
                throw new Error('Passwordless Form');
              default:
                this.emitter.emit('did-get-unauthorized');
                throw new Error('Unauthorized');
            }
          });
      }
      return resp;
    })
    .catch(err => {
      this.emitter.emit('did-fail-authenticate', err);
      throw err;
    });
  }

  whitelist(path) {
    ensureKiteDeps();

    this.emitter.emit('will-whitelist', path);
    return KiteAPI.whitelistPath(path)
    .then(() => this.emitter.emit('did-whitelist', path))
    .catch(err => {
      err.path = path;
      this.emitter.emit('did-fail-whitelist', err);
      throw err;
    });
  }

  blacklist(path, noAction) {
    ensureKiteDeps();

    this.emitter.emit('will-blacklist', path);
    return KiteAPI.blacklistPath(path, noAction)
    .then(() => this.emitter.emit('did-blacklist', path))
    .catch(err => {
      err.path = path;
      this.emitter.emit('did-fail-blacklist', err);
      throw err;
    });
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

  getRootDirectory(editor) {
    if (!os) { os = require('os'); }
    if (!path) { path = require('path'); }

    const [projectPath] = atom.project.getPaths();
    const basepath = editor ? editor.getPath() || projectPath : projectPath;

    return basepath && path.relative(os.homedir(), basepath).indexOf('..') === 0
      ? path.parse(basepath).root
      : os.homedir();
  }

  hasSupportedFileOpen() {
    return atom.workspace.getTextEditors().some(this.isGrammarSupported);
  }

  hasActiveSupportedFile() {
    const editor = atom.workspace.getActiveTextEditor();
    return editor && this.isGrammarSupported(editor);
  }

  isGrammarSupported(editor) {
    return this.supportedLanguages
      ? new RegExp(this.getSupportedLanguagesRegExp(this.supportedLanguages))
            .test(editor.getPath() || '')
      : /\.py$/.test(editor.getPath() || '');
  }

  getSupportedLanguagesRegExp(languages) {
    ensureUtils();
    return `\.(${
      compact(flatten(languages.map(l => EXTENSIONS_BY_LANGUAGES[l]))).join('|')
    })$`;
  }
}

module.exports = KiteApp;

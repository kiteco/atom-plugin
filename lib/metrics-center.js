'use strict';

const {CompositeDisposable} = require('atom');
const metrics = require('./metrics.js');

class MetricsCenter {
  constructor(app) {
    this.app = app;
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(app.onWillDownload(() => {
      metrics.track('download-and-install started');
    }));
    this.subscriptions.add(app.onDidDownload(() => {
      metrics.track('download succeeded');
    }));
    this.subscriptions.add(app.onDidFailDownload(err => {
      metrics.track('download failed', err);
    }));
    this.subscriptions.add(app.onWillInstall(() => {
      metrics.track('install started');
    }));
    this.subscriptions.add(app.onDidSkipInstall(() => {
      metrics.track('skipped kite');
    }));
    this.subscriptions.add(app.onDidInstall(() => {
      metrics.track('download-and-install succeeded');
    }));
    this.subscriptions.add(app.onDidFailInstall(err => {
      metrics.track('install failed', err);
    }));
    this.subscriptions.add(app.onWillStart(() => {
      metrics.track('launch started');
    }));
    this.subscriptions.add(app.onDidStart(() => {
      metrics.track('launch succeeded');
    }));
    this.subscriptions.add(app.onDidFailStart(err => {
      metrics.track('launch failed', err);
    }));
    this.subscriptions.add(app.onDidSubmitLogin(() => {
      metrics.track('submit clicked in login panel');
    }));
    this.subscriptions.add(app.onDidCancelLogin(() => {
      metrics.track('cancel clicked in login panel');
    }));
    this.subscriptions.add(app.onDidResetPassword(() => {
      metrics.track('reset password clicked in login panel');
    }));
    this.subscriptions.add(app.onWillAuthenticate(({email}) => {
      metrics.track('authentication started', {email});
    }));
    this.subscriptions.add(app.onDidAuthenticate(({email}) => {
      metrics.track('authentication succeeded', {email});
    }));
    this.subscriptions.add(app.onDidFailAuthenticate(err => {
      metrics.track('authentication failed', err);
    }));
    this.subscriptions.add(app.onWillWhitelist(path => {
      metrics.track('whitelisting started', {dir: path});
    }));
    this.subscriptions.add(app.onDidWhitelist(path => {
      metrics.track('whitelisting succeeded', {dir: path});
    }));
    this.subscriptions.add(app.onDidFailWhitelist(err => {
      metrics.track('whitelisting failed', {dir: err.content});
    }));
  }

  trackNotifications(notificationsCenter) {
    this.subscriptions.add(notificationsCenter.onDidNotify(({notification, type}) =>
      metrics.track(`${notification} ${type} shown`)));

    this.subscriptions.add(notificationsCenter.onDidDismissNotification(({notification, type}) =>
      metrics.track(`${notification} ${type} dismissed`)));

    this.subscriptions.add(notificationsCenter.onDidRejectNotification(({notification, type}) =>
      metrics.track(`${notification} ${type} rejected`)));

    this.subscriptions.add(notificationsCenter.onDidClickNotificationButton(({button, notification, type}) =>
      metrics.track(`${button} button clicked (via ${notification} ${type})`)));
  }

  dispose() {
    this.subscriptions.dispose();
    delete this.app;
    delete this.subscriptions;
  }
}

module.exports = MetricsCenter;

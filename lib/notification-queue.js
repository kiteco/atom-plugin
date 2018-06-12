'use strict';

const {Emitter, CompositeDisposable} = require('atom');
const KiteNotification = require('./kite-notification');
const KiteModal = require('./kite-modal');

module.exports = class NotificationQueue {
  constructor() {
    this.queue = [];
    this.promise = Promise.resolve();
    this.emitter = new Emitter();
  }

  onDidNotify(listener) {
    return this.emitter.on('did-notify', listener);
  }

  onDidRejectNotification(listener) {
    return this.emitter.on('did-reject-notification', listener);
  }

  onDidDismissNotification(listener) {
    return this.emitter.on('did-dismiss-notification', listener);
  }

  onDidClickNotificationButton(listener) {
    return this.emitter.on('did-click-notification-button', listener);
  }

  abort() {
    this.aborted = true;
    this.activeNotification && this.activeNotification.dismiss();
  }

  add(queuedNotification) {
    if (typeof queuedNotification == 'function') {
      return this.promise = this.promise
      .then(() => this.aborted ? null : queuedNotification())
      .then(notification => {
        this.activeNotification = notification;
        return this.execute(notification);
      })
      .then(() => { delete this.activeNotification; });
    } else {
      return this.promise = this.promise
      .then(() => {
        if (this.aborted) {
          return null;
        } else {
          this.activeNotification = queuedNotification;
          return this.execute(queuedNotification);
        }
      })
      .then(() => { delete this.activeNotification; });
    }
  }
  execute(notification) {
    if (notification) {
      this.subscribeToNotification(notification);
      return notification.execute();
    }
    return null;
  }

  subscribeToNotification(notification) {
    const sub = new CompositeDisposable();
    const forwardEvent = t => e => this.emitter.emit(t, e);
    const forwardEventAndDispose = t => e => {
      this.emitter.emit(t, e);
      sub.dispose();
    };

    sub.add(notification.onDidNotify(forwardEvent('did-notify')));
    sub.add(notification.onDidClickNotificationButton(forwardEvent('did-click-notification-button')));
    sub.add(notification.onDidDismissNotification(forwardEventAndDispose('did-dismiss-notification')));
    sub.add(notification.onDidRejectNotification(forwardEventAndDispose('did-reject-notification')));
  }

  addModal(item, options) {
    return this.add(new KiteModal(item, options));
  }
  addInfo(title, notificationOptions, queueOptions) {
    return this.add(new KiteNotification('info', title, notificationOptions, queueOptions));
  }
  addSuccess(title, notificationOptions, queueOptions) {
    return this.add(new KiteNotification('success', title, notificationOptions, queueOptions));
  }
  addWarning(title, notificationOptions, queueOptions) {
    return this.add(new KiteNotification('warning', title, notificationOptions, queueOptions));
  }
  addError(title, notificationOptions, queueOptions) {
    return this.add(new KiteNotification('error', title, notificationOptions, queueOptions));
  }
  addFatalError(title, notificationOptions, queueOptions) {
    return this.add(new KiteNotification('fatalError', title, notificationOptions, queueOptions));
  }
};

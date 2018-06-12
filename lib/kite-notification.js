'use strict';

const {Emitter} = require('atom');
const capitalize = s => s.replace(/^\w/, m => m.toUpperCase());
const parameterize = s => s.toLowerCase().replace(/[^\w]+/g, '-');

module.exports = class KiteNotification {
  constructor(level, title, notificationOptions = {}, options = {}) {
    this.level = level;
    this.title = title;
    this.emitter = new Emitter();
    this.notificationOptions = notificationOptions;
    this.options = options;

    this.notificationOptions.dismissable = this.notificationOptions.dismissable != null
      ? this.notificationOptions.dismissable
      : true;

    this.id = options.id || parameterize(title);
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

  execute() {
    return new Promise((resolve, reject) => {
      const {condition, onDidDismiss} = this.options;
      if (!condition || condition()) {
        this.notification = atom.notifications[`add${capitalize(this.level)}`](this.title, this.notificationOptions);
        this.instrumentNotification(this.notification, (res) => {
          onDidDismiss && onDidDismiss(res);
          resolve(res);
        });
      } else {
        resolve();
      }
    });
  }

  dismiss() {
    this.notification && this.notification.dismiss();
  }

  instrumentNotification(notification, dismissCallback) {
    this.emitter.emit('did-notify', this);

    let actionTriggered;

    if (this.notificationOptions.buttons) {
      this.notificationOptions.buttons.forEach(button => {
        const {onDidClick} = button;
        button.onDidClick = () => {
          actionTriggered = button.text;
          this.emitter.emit('did-click-notification-button', {notification: this, button});
          onDidClick && onDidClick(() => notification.dismiss());
        };
      });
    }

    const sub = notification.onDidDismiss(() => {
      dismissCallback && dismissCallback(actionTriggered);
      if (actionTriggered) {
        this.emitter.emit('did-dismiss-notification', this);
      } else {
        this.emitter.emit('did-reject-notification', this);
      }
      this.emitter.dispose();
      sub.dispose();
    });

    return notification;
  }
};

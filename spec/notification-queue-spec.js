'use strict';

let notificationsPkg, notification, notificationElement,
  queue, kiteNotification,
  dismissSpy, clickSpy, condSpy, promise;
const KiteNotification = require('../lib/kite-notification');
const NotificationQueue = require('../lib/notification-queue');
const {click} = require('./helpers/events');

const findNotification = () => {
  const allNotifications = atom.notifications.getNotifications();
  notification = allNotifications[allNotifications.length - 1];
  notificationElement = atom.views.getView(notification);
};

describe('NotificationQueue', () => {
  beforeEach(() => {
    waitsForPromise(() =>
      atom.packages.activatePackage('notifications').then(pkg => {
        notificationsPkg = pkg.mainModule;
      }));
    runs(() => {
      spyOn(atom.notifications, 'addNotification').andCallThrough();
      queue = new NotificationQueue();
      dismissSpy = jasmine.createSpy();
      clickSpy = jasmine.createSpy().andCallFake(dismiss => dismiss());
      condSpy = jasmine.createSpy().andReturn(true);
    });
  });

  afterEach(() => {
    queue.abort();
    notificationsPkg.lastNotification = null;
    atom.notifications.clear();
    notification && notification.dismiss();
    notificationElement = null;
    notification = null;
  });

  describe('.add()', () => {
    describe('when there is no pending notifications yet in the queue', () => {
      beforeEach(() => {
        kiteNotification = new KiteNotification('info', 'title', {
          buttons: [{
            text: 'text',
            onDidClick: clickSpy,
          }],
        }, {
          onDidDismiss: dismissSpy,
          condition: condSpy,
        });

        promise = queue.add(kiteNotification);

        waitsFor('notification displayed', () => atom.notifications.addNotification.callCount > 0);
      });

      it('adds the notification in queue and evalutates it immediately ', () => {
        expect(condSpy).toHaveBeenCalled();
      });

      it('displays the notification using atom API', () => {
        expect(atom.notifications.addNotification).toHaveBeenCalled();
      });

      describe('when the notification is dismissed', () => {
        describe('without picking an action', () => {
          it('resolves the promise', () => {
            kiteNotification.dismiss();

            expect(dismissSpy).toHaveBeenCalledWith(undefined);

            waitsForPromise('notification promise', () => promise);
          });
        });

        describe('by picking an action', () => {
          it('resolves the promise', () => {
            findNotification();

            click(notificationElement.element.querySelector('a.btn'));

            expect(clickSpy).toHaveBeenCalled();
            expect(dismissSpy).toHaveBeenCalledWith('text');

            waitsForPromise('notification promise', () => promise);
          });
        });
      });
    });

    describe('when the condition returns false', () => {
      beforeEach(() => {
        condSpy = jasmine.createSpy().andReturn(false);
        kiteNotification = new KiteNotification('info', 'title', {
          buttons: [{
            text: 'text',
            onDidClick: clickSpy,
          }],
        }, {
          onDidDismiss: dismissSpy,
          condition: condSpy,
        });

        promise = queue.add(kiteNotification);
      });

      it('evalutates the notification but displays nothing', () => {
        waitsForPromise('notification promise', () => promise.then(() => {
          expect(atom.notifications.addNotification).not.toHaveBeenCalled();
        }));
      });
    });

    describe('adding several notifications', () => {
      let firstNotification, firstPromise;
      describe('with a first notification whose condition is true', () => {
        beforeEach(() => {
          firstNotification = new KiteNotification('info', 'title');

          kiteNotification = new KiteNotification('info', 'title', {
            buttons: [{
              text: 'text',
              onDidClick: clickSpy,
            }],
          }, {
            onDidDismiss: dismissSpy,
            condition: condSpy,
          });

          firstPromise = queue.add(firstNotification);
          promise = queue.add(kiteNotification);

          waitsFor('notification displayed', () => atom.notifications.addNotification.callCount > 0);
        });

        describe('dismissing the first notification', () => {
          beforeEach(() => {
            firstNotification.dismiss();
            waitsForPromise('first notification dismissed', () => firstPromise);
          });

          it('then evaluates the second promise', () => {
            expect(condSpy).toHaveBeenCalled();
          });
        });
      });

      describe('with a first notification whose condition is false', () => {
        beforeEach(() => {
          firstNotification = new KiteNotification('info', 'title', {}, {
            condition: () => false,
          });

          kiteNotification = new KiteNotification('info', 'title', {
            buttons: [{
              text: 'text',
              onDidClick: clickSpy,
            }],
          }, {
            onDidDismiss: dismissSpy,
            condition: condSpy,
          });

          firstPromise = queue.add(firstNotification);
          promise = queue.add(kiteNotification);

          waitsForPromise('first notification evaluated', () => firstPromise);
        });

        it('evaluates the second promise without displaying the first one', () => {
          expect(condSpy).toHaveBeenCalled();

          expect(atom.notifications.addNotification.callCount).toEqual(1);
        });
      });
    });
  });
});

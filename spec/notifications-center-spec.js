'use strict';

const os = require('os');
const {withKite, withKitePaths} = require('kite-api/test/helpers/kite');

const NotificationsCenter = require('../lib/notifications-center');
const KiteApp = require('../lib/kite-app');
const KiteEditors = require('../lib/editors');
const {sleep} = require('./spec-helpers');
const {click} = require('./helpers/events');

const getNotificationElement = () => {
  const allNotifications = atom.notifications.getNotifications();
  return atom.views.getView(allNotifications[allNotifications.length - 1]);
};

const queryNotificationSelector = (notificationElement, selector) =>
  notificationElement.element
    ? notificationElement.element.querySelector(selector)
    : notificationElement.querySelector(selector);

const queryNotificationSelectorAll = (notificationElement, selector) =>
  notificationElement.element
    ? notificationElement.element.querySelectorAll(selector)
    : notificationElement.querySelectorAll(selector);

describe('NotificationsCenter', () => {
  let app, notifications, notificationsPkg, workspaceElement, notificationElement, notification, editor;

  beforeEach(() => {
    app = new KiteApp();
    const editors = new KiteEditors();
    app.kite = {
      getModule(mod) {
        if (mod === 'editors') {
          return editors;
        }
      },
    };
    notifications = new NotificationsCenter(app);

    workspaceElement = atom.views.getView(atom.workspace);
    localStorage.setItem('kite.wasInstalled', false);

    waitsForPromise(() =>
      atom.packages.activatePackage('notifications').then(pkg => {
        notificationsPkg = pkg.mainModule;
        notificationsPkg.initializeIfNotInitialized();
      }));
  });

  afterEach(() => {
    notificationsPkg.lastNotification = null;
    atom.notifications.clear();
    notification && notification.dismiss();
    notificationElement = null;
    notification = null;
  });

  describe('when there is a python file open', () => {
    beforeEach(() => {
      waitsForPromise(() =>
        atom.packages.activatePackage('language-python'));
      waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
        editor = e;
        // const kiteEditor =
      }));
    });

    describe('and no notifications have been displayed before', () => {
      withKite({supported: false}, () => {
        beforeEach(() => {
          spyOn(os, 'platform').andReturn('wtfOS');

          waitsForPromise(() => app.connect());
        });
        it('notifies the user', () => {
          notificationElement = getNotificationElement();
          notification = notificationElement.getModel();
          const options = notification.getOptions();

          expect(notificationElement).not.toBeNull();

          expect(notification.getType()).toEqual('error');
          expect(notification.getMessage())
          .toEqual("Kite doesn't support your OS");

          expect(options.buttons).toBeUndefined();
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Sorry, the Kite engine only supports macOS and Windows at the moment.');
        });

        describe('when the same state is found after a new check', () => {
          it('does not notify the user', () => {
            atom.notifications.getNotifications()[0].dismiss();
            waitsForPromise(() => app.connect().then(() => {
              expect(atom.notifications.getNotifications().length).toEqual(1);
            }));
          });
        });
      });

      withKite({installed: false}, () => {
        describe('and was never installed before', () => {
          beforeEach(() => {
            waitsForPromise(() => app.connect().then(() => {
              notificationElement = getNotificationElement();
            }));
          });

          it('does not notify the user', () => {
            waitsForPromise(() => app.connect().then(() => {
              expect(workspaceElement.querySelector('atom-notification')).not.toExist();
            }));
          });
        });

        describe('but was installed before', () => {
          beforeEach(() => {
            localStorage.setItem('kite.wasInstalled', true);
          });

          it('does not notify the user', () => {
            waitsForPromise(() => app.connect().then(() => {
              expect(workspaceElement.querySelector('atom-notification')).not.toExist();
            }));
          });
        });
      });

      withKite({reachable: false}, () => {
        beforeEach(() => {
          waitsForPromise(() => app.connect('pollingInterval')
          .then(() => app.connect('pollingInterval'))
          .then(() => {
            notificationElement = getNotificationElement();
            notification = notificationElement.getModel();
          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).not.toBeNull();

          expect(notification.getType()).toEqual('error');
          expect(notification.getMessage())
          .toEqual('The Kite background service is running but not reachable');

          expect(options.buttons).toBeUndefined();
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Try killing Kite from the Activity Monitor.');
        });

        describe('when the same state is found after a new check', () => {
          it('does not notify the user', () => {
            atom.notifications.getNotifications()[0].dismiss();
            waitsForPromise(() => app.connect().then(() => {
              expect(atom.notifications.getNotifications().length).toEqual(1);
            }));
          });
        });
      });

      withKite({logged: false}, () => {
        describe('when a login form is present', () => {
          let login;

          beforeEach(() => {
            login = document.createElement('kite-login');
            document.body.appendChild(login);
            waitsForPromise(() => app.connect().then(() => {
              notificationElement = getNotificationElement();
            }));
          });

          afterEach(() => {
            document.body.removeChild(login);
          });

          it('does not notify the user', () => {
            expect(notificationElement).toBeUndefined();
          });
        });

        describe('when no login form is present', () => {
          beforeEach(() => {
            waitsForPromise(() => app.connect('pollingInterval')
            .then(() => app.connect('pollingInterval'))
            .then(() => {
              notificationElement = getNotificationElement();
              notification = notificationElement.getModel();
            }));
          });

          it('notifies the user', () => {
            const options = notification.getOptions();

            expect(notificationElement).not.toBeNull();

            expect(notification.getType()).toEqual('warning');
            expect(notification.getMessage())
            .toEqual('You need to login to the Kite engine');

            expect(options.buttons.length).toEqual(1);
            expect(options.buttons[0].text).toEqual('Login');
            expect(options.dismissable).toBeTruthy();
            expect(options.description)
            .toEqual('Kite needs to be authenticated to analyze your code.');
          });

          describe('clicking on the Login button', () => {
            it('triggers a login', () => {
              spyOn(app, 'login').andReturn(Promise.resolve());
              const button = queryNotificationSelector(notificationElement, 'a.btn');
              click(button);

              expect(app.login).toHaveBeenCalled();
            });
          });

          describe('when the same state is found after a new check', () => {
            it('does not notify the user', () => {
              atom.notifications.getNotifications()[0].dismiss();
              waitsForPromise(() => app.connect().then(() => {
                expect(atom.notifications.getNotifications().length).toEqual(1);
              }));
            });
          });
        });

        describe('when an attempt to login end with unauthorized', () => {
          beforeEach(() => {
            app.emitter.emit('did-get-unauthorized', {message: 'Some error'});

            waitsFor('notification', () => {
              notificationElement = getNotificationElement();
              if (notificationElement) {
                notification = notificationElement.getModel();
              }
              return notificationElement;
            });
          });

          it('notifies the user', () => {
            const options = notification.getOptions();

            expect(notificationElement).not.toBeNull();

            expect(notification.getType()).toEqual('error');
            expect(notification.getMessage())
            .toEqual('Unable to login');

            expect(options.buttons.length).toEqual(1);
            expect(options.buttons[0].text).toEqual('Retry');
            expect(options.dismissable).toBeTruthy();
            expect(options.description)
            .toEqual(JSON.stringify({message: 'Some error'}));
          });

          describe('clicking on the Retry button', () => {
            it('triggers a new login attempt', () => {
              spyOn(app, 'login').andReturn(Promise.resolve());
              const button = queryNotificationSelector(notificationElement, 'a.btn');
              click(button);

              expect(app.login).toHaveBeenCalled();
            });
          });
        });

        withKitePaths({}, undefined, () => {
          beforeEach(() => {
            waitsForPromise(() => app.connect());
            runs(() => {
              notifications.warnNotWhitelisted(editor, '/path/to/dir');
            });
            sleep(100);
            runs(() => {
              notificationElement = getNotificationElement();
              notification = notificationElement.getModel();
            });
          });

          it('notifies the user', () => {
            const options = notification.getOptions();

            expect(notificationElement).not.toBeNull();

            expect(notification.getType()).toEqual('warning');
            expect(notification.getMessage())
            .toEqual(`The Kite engine is disabled for ${atom.workspace.getActiveTextEditor().getPath()}`);

            expect(options.buttons.length).toEqual(3);
            expect(options.buttons[0].text).toEqual('Settings');
            expect(options.buttons[1].text).toEqual('/path/to/dir');
            expect(options.buttons[2].text).toEqual('Browse…');
            expect(options.dismissable).toBeTruthy();
            expect(options.description)
            .toEqual('Would you like to enable Kite for Python files in:');
          });

          describe('clicking on the homedir button', () => {
            it('attempts to whitelist the homedir path', () => {
              spyOn(app, 'whitelist').andReturn(Promise.resolve());
              const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[1];
              click(button);
              expect(app.whitelist).toHaveBeenCalledWith('/path/to/dir');

            });
          });

          describe('clicking on the setting button', () => {
            it('attempts to blacklist the editor path', () => {
              spyOn(atom.applicationDelegate, 'openExternal');
              const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[0];
              const filename = editor.getPath();
              click(button);

              expect(atom.applicationDelegate.openExternal)
              .toHaveBeenCalledWith(
                `kite://settings/permissions?filename=${filename}&action=blacklist`
              );
            });
          });

          describe('dismissing the notification', () => {
            it('attempts to blacklist the editor path', () => {
              spyOn(app, 'blacklist').andReturn(Promise.resolve());
              const button = queryNotificationSelector(notificationElement, '.close');
              click(button);

              expect(app.blacklist).toHaveBeenCalledWith(editor.getPath(), true);
            });
          });

          describe('clicking on the browse button', () => {
            describe('and picking a directory', () => {
              it('attempts to whitelist the homedir path', () => {
                spyOn(atom.applicationDelegate, 'pickFolder').andCallFake(cb => {
                  cb(['/some/directory/path']);
                });
                spyOn(app, 'whitelist').andReturn(Promise.resolve());
                const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[2];
                click(button);

                expect(app.whitelist).toHaveBeenCalledWith('/some/directory/path');
              });
            });

            describe('and cancelling', () => {
              it('does not try to whitelist', () => {
                spyOn(atom.applicationDelegate, 'pickFolder').andCallFake(cb => { cb([]); });
                spyOn(app, 'whitelist').andReturn(Promise.resolve());
                const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[2];
                click(button);

                expect(app.whitelist).not.toHaveBeenCalled();
              });
            });
          });

          describe('when the same state is found after a new check', () => {
            it('does not notify the user', () => {
              atom.notifications.getNotifications()[0].dismiss();
              waitsForPromise(() => app.connect().then(() => {
                expect(atom.notifications.getNotifications().length).toEqual(1);
              }));
            });
          });
        });

        describe('when an attempt to whitelist a path fails', () => {
          describe('because the path is already whitelisted', () => {
            beforeEach(() => {
              app.emitter.emit('did-fail-whitelist', {
                path: '/some/path/to/dir',
                data: 6,
              });
            });

            it('does not notify the user', () => {
              expect(workspaceElement.querySelector('atom-notification')).not.toExist();
            });
          });

          describe('for another reason', () => {
            beforeEach(() => {
              app.emitter.emit('did-fail-whitelist', {
                path: '/some/path/to/dir',
                data: 5,
              });

              waitsFor('notification', () => {
                notificationElement = getNotificationElement();
                if (notificationElement) {
                  notification = notificationElement.getModel();
                }
                return notificationElement;
              });
            });

            it('notifies the user', () => {
              const options = notification.getOptions();

              expect(notificationElement).not.toBeNull();

              expect(notification.getType()).toEqual('error');
              expect(notification.getMessage())
              .toEqual('Unable to enable Kite for /some/path/to/dir');

              expect(options.buttons.length).toEqual(1);
              expect(options.buttons[0].text).toEqual('Retry');
              expect(options.dismissable).toBeTruthy();
              expect(options.description)
              .toEqual(JSON.stringify({
                path: '/some/path/to/dir',
                data: 5,
              }));
            });

            describe('clicking on the Retry button', () => {
              it('triggers a new whitelist attempt', () => {
                spyOn(app, 'whitelist').andReturn(Promise.resolve());
                const button = queryNotificationSelector(notificationElement, 'a.btn');
                click(button);

                expect(app.whitelist).toHaveBeenCalled();
              });
            });
          });
        });

        withKitePaths({
          whitelist: [__dirname],
        }, undefined, () => {
          beforeEach(() => {
            atom.project.setPaths([__dirname]);
            waitsForPromise(() => app.connect().then(() => {
              notificationElement = getNotificationElement();
            }));
          });

          it('does not notify the user', () => {
            expect(notificationElement).not.toExist();
          });
        });
      });

    });
  });

  describe('when there is no python file open', () => {
    beforeEach(() => {
      waitsForPromise(() => atom.workspace.open('variable.json'));
    });

    withKite({installed: false}, () => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKite({reachable: false}, () => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKite({logged: false}, () => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKite({logged: true}, () => {
      withKitePaths({}, undefined, () => {
        it('does not notify the user', () => {
          waitsForPromise(() => app.connect().then(() => {
            expect(workspaceElement.querySelector('atom-notification')).not.toExist();
          }));
        });
      });

      withKitePaths({
        whitelist: [__dirname],
      }, undefined, () => {
        beforeEach(() => {
          atom.project.setPaths([__dirname]);
        });

        it('does not notify the user', () => {
          waitsForPromise(() => app.connect().then(() => {
            expect(workspaceElement.querySelector('atom-notification')).not.toExist();
          }));
        });
      });
    });
  });
});

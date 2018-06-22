'use strict';

const os = require('os');
const {withKite} = require('kite-api/test/helpers/kite');

// const {StateController} = require('kite-installer');
const NotificationsCenter = require('../lib/notifications-center');
const KiteApp = require('../lib/kite-app');
const {
  fakeKiteInstallPaths, withKiteNotReachable, // withKiteNotRunning,
  withKiteNotAuthenticated, withKiteWhitelistedPaths, sleep,
  // withKiteEnterpriseNotRunning, withBothKiteNotRunning,
  // withManyKiteNotRunning, withManyKiteEnterpriseNotRunning,
  // withManyOfBothKiteNotRunning,
} = require('./spec-helpers');
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

  fakeKiteInstallPaths();

  beforeEach(() => {
    app = new KiteApp();
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

      describe('when kite is not installed', () => {
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
          // it('notifies the user', () => {
          //   const options = notification.getOptions();
          //
          //   expect(notificationElement).not.toBeNull();
          //
          //   expect(notification.getType()).toEqual('warning');
          //   expect(notification.getMessage())
          //   .toEqual('The Kite engine is not installed');
          //
          //   expect(options.buttons.length).toEqual(1);
          //   expect(options.buttons[0].text).toEqual('Install Kite');
          //   expect(options.dismissable).toBeTruthy();
          //   expect(options.description)
          //   .toEqual('Install Kite to get Python completions, documentation, and examples.');
          // });
          //
          // describe('clicking on the Install Kite button', () => {
          //   beforeEach(() => {
          //     spyOn(app, 'install').andReturn(Promise.resolve());
          //   });
          //
          //   it('triggers an install', () => {
          //     const button = queryNotificationSelector(notificationElement, 'a.btn');
          //     click(button);
          //
          //     expect(app.install).toHaveBeenCalled();
          //   });
          // });
          //
          // describe('when the same state is found after a new check', () => {
          //   it('does not notify the user', () => {
          //     atom.notifications.getNotifications()[0].dismiss();
          //     waitsForPromise(() => app.connect().then(() => {
          //       expect(atom.notifications.getNotifications().length).toEqual(1);
          //     }));
          //   });
          // });
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

      // withKiteNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise(() => app.connect());
      //     waitsFor(() => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //
      //     expect(options.buttons.length).toEqual(1);
      //     expect(options.buttons[0].text).toEqual('Start Kite');
      //     expect(options.dismissable).toBeTruthy();
      //     expect(options.description)
      //     .toEqual('Start the Kite background service to get Python completions, documentation, and examples.');
      //   });
      //
      //   describe('clicking on the Start Kite button', () => {
      //     it('triggers a start', () => {
      //       spyOn(app, 'start').andReturn(Promise.resolve());
      //       const button = queryNotificationSelector(notificationElement, 'a.btn');
      //       click(button);
      //
      //       expect(app.start).toHaveBeenCalled();
      //     });
      //
      //     describe('when the start fails', () => {
      //       beforeEach(() => {
      //         spyOn(app, 'start').andReturn(Promise.reject());
      //         const button = queryNotificationSelector(notificationElement, 'a.btn');
      //         click(button);
      //
      //         waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 2);
      //         runs(() => {
      //           notificationElement = getNotificationElement();
      //           notification = notificationElement.getModel();
      //         });
      //       });
      //
      //       it('notifies the user of the failure', () => {
      //         const options = notification.getOptions();
      //
      //         expect(notification.getType()).toEqual('error');
      //         expect(notification.getMessage())
      //         .toEqual('Unable to start Kite engine');
      //
      //         expect(options.buttons.length).toEqual(1);
      //         expect(options.buttons[0].text).toEqual('Retry');
      //         expect(options.dismissable).toBeTruthy();
      //       });
      //
      //       describe('clicking on the retry button', () => {
      //         beforeEach(() => {
      //           const button = queryNotificationSelector(notificationElement, 'a.btn');
      //           click(button);
      //         });
      //
      //         it('calls the start method again', () => {
      //           expect(app.start.callCount).toEqual(2);
      //         });
      //
      //         it('displays another notification when it fails', () => {
      //           waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 3);
      //         });
      //       });
      //     });
      //   });
      //
      //   describe('when the same state is found after a new check', () => {
      //     it('does not notify the user', () => {
      //       atom.notifications.getNotifications()[0].dismiss();
      //       waitsForPromise(() => app.connect().then(() => {
      //         expect(atom.notifications.getNotifications().length).toEqual(1);
      //       }));
      //     });
      //   });
      // });

      // withManyKiteNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise(() => app.connect());
      //     waitsFor(() => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user with no actions', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //     expect(options.description)
      //     .toEqual('You have multiple versions of Kite installed. Please launch your desired one.');
      //
      //     expect(options.buttons).toBeUndefined();
      //   });
      // });

      // withKiteEnterpriseNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise(() => app.connect());
      //     waitsFor(() => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //
      //     expect(options.buttons.length).toEqual(1);
      //     expect(options.buttons[0].text).toEqual('Start Kite Enterprise');
      //     expect(options.dismissable).toBeTruthy();
      //     expect(options.description)
      //     .toEqual('Start the Kite background service to get Python completions, documentation, and examples.');
      //   });
      //
      //   describe('clicking on the Start Kite button', () => {
      //     it('triggers a start', () => {
      //       spyOn(app, 'startEnterprise').andReturn(Promise.resolve());
      //       const button = queryNotificationSelector(notificationElement, 'a.btn');
      //       click(button);
      //
      //       expect(app.startEnterprise).toHaveBeenCalled();
      //     });
      //
      //     describe('when the start fails', () => {
      //       beforeEach(() => {
      //         spyOn(app, 'startEnterprise').andReturn(Promise.reject());
      //         const button = queryNotificationSelector(notificationElement, 'a.btn');
      //         click(button);
      //
      //         waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 2);
      //         runs(() => {
      //           notificationElement = getNotificationElement();
      //           notification = notificationElement.getModel();
      //         });
      //       });
      //
      //       it('notifies the user of the failure', () => {
      //         const options = notification.getOptions();
      //
      //         expect(notification.getType()).toEqual('error');
      //         expect(notification.getMessage())
      //         .toEqual('Unable to start Kite engine');
      //
      //         expect(options.buttons.length).toEqual(1);
      //         expect(options.buttons[0].text).toEqual('Retry');
      //         expect(options.dismissable).toBeTruthy();
      //       });
      //
      //       describe('clicking on the retry button', () => {
      //         beforeEach(() => {
      //           const button = queryNotificationSelector(notificationElement, 'a.btn');
      //           click(button);
      //         });
      //
      //         it('calls the start method again', () => {
      //           expect(app.startEnterprise.callCount).toEqual(2);
      //         });
      //
      //         it('displays another notification when it fails', () => {
      //           waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 3);
      //         });
      //       });
      //     });
      //   });
      //
      //   describe('when the same state is found after a new check', () => {
      //     it('does not notify the user', () => {
      //       atom.notifications.getNotifications()[0].dismiss();
      //       waitsForPromise(() => app.connect().then(() => {
      //         expect(atom.notifications.getNotifications().length).toEqual(1);
      //       }));
      //     });
      //   });
      // });
      //
      // withManyKiteEnterpriseNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise(() => app.connect());
      //     waitsFor(() => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user with no actions', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //     expect(options.description)
      //     .toEqual('You have multiple versions of Kite installed. Please launch your desired one.');
      //
      //     expect(options.buttons).toBeUndefined();
      //   });
      // });
      //
      // withBothKiteNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise('connection', () => app.connect());
      //     waitsFor('first notification', () => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //
      //     expect(options.buttons.length).toEqual(2);
      //     expect(options.buttons[0].text).toEqual('Start Kite');
      //     expect(options.buttons[1].text).toEqual('Start Kite Enterprise');
      //     expect(options.dismissable).toBeTruthy();
      //     expect(options.description)
      //     .toEqual('Start the Kite background service to get Python completions, documentation, and examples.');
      //   });
      //
      //   describe('clicking on the Start Kite button', () => {
      //     it('triggers a start', () => {
      //       spyOn(app, 'start').andReturn(Promise.resolve());
      //       const button = queryNotificationSelector(notificationElement, 'a.btn');
      //       click(button);
      //
      //       expect(app.start).toHaveBeenCalled();
      //     });
      //
      //     describe('when the start fails', () => {
      //       beforeEach(() => {
      //         spyOn(app, 'start').andReturn(Promise.reject());
      //         const button = queryNotificationSelector(notificationElement, 'a.btn');
      //         click(button);
      //
      //         waitsFor('second notification', () =>
      //           workspaceElement.querySelectorAll('atom-notification').length === 2);
      //         runs(() => {
      //           notificationElement = getNotificationElement();
      //           notification = notificationElement.getModel();
      //         });
      //       });
      //
      //       it('notifies the user of the failure', () => {
      //         const options = notification.getOptions();
      //
      //         expect(notification.getType()).toEqual('error');
      //         expect(notification.getMessage())
      //         .toEqual('Unable to start Kite engine');
      //
      //         expect(options.buttons.length).toEqual(1);
      //         expect(options.buttons[0].text).toEqual('Retry');
      //         expect(options.dismissable).toBeTruthy();
      //       });
      //
      //       describe('clicking on the retry button', () => {
      //         beforeEach(() => {
      //           const button = queryNotificationSelector(notificationElement, 'a.btn');
      //           click(button);
      //         });
      //
      //         it('calls the start method again', () => {
      //           expect(app.start.callCount).toEqual(2);
      //         });
      //
      //         it('displays another notification when it fails', () => {
      //           waitsFor('third notification', () =>
      //             workspaceElement.querySelectorAll('atom-notification').length === 3);
      //         });
      //       });
      //     });
      //   });
      //
      //   describe('clicking on the Start Kite Enterprise button', () => {
      //     it('triggers a start', () => {
      //       spyOn(app, 'startEnterprise').andReturn(Promise.resolve());
      //       const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[1];
      //       click(button);
      //
      //       expect(app.startEnterprise).toHaveBeenCalled();
      //     });
      //
      //     describe('when the start fails', () => {
      //       beforeEach(() => {
      //         spyOn(app, 'startEnterprise').andReturn(Promise.reject());
      //         const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[1];
      //         click(button);
      //
      //         waitsFor('second notification', () =>
      //           workspaceElement.querySelectorAll('atom-notification').length === 2);
      //         runs(() => {
      //           notificationElement = getNotificationElement();
      //           notification = notificationElement.getModel();
      //         });
      //       });
      //
      //       it('notifies the user of the failure', () => {
      //         const options = notification.getOptions();
      //
      //         expect(notification.getType()).toEqual('error');
      //         expect(notification.getMessage())
      //         .toEqual('Unable to start Kite engine');
      //
      //         expect(options.buttons.length).toEqual(1);
      //         expect(options.buttons[0].text).toEqual('Retry');
      //         expect(options.dismissable).toBeTruthy();
      //       });
      //
      //       describe('clicking on the retry button', () => {
      //         beforeEach(() => {
      //           const button = queryNotificationSelector(notificationElement, 'a.btn');
      //           click(button);
      //           sleep(100);
      //           runs(() => advanceClock(100));
      //         });
      //
      //         it('calls the start method again', () => {
      //           expect(app.startEnterprise.callCount).toEqual(2);
      //         });
      //
      //         it('displays another notification when it fails', () => {
      //           waitsFor('third notification', () => atom.notifications.getNotifications().length === 3);
      //         });
      //       });
      //     });
      //   });
      //
      //   describe('when the same state is found after a new check', () => {
      //     it('does not notify the user', () => {
      //       atom.notifications.getNotifications()[0].dismiss();
      //       waitsForPromise(() => app.connect().then(() => {
      //         expect(atom.notifications.getNotifications().length).toEqual(1);
      //       }));
      //     });
      //   });
      // });
      //
      // withManyOfBothKiteNotRunning(() => {
      //   beforeEach(() => {
      //     waitsForPromise(() => app.connect());
      //     waitsFor(() => notificationElement = getNotificationElement());
      //     runs(() => notification = notificationElement.getModel());
      //   });
      //
      //   it('notifies the user with no actions', () => {
      //     const options = notification.getOptions();
      //
      //     expect(notificationElement).not.toBeNull();
      //
      //     expect(notification.getType()).toEqual('warning');
      //     expect(notification.getMessage())
      //     .toEqual('The Kite engine is not running');
      //     expect(options.description)
      //     .toEqual('You have multiple versions of Kite installed. Please launch your desired one.');
      //
      //     expect(options.buttons).toBeUndefined();
      //   });
      // });

      withKiteNotReachable(() => {
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

      withKiteNotAuthenticated(() => {
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
            .toEqual('Kite needs to be authenticated to access the index of your code stored on the cloud.');
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
      });

      describe('when an attempt to login end with unauthorized', () => {
        beforeEach(() => {
          app.emitter.emit('did-get-unauthorized', {message: 'Some error'});

          notificationElement = getNotificationElement();
          notification = notificationElement.getModel();
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

      withKiteWhitelistedPaths(() => {
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

            notificationElement = getNotificationElement();
            notification = notificationElement.getModel();
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

      withKiteWhitelistedPaths([__dirname], () => {
        beforeEach(() => {
          atom.project.setPaths([__dirname]);
          waitsForPromise(() => app.connect().then(() => {
            notificationElement = getNotificationElement();
          }));
        });

        it('does not notify the user', () => {
          expect(notificationElement).not.toExist();
        });

        // it('notifies the user', () => {
        //   const options = notification.getOptions();
        //
        //   expect(notificationElement).not.toBeNull();
        //
        //   expect(notification.getType()).toEqual('success');
        //   expect(notification.getMessage())
        //   .toEqual('The Kite engine is ready');
        //
        //   expect(options.buttons).toBeUndefined();
        //   expect(options.dismissable).toBeTruthy();
        //   expect(options.description)
        //   .toEqual('We checked that the autocomplete engine is installed, running, responsive, and authenticated.');
        // });
        //
        // describe('when the same state is found after a new check', () => {
        //   it('does not notify the user', () => {
        //     atom.notifications.getNotifications()[0].dismiss();
        //     waitsForPromise(() => app.connect().then(() => {
        //       expect(atom.notifications.getNotifications().length).toEqual(1);
        //     }));
        //   });
        // });
      });
    });
  });

  describe('when there is no python file open', () => {
    beforeEach(() => {
      waitsForPromise(() => atom.workspace.open('variable.json'));
    });

    describe('when kite is not installed', () => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    // withKiteNotRunning(() => {
    //   it('does not notify the user', () => {
    //     waitsForPromise(() => app.connect().then(() => {
    //       expect(workspaceElement.querySelector('atom-notification')).not.toExist();
    //     }));
    //   });
    // });

    withKiteNotReachable(() => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKiteNotAuthenticated(() => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKiteWhitelistedPaths(() => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    withKiteWhitelistedPaths([__dirname], () => {
      beforeEach(() => {
        atom.project.setPaths([__dirname]);
      });

      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

    // describe('when the notifications are forced', () => {
    //   beforeEach(() => {
    //     notifications.activateForcedNotifications();
    //   });
    //
    //   withKiteWhitelistedPaths(() => {
    //     it('notifies the user', () => {
    //       waitsForPromise(() => app.connect().then(() => {
    //         expect(workspaceElement.querySelector('atom-notification')).toExist();
    //       }));
    //     });
    //   });
    // });
    //
    // describe('opening a python file', () => {
    //   beforeEach(() => {
    //     waitsForPromise(() =>
    //       atom.packages.activatePackage('language-python'));
    //     waitsForPromise(() => atom.workspace.open('sample.py'));
    //   });
    //
    //   withKiteWhitelistedPaths(() => {
    //     it('starts notifying the user', () => {
    //       waitsForPromise(() => app.connect().then(() => {
    //         expect(workspaceElement.querySelector('atom-notification')).toExist();
    //       }));
    //     });
    //   });
    // });
  });
});

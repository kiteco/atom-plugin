'use strict';

const os = require('os');

// const {StateController} = require('kite-installer');
const NotificationsCenter = require('../lib/notifications-center');
const MetricsCenter = require('../lib/metrics-center');
const KiteApp = require('../lib/kite-app');
const {
  fakeKiteInstallPaths, withKiteNotReachable, withKiteNotRunning,
  withKiteNotAuthenticated, withKiteWhitelistedPaths,
} = require('./spec-helpers');
const {click} = require('./helpers/events');

describe('NotificationsCenter', () => {
  let app, notifications, notificationsPkg, workspaceElement, notificationElement, notification;

  fakeKiteInstallPaths();

  beforeEach(() => {
    app = new KiteApp();
    notifications = new NotificationsCenter(app);
    const metricsCenter = new MetricsCenter(app);
    metricsCenter.trackNotifications(notifications);

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
      waitsForPromise(() => atom.workspace.open('sample.py'));
    });

    describe('and no notifications have been displayed before', () => {
      describe('when kite is not supported', () => {
        beforeEach(() => {
          spyOn(os, 'platform').andReturn('wtfOS');

          waitsForPromise(() => app.connect());
        });
        it('notifies the user', () => {
          notificationElement = workspaceElement.querySelector('atom-notification');
          notification = notificationElement.getModel();
          const options = notification.getOptions();

          expect(notificationElement).toExist();

          expect(notification.getType()).toEqual('error');
          expect(notification.getMessage())
          .toEqual("Kite doesn't support your OS");

          expect(options.buttons).toBeUndefined();
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Sorry, the Kite autocomplete engine only supports macOS at the moment.');
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
              notificationElement = workspaceElement.querySelector('atom-notification');
              notification = notificationElement.getModel();
            }));
          });

          it('notifies the user', () => {
            const options = notification.getOptions();

            expect(notificationElement).toExist();

            expect(notification.getType()).toEqual('warning');
            expect(notification.getMessage())
            .toEqual('The Kite autocomplete engine is not installed');

            expect(options.buttons.length).toEqual(1);
            expect(options.buttons[0].text).toEqual('Install Kite');
            expect(options.dismissable).toBeTruthy();
            expect(options.description)
            .toEqual('Install Kite to get Python completions, documentation, and examples.');
          });

          describe('clicking on the Install Kite button', () => {
            beforeEach(() => {
              spyOn(app, 'install').andReturn(Promise.resolve());
            });

            it('triggers an install', () => {
              const button = notificationElement.querySelector('a.btn');
              click(button);

              expect(app.install).toHaveBeenCalled();
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

      withKiteNotRunning(() => {
        beforeEach(() => {
          waitsForPromise(() => app.connect().then(() => {
            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();
          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

          expect(notification.getType()).toEqual('warning');
          expect(notification.getMessage())
          .toEqual('The Kite autocomplete engine is not running');

          expect(options.buttons.length).toEqual(1);
          expect(options.buttons[0].text).toEqual('Start Kite');
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Start the Kite background service to get Python completions, documentation, and examples.');
        });

        describe('clicking on the Start Kite button', () => {
          it('triggers a start', () => {
            spyOn(app, 'start').andReturn(Promise.resolve());
            const button = notificationElement.querySelector('a.btn');
            click(button);

            expect(app.start).toHaveBeenCalled();
          });

          describe('when the start fails', () => {
            beforeEach(() => {
              spyOn(app, 'start').andReturn(Promise.reject());
              const button = notificationElement.querySelector('a.btn');
              click(button);

              waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 2);
              runs(() => {
                notificationElement = workspaceElement.querySelectorAll('atom-notification')[1];
                notification = notificationElement.getModel();
              });
            });

            it('notifies the user of the failure', () => {
              const options = notification.getOptions();

              expect(notification.getType()).toEqual('error');
              expect(notification.getMessage())
              .toEqual('Unable to start Kite autocomplete engine');

              expect(options.buttons.length).toEqual(1);
              expect(options.buttons[0].text).toEqual('Retry');
              expect(options.dismissable).toBeTruthy();
            });

            describe('clicking on the retry button', () => {
              beforeEach(() => {
                const button = notificationElement.querySelector('a.btn');
                click(button);
              });

              it('calls the start method again', () => {
                expect(app.start.callCount).toEqual(2);
              });

              it('displays another notification when it fails', () => {
                waitsFor(() => workspaceElement.querySelectorAll('atom-notification').length === 3);
              });
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

      withKiteNotReachable(() => {
        beforeEach(() => {
          waitsForPromise(() => app.connect().then(() => {
            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();

          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

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
        beforeEach(() => {
          waitsForPromise(() => app.connect().then(() => {
            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();
          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

          expect(notification.getType()).toEqual('warning');
          expect(notification.getMessage())
          .toEqual('You need to login to the Kite autocomplete engine');

          expect(options.buttons.length).toEqual(1);
          expect(options.buttons[0].text).toEqual('Login');
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Kite needs to be authenticated, so that it can access the index of your code stored on the cloud.');
        });

        describe('clicking on the Login button', () => {
          it('triggers a login', () => {
            spyOn(app, 'login').andReturn(Promise.resolve());
            const button = notificationElement.querySelector('a.btn');
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

          notificationElement = workspaceElement.querySelector('atom-notification');
          notification = notificationElement.getModel();
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

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
            const button = notificationElement.querySelector('a.btn');
            click(button);

            expect(app.login).toHaveBeenCalled();
          });
        });
      });

      withKiteWhitelistedPaths(() => {
        beforeEach(() => {
          waitsForPromise(() => app.connect().then(() => {
            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();

          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

          expect(notification.getType()).toEqual('warning');
          expect(notification.getMessage())
          .toEqual(`The Kite autocomplete engine is disabled for ${atom.project.getPaths()}`);

          expect(options.buttons.length).toEqual(2);
          expect(options.buttons[0].text).toEqual(os.homedir());
          expect(options.buttons[1].text).toEqual('Browse…');
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('Would you like to enable Kite for Python files in:');
        });

        describe('clicking on the homedir button', () => {
          it('attempts to whitelist the homedir path', () => {
            spyOn(app, 'whitelist').andReturn(Promise.resolve());
            const button = notificationElement.querySelector('a.btn');
            click(button);

            expect(app.whitelist).toHaveBeenCalledWith(os.homedir());
          });
        });

        describe('clicking on the browse button', () => {
          describe('and picking a directory', () => {
            it('attempts to whitelist the homedir path', () => {
              spyOn(atom.applicationDelegate, 'pickFolder').andCallFake(cb => {
                cb(['/some/directory/path']);
              });
              spyOn(app, 'whitelist').andReturn(Promise.resolve());
              const button = notificationElement.querySelectorAll('a.btn')[1];
              click(button);

              expect(app.whitelist).toHaveBeenCalledWith('/some/directory/path');
            });
          });

          describe('and cancelling', () => {
            it('does not try to whitelist', () => {
              spyOn(atom.applicationDelegate, 'pickFolder').andCallFake(cb => { cb([]); });
              spyOn(app, 'whitelist').andReturn(Promise.resolve());
              const button = notificationElement.querySelectorAll('a.btn')[1];
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

            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();
          });

          it('notifies the user', () => {
            const options = notification.getOptions();

            expect(notificationElement).toExist();

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
              const button = notificationElement.querySelector('a.btn');
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
            notificationElement = workspaceElement.querySelector('atom-notification');
            notification = notificationElement.getModel();
          }));
        });

        it('notifies the user', () => {
          const options = notification.getOptions();

          expect(notificationElement).toExist();

          expect(notification.getType()).toEqual('success');
          expect(notification.getMessage())
          .toEqual('The Kite autocomplete engine is ready');

          expect(options.buttons).toBeUndefined();
          expect(options.dismissable).toBeTruthy();
          expect(options.description)
          .toEqual('We checked that the autocomplete engine is installed, running, responsive, and authenticated.');
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

    withKiteNotRunning(() => {
      it('does not notify the user', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(workspaceElement.querySelector('atom-notification')).not.toExist();
        }));
      });
    });

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

    describe('when the notifications are forced', () => {
      beforeEach(() => {
        notifications.activateForcedNotifications();
      });

      withKiteWhitelistedPaths(() => {
        it('notifies the user', () => {
          waitsForPromise(() => app.connect().then(() => {
            expect(workspaceElement.querySelector('atom-notification')).toExist();
          }));
        });
      });
    });

    describe('opening a python file', () => {
      beforeEach(() => {
        waitsForPromise(() =>
          atom.packages.activatePackage('language-python'));
        waitsForPromise(() => atom.workspace.open('sample.py'));
      });

      withKiteWhitelistedPaths(() => {
        it('starts notifying the user', () => {
          waitsForPromise(() => app.connect().then(() => {
            expect(workspaceElement.querySelector('atom-notification')).toExist();
          }));
        });
      });
    });
  });
});

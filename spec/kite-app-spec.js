'use strict';

const os = require('os');
const KiteAPI = require('kite-api');
const {withKite, withKiteAccountRoutes} = require('kite-api/test/helpers/kite');
const {fakeResponse} = require('kite-api/test/helpers/http');

const KiteApp = require('../lib/kite-app');
const {click} = require('./helpers/events');

describe('KiteApp', () => {
  let changeSpy, readySpy, app;

  beforeEach(() => {
    app = new KiteApp();
  });

  describe('.connect()', () => {
    beforeEach(() => {
      changeSpy = jasmine.createSpy();
      readySpy = jasmine.createSpy();

      app.onDidChangeState(changeSpy);
      app.onKiteReady(readySpy);
    });

    withKite({installed: false}, () => {
      it('returns a promise that is resolved with UNINSTALLED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(KiteAPI.STATES.UNINSTALLED);
          expect(changeSpy)
          .toHaveBeenCalledWith(KiteAPI.STATES.UNINSTALLED);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKite({running: false}, () => {
      it('returns a promise that is resolved with INSTALLED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(KiteAPI.STATES.INSTALLED);
          expect(changeSpy)
          .toHaveBeenCalledWith(KiteAPI.STATES.INSTALLED);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKite({reachable: false}, () => {
      it('returns a promise that is resolved with RUNNING state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(KiteAPI.STATES.RUNNING);
          expect(changeSpy)
          .toHaveBeenCalledWith(KiteAPI.STATES.RUNNING);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKite({logged: false}, () => {
      it('returns a promise that is resolved with REACHABLE state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(KiteAPI.STATES.REACHABLE);
          expect(changeSpy)
          .toHaveBeenCalledWith(KiteAPI.STATES.REACHABLE);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKite({logged: true}, () => {
      it('returns a promise that is resolved with AUTHENTICATED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(KiteAPI.STATES.AUTHENTICATED);
          expect(changeSpy)
          .toHaveBeenCalledWith(KiteAPI.STATES.AUTHENTICATED);

          expect(readySpy).toHaveBeenCalled();
        }));
      });

      it('nevers trigger the kite ready event twice', () => {
        waitsForPromise(() => app.connect());
        waitsForPromise(() => app.connect());
        waitsForPromise(() => app.connect());
        runs(() => {
          expect(readySpy.callCount).toEqual(1);
        });
      });
    });
  });

  describe('.install()', () => {
    beforeEach(() => {
      spyOn(KiteAPI, 'downloadKiteRelease').andCallFake(() => Promise.resolve());
    });

    it('calls the KiteAPI.downloadKiteRelease method', () => {
      app.install();

      expect(KiteAPI.downloadKiteRelease).toHaveBeenCalled();
    });
  });

  describe('.start()', () => {
    beforeEach(() => {
      spyOn(KiteAPI, 'runKiteAndWait').andCallFake(() => Promise.resolve());
    });

    it('calls the KiteAPI.runKiteAndWait method', () => {
      app.start();

      expect(KiteAPI.runKiteAndWait).toHaveBeenCalledWith(30, 2500);
    });
  });
  withKite({reachable: true}, () => {

    describe('.login()', () => {
      let workspaceElement, jasmineContent, loginForm, spy;

      beforeEach(() => {
        spy = jasmine.createSpy();
        workspaceElement = atom.views.getView(atom.workspace);
        jasmineContent = document.querySelector('#jasmine-content');

        jasmineContent.appendChild(workspaceElement);

        app.onDidShowLogin(spy);
        app.login();


        loginForm = workspaceElement.querySelector('kite-login');
      });

      it('opens a login modal', () => {
        expect(loginForm).toExist();
      });

      it('emits a did-show-login event', () => {
        expect(spy).toHaveBeenCalled();
      });

      describe('when submitted', () => {
        let spy;
        describe('with no data', () => {
          beforeEach(() => {
            spy = jasmine.createSpy();

            app.onDidShowLoginError(spy);

            click(loginForm.submitBtn);

            waitsFor(() => spy.callCount);
          });

          it('displays the corresponding error', () => {
            expect(loginForm.querySelector('.form-status').textContent)
          .toEqual('No email provided');
          });
        });

        describe('with just an email', () => {
          beforeEach(() => {
            spy = jasmine.createSpy();

            app.onDidShowLoginError(spy);

            loginForm.emailInput.value = 'foo@bar.com';
            click(loginForm.submitBtn);

            waitsFor(() => spy.callCount);
          });

          it('displays the corresponding error', () => {
            expect(loginForm.querySelector('.form-status').textContent)
          .toEqual('No password provided');
          });
        });

        describe('with all the data but an invalid email', () => {
          withKiteAccountRoutes([
            [
              o => /\/api\/account\/login/.test(o.path),
              o => fakeResponse(401, JSON.stringify({code: 6})),
            ],
          ], () => {
            beforeEach(() => {
              spy = jasmine.createSpy();

              app.onDidShowLoginError(spy);

              loginForm.emailInput.value = 'foo@bar.com';
              loginForm.passwordInput.value = 'password';
              click(loginForm.submitBtn);

              waitsFor(() => spy.callCount);
            });

            it('displays the corresponding error', () => {
              expect(loginForm.querySelector('.form-status').textContent)
            .toEqual('Invalid Password');
            });
          });
        });

        describe('for an unauthorized account', () => {
          withKiteAccountRoutes([
            [
              o => /\/api\/account\/login/.test(o.path),
              o => fakeResponse(401, JSON.stringify({code: 1})),
            ],
          ], () => {
            beforeEach(() => {
              spy = jasmine.createSpy();

              app.onDidShowLoginError(spy);

              loginForm.emailInput.value = 'foo@bar.com';
              loginForm.passwordInput.value = 'password';
              click(loginForm.submitBtn);

              waitsFor(() => spy.callCount);
            });

            it('displays the corresponding error', () => {
              expect(loginForm.querySelector('.form-status').textContent)
            .toEqual('Unauthorized');
            });
          });
        });

        describe('for a passwordless account', () => {
          withKiteAccountRoutes([
            [
              o => /\/api\/account\/login/.test(o.path),
              o => fakeResponse(401, JSON.stringify({code: 9})),
            ],
          ], () => {
            beforeEach(() => {
              spy = jasmine.createSpy();

              loginForm.onDidShowPasswordLessForm(spy);

              loginForm.emailInput.value = 'foo@bar.com';
              loginForm.passwordInput.value = 'password';
              click(loginForm.submitBtn);

              waitsFor(() => spy.callCount);
            });

            it('adds the password-less class to the form', () => {
              expect(loginForm.classList.contains('password-less')).toBeTruthy();
            });

            it('does not display and error', () => {
              expect(loginForm.querySelector('.form-status').textContent)
            .toEqual('');
            });
          });
        });

        describe('with valid data', () => {
          withKiteAccountRoutes([
            [
              o => /\/api\/account\/login/.test(o.path),
              o => fakeResponse(200),
            ],
          ], () => {
            beforeEach(() => {
              spy = jasmine.createSpy();

              app.onDidAuthenticate(spy);

              loginForm.emailInput.value = 'foo@bar.com';
              loginForm.passwordInput.value = 'password';
              click(loginForm.submitBtn);

              waitsFor(() => spy.callCount);
            });

            it('removes the modal', () => {
              expect(workspaceElement.querySelector('kite-login')).not.toExist();
            });
          });
        });
      });

      describe('when the password is reset', () => {
        beforeEach(() => {
          spyOn(os, 'platform').andReturn('darwin');
          spyOn(atom.applicationDelegate, 'openExternal');

          spy = jasmine.createSpy();
          app.onDidResetPassword(spy);


          click(loginForm.resetBtn);
        });

        it('emits a did-reset-password event', () => {
          expect(spy).toHaveBeenCalled();
        });

        it('opens the reset password link in a browser', () => {
          expect(atom.applicationDelegate.openExternal)
        .toHaveBeenCalledWith('https://kite.com/reset-password?email=');
        });

        it('removes the modal', () => {
          expect(workspaceElement.querySelector('kite-login')).not.toExist();
        });
      });

      describe('when cancelled', () => {
        it('removes the modal', () => {
          loginForm.cancel();

          expect(workspaceElement.querySelector('kite-login')).not.toExist();
        });
      });
    });

    describe('.authenticate()', () => {
      beforeEach(() => {
        spyOn(KiteAPI, 'login').andCallFake(() => Promise.resolve());
      });

      it('calls the KiteAPI.login method', () => {
        const data = {};

        app.authenticate(data);

        expect(KiteAPI.login).toHaveBeenCalledWith(data);
      });
    });

    describe('.whitelist()', () => {
      beforeEach(() => {
        spyOn(KiteAPI, 'whitelistPath').andCallFake(() => Promise.resolve());
      });

      it('calls the KiteAPI.whitelistPath method', () => {
        const path = '/path/to/other/dir/';

        app.whitelist(path);

        expect(KiteAPI.whitelistPath).toHaveBeenCalledWith(path);
      });
    });
  });
});

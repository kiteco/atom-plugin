'use strict';

const os = require('os');
const proc = require('child_process');
const {StateController, AccountManager} = require('kite-installer');
const KiteApp = require('../lib/kite-app');
const {fakeKiteInstallPaths, withKiteNotReachable, withKiteNotRunning, withKiteNotAuthenticated, withKiteWhitelistedPaths, fakeProcesses, withFakeServer, fakeResponse} = require('./spec-helpers');
const {click} = require('./helpers/events');

describe('KiteApp', () => {
  let changeSpy, readySpy, app;

  fakeKiteInstallPaths();
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

    describe('when kite is not installed', () => {
      it('returns a promise that is resolved with UNINSTALLED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.UNINSTALLED);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.UNINSTALLED);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKiteNotRunning(() => {
      it('returns a promise that is resolved with INSTALLED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.INSTALLED);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.INSTALLED);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKiteNotReachable(() => {
      it('returns a promise that is resolved with RUNNING state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.RUNNING);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.RUNNING);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKiteNotAuthenticated(() => {
      it('returns a promise that is resolved with REACHABLE state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.REACHABLE);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.REACHABLE);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKiteWhitelistedPaths(() => {
      it('returns a promise that is resolved with AUTHENTICATED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.AUTHENTICATED);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.AUTHENTICATED);

          expect(readySpy).not.toHaveBeenCalled();
        }));
      });
    });

    withKiteWhitelistedPaths([__dirname], () => {
      beforeEach(() => {
        atom.project.setPaths([__dirname]);
      });

      it('returns a promise that is resolved with WHITELISTED state', () => {
        waitsForPromise(() => app.connect().then(state => {
          expect(state).toEqual(StateController.STATES.WHITELISTED);
          expect(changeSpy)
          .toHaveBeenCalledWith(StateController.STATES.WHITELISTED);

          expect(readySpy).toHaveBeenCalled();
        }));
      });

      it('nevers trigger the kite ready event twice', () => {
        waitsForPromise(() => app.connect());
        waitsForPromise(() => app.checkPath('/path/to/dir'));
        waitsForPromise(() => app.checkPath(__dirname));
        runs(() => {
          expect(readySpy.callCount).toEqual(1);
        });
      });
    });
  });

  describe('.install()', () => {
    beforeEach(() => {
      spyOn(StateController, 'downloadKite').andCallFake(() => Promise.resolve());
    });

    it('calls the StateController.downloadKite method', () => {
      app.install();

      expect(StateController.downloadKite).toHaveBeenCalled();
    });
  });

  describe('.start()', () => {
    beforeEach(() => {
      spyOn(StateController, 'runKiteAndWait').andCallFake(() => Promise.resolve());
    });

    it('calls the StateController.runKiteAndWait method', () => {
      app.start();

      expect(StateController.runKiteAndWait).toHaveBeenCalledWith(30, 2500);
    });
  });

  describe('.login()', () => {
    let workspaceElement, jasmineContent, loginForm, spy;

    beforeEach(() => {
      spy = jasmine.createSpy();
      workspaceElement = atom.views.getView(atom.workspace);
      jasmineContent = document.querySelector('#jasmine-content');
      AccountManager.initClient('localhost', 46654);

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
        withFakeServer([
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
        withFakeServer([
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
        withFakeServer([
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
        withFakeServer([
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

        spy = jasmine.createSpy();
        app.onDidResetPassword(spy);
        fakeProcesses({open : () => 0});

        click(loginForm.resetBtn);
      });

      it('emits a did-reset-password event', () => {
        expect(spy).toHaveBeenCalled();
      });

      it('opens the reset password link in a browser', () => {
        expect(proc.spawn).toHaveBeenCalledWith('open', [
          '-W', 'https://alpha.kite.com/account/resetPassword/request?email=',
        ], {});
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
      spyOn(AccountManager, 'login').andCallFake(() => Promise.resolve());
    });

    it('calls the AccountManager.login method', () => {
      const data = {};

      app.authenticate(data);

      expect(AccountManager.login).toHaveBeenCalledWith(data);
    });
  });

  describe('.whitelist()', () => {
    beforeEach(() => {
      spyOn(StateController, 'whitelistPath').andCallFake(() => Promise.resolve());
    });

    it('calls the StateController.whitelistPath method', () => {
      const path = '/path/to/other/dir/';

      app.whitelist(path);

      expect(StateController.whitelistPath).toHaveBeenCalledWith(path);
    });
  });
});

'use strict';

const KiteLogin = require('../../lib/elements/kite-login');
const {click} = require('../helpers/events');

describe('KiteLogin', () => {
  let jasmineContent, loginForm;

  beforeEach(() => {
    loginForm = new KiteLogin();
    jasmineContent = document.querySelector('#jasmine-content');

    jasmineContent.appendChild(loginForm);
  });

  describe('when attached to the DOM', () => {

    it('gives the focus to the email field', () => {
      const emailField = loginForm.querySelector('[name="email"]');
      expect(document.activeElement).toEqual(emailField);
    });

    describe('clicking on the submit button', () => {
      let spy;

      beforeEach(() => {
        spy = jasmine.createSpy();

        loginForm.onDidSubmit(spy);
        loginForm.emailInput.value = 'foo@bar.com';
        loginForm.passwordInput.value = 'password';

        click(loginForm.submitBtn);
      });

      it('emits a did-submit event with the forma data', () => {
        expect(spy).toHaveBeenCalledWith({
          email: 'foo@bar.com',
          password: 'password',
        });
      });
    });

    describe('clicking on the cancel button', () => {
      it('emits a did-cancel event', () => {
        const spy = jasmine.createSpy();

        loginForm.onDidCancel(spy);
        click(loginForm.cancelBtn);

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('.cancel()', () => {
      it('emits a did-cancel event', () => {
        const spy = jasmine.createSpy();

        loginForm.onDidCancel(spy);
        loginForm.cancel();

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('clicking on the reset password button', () => {
      it('emits a did-reset-password event', () => {
        const spy = jasmine.createSpy();

        loginForm.onDidResetPassword(spy);

        click(loginForm.resetBtn);

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('clicking on the send password link', () => {
      it('emits a did-reset-password event', () => {
        const spy = jasmine.createSpy();

        loginForm.onDidResetPassword(spy);

        click(loginForm.sendLinkBtn);

        expect(spy).toHaveBeenCalled();
      });
    });
  });
});

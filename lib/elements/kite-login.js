'use strict';

const fs = require('fs');
const path = require('path');
const {Emitter, CompositeDisposable} = require('atom');
const {DisposableEvent} = require('../utils');

const logoSvg = String(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'logo.svg')));

class KiteLogin extends HTMLElement {
  static initClass() {
    atom.commands.add('kite-login', {
      'core:cancel'() { this.cancel(); },
    });

    return document.registerElement('kite-login', {
      prototype: KiteLogin.prototype,
    });
  }

  createdCallback() {
    this.classList.add('native-key-bindings');
    this.setAttribute('tabindex', '-1');

    this.innerHTML = `
      <form>
        ${logoSvg}
        <div class="block has-password">Sign into Kite:</div>
        <div class="block text-warning no-password">It looks like you didn't set a password for your account yet.</div>

        <div class="block has-password">
          <input class="input-text" name="email" type="text" placeholder="Email" tabindex="1">
        </div>

        <div class="block has-password">
          <input class="input-text" name="password" type="password" placeholder="Password" tabindex="2">
        </div>

        <div>
          <a class="reset-password pull-right has-password text-info">Reset Password</a>
          <button type="submit" class="submit btn btn-primary inline-block  has-password">Sign into Kite</button>
          <button type="button" class="cancel btn inline-block">Cancel</button>
          <button type="button" class="send-link no-password btn btn-primary inline-block">
            Resend password setup email
          </button>
        </div>
        <div class="form-status"></div>
      </form>
    `;

    this.emailInput = this.querySelector('[name="email"]');
    this.passwordInput = this.querySelector('[name="password"]');
    this.submitBtn = this.querySelector('button.submit');
    this.resetBtn = this.querySelector('a.reset-password');
    this.cancelBtn = this.querySelector('button.cancel');
    this.sendLinkBtn = this.querySelector('button.send-link');
    this.form = this.querySelector('form');
    this.status = this.querySelector('.form-status');
  }

  attachedCallback() {
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(new DisposableEvent(this.form, 'submit', (e) => {
      e.preventDefault();
      this.emitter.emit('did-submit', this.getFormData());
    }));

    this.subscriptions.add(new DisposableEvent(this.cancelBtn, 'click', (e) => {
      this.emitter.emit('did-cancel');
    }));

    this.subscriptions.add(new DisposableEvent(this.resetBtn, 'click', (e) => {
      this.emitter.emit('did-reset-password');
    }));

    this.subscriptions.add(new DisposableEvent(this.sendLinkBtn, 'click', (e) => {
      this.emitter.emit('did-reset-password');
    }));

    this.emailInput.focus();
  }

  detachedCallback() {
    this.emitter.dispose();
    this.subscriptions.dispose();
  }

  onDidSubmit(listener) {
    return this.emitter.on('did-submit', listener);
  }

  onDidCancel(listener) {
    return this.emitter.on('did-cancel', listener);
  }

  onDidResetPassword(listener) {
    return this.emitter.on('did-reset-password', listener);
  }

  onDidShowPasswordLessForm(listener) {
    return this.emitter.on('did-show-passwordless-form', listener);
  }

  cancel() {
    this.emitter.emit('did-cancel');
  }

  destroy() {
    this.remove();
  }

  hide() {
    this.hideStatus();
    this.classList.add('hidden');
  }

  show() {
    this.classList.remove('hidden');
    this.emailInput.focus();
    this.emailInput.setSelectionRange(0, this.emailInput.value.length);
  }

  setEmail(email) {
    this.emailInput.value = email;
  }

  showStatus(text) {
    this.status.textContent = text;
    this.status.classList.remove('text-danger');
    this.status.classList.remove('hidden');
  }

  hideStatus() {
    this.status.textContent = '';
    this.status.classList.remove('text-danger');
    this.status.classList.add('hidden');
  }

  showError(text) {
    this.status.textContent = text;
    this.status.classList.add('text-danger');
    this.status.classList.remove('hidden');
  }

  passwordLessForm() {
    this.classList.add('password-less');
    this.emitter.emit('did-show-passwordless-form');
  }

  hideError() {
    this.hideStatus();
  }

  getFormData() {
    return {
      email: this.email,
      password: this.password,
    };
  }

  get email() {
    return this.emailInput.value;
  }

  get password() {
    return this.passwordInput.value;
  }
}

module.exports = KiteLogin.initClass();

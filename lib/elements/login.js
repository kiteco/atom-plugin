'use strict';

const fs = require('fs');
const path = require('path');
const logoSvg = String(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'logo.svg')));

var LoginStep = class {
  constructor(classes) {
    classes = classes || [];
    this.element = document.createElement('div');
    this.element.classList.add('kite-login-panel');
    this.element.classList.add('native-key-bindings');
    this.element.setAttribute('tabindex', '-1');
    classes.forEach((c) => this.element.classList.add(c));

    this.element.innerHTML = `
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

    this.emailInput = this.element.querySelector('[name="email"]');
    this.passwordInput = this.element.querySelector('[name="password"]');
    this.submitBtn = this.element.querySelector('button.submit');
    this.resetBtn = this.element.querySelector('a.reset-password');
    this.cancelBtn = this.element.querySelector('button.cancel');
    this.sendLinkBtn = this.element.querySelector('button.send-link');
    this.form = this.element.querySelector('form');
    this.status = this.element.querySelector('.form-status');

    this.element.cancel = () => {
      this.cancelBtn.onclick && this.cancelBtn.onclick();
    };
  }

  destroy() {
    this.element.remove();
  }

  hide() {
    this.hideStatus();
    this.element.classList.add('hidden');
  }

  show() {
    this.element.classList.remove('hidden');
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
    this.element.classList.add('password-less');
  }

  hideError() {
    this.hideStatus();
  }

  onSubmit(func) {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      func();
    });
  }

  onCancel(func) {
    this.cancelBtn.onclick = func;
  }

  onResetPassword(func) {
    this.resetBtn.onclick = func;
    this.sendLinkBtn.onclick = func;
  }

  get email() {
    return this.emailInput.value;
  }

  get password() {
    return this.passwordInput.value;
  }
};

module.exports = LoginStep;

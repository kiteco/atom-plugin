var LoginStep = class {
  constructor(classes=[]) {
    this.element = document.createElement('div');
    this.element.classList.add('kite-login-panel');
    this.element.classList.add('block');
    this.element.classList.add('native-key-bindings');
    classes.forEach((c) => this.element.classList.add(c));

    let copy = document.createElement('div');
    copy.classList.add('inline-block');
    copy.textContent = 'Sign in to Kite:';
    this.element.appendChild(copy);

    this.emailInput = document.createElement('input');
    this.emailInput.classList.add('input-text');
    this.emailInput.classList.add('inline-block');
    this.emailInput.type = 'text';
    this.emailInput.name = 'email';
    this.emailInput.placeholder = 'Email';
    this.emailInput.tabIndex = 1;
    this.element.appendChild(this.emailInput);

    this.passwordInput = document.createElement('input');
    this.passwordInput.classList.add('input-text');
    this.passwordInput.classList.add('inline-block');
    this.passwordInput.type = 'password';
    this.passwordInput.name = 'password';
    this.passwordInput.placeholder = 'Password';
    this.passwordInput.tabIndex = 2;
    this.element.appendChild(this.passwordInput);

    this.submitBtn = document.createElement('button');
    this.submitBtn.classList.add('btn');
    this.submitBtn.classList.add('btn-large');
    this.submitBtn.classList.add('inline-block');
    this.submitBtn.textContent = "Sign in to Kite";
    this.element.appendChild(this.submitBtn);

    this.resetBtn = document.createElement('button');
    this.resetBtn.classList.add('btn');
    this.resetBtn.classList.add('btn-large');
    this.resetBtn.classList.add('inline-block');
    this.resetBtn.textContent = "Reset Password";
    this.element.appendChild(this.resetBtn);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.classList.add('btn');
    this.cancelBtn.classList.add('btn-large');
    this.cancelBtn.classList.add('inline-block');
    this.cancelBtn.textContent = "Cancel";
    this.element.appendChild(this.cancelBtn);
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
    this.status.classList.remove('error');
    this.status.classList.remove('hidden');
  }

  hideStatus() {
    this.status.textContent = "";
    this.status.classList.remove('error');
    this.status.classList.add('hidden');
  }

  showError(text) {
    this.status.textContent = text;
    this.status.classList.add('error');
    this.status.classList.remove('hidden');
  }

  hideError() {
    this.hideStatus();
  }

  onSubmit(func) {
    this.submitBtn.onclick = func;
  }

  onCancel(func) {
    this.cancelBtn.onclick = func;
  }

  onResetPassword(func) {
    this.resetBtn.onclick = func;
  }

  get email() {
    return this.emailInput.value;
  }

  get password() {
    return this.passwordInput.value;
  }
};

module.exports = LoginStep;

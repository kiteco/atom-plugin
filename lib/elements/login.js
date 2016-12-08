var LoginStep = class {
  constructor(classes=[]) {
    this.element = document.createElement('div');
    this.element.classList.add('kite-login-panel');
    this.element.classList.add('block');
    this.element.classList.add('native-key-bindings');
    classes.forEach((c) => this.element.classList.add(c));

    this.element.innerHTML = `
      <form>
        <div class="block">Sign in to Kite:</div>
        <input class="input-text inline-block" name="email" type="text" placeholder="Email" tabindex="1">
        <input class="input-text inline-block" name="password" type="password" placeholder="Password" tabindex="2">
        <button type="submit" class="submit btn btn-large inline-block">Sign in to Kite</button>
        <button type="button" class="reset-password btn btn-large inline-block">Reset Password</button>
        <button type="button" class="cancel btn btn-large inline-block">Cancel</button>
      </form>
    `

    this.emailInput = this.element.querySelector('[name="email"]')
    this.passwordInput = this.element.querySelector('[name="password"]')
    this.submitBtn = this.element.querySelector('button.submit')
    this.resetBtn = this.element.querySelector('button.reset-password')
    this.cancelBtn = this.element.querySelector('button.cancel')
    this.form = this.element.querySelector('form')
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
    this.form.addEventListener('submit', (e) => {
      e.preventDefault()
      func()
    });
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

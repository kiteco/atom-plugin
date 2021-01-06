'use strict';

const fs = require('fs');
const path = require('path');
const ASSETS_PATH = process.env.PRODUCTION
  ? path.resolve(__dirname, '..', 'assets')
  : path.resolve(__dirname, '..', '..', 'assets');
const syncLogoSvg = String(fs.readFileSync(path.join(ASSETS_PATH, 'kitesync.svg')));
const logoSvg = String(fs.readFileSync(path.join(ASSETS_PATH, 'logo-no-text.svg')));
const logoSmallSvg = String(fs.readFileSync(path.join(ASSETS_PATH, 'logo-small.svg')));

class KiteLogo extends HTMLElement {
  static initClass() {
    customElements.define('kite-logo', this);
    return this;
  }

  connectedCallback() {
    if (this.hasAttribute('sync')) {
      this.innerHTML = syncLogoSvg;
    } else if (this.hasAttribute('small')) {
      this.innerHTML = logoSmallSvg;
    } else {
      this.innerHTML = logoSvg;
    }
  }
}

module.exports = KiteLogo.initClass();

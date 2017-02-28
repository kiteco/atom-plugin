'use strict';

const {DisposableEvent} = require('../utils');
const {symbolLabel, symbolType} = require('../kite-data-utils');
let Kite;

class KiteHover extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-hover', {prototype: this.prototype});
  }

  detachedCallback() {
    this.subscription && this.subscription.dispose();
  }

  setData(data, editor, range) {
    if (data && data.symbol && data.symbol.length) {
      const [symbol] = data.symbol;
      this.innerHTML = `
        <span class="name">${symbolLabel(symbol)}</span>
        <span class="type">${symbolType(symbol)}</span>
      `;

      const button = document.createElement('button');

      button.classList.add('btn');
      button.textContent = 'Expand view';

      this.subscription = new DisposableEvent(button, 'click', (e) => {
        if (!Kite) { Kite = require('../kite'); }
        const kiteEditor = Kite.kiteEditorForEditor(editor);

        kiteEditor.expandRange(range);
      });

      this.appendChild(button);
    } else {
      this.innerHTML = '';
    }
  }
}

module.exports = KiteHover.initClass();

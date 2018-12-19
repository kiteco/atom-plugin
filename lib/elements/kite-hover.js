'use strict';

require('./kite-links');
const {Point, CompositeDisposable} = require('atom');
const {symbolName, symbolKind} = require('../kite-data-utils');
const {internalGotoURL, internalExpandURL} = require('../urls');
const {debugData, wrapAfterParenthesisAndDots} = require('./html-utils');
const {DisposableEvent} = require('../utils');

let OverlayManager;

class KiteHover extends HTMLElement {
  static initClass() {
    customElements.define('kite-hover', this);
    return this;
  }

  disconnectedCallback() {
    this.subscriptions && this.subscriptions.dispose();
  }

  connectedCallback() {
    this.classList.add('native-key-bindings');
    this.setAttribute('tabindex', '-1');
    this.parentNode.style.zIndex = 15;
  }

  setData(data, editor, position) {
    position = Point.fromObject(position);

    if (data && data.symbol && data.symbol.length) {
      const [symbol] = data.symbol;
    // const type = symbolType(symbol);
      const actions = [
        `<a href="${internalExpandURL(symbol.id)}">Docs</a>`,
      ];

      if (data.report.definition &&
        data.report.definition.filename &&
        data.report.definition.filename.trim() !== '') {
        actions.push(`<a
        href="${internalGotoURL(data.report.definition)}">Def</a>`);
      }

      this.innerHTML = `
    <div class="definition">
      <span class="name"><code>${wrapAfterParenthesisAndDots(symbolName(symbol))}</code></span>
      <span class="type">${symbolKind(symbol)}</span>
    </div>
    <kite-links class="one-line" metric="Hover">
      ${actions.join(' ')}
      <div class="flex-separator"></div>
      <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
    </kite-links>
    ${debugData(data)}`;

      this.subscriptions = new CompositeDisposable();
      const links = this.querySelector('kite-links');
      const debug = this.querySelector('.debug');

      if (debug) {
        this.subscriptions.add(new DisposableEvent(debug, 'mousewheel', (e) => {
          e.stopPropagation();
        }));
      }

      if (links) {
        this.subscriptions.add(links.onDidClickMoreLink(() => {
          if (!OverlayManager) {
            OverlayManager = require('../overlay-manager');
          }
          OverlayManager.dismiss();
        }));
      }

    } else {
      this.innerHTML = '';
    }
  }
}

module.exports = KiteHover.initClass();

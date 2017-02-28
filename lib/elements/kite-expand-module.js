'use strict';

const {openDocumentationInWebURL} = require('../urls');
const {renderValueHeader, renderExtend, renderExamples, renderUsages, renderDefinition, renderMembers, valueDescription} = require('./html-utils');

class KiteExpandModule extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-expand-module', {prototype: this.prototype});
  }

  setData(data) {
    const {value} = data;

    this.innerHTML = `
    ${renderValueHeader(value)}
    ${renderExtend(value)}

    <div class="sections-wrapper">
      <section class="summary">
        <div class="description">${valueDescription(data)}</div>
      </section>

      ${renderMembers(value)}
      ${renderDefinition(data)}
      ${renderExamples(value)}
      ${renderUsages(data)}
    </div>

    <footer>
      <div></div>
      <kite-open-link data-url="${openDocumentationInWebURL(value.id)}"></kite-open-link>
    </footer>
    `;
  }
}

module.exports = KiteExpandModule.initClass();

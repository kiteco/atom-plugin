'use strict';

const {CompositeDisposable} = require('atom');
const {head, DisposableEvent, detailLang, detailGet, getFunctionDetails} = require('../utils');
const {internalExpandURL} = require('../urls');
const {valueLabel, valueName, callSignature} = require('../kite-data-utils');
const {highlightCode, wrapAfterParenthesis, debugData, proFeatures, pluralize, renderParameter} = require('./html-utils');
const Plan = require('../plan');

class KiteSignature extends HTMLElement {
  static initClass() {
    return document.registerElement('kite-signature', {
      prototype: this.prototype,
    });
  }

  setListElement(listElement) {
    this.listElement = listElement;
  }

  detachedCallback() {

  }

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    if (this.parentNode) {
      this.listElement.maxVisibleSuggestions = atom.config.get('autocomplete-plus.maxVisibleSuggestions');
      this.parentNode.removeChild(this);
    }
  }

  attachedCallback() {
    this.listElement.maxVisibleSuggestions = this.compact
      ? atom.config.get('autocomplete-plus.maxVisibleSuggestions')
      : atom.config.get('kite.maxVisibleSuggestionsAlongSignature');

    requestAnimationFrame(() => this.checkWidth());
  }

  openInWeb() {
    const link = this.querySelector('kite-open-link');
    link && link.open();
  }

  updateIndent() {
    if (this.indentUpdateRequested) { return; }

    this.indentUpdateRequested = true;
    requestAnimationFrame(() => {
      const item = this.listElement.element.querySelector('.left-label');
      const indent = item ? item.offsetLeft : 10;

      this.style.paddingLeft = `${indent}px`;
      this.indentUpdateRequested = false;
    });
  }

  setData(data, compact = false) {
    const call = head(data.calls);
    const name = call.func_name || valueName(call.callee);
    const detail = getFunctionDetails(call.callee);
    let extendedContent = '';

    compact = false;

    compact
      ? this.setAttribute('compact', '')
      : this.removeAttribute('compact');

    let kwargs = '';
    const lang = detailLang(detail);

    if (lang === 'python' && detailGet(detail, 'kwarg_parameters')) {
      kwargs = `<section class="kwargs ${detailGet(call, 'in_kwargs') ? 'visible' : ''}">
      <h4>**${detailGet(detail, 'kwarg').name}</h4>
      <kite-links metric="Signature">
      <dl>
      ${
        detailGet(detail, 'kwarg_parameters')
        .map((p, i) => renderParameter(p, '', detailGet(call, 'in_kwargs') && call.arg_index === i))
        .join('')
      }
      </dl></kite-links>
      </section>`;
    }

    if (!compact) {
      let patterns = '';
      if (call.signatures && call.signatures.length) {
        patterns = Plan.can('common_invocations_editor')
          ? `
            <section class="patterns">
            <h4>How others used this</h4>
            ${highlightCode(wrapAfterParenthesis(
              call.signatures
              .map(s => callSignature(s))
              .map(s => `${name}(${s})`)
              .join('\n')))}
            </section>`
          : `<section class="patterns">
              <h4>How others used this</h4>
              ${proFeatures(
                `To see ${call.signatures.length} ${pluralize(call.signatures.length, 'pattern', 'patterns')}`
              )}
            </section>`;
      }

      const actions = [
        `<a href="${internalExpandURL(call.callee.id)}">Docs</a>`,
      ];

      extendedContent = `
      ${kwargs}
      ${patterns}
      <kite-links class="one-line" metric="Signature">
        ${actions.join(' ')}
        <div class="flex-separator"></div>
        <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
      </kite-links>
      `;
    } else {
      extendedContent = kwargs;
    }

    this.innerHTML = `
    <div class="kite-signature-wrapper">
      <div class="name"><pre>${
        valueLabel(call.callee, detailGet(call, 'in_kwargs') ? -1 : call.arg_index)
      }</pre></div>
      ${extendedContent}
    </div>
    ${debugData(data)}
    `;

    this.updateIndent();

    if (this.subscriptions) {
      this.subscriptions.dispose();
    }

    this.compact = true; //compact;
    this.currentIndex = call.arg_index;
    this.subscriptions = new CompositeDisposable();

    const links = this.querySelector('kite-links');
    const kwargLink = this.querySelector('a.kwargs');
    const kwargSection = this.querySelector('section.kwargs');
    const editor = atom.workspace.getActiveTextEditor();
    const editorElement = atom.views.getView(editor);

    this.subscriptions.add(new DisposableEvent(this, 'click', (e) => {
      editorElement && editorElement.focus();
    }));

    if (kwargLink && kwargSection) {
      this.subscriptions.add(new DisposableEvent(kwargLink, 'click', (e) => {
        kwargSection.classList.toggle('visible');
      }));

      if (detailGet(call, 'in_kwargs')) {
        setTimeout(() => {
          const dl = kwargSection.querySelector('dl');
          const dt = kwargSection.querySelector('dt.highlight');
          if (dt) {
            dl.scrollTop = dt.offsetTop - dt.offsetHeight;
          }
        }, 100);
      }
    }

    if (links) {
      this.subscriptions.add(links.onDidClickMoreLink(() => {
        this.listElement.model.hide();
      }));
    }

    // if (this.parentNode) {
    //   this.checkWidth();
    // }
  }

  checkWidth() {
    const name = this.querySelector('.name');
    if (name && name.scrollWidth > name.offsetWidth) {
      const missingWidth = name.scrollWidth - name.offsetWidth;
      const signature = name.querySelector('.signature');
      const parameters = [].slice.call(name.querySelectorAll('.parameter'));
      const half = name.scrollWidth;
      const parameter = parameters[this.currentIndex];
      const middle = parameter ?
        parameter.offsetLeft - parameter.offsetWidth / 2
        : half + 1;
      const removed = [];
      let gainedWidth = 0;
      const currentIndex = this.currentIndex;

      if (!signature) { return; }

      if (middle > half) {
        truncateLeft();

        if (gainedWidth < missingWidth) { truncateRight(); }
      } else {
        truncateRight();
        if (gainedWidth < missingWidth) { truncateLeft(); }
      }

      function truncateLeft() {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'parameter ellipsis';
        ellipsis.textContent = '…0 more, ';
        signature.insertBefore(ellipsis, signature.firstElementChild);

        for (let i = 0; i < currentIndex; i++) {
          const parameter = parameters[i];
          removed.push(parameter);
          gainedWidth += parameter.offsetWidth;

          if (gainedWidth - ellipsis.offsetWidth >= missingWidth) {
            gainedWidth -= ellipsis.offsetWidth;
            removed.forEach(el => el.remove());
            ellipsis.textContent = `…${removed.length} more, `;
            removed.length = 0;
            return;
          }
        }

        if (removed.length) {
          gainedWidth -= ellipsis.offsetWidth;
          removed.forEach(el => el.remove());
          ellipsis.textContent = `…${removed.length} more, `;
          removed.length = 0;
        } else {
          ellipsis.remove();
        }
      }

      function truncateRight() {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'parameter ellipsis';
        ellipsis.textContent = '0 more…';
        signature.appendChild(ellipsis);

        for (let i = parameters.length - 1; i > currentIndex; i--) {
          const parameter = parameters[i];
          removed.push(parameter);
          gainedWidth += parameter.offsetWidth;

          if (gainedWidth - ellipsis.offsetWidth >= missingWidth) {
            gainedWidth -= ellipsis.offsetWidth;
            removed.forEach(el => el.remove());
            ellipsis.textContent = `${removed.length} more…`;
            removed.length = 0;
            return;
          }
        }

        if (removed.length) {
          gainedWidth -= ellipsis.offsetWidth;
          removed.forEach(el => el.remove());
          ellipsis.textContent = `${removed.length} more…`;
          removed.length = 0;
        } else {
          ellipsis.remove();
        }
      }
    }
  }
}

module.exports = KiteSignature.initClass();

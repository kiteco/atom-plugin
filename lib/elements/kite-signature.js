'use strict';

const {CompositeDisposable} = require('atom');
const {head, DisposableEvent, detailLang, detailGet, getFunctionDetails, idToDottedPath} = require('../utils');
const {valueLabel, valueName, callSignature, returnTypes} = require('../kite-data-utils');
const {highlightCode, wrapAfterParenthesis, debugData, renderParameter} = require('./html-utils');

class KiteSignature extends HTMLElement {
  static initClass() {
    customElements.define('kite-signature', this);
    return this;
  }

  setListElement(listElement) {
    this.listElement = listElement;
  }

  disconnectedCallback() {
    this.subscriptions && this.subscriptions.dispose();
    this.listElement.maxVisibleSuggestions = atom.config.get('autocomplete-plus.maxVisibleSuggestions');
    this.resizeObserver.disconnect();
    this.style.maxWidth = '';
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  connectedCallback() {
    this.listElement.maxVisibleSuggestions = this.compact
      ? atom.config.get('autocomplete-plus.maxVisibleSuggestions')
      : atom.config.get('kite.maxVisibleSuggestionsAlongSignature');

    const element = this.parentNode;
    let frameRequested;

    this.resizeObserver = new ResizeObserver(([{contentRect}]) => {
      if (frameRequested) {
        return;
      }
      frameRequested = true;
      requestAnimationFrame(() => {
        const ol = element.querySelector('ol:not(:empty)');
        if (ol) {
          const bounds = ol.getBoundingClientRect();
          if (bounds.width >= this.offsetWidth) {
            this.style.maxWidth = bounds.width + 'px';
          } else {
            this.style.maxWidth = '';
          }
        }
        frameRequested = false;
      });
    });
    // sometimes parentNode can be a Document
    if (element instanceof Element) {
      this.resizeObserver.observe(element);
    }

    requestAnimationFrame(() => this.checkWidth());
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
      kwargs = `<section class="kwargs ${atom.config.get('kite.signatureKwargsVisible') ? 'visible' : ''}">
      <h4><span class="title">**${detailGet(detail, 'kwarg').name}<span class="kwargs-toggle">&#8613;</span></span></h4>
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
      const popularPatternsVisible = atom.config.get('kite.signaturePopularPatternsVisible');
      if (call.signatures && call.signatures.length) {
        patterns = `
          <section class="patterns ${popularPatternsVisible ? 'visible' : ''}">
          <h4><span class="title">How others used this<span class="popular-patterns-toggle">&#8613;</span></span></h4>
          ${highlightCode(wrapAfterParenthesis(
            call.signatures
            .map(s => callSignature(s))
            .map(s => `${name}(${s})`)
            .join('\n')))}
          </section>`;
      }

      const actions = [
        `<a class="kite-link docs" href="kite-atom-internal://open-search-docs/${idToDottedPath(call.callee.id)}">Docs<span class="kite-link-icon">&#8663;</span></a>`,
      ];

      if (!popularPatternsVisible) {
        actions.unshift('<a class="kite-link patterns" href="#">Examples<span class="kite-link-icon">&#8615;</span></a>');
      }

      extendedContent = `
      ${kwargs}
      ${patterns}
      <kite-links class="one-line footer-links" metric="Signature">
        ${actions.join(' ')}
        <div class="flex-separator"></div>
        <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
      </kite-links>
      `;
    } else {
      extendedContent = kwargs;
    }

    const retTypes = returnTypes(call.callee);
    this.innerHTML = `
    <div class="kite-signature-wrapper">
      <div class="name"><pre>${
        valueLabel(call.callee, detailGet(call, 'in_kwargs') ? -1 : call.arg_index)
      }${retTypes ? ` &#8614; ${retTypes}` : ''}</pre></div>
      ${extendedContent}
    </div>
    ${debugData(data)}
    `;


    if (this.subscriptions) {
      this.subscriptions.dispose();
    }

    this.compact = true; //compact;
    this.currentIndex = call.arg_index;
    this.subscriptions = new CompositeDisposable();

    const kwargLinks = this.querySelector('section.kwargs kite-links');
    const footerLinks = this.querySelector('kite-links.footer-links');
    let popularPatternsLink = this.querySelector('kite-links.footer-links a.kite-link.patterns');
    if (!popularPatternsLink) {
      popularPatternsLink = document.createElement('a');
      popularPatternsLink.className = 'kite-link patterns';
      popularPatternsLink.setAttribute('href', '#');
      popularPatternsLink.innerHTML = 'Examples<span class="kite-link-icon">&#8615;</span>';
    }
    const docsLink = this.querySelector('kite-links.footer-links a.kite-link.docs');
    const kwargLink = this.querySelector('a.kwargs');
    const kwargSection = this.querySelector('section.kwargs');
    const editor = atom.workspace.getActiveTextEditor();
    const editorElement = atom.views.getView(editor);
    const kwargsTitle = this.querySelector('section.kwargs h4 span.title');
    const popularPatternsToggle = this.querySelector('span.popular-patterns-toggle');
    const popularPatternsTitle = this.querySelector('section.patterns h4 span.title');
    const popularPatternsSection = this.querySelector('section.patterns');

    this.subscriptions.add(new DisposableEvent(this, 'click', (e) => {
      editorElement && editorElement.focus();
    }));

    if (popularPatternsSection && popularPatternsToggle && popularPatternsTitle && footerLinks) {
      this.subscriptions.add(new DisposableEvent(popularPatternsTitle, 'click', (e) => {
        footerLinks.insertBefore(popularPatternsLink, docsLink);
        popularPatternsSection.classList.toggle('visible');
        atom.config.set('kite.signaturePopularPatternsVisible', !atom.config.get('kite.signaturePopularPatternsVisible'));
      }));
    }

    if (popularPatternsLink && popularPatternsSection && footerLinks) {
      this.subscriptions.add(new DisposableEvent(popularPatternsLink, 'click', (e) => {
        footerLinks.removeChild(popularPatternsLink);
        popularPatternsSection.classList.toggle('visible');
        atom.config.set('kite.signaturePopularPatternsVisible', !atom.config.get('kite.signaturePopularPatternsVisible'));
      }));
    }

    if (kwargSection && kwargsTitle) {
      this.subscriptions.add(new DisposableEvent(kwargsTitle, 'click', (e) => {
        kwargSection.classList.toggle('visible');
        atom.config.set('kite.signatureKwargsVisible', !atom.config.get('kite.signatureKwargsVisible'));
      }));
    }

    if (kwargLink && kwargSection) {
      this.subscriptions.add(new DisposableEvent(kwargLink, 'click', (e) => {
        kwargSection.classList.toggle('visible');
        atom.config.set('kite.signatureKwargsVisible', !atom.config.get('kite.signatureKwargsVisible'));
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

    if (kwargLinks) {
      this.subscriptions.add(kwargLinks.onDidClickMoreLink(() => {
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

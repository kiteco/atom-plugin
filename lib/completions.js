'use strict';

const DataLoader = require('./data-loader');
const KiteSignature = require('./elements/kite-signature');
const Plan = require('./plan');
const {delayPromise} = require('./utils');
let Kite;

const KiteProvider = {
  selector: '.source.python, .source.js',
  disableForSelector: [
    '.source.python .comment',
    '.source.python .string',
    '.source.js .comment',
    '.source.js .string',
  ].join(', '),
  inclusionPriority: 5,
  suggestionPriority: 5,
  excludeLowerPriority: false,

  // called to handle attribute completions
  getSuggestions(params) {
    if (!Kite) { Kite = require('./kite'); }

    // console.log('suggestions requested',
    //   Kite.isEditorWhitelisted(params.editor),
    //   Kite.app.isGrammarSupported(params.editor));
    return Kite.isEditorWhitelisted(params.editor) && Kite.app.isGrammarSupported(params.editor)
      ? delayPromise(() => {
        let promise = Plan.queryPlan();
        const position = params.editor.getCursorBufferPosition();
        if (this.isInsideFunctionCall(params.editor, position) ||
            this.isInsideFunctionCallBrackets(params.editor, position)) {
          promise = promise.then(() => this.loadSignature(params));
        } else {
          // the signature panel is visible, it's either we've deleted the
          // open paren or got past the closing one. We do an extra request
          // to conform to the specs
          if (this.isSignaturePanelVisible()) {
            promise = promise.then(() => this.loadSignature(params));
          } else {
            this.clearSignature();
          }
        }

        if (!atom.config.get('kite.enableCompletions', false)) {
          return promise.then(() => []);
        }

        return promise.then(() =>
        DataLoader.getCompletionsAtPosition(params.editor, params.editor.getCursorBufferPosition()))
        .then(suggestions =>
          // For Atom < 1.23.3, a weird bug happen when we're completing after a space.
          // In that case we just remove the replacementPrefix that is by default set
          // to the provided prefix
          params.prefix === ' '
            ? suggestions.map(s => {s.replacementPrefix = ''; return s;})
            : suggestions
        )
        .then(suggestions => {
          suggestions.forEach(s => {
            // in the case the suggestion text matches the completion prefix
            // it seems atom will set an empty replacementPrefix, making the completed
            // text appear twice as the typed text is not removed.
            // FWIW most providers seems to not provide anything in the case the prefix
            // matches a single completion whose text equals the prefix
            if (!s.replacementPrefix && params.prefix === s.text) {
              s.replacementPrefix = s.text;
            }
          });
          return suggestions;
        });
      }, 0)
      : Promise.resolve();
  },

  isInsideFunctionCall(editor, position) {
    const scopeDescriptor = editor.scopeDescriptorForBufferPosition(position);
    // Prior to version 1.24 the arguments scope didn't had the function-call|method-call
    // prefix, so we need to keed the old check otherwise we're breaking the signature
    // panel in these versions
    return (
      (parseFloat(atom.getVersion()) <= 1.23
        ? scopeDescriptor.scopes.some(s => /(function|method)-call|arguments/.test(s))
        : scopeDescriptor.scopes.some(s => /(function|method)-call\.arguments/.test(s)))
      );
  },

  isOnFunctionCallBrackets(editor, position) {
    const scopeDescriptor = editor.scopeDescriptorForBufferPosition(position);
    return scopeDescriptor.scopes.some(s => /arguments(.*)\.bracket/.test(s));
  },

  isInsideFunctionCallBrackets(editor, position) {
    const prefixChar = editor.getTextInBufferRange([
      [position.row, position.column - 1],
      [position.row, position.column],
    ]);
    const suffixChar = editor.getTextInBufferRange([
      [position.row, position.column],
      [position.row, position.column + 1],
    ]);
    return this.isOnFunctionCallBrackets(editor, position)
           && (
             /\(/.test(prefixChar)
             || /\)/.test(suffixChar)
           );
  },

  loadSignature({editor, position}) {
    const compact = false;

    return DataLoader.getSignaturesAtPosition(editor, position || editor.getCursorBufferPosition())
    .then(data => {
      if (data) {
        const listElement = this.getSuggestionsListElement( );

        listElement.maxVisibleSuggestions = compact
          ? atom.config.get('autocomplete-plus.maxVisibleSuggestions')
          : atom.config.get('kite.maxVisibleSuggestionsAlongSignature');

        const isNewSigPanel = this.signaturePanel == null;

        const element = listElement.element
          ? listElement.element
          : listElement;

        this.signaturePanel = this.signaturePanel || new KiteSignature();
        this.signaturePanel.setListElement(listElement);
        this.signaturePanel.setData(data, compact);
        atom.config.get('kite.hideDocumentationWhenSignatureIsAvailable')
          ? element.setAttribute('no-documentation', '')
          : element.removeAttribute('no-documentation');


        if (isNewSigPanel || this.sigPanelNeedsReinsertion(element)) {
          element.style.width = null;

          // element.insertBefore(this.signaturePanel, element.lastChild);
          element.appendChild(this.signaturePanel);
        }
      } else {
        this.clearSignature();
      }
    })
    .catch(err => {
      this.clearSignature();
    });
  },

  sigPanelNeedsReinsertion(element) {
    for (let i = 0; i < element.children.length; i++) {
      if (element.children[i].tagName.toLowerCase() === 'kite-signature') { return false; }
    }
    return true;
  },

  clearSignature() {
    if (this.isSignaturePanelVisible()) {
      this.signaturePanel.parentNode.removeChild(this.signaturePanel);
    }
  },

  isSignaturePanelVisible() {
    return this.signaturePanel && this.signaturePanel.parentNode;
  },

  getSuggestionsListElement() {
    if (!atom.packages.getAvailablePackageNames().includes('autocomplete-plus')) {
      return null;
    }
    if (this.suggestionListElement) { return this.suggestionListElement; }

    const pkg = atom.packages.getActivePackage('autocomplete-plus').mainModule;
    const list = pkg.autocompleteManager.suggestionList;
    this.suggestionListElement = list.suggestionListElement
      ? list.suggestionListElement
      : atom.views.getView(pkg.autocompleteManager.suggestionList);

    if (!this.suggestionListElement.ol) {
      this.suggestionListElement.renderList();
    }

    return this.suggestionListElement;
  },
};

module.exports = KiteProvider;

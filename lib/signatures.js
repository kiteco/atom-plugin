'use strict';
const {CompositeDisposable, Disposable, Point} = require('atom');
const DataLoader = require('./data-loader');
const KiteSignature = require('./elements/kite-signature');

let Kite;

module.exports = {
  init(kite) {
    Kite = kite;

    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.workspace.onDidChangeActiveTextEditor(editor => {
      this.unsubscribeFromActiveEditor();

      if (editor && Kite.app.isGrammarSupported(editor)) {
        this.setActiveEditor(editor);
      }
    }));

    this.setActiveEditor(atom.workspace.getActiveTextEditor());
  },

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
    delete this.activeEditor;
    delete this.activeEditorSubscriptions;
  },

  setActiveEditor(editor) {
    this.unsubscribeFromActiveEditor();
    if (editor) {
      this.activeEditor = editor;
      this.activeEditorSubscriptions = new CompositeDisposable();

      this.activeEditorSubscriptions.add(editor.buffer.onDidChange(() => {
        this.bufferChanged = true;
        this.requestSignatureCheck();
      }));
      this.activeEditorSubscriptions.add(editor.onDidChangeCursorPosition(() => {
        this.cursorMoved = true;
        this.requestSignatureCheck();
      }));

      this.subscriptions.add(this.activeEditorSubscriptions);
    }
  },

  unsubscribeFromActiveEditor() {
    if (this.activeEditor) {
      this.subscriptions.remove(this.activeEditorSubscriptions);
      this.activeEditorSubscriptions.dispose();
      delete this.activeEditor;
      delete this.activeEditorSubscriptions;
    }
  },

  requestSignatureCheck() {
    if (this.checkRequested != null) { return; }

    this.checkRequested = true;
    requestAnimationFrame(() => {
      if (!Kite.isEditorWhitelisted(this.activeEditor)) {
        this.cleanSignatureCheck();
        return;
      }

      const position = this.activeEditor.getCursorBufferPosition();
      const insideParenthesis = this.isInsideFunctionCall(this.activeEditor, position)
                                || this.isInsideFunctionCallBrackets(this.activeEditor, position);
      const insideCall = this.isInsideFunctionCall(this.activeEditor, position)
                         || this.isOnFunctionCallBrackets(this.activeEditor, position);

      if ((this.bufferChanged && insideParenthesis)
       || (this.isOverlayVisible() && insideCall)) {
        if (!this.isOverlayVisible()) {
          this.showOverlay();
        } else if (this.isOverlayVisible()) {
          this.updateOverlay();
        }
      } else if (this.isOverlayVisible()) {
        this.hideOverlay();
      }

      this.cleanSignatureCheck();
    });
  },

  cleanSignatureCheck() {
    delete this.checkRequested;
    delete this.bufferChanged;
    delete this.cursorMoved;
  },

  setListElement(listElement) {
    this.listElement = listElement;

    // We're using an IntersectionObserver to detect when the completion list
    // becomes visible and a mutation observer to track channges made to the
    // completion overlay.
    let mutationObserverDisposable;
    this.intersectionObserver = new IntersectionObserver((entries) => {
      // this callback is called only when the UI is first created and then
      // whenever it's added/removed from the DOM. The trick being that
      // it has a parent only after having being added once, and the parent
      // will still exist when entering the callback when the UI disappear
      // because it tracks the node render rather than the DOM, the overlay
      // is removed from the DOM, so the list is no longer visible, but it is
      // still a children of the overlay.
      if (this.listElement.parentNode && !mutationObserverDisposable) {
        // the list now has a parent and we haven't an observer yet,
        // we're creating a MutationObserver to watch for the style
        // attribute changes on the parent (the overlay decoration
        // that host the completion list) to detect when it overlap
        // with our UI and switch its place.
        const observer = new MutationObserver(([mutation]) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            this.checkCompletionOverlap();
          }
        });
        observer.observe(this.listElement.parentNode, {
          attributes: true,
        });

        mutationObserverDisposable = new Disposable(() => {
          observer.disconnect();
        });

        this.subscriptions.add(mutationObserverDisposable);
        this.checkCompletionOverlap();
      } else if (mutationObserverDisposable) {
        // If we enter this callback while having an observer that mean the
        // completion overlay is no longer on screen, we can clean up the
        // mutation observer, given each time the completion list is displayed
        // we'll have to register on the new overlay element
        this.subscriptions.remove(mutationObserverDisposable);
        mutationObserverDisposable.dispose();
        mutationObserverDisposable = null;

        // we reset the position of our UI
        this.signature && this.signature.classList.remove('upside-down');
      }
    });

    this.intersectionObserver.observe(this.listElement);
    this.subscriptions.add(new Disposable(() => {
      this.intersectionObserver.disconnect();
      delete this.intersectionObserver;
    }));
  },

  isOverlayVisible() {
    return this.decoration;
  },

  showOverlay() {
    const position = this.activeEditor.getCursorBufferPosition();

    DataLoader.getSignaturesAtPosition(this.activeEditor, position)
    .then(data => {
      if (data) {
        if (!this.signature) {
          this.signature = new KiteSignature();
        }

        this.signature.setData(data);

        const name = data.calls[0].func_name;
        const range = this.findFunctionRange(name, position);

        this.currentFunctionName = name;

        if (range) {
          this.marker = this.activeEditor.markBufferRange(range, {
            invalidate: 'never',
          });
          this.decoration = this.activeEditor.decorateMarker(this.marker, {
            type: 'overlay',
            position: 'tail',
            item: this.signature,
            avoidOverflow: false,
          });
        }
      }
    });
  },

  hideOverlay() {
    this.marker && this.marker.destroy();
    this.decoration && this.decoration.destroy();
    delete this.marker;
    delete this.decoration;
    // delete this.signature;
  },

  updateOverlay() {
    if (!this.signature) { return; }
    const position = this.activeEditor.getCursorBufferPosition();

    DataLoader.getSignaturesAtPosition(this.activeEditor, position)
    .then(data => {
      if (data) {
        const name = data.calls[0].func_name;
        const range = this.findFunctionRange(name, position);
        const currentRange = this.marker.getBufferRange();

        if (!currentRange.isEqual(range)) {
          this.marker.setBufferRange(range);
        }

        this.signature.setData(data);
      } else {
        this.hideOverlay();
      }
    });
  },

  findFunctionRange(name, position) {
    let {row} = position;
    let startPosition;
    let lineScanned = 0;

    while (!startPosition) {
      const text = this.activeEditor.getTextInBufferRange([
        [row, 0],
        [row, Number.POSITIVE_INFINITY],
      ]);
      const index = text.indexOf(name);

      if (index !== -1) {
        startPosition = Point.fromObject([row, index]);
        return {start: startPosition, end: position};
      } else {
        lineScanned++;
        row--;

        if (row === -1 || lineScanned > 10) {
          return null;
        }
      }
    }

    return null;
  },

  checkCompletionOverlap() {
    if (this.decoration && this.listElement && this.listElement.parentNode) {
      const sigBounds = this.signature.getBoundingClientRect();
      const listBounds = this.listElement.getBoundingClientRect();

      if (!(sigBounds.top > listBounds.bottom || sigBounds.bottom < listBounds.top)) {
        this.signature.classList.toggle('upside-down');

        this.decoration.setProperties({
          type: 'overlay',
          item: this.signature,
          avoidOverflow: false,
          position: this.signature.classList.contains('upside-down') ? 'head' : 'tail',
        });
      }
    }
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
};

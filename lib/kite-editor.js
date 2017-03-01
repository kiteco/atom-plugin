'use strict';

const {CompositeDisposable} = require('atom');
const {screenPositionForMouseEvent, pixelPositionForMouseEvent} = require('./utils');
const {symbolId} = require('./kite-data-utils');
const EditorEvents = require('./editor-events');
const DataLoader = require('./data-loader');
const OverlayManager = require('./overlay-manager');
const HoverGesture = require('./gestures/hover');
const TokensList = require('./tokens-list');
const HyperClickMode = require('./modes/hyperclick');
const OverlayMode = require('./modes/overlay');
const SidebarMode = require('./modes/sidebar');
let Kite;

class KiteEditor {
  constructor(editor) {
    if (!Kite) { Kite = require('./kite'); }

    this.editor = editor;
    this.buffer = editor.getBuffer();
    this.editorElement = atom.views.getView(editor);

    this.subscribeToEditor();
    this.updateTokens();
  }

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
    delete this.editorElement;
    delete this.editor;
    delete this.buffer;
  }

  subscribeToEditor() {
    const editor = this.editor;
    const subs = new CompositeDisposable();

    this.subscriptions = subs;
    this.tokensList = new TokensList(editor);
    this.hyperClickMode = new HyperClickMode(this);
    this.editorEvents = new EditorEvents(editor);

    subs.add(this.tokensList);
    subs.add(this.hyperClickMode);
    subs.add(this.editorEvents);

    subs.add(editor.onDidStopChanging(() => this.updateTokens()));

    this.hoverGesture = new HoverGesture(editor, this.tokensList, {
      ignoredSelector: 'atom-overlay, atom-overlay *',
    });
    subs.add(this.hoverGesture);

    subs.add(this.hoverGesture.onDidActivate(({range}) => {
      OverlayManager.showHoverAtRangeWithDelay(editor, range);
    }));
    subs.add(this.hoverGesture.onDidDeactivate(() => {
      OverlayManager.dismissWithDelay();
    }));

    subs.add(editor.onDidDestroy(() => {
      Kite.unsubscribeFromEditor(editor);
    }));

    subs.add(atom.config.observe('kite.displayExpandViewAs', (display) => {
      if (this.mode) {
        this.mode.dispose();
        subs.remove(this.mode);
      }

      this.mode = display === 'sidebar'
        ? new SidebarMode(this)
        : new OverlayMode(this);

      subs.add(this.mode);
    }));
  }

  updateTokens() {
    DataLoader.getTokensForEditor(this.editor).then(tokens => {
      this.tokensList.setTokens(tokens.tokens);
    });
  }

  expandRange(range) {
    this.mode.expandRange(range);
  }

  openInWebAtRange(range) {
    return DataLoader.openInWebAtRange(this.editor, range);
  }

  openTokenDefinition(token) {
    DataLoader.getValueReportDataForId(symbolId(token.Symbol))
    .then((data) => {
      const {definition} = data.report;
      if (definition) {
        atom.workspace.open(definition.filename)
        .then(editor => {
          editor.setCursorBufferPosition([
            definition.line - 1, 0,
          ], {
            autoscroll: true,
          });
        });
        return true;
      }
      return false;
    })
    .catch(() => {
      atom.notifications.addWarning(`Can't find a definition for token \`${token.Symbol.name}\``, {
        dismissable: true,
      });
    });
  }

  showHyperClickHighlight(range) {
    this.hyperclickMarker = this.editor.markBufferRange(range, {
      invalidate: 'touch',
    });
    this.editor.decorateMarker(this.hyperclickMarker, {
      type: 'highlight',
      class: 'kite-hyperclick',
    });
  }

  hideHyperClickHighlight() {
    if (this.hyperclickMarker ) {
      this.hyperclickMarker.destroy();
      delete this.hyperclickMarker;
    }
  }

  tokenAtPosition(position) {
    return this.tokensList.tokenAtPosition(position);
  }

  tokenAtScreenPosition(position) {
    return this.tokensList.tokenAtScreenPosition(position);
  }

  tokenForMouseEvent(event) {
    return this.tokensList.tokenForMouseEvent(event);
  }

  screenPositionForMouseEvent(event) {
    return screenPositionForMouseEvent(this.editorElement, event);
  }

  pixelPositionForMouseEvent(event) {
    return pixelPositionForMouseEvent(this.editorElement, event);
  }
}

module.exports = KiteEditor;

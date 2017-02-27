'use strict';

const {CompositeDisposable} = require('atom');
const {screenPositionForMouseEvent, pixelPositionForMouseEvent} = require('./utils');
const EditorEvents = require('./editor-events');
const DataLoader = require('./data-loader');
const OverlayManager = require('./overlay-manager');
const HoverGesture = require('./gestures/hover');
const WordSelectionGesture = require('./gestures/word-selection');
const CursorMoveGesture = require('./gestures/cursor-move');
const TokensList = require('./tokens-list');
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

    subs.add(this.tokensList);
    subs.add(new EditorEvents(editor));
    subs.add(editor.onDidStopChanging(() => this.updateTokens()));

    const expandGesture = new WordSelectionGesture(editor, this.tokensList);
    const cursorGesture = new CursorMoveGesture(editor, this.tokensList);
    const hoverGesture = new HoverGesture(editor, this.tokensList, {
      ignoredSelector: 'atom-overlay, atom-overlay *',
    });
    const hyperclickHoverGesture = new HoverGesture(editor, this.tokensList, {
      altKey: true,
    });
    subs.add(hoverGesture);
    subs.add(expandGesture);
    subs.add(cursorGesture);
    subs.add(hyperclickHoverGesture);

    // We don't want hover to make the expand panel disappear, so we're
    // pausing the hover gesture until the expand panel is dismissed.
    // Moving a cursor wil still hide the expand panel though.
    subs.add(OverlayManager.onDidShowExpand(() => hoverGesture.pause()));
    subs.add(OverlayManager.onDidDismiss(() => hoverGesture.resume()));

    subs.add(hyperclickHoverGesture.onDidActivate(({range}) => {
      this.showHyperClickHighlight(range);
    }));
    subs.add(hyperclickHoverGesture.onDidDeactivate(() => {
      this.hideHyperClickHighlight();
    }));

    subs.add(hoverGesture.onDidActivate(({range}) => {
      OverlayManager.showHoverAtRangeWithDelay(editor, range);
    }));
    subs.add(hoverGesture.onDidDeactivate(() => {
      OverlayManager.dismissWithDelay();
    }));

    subs.add(cursorGesture.onDidActivate(({range}) => {
      if (Kite.useSidebar() && Kite.isSidebarVisible()) {
        Kite.sidebar.showDataAtRange(editor, range);
      } else {
        OverlayManager.dismiss('kite');
      }
    }));

    subs.add(expandGesture.onDidActivate(({range}) => {
      Kite.expandAtCursor(editor);
    }));
    subs.add(expandGesture.onDidDeactivate(() => {
      OverlayManager.dismiss('kite');
    }));

    subs.add(editor.onDidDestroy(() => {
      Kite.unsubscribeFromEditor(editor);
    }));
  }

  updateTokens() {
    DataLoader.getTokensForEditor(this.editor).then(tokens => {
      this.tokensList.setTokens(tokens.tokens);
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

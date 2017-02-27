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

    const expandGesture = new WordSelectionGesture(editor);
    const cursorGesture = new CursorMoveGesture(editor);
    const hoverGesture = new HoverGesture(editor, this.tokensList, {
      ignoredSelector: 'atom-overlay, atom-overlay *',
    });
    subs.add(hoverGesture);
    subs.add(expandGesture);
    subs.add(cursorGesture);

    // We don't want hover to make the expand panel disappear, so we're
    // pausing the hover gesture until the expand panel is dismissed.
    // Moving a cursor wil still hide the expand panel though.
    subs.add(OverlayManager.onDidShowExpand(() => hoverGesture.pause()));
    subs.add(OverlayManager.onDidDismiss(() => hoverGesture.resume()));

    subs.add(hoverGesture.onDidActivate(position => {
      OverlayManager.showHoverAtPositionWithDelay(editor, position);
    }));
    subs.add(hoverGesture.onDidDeactivate(position => {
      OverlayManager.dismissWithDelay();
    }));

    subs.add(cursorGesture.onDidActivate(position => {
      if (Kite.useSidebar() && Kite.isSidebarVisible()) {
        Kite.sidebar.showDataAtPosition(editor, position);
      } else {
        OverlayManager.dismiss('kite');
      }
    }));

    subs.add(expandGesture.onDidActivate(position => {
      Kite.expandAtCursor(editor);
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

'use strict';

const {CompositeDisposable} = require('atom');
const {head} = require('./utils');
const EditorEvents = require('./editor-events');
const DataLoader = require('./data-loader');
const OverlayManager = require('./overlay-manager');
const HoverGesture = require('./gestures/hover');
const WordSelectionGesture = require('./gestures/word-selection');
const CursorMoveGesture = require('./gestures/cursor-move');
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

    const expandGesture = new WordSelectionGesture(editor);
    const cursorGesture = new CursorMoveGesture(editor);
    const hoverGesture = new HoverGesture(editor, {
      ignoredSelector: 'atom-overlay, atom-overlay *',
    });
    const subs = new CompositeDisposable();

    this.subscriptions = subs;

    subs.add(new EditorEvents(editor));
    subs.add(editor.onDidStopChanging(() => this.updateTokens()));
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
      this.tokens = tokens.tokens;
    });
  }

  tokenAtPosition(position) {
    const pos = this.buffer.characterIndexForPosition(position);
    return this.tokens
      ? head(this.tokens.filter(token => pos >= token.begin_bytes &&
                                         pos <= token.end_bytes))
      : null;
  }

  tokenForMouseEvent(event) {
    if (!event) { return null; }

    const position = this.screenPositionForMouseEvent(event);

    if (!position) { return null; }

    const bufferPosition = this.editor.bufferPositionForScreenPosition(position);

    return this.tokenAtPosition(bufferPosition);
  }

  screenPositionForMouseEvent(event) {
    const pixelPosition = this.pixelPositionForMouseEvent(event);

    if (pixelPosition == null) { return null; }

    return this.editorElement.screenPositionForPixelPosition != null
      ? this.editorElement.screenPositionForPixelPosition(pixelPosition)
      : this.editor.screenPositionForPixelPosition(pixelPosition);
  }

  pixelPositionForMouseEvent(event) {
    const {clientX, clientY} = event;

    const scrollTarget = (this.editorElement.getScrollTop != null)
      ? this.editorElement
      : this.editor;

    if (this.editorElement.querySelector('.lines') == null) { return null; }

    let {top, left} = this.editorElement.querySelector('.lines').getBoundingClientRect();
    top = (clientY - top) + scrollTarget.getScrollTop();
    left = (clientX - left) + scrollTarget.getScrollLeft();
    return {top, left};
  }
}

module.exports = KiteEditor;

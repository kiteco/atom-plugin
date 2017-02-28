'use strict';

const {CompositeDisposable} = require('atom');
const {screenPositionForMouseEvent, pixelPositionForMouseEvent} = require('./utils');
const {symbolId} = require('./kite-data-utils');
const metrics = require('./metrics.js');
const EditorEvents = require('./editor-events');
const DataLoader = require('./data-loader');
const OverlayManager = require('./overlay-manager');
const HoverGesture = require('./gestures/hover');
const ClickGesture = require('./gestures/click');
const KeyboardGesture = require('./gestures/keyboard');
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
    const hyperclickKeydownGesture = new KeyboardGesture(editor, this.tokensList, {
      type: 'keydown',
      key: 'Alt',
      altKey: true,
    });
    const hyperclickKeyupGesture = new KeyboardGesture(editor, this.tokensList, {
      type: 'keyup',
      key: 'Alt',
    });
    const hyperclickGesture = new ClickGesture(editor, this.tokensList, {
      altKey: true,
    });
    subs.add(hoverGesture);
    subs.add(expandGesture);
    subs.add(cursorGesture);
    subs.add(hyperclickHoverGesture);
    subs.add(hyperclickKeydownGesture);
    subs.add(hyperclickKeyupGesture);
    subs.add(hyperclickGesture);

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
    subs.add(hyperclickKeydownGesture.onDidActivate(({token}) => {
      hyperclickHoverGesture.activate(token);
      hoverGesture.deactivate();
    }));
    subs.add(hyperclickKeyupGesture.onDidActivate(({token}) => {
      hyperclickHoverGesture.deactivate();
      hoverGesture.activate(token);
    }));
    subs.add(hyperclickGesture.onDidActivate(({token}) => {
      this.openTokenDefinition(token);
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
        metrics.track('Context menu Go to definition clicked (with definition in report)');
      } else {
        metrics.track('Context menu Go to definition clicked (without definition in report)');
      }
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

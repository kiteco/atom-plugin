'use strict';

let Kite, DataLoader, OverlayManager, WordHoverGesture,
  screenPositionForMouseEvent,
  pixelPositionForMouseEvent, CompositeDisposable,
  metrics;

class KiteEditor {
  constructor(editor) {
    this.editor = editor;
    this.buffer = editor.getBuffer();
    this.editorElement = atom.views.getView(editor);
    this.fixesHistory = [];

    this.subscribeToEditor();
  }

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
    delete this.editorElement;
    delete this.editor;
    delete this.buffer;
  }

  subscribeToEditor() {
    if (!CompositeDisposable) {
      ({CompositeDisposable} = require('atom'));
      ({screenPositionForMouseEvent, pixelPositionForMouseEvent} = require('./utils'));
      WordHoverGesture = require('./gestures/word-hover');
      DataLoader = require('./data-loader');
    }

    const editor = this.editor;
    const subs = new CompositeDisposable();

    this.subscriptions = subs;

    // subs.add(this.hoverGesture.onDidActivate(({position}) => {
    //   if (atom.config.get('kite.enableHoverUI')) {
    //     if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
    //     OverlayManager.showHoverAtPositionWithDelay(editor, position);
    //   }
    // }));
    // subs.add(this.hoverGesture.onDidDeactivate(() => {
    //   if (atom.config.get('kite.enableHoverUI')) {
    //     if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
    //     OverlayManager.dismissWithDelay();
    //   }
    // }));

    subs.add(editor.onDidChangeCursorPosition(() => {
      if (!Kite) { Kite = require('./kite'); }
      if (typeof Kite.setStatusLabel === 'function') { Kite.setStatusLabel(this); }
      if (atom.config.get('kite.enableHoverUI')) {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismissWithDelay();
      }
    }));

    subs.add(editor.onDidDestroy(() => {
      if (!Kite) { Kite = require('./kite'); }
      Kite.unsubscribeFromEditor(editor);
    }));

    subs.add(editor.getBuffer().onWillSave(() => {
      if (!Kite) { Kite = require('./kite'); }
      if (Kite.isEditorWhitelisted(this.editor)) {
        return this.willSaveHook();
      }
      return null;
    }));
  }

  initialize() {
    return this.editor === atom.workspace.getActivePaneItem()
      ? DataLoader.isEditorAuthorized(this.editor)
      : Promise.resolve();
  }

  willSaveHook() {
    return DataLoader.postSaveValidationData(this.editor).catch(() => {});
  }

  expandPosition(position) {
    if (!metrics) { metrics = require('./metrics'); }

    DataLoader.getHoverDataAtPosition(this.editor, position).then(data => {
      const [symbol] = data.symbol;

      if (symbol && symbol.id) {
        this.expandId(symbol.id);
      }
    });
  }

  expandId(id) {
    atom.applicationDelegate.openExternal(`kite://docs/${encodeURI(id)}`);
  }

  openInWebAtRange(range) {
    return DataLoader.openInWebAtRange(this.editor, range);
  }

  openInWebAtPosition(position) {
    return DataLoader.openInWebAtPosition(this.editor, position);
  }

  openDefinitionForId(id) {
    return DataLoader.getValueReportDataForId(id)
    .then((data) => this.openDefinition(data.report.definition));
  }

  openDefinitionAtRange(range) {
    const token = this.tokensList.tokenAtRange(range);
    return this.openTokenDefinition(token);
  }

  openDefinitionAtPosition(position) {
    const token = this.tokensList.tokenAtPosition(position);
    return this.openTokenDefinition(token);
  }

  openDefinition(definition) {
    if (!metrics) { metrics = require('./metrics'); }

    if (definition.filename.trim() === '') { return Promise.resolve(false); }

    return new Promise((resolve, reject) => {
      metrics.featureRequested('definition');
      if (definition) {
        return atom.workspace.open(definition.filename)
        .then(editor => {
          metrics.featureFulfilled('definition');
          editor.setCursorBufferPosition([
            definition.line - 1, definition.column ? definition.column - 1 : 0,
          ], {
            autoscroll: true,
          });
          return true;
        });
      }
      return false;
    });
  }

  screenPositionForMouseEvent(event) {
    return screenPositionForMouseEvent(this.editorElement, event);
  }

  pixelPositionForMouseEvent(event) {
    return pixelPositionForMouseEvent(this.editorElement, event);
  }
}

module.exports = KiteEditor;

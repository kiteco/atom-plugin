'use strict';

const BaseMode = require('./base');
// const WordSelectionGesture = require('../gestures/word-selection');
const CursorMoveGesture = require('../gestures/cursor-move');
const OverlayManager = require('../overlay-manager');
let Kite;

module.exports = class OverlayMode extends BaseMode {
  constructor(kiteEditor) {
    super(kiteEditor);

    this.registerGestures();
  }

  expandRange(range) {
    OverlayManager.showExpandAtRange(this.kiteEditor.editor, range);
  }

  registerGestures() {
    if (!Kite) { Kite = require('../kite'); }

    const {editor, tokensList} = this.kiteEditor;
    const subs = this.subscriptions;
    const cursorGesture = new CursorMoveGesture(editor, tokensList, {
      checkToken: false,
    });

    subs.add(cursorGesture);

    // We don't want hover to make the expand panel disappear, so we're
    // pausing the hover gesture until the expand panel is dismissed.
    // Moving a cursor wil still hide the expand panel though.
    subs.add(OverlayManager.onDidShowExpand(() =>
      this.kiteEditor.hoverGesture.pause()));
    subs.add(OverlayManager.onDidDismiss(() =>
      this.kiteEditor.hoverGesture.resume()));

    subs.add(cursorGesture.onDidActivate(() => {
      OverlayManager.dismiss('kite');
    }));
  }
};

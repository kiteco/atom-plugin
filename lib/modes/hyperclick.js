'use strict';

const BaseMode = require('./base');
const HoverGesture = require('../gestures/hover');
const ClickGesture = require('../gestures/click');
const KeyboardGesture = require('../gestures/keyboard');

module.exports = class HyperClickMode extends BaseMode {
  constructor(kiteEditor) {
    super(kiteEditor);

    this.registerGestures();
  }

  registerGestures() {
    const {editor, tokensList} = this.kiteEditor;
    const subs = this.subscriptions;

    const hyperclickHoverGesture = new HoverGesture(editor, tokensList, {
      altKey: true,
    });
    const hyperclickKeydownGesture = new KeyboardGesture(editor, tokensList, {
      type: 'keydown',
      key: 'Alt',
      altKey: true,
    });
    const hyperclickKeyupGesture = new KeyboardGesture(editor, tokensList, {
      type: 'keyup',
      key: 'Alt',
    });
    const hyperclickGesture = new ClickGesture(editor, tokensList, {
      altKey: true,
    });

    subs.add(hyperclickHoverGesture);
    subs.add(hyperclickKeydownGesture);
    subs.add(hyperclickKeyupGesture);
    subs.add(hyperclickGesture);

    subs.add(hyperclickHoverGesture.onDidActivate(({range}) => {
      this.kiteEditor.showHyperClickHighlight(range);
    }));
    subs.add(hyperclickHoverGesture.onDidDeactivate(() => {
      this.kiteEditor.hideHyperClickHighlight();
    }));
    subs.add(hyperclickKeydownGesture.onDidActivate(({token}) => {
      hyperclickHoverGesture.activate(token);
      this.kiteEditor.hoverGesture.deactivate();
    }));
    subs.add(hyperclickKeyupGesture.onDidActivate(({token}) => {
      hyperclickHoverGesture.deactivate();
      this.kiteEditor.hoverGesture.activate(token);
    }));
    subs.add(hyperclickGesture.onDidActivate(({token}) => {
      this.kiteEditor.openTokenDefinition(token);
    }));
  }
};

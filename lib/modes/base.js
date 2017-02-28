'use strict';

const {CompositeDisposable} = require('atom');

module.exports = class BaseMode {
  constructor(kiteEditor) {
    this.kiteEditor = kiteEditor;
    this.subscriptions = new CompositeDisposable();
  }

  dispose() {
    if (this.kiteEditor) {
      this.subscriptions.dispose();
      delete this.kiteEditor;
      delete this.subscriptions;
    }
  }
};

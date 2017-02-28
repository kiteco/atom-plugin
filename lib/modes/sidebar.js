'use strict';

const BaseMode = require('./base');
let Kite;

module.exports = class SidebarMode extends BaseMode {
  constructor(kiteEditor) {
    super(kiteEditor);
  }

  expandRange(range) {
    if (!Kite) { Kite = require('../kite'); }

    if (!Kite.isSidebarVisible()) { Kite.toggleSidebar(true); }

    console.log(range);

    Kite.sidebar.showDataAtRange(this.kiteEditor.editor, range);
  }
};

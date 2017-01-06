'use strict';

var StatusItem = class {
  constructor() {
    this.element = document.createElement('div');
    this.setState('kite-status-unknown');
    this.tooltipText = '';
    this.tooltip = atom.tooltips.add(this.element, {
      title: () => { return this.tooltipText; },
    });
  }

  setState(cls, description) {
    this.tooltipText = description;
    this.element.className = '';  // clear the list of classes
    this.element.classList.add('inline-block');
    this.element.classList.add('kite-status');
    if (cls !== undefined) {
      this.element.classList.add(cls);
    }
  }

  onClick(func) {
    this.element.onclick = func;
  }
};

module.exports = StatusItem;

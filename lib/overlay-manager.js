'use strict';

const {Range, Emitter, CompositeDisposable} = require('atom');
const {Logger} = require('kite-installer');
const {DisposableEvent} = require('./utils');
const VirtualCursor = require('./virtual-cursor');
const KiteHover = require('./elements/kite-hover');
const KiteExpand = require('./elements/kite-expand');
const DataLoader = require('./data-loader');
const metrics = require('./metrics.js');

module.exports = {
  emitter: new Emitter(),
  queue: Promise.resolve(),
  hoverDefault: {
    show: 750,
    hide: 100,
  },

  enqueue(promiseGenerator) {
    this.queue = this.queue
    .then(promiseGenerator)
    .catch(err => {});

    return this.queue;
  },

  onDidShowExpand(listener) {
    return this.emitter.on('did-show-expand', listener);
  },

  onDidShowHover(listener) {
    return this.emitter.on('did-show-hover', listener);
  },

  onDidDismiss(listener) {
    return this.emitter.on('did-dismiss', listener);
  },

  dismiss(from) {
    this.marker && this.marker.destroy();
    this.decoration && this.decoration.destroy();
    delete this.marker;
    delete this.decoration;
    delete this.lastHoverRange;
    delete this.lastExpandRange;
    delete this.expandDisplayed;

    this.emitter.emit('did-dismiss');
  },

  dismissWithDelay() {
    this.abortHoverWithDelay();
    if (this.decoration && this.dismissTimeout == null) {
      this.dismissTimeout = setTimeout(() => {
        this.dismiss();
        delete this.dismissTimeout;
      }, this.hoverDefault.hide);
    }
  },

  abortHoverWithDelay() {
    // this.abortDismissWithDelay();
    clearTimeout(this.hoverTimeout);
  },

  abortDismissWithDelay() {
    if (this.dismissTimeout) { clearTimeout(this.dismissTimeout); }
  },

  showHoverAtPositionWithDelay(editor, position) {
    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });

    return this.showHoverAtRangeWithDelay(editor, range);
  },

  showHoverAtRangeWithDelay(editor, range) {
    if ((this.lastHoverRange && this.lastHoverRange.isEqual(range)) ||
        (this.lastExpandRange && this.lastExpandRange.isEqual(range))) {
      return;
    }

    clearTimeout(this.hoverTimeout);
    this.dismissWithDelay();

    this.hoverTimeout = setTimeout(() => {
      if (!this.expandDisplayed) {
        this.showHoverAtRange(editor, range);
      }
    }, this.hoverDefault.show);
  },

  showHoverAtPosition(editor, position) {
    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });

    return this.showHoverAtRange(editor, range);
  },

  showHoverAtRange(editor, range) {
    range = Range.fromObject(range);
    return this.enqueue(() => {
      if ((this.lastHoverRange && this.lastHoverRange.isEqual(range)) ||
          (this.lastExpandRange && this.lastExpandRange.isEqual(range))) {
        return null;
      }

      this.dismiss('hover');

      if (range.isEmpty()) { return null; }

      this.lastHoverRange = range;

      return DataLoader.getHoverDataAtRange(editor, range).then(data => {
        if (data.symbol && data.symbol.length) {
          const hover = new KiteHover();
          hover.setData(data, editor, range);

          this.marker = editor.markBufferRange(range, {
            invalidate: 'touch',
          });
          this.decoration = editor.decorateMarker(this.marker, {
            type: 'overlay',
            position: 'tail',
            item: hover,
          });
          this.emitter.emit('did-show-hover');
          metrics.track('Hover UI shown');
        }
      });
    });
  },

  showExpandAtPosition(editor, position) {
    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });

    return this.showExpandAtRange(editor, range);
  },

  showExpandAtRange(editor, range) {
    range = Range.fromObject(range);

    this.abortHoverWithDelay();

    return this.enqueue(() => {
      if (this.lastExpandRange && this.lastExpandRange.isEqual(range)) {
        return null;
      }

      this.dismiss('expand');

      if (range.isEmpty()) { return null; }

      this.lastExpandRange = range;

      const expand = new KiteExpand();
      return expand.showDataAtRange(editor, range)
      .then(() => {
        const displayMode = atom.config.get('kite.displayExpandViewAs');

        this.marker = editor.markBufferRange(range, {
          invalidate: 'touch',
        });

        switch (displayMode) {
          case 'overlay':
            this.decoration = editor.decorateMarker(this.marker, {
              type: 'overlay',
              position: 'tail',
              item: expand,
            });
            break;
          case 'block':
            this.decoration = editor.decorateMarker(this.marker, {
              type: 'block',
              position: 'after',
              item: expand,
            });

            const subs = new CompositeDisposable();
            subs.add(new DisposableEvent(expand, 'mousedown mouseup', (e) => {
              e.stopImmediatePropagation();
              e.stopPropagation();
            }));
            subs.add(this.decoration.onDidDestroy(() => subs.dispose()));
            break;
        }
        this.emitter.emit('did-show-expand');
        this.expandDisplayed = true;
      })
      .catch(err => Logger.error(err));
    });
  },
};

const DataLoader = require('./data-loader');
const VirtualCursor = require('./virtual-cursor');

export class DocsCommand {
  dispose() {
    this.cmds && this.cmds.dispose();
  }

  add() {
    this.dispose();
    this.cmds = atom.commands.add('atom-text-editor[data-grammar="source python"]', {
      'kite:docs-at-cursor': this.expandAtCursor.bind(this),
    });
  }

  expandAtCursor() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    const position = editor.getLastCursor().getBufferPosition();

    this.highlightWordAtPosition(editor, position);

    if (!editor.getPath()) {
      return;
    }

    DataLoader
      .getHoverDataAtPosition(editor, position)
      .then(data => {
        const [symbol] = data.symbol;
        if (symbol && symbol.id) {
          atom.applicationDelegate.openExternal(`kite://docs/${symbol.id}`);
        }
      });
  }

  highlightWordAtPosition(editor, position, cls = '') {
    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });
    const marker = editor.markBufferRange(range, {
      invalidate: 'touch',
    });
    const decoration = editor.decorateMarker(marker, {
      type: 'highlight',
      class: `expand-at-cursor-highlight ${cls}`,
      item: this,
    });

    // Timed for all transition to be finished by then
    setTimeout(() => decoration.destroy(), 800);
  }
}

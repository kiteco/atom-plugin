const DataLoader = require('./data-loader');
const VirtualCursor = require('./virtual-cursor');

export class DocsCommand {
  constructor(notifCenter) {
    this.notifCenter = notifCenter;
  }

  dispose() {
    this.cmds && this.cmds.dispose();
  }

  add() {
    this.dispose();
    this.cmds = atom.commands.add('atom-text-editor[data-grammar="source python"]', {
      'kite:docs-at-cursor': this.expandAtCursor.bind(this),
    });
  }

  async expandAtCursor() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }

    const position = editor.getLastCursor().getBufferPosition();

    this.highlightWordAtPosition(editor, position);

    if (!editor.getPath()) {
      return;
    }

    try {
      const data = await DataLoader.getHoverDataAtPosition(editor, position);
      const [symbol] = data.symbol;
      if (symbol && symbol.id) {
        atom.applicationDelegate.openExternal(`kite://docs/${symbol.id}`);
      }
    } catch (err) {
      if (err.data && err.data.responseStatus === 503) {
        this.notifCenter.notifyFromError(err);
      }
      // Endpoint can 503 for paywall locked or 404 for not found symbol. Ignore those.
      const expected = err.data && (err.data.responseStatus === 503 || err.data.responseStatus === 404);
      if (!expected) {
        console.log(err, err.data);
      }
    }
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

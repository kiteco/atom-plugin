const KiteAPI = require('kite-api');
const KiteCodenavButton = require('./elements/kite-codenav-button');

module.exports = class CodenavLineDecoration {
  constructor(onClick) {
    this.onClick = onClick;
    this.activeEditor = null;
    this.marker = null;
    this.decoration = null;
    this.lineInfo = null;
    this.editTimeout = null;

    this.onDidChangeCursorPosition();
    atom.workspace.observeTextEditors(editor => {
      editor.onDidChangeCursorPosition(this.onDidChangeCursorPosition.bind(this));
      editor.onDidChange(this.onDidChange.bind(this));
    });
    atom.workspace.onDidChangeActiveTextEditor(this.onDidChangeCursorPosition.bind(this));
  }

  dispose() {
    this.marker && this.marker.destroy();
  }

  enabled() {
    return atom.config.get('kite.enableCodeFinderLineDecoration');
  }

  // Hide the decoration when the user is changing buffer contents
  // onDidChangeCursorPosition event.textChanged !== true for deletions
  // So we hook into onDidChange instead
  onDidChange() {
    if (!this.enabled()) {
      return;
    }
    this.dispose();
    if (this.editTimeout !== null) {
      clearTimeout(this.editTimeout);
    }
    this.editTimeout = setTimeout(() => {
      this.decorate();
      this.editTimeout = null;
    }, 1000);
  }

  onDidChangeCursorPosition() {
    if (!this.enabled()) {
      return;
    }
    this.dispose();

    if (this.editTimeout === null) {
      this.decorate();
    }
  }

  async decorate() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }
    const curBufPos = editor.getLastCursor().getBufferPosition();

    const applicable = this.lineInfo && this.lineInfo.projectReady !== undefined;
    const ready = this.lineInfo && this.lineInfo.projectReady;
    if (!this.lineInfo || editor !== this.activeEditor || (applicable && !ready)) {
      await this.reset(editor);
    } else if (editor.hasMultipleCursors()) {
      await this.reset(editor);
      return;
    }

    if (this.lineInfo && this.lineInfo.projectReady) {
      // Must dispose before marking to avoid multiple decorations
      this.dispose();
      this.marker = editor.markBufferPosition(curBufPos);
      this.decoration = editor.decorateMarker(this.marker, {
        type: 'block',
        position: 'after',
        item: KiteCodenavButton(
          this.lineInfo.inlineMessage,
          this.onClick,
          {
            lineHeightPx: editor.getLineHeightInPixels(),
            lineLengthPx: editor.element.pixelPositionForBufferPosition(
              [curBufPos.row, Infinity]
            ).left,
            charWidth: editor.getDefaultCharWidth(),
          }
        ),
      });
    }
  }

  async reset(editor) {
    this.dispose();
    this.activeEditor = editor;
    this.lineInfo = null;
    const info = await this.fetchDecoration(editor.getPath());
    if (!info) {
      return;
    }
    this.lineInfo = info;
  }

  async fetchDecoration(filename) {
    try {
      const resp = await KiteAPI.getLineDecoration(filename);
      if (resp && !resp.err) {
        return {
          inlineMessage: resp.inline_message,
          hoverMessage: resp.hover_message,
          projectReady: resp.project_ready,
        };
      }
    } catch (e) {
      // pass
    }
    return null;
  }
};

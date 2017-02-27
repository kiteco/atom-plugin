'use strict';

const {Range} = require('atom');
const {head, screenPositionForMouseEvent, screenPositionForPixelPosition} = require('./utils');

class TokensList {
  constructor(editor, tokens = []) {
    this.editor = editor;
    this.buffer = editor.getBuffer();
    this.editorElement = atom.views.getView(editor);
    this.setTokens(tokens);
  }

  dispose() {
    delete this.editor;
    delete this.buffer;
    delete this.editorElement;
    delete this.tokens;
  }

  setTokens(tokens) {
    this.tokens = tokens;
  }

  tokenAtPosition(position) {
    const pos = this.buffer.characterIndexForPosition(position);
    return this.tokens
      ? head(this.tokens.filter(token => pos >= token.begin_bytes &&
                                         pos <= token.end_bytes))
      : null;
  }

  tokenAtRange(range) {
    let {start, end} = Range.fromObject(range);
    start = this.buffer.characterIndexForPosition(start);
    end = this.buffer.characterIndexForPosition(end);
    return this.tokens
      ? head(this.tokens.filter(token => token.begin_bytes === start &&
                                         token.end_bytes === end))
      : null;
  }

  tokenAtScreenPosition(position) {
    const bufferPosition = this.editor.bufferPositionForScreenPosition(position);

    return this.tokenAtPosition(bufferPosition);
  }

  tokenAtPixelPosition(position) {
    const screenPosition = screenPositionForPixelPosition(position);

    return this.tokenAtScreenPosition(screenPosition);
  }

  tokenForMouseEvent(event) {
    if (!event) { return null; }

    const position = screenPositionForMouseEvent(this.editorElement, event);

    if (!position) { return null; }

    const line = this.editor.displayLayer.getScreenLines()[position.row];

    if (!line || position.column >= line.lineText.length) { return null; }

    return this.tokenAtScreenPosition(position);
  }
}

module.exports = TokensList;

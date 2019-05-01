'use strict';

const KiteAPI = require('kite-api');
const KiteConnect = require('kite-connector');
const metrics = require('./metrics');
const {escapeHTML} = require('./highlighter');
const {appendCompletionsFooter, symbolTypeString, completionRightLabel, kindLabel} = require('./kite-data-utils');

const pendingStatusRequestByEditor = {};

const DataLoader = {
  isEditorAuthorized(editor) {
    return KiteAPI.isPathWhitelisted(editor.getPath());
  },

  getSupportedLanguages() {
    return KiteAPI.getSupportedLanguages();
  },

  getPlugins() {
    return KiteAPI.requestJSON({
      path: '/clientapi/plugins',
    });
  },

  getStatus(editor) {
    if (!editor) { return Promise.resolve({status: 'ready'}); }

    const filepath = editor.getPath();

    if (pendingStatusRequestByEditor[filepath]) {
      return pendingStatusRequestByEditor[filepath];
    }

    return pendingStatusRequestByEditor[filepath] = KiteAPI.getStatus(editor.getPath())
    .then(res => {
      delete pendingStatusRequestByEditor[filepath];
      return res;
    });
  },

  getCompletionsAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);

    return KiteAPI.getCompletionsAtPosition(editor.getPath(), text, cursorPosition, 'atom')
    .then(completions => {
      return completions.map((c) => {
        const completion = {
          text: c.insert || c.display,
          displayText: c.display,
          className: 'kite-completion',
        };
        if (c.symbol) {
          completion.type = symbolTypeString(c.symbol);
          completion.rightLabelHTML = kindLabel(c.hint);
        } else {
          completion.type = c.hint;
          completion.rightLabelHTML = kindLabel(c.hint);
        }
        if (c.documentation_text) {
          completion.descriptionHTML = appendCompletionsFooter(c, escapeHTML(c.documentation_text));
          completion.description = c.documentation_text;
        }
        return completion;
      });
    });
  },

  getSnippetCompletionsAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getSnippetCompletionsAtPosition(editor.getPath(), text, 'atom', cursorPosition)
    .then(completions => {
      var parsedCompletions = [];
      completions.forEach(function(c) {
        parsedCompletions.push(DataLoader.parseCompletion(editor, c, ''));
        if (c.children) {
          c.children.forEach(function(child) {
            parsedCompletions.push(DataLoader.parseCompletion(editor, child, '...'));
          });
        }
      });
      return parsedCompletions;
    });
  },

  parseCompletion(editor, c, displayPrefix) {
    const completion = {
      text: c.snippet.text,
      displayText: displayPrefix + c.display,
      className: 'kite-completion',
    };
    if (c.replace) {
      // completion.replacementRange = [
      //   editor.getBuffer().positionForCharacterIndex(c.replace.begin),
      //   editor.getBuffer().positionForCharacterIndex(c.replace.end),
      // ];
      completion.replacementRange = {
        begin: editor.getBuffer().positionForCharacterIndex(c.replace.begin),
        end: editor.getBuffer().positionForCharacterIndex(c.replace.end),
      };
    }
    if (c.snippet.placeholders.length > 0) {
      var snippetStr = c.snippet.text;
      var offset = 0;
      for (let i = 0; i < c.snippet.placeholders.length; i++) {
        let placeholder = c.snippet.placeholders[i];
        placeholder.begin += offset;
        placeholder.end += offset;
        snippetStr = snippetStr.slice(0, placeholder.begin)
        + '${' + (i + 1).toString() + ':' + snippetStr.slice(placeholder.begin, placeholder.end) 
        + '}' + snippetStr.slice(placeholder.end);
        offset += 5;
      }
      completion.snippet = snippetStr;
    }
    completion.type = c.hint;
    completion.rightLabelHTML = kindLabel(c.hint);
    if (c.documentation.text) {
      completion.descriptionHTML = appendCompletionsFooter(c, escapeHTML(c.documentation.text));
      completion.description = c.documentation.text;
    }
    return completion;
  },

  getSignaturesAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getSignaturesAtPosition(editor.getPath(), text, cursorPosition, 'atom');
  },

  getHoverDataAtRange(editor, range) {
    throw new Error('deprecated');
  },

  getHoverDataAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getHoverDataAtPosition(editor.getPath(), text, cursorPosition, 'atom');
  },

  getReportDataAtRange(editor, range) {
    throw new Error('deprecated');
  },

  getReportDataAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);

    return KiteAPI.getReportDataAtPosition(editor.getPath(), text, cursorPosition, 'atom');
  },

  getValueReportDataForId(id) {
    return KiteAPI.getValueReportDataForId(id);
  },

  getSymbolReportDataForId(id) {
    return KiteAPI.getSymbolReportDataForId(id);
  },

  getMembersDataForId(id) {
    return KiteAPI.getMembersDataForId(id);
  },

  getUsagesDataForValueId(id, page, limit) {
    return KiteAPI.getUsagesDataForValueId(id);
  },

  getUsageDataForId(id) {
    return KiteAPI.getUsageDataForId(id);
  },

  getExampleDataForId(id) {
    return KiteAPI.getExampleDataForId(id);
  },

  getUserAccountInfo() {
    return KiteAPI.getUserAccountInfo();
  },

  isUserAuthenticated() {
    return KiteConnect.client.request({
      path: '/clientapi/user',
      method: 'GET',
    })
    .then((resp) => resp.statusCode !== 401);
  },
};

module.exports = DataLoader;

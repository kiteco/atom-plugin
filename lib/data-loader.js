'use strict';

const KiteAPI = require('kite-api');
const KiteConnect = require('kite-connector');
const { parseSnippetCompletion } = require('./kite-data-utils');

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
    if (!editor) { return Promise.resolve({ status: 'ready' }); }

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

  getCompletions(editor, yesSnippets, maxFileSize) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const ranges = editor.getSelectedBufferRanges();
    if (ranges.length !== 1 || text.length > maxFileSize) {
      return Promise.resolve([]);
    }
    const begin = buffer.characterIndexForPosition(ranges[0].start);
    const end = buffer.characterIndexForPosition(ranges[0].end);
    return KiteAPI.getCompletions({
      text,
      editor: 'atom',
      filename: editor.getPath(),
      position: {
        begin,
        end,
      },
      offset_encoding: 'utf-16',
      no_snippets: !yesSnippets,
    }).then(completions => {
      var parsedCompletions = [];
      completions.forEach(c => {
        parsedCompletions.push(parseSnippetCompletion(editor, c, ''));
        if (c.children) {
          c.children.forEach(child => {
            parsedCompletions.push(parseSnippetCompletion(editor, child, String.fromCharCode(0x00A0).repeat(2)));
          });
        }
      });
      return parsedCompletions;
    });
  },

  getKSGCompletions(query) {
    return KiteAPI.getKSGCompletions(query);
  },

  getKSGCodeBlocks(query) {
    // we desire 3 results
    return KiteAPI.getKSGCodeBlocks(query, 3);
  },

  getSignaturesAtPosition(editor, position, maxFileSize) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    if (text.length > maxFileSize) {
      return Promise.resolve();
    }
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getSignaturesAtPosition(editor.getPath(), text, cursorPosition, 'atom', 'utf-16');
  },

  getHoverDataAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getHoverDataAtPosition(editor.getPath(), text, cursorPosition, 'atom', 'utf-16');
  },

  getReportDataAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);

    return KiteAPI.getReportDataAtPosition(editor.getPath(), text, cursorPosition, 'atom', 'utf-16');
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

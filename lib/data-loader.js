'use strict';

const {
  internalExpandURL,
  openDocumentationInWebURL,
} = require('./urls');
const {head} = require('./utils');
const KiteAPI = require('kite-api');
const {symbolId} = require('./kite-data-utils');
const metrics = require('./metrics');

const pendingStatusRequestByEditor = {};

const DataLoader = {
  isEditorAuthorized(editor) {
    return KiteAPI.isPathWhitelisted(editor.getPath());
  },

  getSupportedLanguages() {
    return KiteAPI.getSupportedLanguages();
  },

  shouldOfferWhitelist(editor) {
    return KiteAPI.shouldOfferWhitelist(editor.getPath());
  },

  projectDirForEditor(editor) {
    return KiteAPI.projectDirForFile(editor.getPath());
  },

  postSaveValidationData(editor) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();

    return KiteAPI.postSaveValidationData(editor.getPath(), text, this.getAutocorrectMetadata());
  },

  postAutocorrectHashMismatchData(response, requestStartTime) {
    return KiteAPI.postAutocorrectHashMismatchData(response, requestStartTime, this.getAutocorrectMetadata());
  },

  postAutocorrectFeedbackData(response, feedback) {
    return KiteAPI.postAutocorrectFeedbackData(response, feedback, this.getAutocorrectMetadata());
  },

  shouldNotify(editor) {
    return KiteAPI.shouldNotify(editor.getPath());
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
        return {
          text: c.insert || c.display,
          displayText: c.display,
          type: c.hint,
          rightLabel: c.hint,
          description: c.documentation_text,
          descriptionHTML: this.appendCompletionsFooter(c,
            c.documentation_html !== ''
              ? c.documentation_html
              : c.documentation_text),
        };
      });
    });
  },

  appendCompletionsFooter(completion, descriptionHTML) {
    const id = completion.symbol && completion.symbol.value &&
        completion.symbol.value[0] && completion.symbol.value[0].id;
    const actions = id
      ? `<a href="${openDocumentationInWebURL(id)}">Web</a>
         <a href="${internalExpandURL(id)}">More</a>`
      : '';

    return `
    <div class="kite-completions">
      <div class="kite-completion-description">${descriptionHTML}</div>
      <div class="kite-completion-footer">
        <kite-links class="one-line" metric="Suggestion">
          ${actions}
          <div class="flex-separator"></div>
          <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
        </kite-links>
      </div>
    </div>`;
  },

  getSignaturesAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();
    const cursorPosition = buffer.characterIndexForPosition(position);
    return KiteAPI.getSignaturesAtPosition(editor.getPath(), text, cursorPosition, 'atom');
  },

  getAutocorrectData(editor) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();

    return KiteAPI.getAutocorrectData(editor.getPath(), text, this.getAutocorrectMetadata());
  },

  getAutocorrectModelInfo(version) {
    return KiteAPI.getAutocorrectModelInfo(version, this.getAutocorrectMetadata());
  },

  getAutocorrectMetadata() {
    return {
      source: 'atom',
      plugin_version: metrics.version,
    };
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

  openInWebAtPosition(editor, position) {
    metrics.featureRequested('open_in_web');
    return this.getHoverDataAtPosition(editor, position)
    .then(data => {
      this.openInWebForId(symbolId(head(data.symbol)));
      metrics.featureFulfilled('open_in_web');
    });
  },

  openInWebAtRange(editor, range) {
    metrics.featureRequested('open_in_web');
    return this.getHoverDataAtRange(editor, range)
    .then(data => {
      this.openInWebForId(symbolId(head(data.symbol)));
      metrics.featureFulfilled('open_in_web');
    });
  },

  openInWebForId(id) {
    atom.applicationDelegate.openExternal(openDocumentationInWebURL(id));
  },
};

module.exports = DataLoader;

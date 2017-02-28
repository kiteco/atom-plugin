'use strict';

const {StateController, Logger} = require('kite-installer');
const {
  examplePath,
  hoverPath,
  membersPath,
  openDocumentationInWebURL,
  tokensPath,
  usagePath,
  usagesPath,
  valueReportPath,
  signaturePath,
  completionsPath,
} = require('./urls');
const {promisifyRequest, promisifyReadResponse, head, parseJSON} = require('./utils');

const {MAX_FILE_SIZE} = require('./constants');
const {symbolId} = require('./kite-data-utils');
const VirtualCursor = require('./virtual-cursor');

const DataLoader = {
  getCompletionsAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting completions');
      return Promise.resolve([]);
    }

    const cursorPosition = buffer.characterIndexForPosition(position);
    const payload = {
      text,
      editor: 'atom',
      filename: editor.getPath(),
      cursor: cursorPosition,
      localtoken: StateController.client.LOCAL_TOKEN,
    };

    return promisifyRequest(StateController.client.request({
      path: completionsPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode === 404) {
        // This means we had no completions for this cursor position.
        // Do not call reject() because that will generate an error
        // in the console and lock autocomplete-plus
        return [];
      } else if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => {
      data = parseJSON(data, {});
      data.completions = data.completions || [];

      return data.completions.map((c) => ({
        text: c.display,
        type: c.hint,
        rightLabel: c.hint,
        description: c.documentation_text || '',
      }));
    })
    .catch(err => []);
  },

  getSignaturesAtPosition(editor, position) {
    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting signatures');
      return Promise.resolve([]);
    }

    const cursorPosition = buffer.characterIndexForPosition(position);
    const payload = {
      text,
      editor: 'atom',
      filename: editor.getPath(),
      cursor: cursorPosition,
    };

    return promisifyRequest(StateController.client.request({
      path: signaturePath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode === 404) {
        // This means we had no completions for this cursor position.
        // Do not call reject() because that will generate an error
        // in the console and lock autocomplete-plus
        return null;
      } else if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => {
      data = parseJSON(data, {});
      console.log(data);
      return data;
    })
    .catch(err => console.error(err));
  },

  getTokensForEditor(editor) {
    const path = tokensPath(editor);
    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        throw new Error(`${resp.statusCode} status at ${path}`);
      }
      return promisifyReadResponse(resp);
    })
    .then(data => parseJSON(data));
  },

  getHoverDataAtRange(editor, range) {
    const path = hoverPath(editor, range);
    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        throw new Error(`${resp.statusCode} status at ${path}`);
      }
      return promisifyReadResponse(resp);
    })
    .then(data => parseJSON(data));
  },

  getReportDataAtRange(editor, range) {
    return this.getHoverDataAtRange(editor, range)
    .then(data => this.getReportDataFromHover(data));
  },

  getReportDataFromHover(data) {
    const id = head(head(data.symbol).value).id;
    return id && id !== ''
      ? this.getValueReportDataForId(id)
        .then(report => [data, report])
        .catch(err => [data])
      : [data];
  },

  getValueReportDataForId(id) {
    const path = valueReportPath(id);

    // this.getUsagesDataForValueId(id, 0, 10).then(data => console.log(data)).catch(err => console.error(err));

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report))
      .then(report => {
        if (report.value && report.value.id === '') { report.value.id = id; }
        return report;
      });
  },

  getMembersDataForId(id) {
    const path = membersPath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getUsagesDataForValueId(id, page, limit) {
    const path = usagesPath(id, page, limit);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getUsageDataForId(id) {
    const path = usagePath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report))
      .then(report => {
        if (report.value && report.value.id === '') { report.value.id = id; }
        return report;
      });
  },

  getExampleDataForId(id) {
    const path = examplePath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  openInWebAtPosition(editor, position) {
    const cursor = new VirtualCursor(editor, position);
    const range = cursor.getCurrentWordBufferRange({
      includeNonWordCharacters: false,
    });

    return this.openInWebAtRange(editor, range);
  },

  openInWebAtRange(editor, range) {
    return StateController.isPathWhitelisted(editor.getPath())
    .then(() => this.getHoverDataAtRange(editor, range))
    .then(data => {
      this.openInWebForId(symbolId(head(data.symbol)));
    });
  },

  openInWebForId(id) {
    atom.applicationDelegate.openExternal(openDocumentationInWebURL(id));
  },
};

module.exports = DataLoader;

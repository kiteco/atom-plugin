'use strict';

const http = require('http');
const metrics = require('./metrics.js');
const {MAX_FILE_SIZE} = require('./constants');

// called to handle attribute completions
function getSuggestions(params) {
  if (!atom.config.get('kite.enableCompletions', false)) {
    return [];
  }
  return new Promise(function(resolve, reject) {
    var buffer = params.editor.getBuffer();
    var text = buffer.getText();
    // The TextBuffer class already provides position->char index conversion
    // with regard for unicode's surrogate pairs
    var cursor = buffer.characterIndexForPosition(params.bufferPosition);
    var payload = {
      'filename': params.editor.getPath(),
      'text': text,
      'cursor': cursor,
    };

    // don't send content over 1mb
    if (payload.text.length > MAX_FILE_SIZE) {
      reject('buffer contents too large, not attempting completions');
      return;
    }

    var callback = function(response) {
      var str = '';
      response.on('data', function(chunk) {
        str += chunk;
      });

      response.on('end', function() {
        if (response.statusCode == 404) {
          // This means we had no completions for this cursor position. Do not call
          // reject() because that will generate an error in the console.
          resolve([]);
          return;
        } else if (response.statusCode != 200) {
          reject('error from kited: ' + str);
          return;
        }

        try {
          var resp = JSON.parse(str);
        } catch (ex) {
          reject('error parsing response from kited: ' + ex);
          return;
        }

        try {
          var suggestions = [];
          for (var i = 0; i < resp.completions.length; i++) {
            var c = resp.completions[i];
            suggestions.push({
              text: c.display,
              type: c.hint,
              rightLabel: c.hint,
              description: c.documentation_text || '',
            });
          }
          resolve(suggestions);
        } catch (ex) {
          reject('error processing completions from kited: ' + ex);
          return;
        }
      });
    };

    var options = {
      host: '127.0.0.1',
      port: '46624',
      path: '/clientapi/editor/completions',
      method: 'POST',
    };

    var req = http.request(options, callback);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function onDidInsertSuggestion(ev) {
  // ev has three fields: editor, triggerPosition, suggestion
  metrics.track('completion used', {
    text: ev.suggestion.text,
  });
}

module.exports = {
  selector: '.source.python',
  disableForSelector: '.source.python .comment, .source.python .string',
  inclusionPriority: 5,
  suggestionPriority: 5,
  excludeLowerPriority: false,
  getSuggestions: getSuggestions,
  onDidInsertSuggestion: onDidInsertSuggestion,
};

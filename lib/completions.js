'use strict';

const DataLoader = require('./data-loader');
const Plan = require('./plan');
const {delayPromise} = require('./utils');
let Kite;

const KiteProvider = {
  selector: '.source.python, .source.js',
  disableForSelector: [
    '.source.python .comment',
    '.source.python .string',
    '.source.js .comment',
    '.source.js .string',
  ].join(', '),
  inclusionPriority: 5,
  suggestionPriority: 5,
  excludeLowerPriority: false,

  // called to handle attribute completions
  getSuggestions(params) {
    if (!Kite) { Kite = require('./kite'); }

    // console.log('suggestions requested',
    //   Kite.isEditorWhitelisted(params.editor),
    //   Kite.app.isGrammarSupported(params.editor));
    return Kite.isEditorWhitelisted(params.editor) && Kite.app.isGrammarSupported(params.editor)
      ? delayPromise(() => {
        let promise = Plan.queryPlan();

        if (!atom.config.get('kite.enableCompletions', false)) {
          return promise.then(() => []);
        }

        return promise.then(() =>
        DataLoader.getCompletionsAtPosition(params.editor, params.editor.getCursorBufferPosition()))
        .then(suggestions =>
          // For Atom < 1.23.3, a weird bug happen when we're completing after a space.
          // In that case we just remove the replacementPrefix that is by default set
          // to the provided prefix
          params.prefix === ' '
            ? suggestions.map(s => {s.replacementPrefix = ''; return s;})
            : suggestions
        )
        .then(suggestions => {
          suggestions.forEach(s => {
            // in the case the suggestion text matches the completion prefix
            // it seems atom will set an empty replacementPrefix, making the completed
            // text appear twice as the typed text is not removed.
            // FWIW most providers seems to not provide anything in the case the prefix
            // matches a single completion whose text equals the prefix
            if (!s.replacementPrefix && params.prefix === s.text) {
              s.replacementPrefix = s.text;
            }
          });
          return suggestions;
        });
      }, 0)
      : Promise.resolve();
  },

};

module.exports = KiteProvider;

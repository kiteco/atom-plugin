'use strict';

const fs = require('fs');
const path = require('path');
const { withKite, withKiteRoutes } = require('kite-api/test/helpers/kite');
const { fakeResponse } = require('kite-api/test/helpers/http');
const completions = require('../lib/completions');

const projectPath = path.join(__dirname, 'fixtures');
let Kite;

describe('signature + completion', () => {
  let workspaceElement, jasmineContent, editor, editorView, completionList;

  beforeEach(() => {
    jasmine.useRealClock();

    atom.config.set('core.useTreeSitterParsers', false);

    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);

    jasmineContent.appendChild(workspaceElement);

    waitsForPromise('package activation', () => atom.packages.activatePackage('language-python'));
    delete completions.signaturePanel;
    delete completions.suggestionListElement;
  });

  withKite({ reachable: true }, () => {
    withKiteRoutes([[
      o => o.path === '/clientapi/editor/signatures',
      o => fakeResponse(200, String(fs.readFileSync(path.join(projectPath, 'dumps-signature.json')))),
    ],
    ]);

    beforeEach(() => {
      waitsForPromise('package activation', () =>
        atom.packages.activatePackage('kite').then(pkg => {
          Kite = pkg.mainModule;

          spyOn(completions, 'loadSignature').andCallThrough();
          spyOn(completions, 'clearSignature').andCallThrough();
        }));

      waitsForPromise('open editor', () =>
        atom.workspace.open(path.join(projectPath, 'json.py')).then(e => {
          editor = e;
          editorView = atom.views.getView(editor);
        }));

      waitsFor('kite editor', () =>
        Kite.getModule('editors').kiteEditorForEditor(editor));

      runs(() => {
        editor.setCursorBufferPosition([2, Number.POSITIVE_INFINITY]);
        editor.insertText('f');
      });

      waitsFor('autocomplete panel', () => completionList = editorView.querySelector('autocomplete-suggestion-list'));

    });

    describe('validating the suggestion', () => {
      beforeEach(() => {
        expect(completionList).not.toBeNull();

        waitsFor('load signature call', () => completions.loadSignature.callCount > 0);
        waitsFor('no clear sig call', () => completions.clearSignature.callCount === 0);
        waitsFor('first signature display', () => completionList.querySelector('kite-signature'));

        runs(() => {
          atom.commands.dispatch(editorView, 'autocomplete-plus:confirm');
        });
      });

      it('inserts the suggestion but leave the signature visible', () => {
        const list = editorView.querySelector('autocomplete-suggestion-list');
        expect(list).not.toBeNull();

        waitsFor('second signature display', () => list.querySelector('kite-signature'));

        waitsFor('empty list', () => list.querySelectorAll('li').length === 0);
      });
    });
  });
});

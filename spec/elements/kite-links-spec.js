'use strict';

const os = require('os');
const path = require('path');
const {click} = require('../helpers/events');
const KiteLinks = require('../../lib/elements/kite-links');
const {withKite, withKitePaths} = require('kite-api/test/helpers/kite');

const projectPath = path.join(__dirname, 'fixtures');

describe('KiteLinks', () => {
  let links, editor, kiteEditor, Kite, jasmineContent;

  beforeEach(() => {
    jasmineContent = document.querySelector('#jasmine-content');
  });
  withKite({logged: true}, () => {
    withKitePaths({
      whitelist: [projectPath],
    }, undefined, () => {
      beforeEach(() => {
        links = new KiteLinks();
        jasmineContent.appendChild(links);

        waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
          Kite = pkg.mainModule;
        }));
        waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
          editor = e;
          Kite.subscribeToEditor(e);
        }));
        waitsFor(() => kiteEditor = Kite.kiteEditorForEditor(editor));
      });

      describe('for internal goto urls', () => {
        beforeEach(() => {
          spyOn(os, 'platform').andCallFake(() => 'win32');
          spyOn(kiteEditor, 'openDefinition').andCallFake(() => Promise.resolve());
          links.innerHTML = '<a href="kite-atom-internal://goto/C:%5Cpath%5Cto%5Cfile.py:123:45">link</a>';
          click(links.querySelector('a'));
        });

        it('decodes the file path in the url and calls the openDefinition function', () => {
          expect(kiteEditor.openDefinition).toHaveBeenCalledWith({
            filename: 'C:\\path\\to\\file.py',
            line: 123,
            column: 45,
          });
        });
      });
    });
  });
});

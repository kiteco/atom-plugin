'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const KiteApp = require('../lib/kite-app');
const OverlayManager = require('../lib/overlay-manager');
const {hoverPath} = require('../lib/urls');
const {
  withKiteWhitelistedPaths, withRoutes, fakeResponse,
} = require('./spec-helpers');

const projectPath = path.join(__dirname, 'fixtures');

// By enabling this constant, it's possible to visually debug a test.
// It should only be used when a single test is focused as it will make every
// test last for one minute before completing.
// During that time the atom's workspace will be visible in the test. After that
// the normal test cleanup occurs and the workspace will be cleaned of all its
// content.
const VISUAL_DEBUG = false;
let jasmineContent;

describe('OverlayManager', () => {
  let editor, editorElement, showSpy, dismissSpy, app;

  const editorQuery = (selector) => editorElement.querySelector(selector);

  const editorQueryAll = (selector) => editorElement.querySelectorAll(selector);

  beforeEach(() => {
    app = new KiteApp();
    showSpy = jasmine.createSpy();
    dismissSpy = jasmine.createSpy();
    jasmineContent = !VISUAL_DEBUG
      ? document.body.querySelector('#jasmine-content')
      : document.body;

    const styleNode = document.createElement('style');
    styleNode.textContent = !VISUAL_DEBUG
      ? ''
      : `
        atom-workspace {
          z-index: 100000;
          position: relative;
        }
      `;

    OverlayManager.hoverDefault = {
      show: 50,
      hide: 0,
    };

    jasmineContent.appendChild(styleNode);
    jasmineContent.appendChild(atom.views.getView(atom.workspace));

    jasmine.useRealClock();
    waitsForPromise(() => atom.packages.activatePackage('language-python'));
    waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
      editor = e;
      editorElement = atom.views.getView(editor);
    }));
  });

  afterEach(() => {
    if (VISUAL_DEBUG) {
      let done = false;
      setTimeout(() => done = true, 59500);
      waitsFor('nothing', 60000, () => done);
    }
  });

  withKiteWhitelistedPaths([projectPath], () => {
    beforeEach(() => {
      waitsForPromise(() => atom.packages.activatePackage('kite'));
      waitsForPromise(() => app.connect());
    });

    describe('.showHoverAtPosition()', () => {
      beforeEach(() => {
        OverlayManager.onDidShowHover(showSpy);
        OverlayManager.onDidDismiss(dismissSpy);
      });

      describe('when the position matches a word', () => {
        it('triggers a request for the editor at the given position', () => {
          waitsForPromise(() => OverlayManager.showHoverAtPosition(editor, [2, 8]).then(() => {
            expect(http.request.mostRecentCall.args[0].path)
            .toEqual(hoverPath(editor, [[2, 4], [2, 9]]));
          }));
        });
      });

      describe('when the position does not match a word', () => {
        it('does not triggers a request', () => {
          OverlayManager.showHoverAtPosition(editor, [1, 0]);

          expect(http.request.mostRecentCall.args[0].path)
          .not.toEqual(hoverPath(editor, [[1, 0], [1, 0]]));
        });
      });

      describe('when the position match the position of a token', () => {
        let hover;

        withRoutes([
          [
            o => /^\/api\/buffer\/atom/.test(o.path),
            o => fakeResponse(200, fs.readFileSync(path.resolve(__dirname, 'fixtures/hello.json'))),
          ],
        ]);

        beforeEach(() => {
          waitsForPromise(() =>
            OverlayManager.showHoverAtPosition(editor, [2, 8]));
          runs(() => hover = editorQuery('kite-hover'));
        });

        it('displays an overlay decoration with the results from the API', () => {
          expect(hover).toExist();
          expect(hover.querySelector('.name').textContent.trim().replace(/\s+/, ' ')).toEqual('hello()');

          expect(showSpy).toHaveBeenCalled();
        });

        describe('querying the same range again', () => {
          beforeEach(() => {
            waitsForPromise(() =>
              OverlayManager.showHoverAtPosition(editor, [2, 7]));
          });

          it('leaves the previous decoration in place', () => {
            const newHover = editorQuery('kite-hover');
            expect(newHover).toBe(hover);
          });

        });

        describe('querying a different range', () => {
          beforeEach(() => {
            waitsForPromise(() =>
              OverlayManager.showHoverAtPosition(editor, [0, 1]));
          });

          it('destroys the previous decoration and creates a new one', () => {
            expect(editorQueryAll('kite-hover').length).toEqual(1);
            expect(dismissSpy).toHaveBeenCalled();

            const newHover = editorQuery('kite-hover');
            expect(newHover).not.toBe(hover);
          });
        });
      });

      describe('when the position does not match the position of a token', () => {
        beforeEach(() => {
          waitsForPromise(() =>
            OverlayManager.showHoverAtPosition(editor, [2, 8]));
        });

        it('does not displays an overlay decoration', () => {
          const hover = editorQuery('kite-hover');
          expect(hover).not.toExist();
        });
      });
    });

    xdescribe('.showExpandAtPosition()', () => {
      beforeEach(() => {
        OverlayManager.onDidShowExpand(showSpy);
        OverlayManager.onDidDismiss(dismissSpy);
      });
      describe('when the position matches a word', () => {
        it('triggers a request for the editor at the given position', () => {
          waitsForPromise(() => OverlayManager.showExpandAtPosition(editor, [2, 8]).then(() => {
            expect(http.request.mostRecentCall.args[0].path)
            .toEqual(hoverPath(editor, [[2, 4], [2, 9]]));
          }));
        });
      });

      describe('when the position does not match a word', () => {
        it('does not triggers a request', () => {
          OverlayManager.showExpandAtPosition(editor, [1, 0]);

          expect(http.request.mostRecentCall.args[0].path)
          .not.toEqual(hoverPath(editor, [[1, 0], [1, 0]]));

          expect(showSpy).not.toHaveBeenCalled();
        });
      });

      describe('when the position match the position of a token', () => {
        let expand;

        withRoutes([
          [
            o => /^\/api\/buffer\/atom/.test(o.path),
            o => fakeResponse(200, fs.readFileSync(path.resolve(__dirname, 'fixtures/hello.json'))),
          ], [
            o => /^\/clientapi\/atom\/value/.test(o.path),
            o => fakeResponse(200, '{}'),
          ],
        ]);

        beforeEach(() => {
          waitsForPromise(() =>
            OverlayManager.showExpandAtPosition(editor, [2, 8]));
          runs(() => expand = editorQuery('kite-expand'));
        });

        it('displays an overlay decoration with the results from the API', () => {
          expect(expand).toExist();
          expect(showSpy).toHaveBeenCalled();
        });

        describe('querying the same range again', () => {
          beforeEach(() => {
            waitsForPromise(() =>
              OverlayManager.showExpandAtPosition(editor, [2, 7]));
          });

          it('leaves the previous decoration in place', () => {
            const newExpand = editorQuery('kite-expand');
            expect(newExpand).toBe(expand);
          });

        });

        describe('querying a different range', () => {
          beforeEach(() => {
            waitsForPromise(() =>
              OverlayManager.showExpandAtPosition(editor, [0, 1]));
          });

          it('destroys the previous decoration and creates a new one', () => {
            expect(editorQueryAll('kite-expand').length).toEqual(1);
            expect(dismissSpy).toHaveBeenCalled();

            const newExpand = editorQuery('kite-expand');
            expect(newExpand).not.toBe(expand);
          });
        });
      });

      describe('when the position does not match the position of a token', () => {
        beforeEach(() => {
          waitsForPromise(() =>
            OverlayManager.showExpandAtPosition(editor, [2, 8]));
        });

        it('does not displays an overlay decoration', () => {
          const expand = editorQuery('kite-expand');
          expect(expand).not.toExist();
        });
      });
    });
  });
});

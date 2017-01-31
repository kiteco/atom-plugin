'use strict';

const http = require('http');
const EditorEvents = require('../lib/editor-events');
const {withFakeServer, fakeResponse} = require('./spec-helpers');

describe('EditorEvents', () => {
  let editor, events;

  withFakeServer([
    [
      o => /\/clientapi\/editor\/event/.test(o.path),
      o => fakeResponse(200),
    ], [
      o => /\/clientapi\/editor\/error/.test(o.path),
      o => fakeResponse(200),
    ],
  ], () => {
    describe('when attached to an editor', () => {
      beforeEach(() => {
        waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
          editor = e;
          events = new EditorEvents(editor);
        }));
      });

      afterEach(() => {
        events.dispose();
      });

      describe('when an edit is made', () => {
        it('foo', () => {
          editor.moveLineDown();

          advanceClock(10);

          expect(http.request).toHaveBeenCalled();
          expect(http.request.callCount).toEqual(1);
        });
      });
    });
  });
});

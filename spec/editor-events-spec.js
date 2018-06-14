'use strict';

const {StateController} = require('kite-installer');
const {withKite, withKiteRoutes} = require('kite-api/test/helpers/kite');
const {fakeResponse} = require('kite-api/test/helpers/http');

const EditorEvents = require('../lib/editor-events');

describe('EditorEvents', () => {
  let editor, events;

  beforeEach(() => {
    spyOn(StateController.client, 'request').andCallThrough();
  });

  withKite({reachable: true}, () => {
    withKiteRoutes([
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

            expect(StateController.client.request).toHaveBeenCalled();
            expect(StateController.client.request.callCount).toEqual(1);
          });
        });
      });
    });
  });
});

'use strict';

const HoverGesture = require('../../lib/gestures/hover');
const TokensList = require('../../lib/tokens-list');
const {mousemove} = require('../helpers/events');

describe('HoverGesture', () => {
  let editor, editorElement, gesture, activateSpy, deactivateSpy, tokensList, jasmineContent, workspaceElement;

  beforeEach(() => {
    jasmine.useRealClock();
    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);
    jasmineContent.appendChild(workspaceElement);

    waitsForPromise(() => atom.packages.activatePackage('language-python'));
    waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
      editor = e;
      editorElement = atom.views.getView(editor);
      tokensList = new TokensList(editor, require('../fixtures/sample-tokens.json').tokens);
    }));
  });

  describe('without any modifier', () => {
    beforeEach(() => {
      activateSpy = jasmine.createSpy();
      deactivateSpy = jasmine.createSpy();
      gesture = new HoverGesture(editor, tokensList);

      gesture.onDidActivate(activateSpy);
      gesture.onDidDeactivate(deactivateSpy);
    });

    describe('when the mouse is moved', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 300, y: 5});
      });

      it('does not trigger a did-activate event', () => {
        expect(activateSpy).not.toHaveBeenCalled();
      });

      describe('above a token', () => {
        beforeEach(() => {
          mousemove(editorElement, {x: 5, y: 5});
        });

        it('triggers a did-activate event', () => {
          expect(activateSpy).toHaveBeenCalled();
        });

        describe('and moving again above the same token', () => {
          beforeEach(() => {
            mousemove(editorElement, {x: 10, y: 5});
          });

          it('does not trigger another did-activate event', () => {
            expect(activateSpy.callCount).toEqual(1);
          });
        });

        describe('then leaving the token', () => {
          beforeEach(() => {
            mousemove(editorElement, {x: 300, y: 5});
          });

          it('triggers a did-deactivate event', () => {
            expect(deactivateSpy).toHaveBeenCalled();
          });

          it('does not trigger a did-activate event twice', () => {
            expect(activateSpy.callCount).toEqual(1);
          });
        });
      });
    });
  });

  describe('with modifiers', () => {
    beforeEach(() => {
      activateSpy = jasmine.createSpy();
      gesture = new HoverGesture(editor, tokensList, {
        altKey: true,
      });

      gesture.onDidActivate(activateSpy);
    });

    describe('when the mouse is moved without modifier', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 5, y: 5});
      });

      it('does not trigger a did-activate event', (done) => {
        expect(activateSpy).not.toHaveBeenCalled();
      });
    });

    describe('when the mouse is moved with the proper modifier', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 5, y: 5, altKey: true});
      });

      it('triggers a did-activate event', (done) => {
        expect(activateSpy).toHaveBeenCalled();
      });
    });
  });
});

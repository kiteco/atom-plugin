'use strict';

const ClickGesture = require('../../lib/gestures/click');
const TokensList = require('../../lib/tokens-list');
const {click} = require('../helpers/events');

describe('ClickGesture', () => {
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
      gesture = new ClickGesture(editor, tokensList);

      gesture.onDidActivate(activateSpy);
      gesture.onDidDeactivate(deactivateSpy);
    });

    describe('when the mouse is clicked', () => {
      describe('on a token', () => {
        beforeEach(() => {
          click(editorElement, {x: 5, y: 5});
        });

        it('triggers a did-activate event', (done) => {
          expect(activateSpy).toHaveBeenCalled();
        });

        describe('and in the same token again', () => {
          beforeEach(() => {
            click(editorElement, {x: 10, y: 5});
          });

          it('does not trigger another did-activate event', (done) => {
            expect(activateSpy.callCount).toEqual(1);
          });
        });

        describe('to a place without token', () => {
          beforeEach(() => {
            click(editorElement, {x: 300, y: 5});
          });

          it('triggers a did-deactivate event', (done) => {
            expect(deactivateSpy).toHaveBeenCalled();
          });

          it('does not trigger a new did-activate event', (done) => {
            expect(activateSpy.callCount).toEqual(1);
          });
        });
      });
    });
  });

  describe('without no token check', () => {
    beforeEach(() => {
      activateSpy = jasmine.createSpy();
      gesture = new ClickGesture(editor, tokensList, {
        checkToken: false,
      });

      gesture.onDidActivate(activateSpy);
    });

    describe('when the mouse is clicked', () => {
      describe('on a token', () => {
        beforeEach(() => {
          click(editorElement, {x: 5, y: 5});
        });

        it('triggers a did-activate event', (done) => {
          expect(activateSpy).toHaveBeenCalled();
        });

        describe('and in the same token again', () => {
          beforeEach(() => {
            click(editorElement, {x: 10, y: 5});
          });

          it('triggers another did-activate event', (done) => {
            expect(activateSpy.callCount).toEqual(2);
          });
        });

        describe('to a place without token', () => {
          beforeEach(() => {
            click(editorElement, {x: 300, y: 5});
          });

          it('triggers a new did-activate event', (done) => {
            expect(activateSpy.callCount).toEqual(2);
          });
        });
      });
    });
  });

  describe('with modifiers', () => {
    beforeEach(() => {
      activateSpy = jasmine.createSpy();
      deactivateSpy = jasmine.createSpy();
      gesture = new ClickGesture(editor, tokensList, {
        altKey: true,
      });

      gesture.onDidActivate(activateSpy);
      gesture.onDidDeactivate(deactivateSpy);
    });

    describe('when the mouse is clicked without modifier', () => {
      beforeEach(() => {
        click(editorElement, {x: 5, y: 5});
      });

      it('does not trigger a did-activate event', (done) => {
        expect(activateSpy).not.toHaveBeenCalled();
      });
    });

    describe('when the mouse is clicked with the proper modifier', () => {
      beforeEach(() => {
        click(editorElement, {x: 5, y: 5, altKey: true});
      });

      it('triggers a did-activate event', (done) => {
        expect(activateSpy).toHaveBeenCalled();
      });
    });
  });
});

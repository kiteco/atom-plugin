'use strict';

const CursorMoveGesture = require('../../lib/gestures/cursor-move');
const TokensList = require('../../lib/tokens-list');

describe('CursorMoveGesture', () => {
  let editor, gesture, activateSpy, deactivateSpy, tokensList, jasmineContent, workspaceElement;

  beforeEach(() => {
    jasmine.useRealClock();
    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);
    jasmineContent.appendChild(workspaceElement);

    waitsForPromise(() => atom.packages.activatePackage('language-python'));
    waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
      editor = e;
      activateSpy = jasmine.createSpy();
      deactivateSpy = jasmine.createSpy();
      tokensList = new TokensList(editor, require('../fixtures/sample-tokens.json').tokens);
      gesture = new CursorMoveGesture(editor, tokensList);

      gesture.onDidActivate(activateSpy);
      gesture.onDidDeactivate(deactivateSpy);
    }));
  });

  describe('when moved inside a token range', () => {
    beforeEach(() => {
      editor.setCursorBufferPosition([0, 3]);
    });

    it('triggers a did-activate event', () => {
      expect(activateSpy).toHaveBeenCalled();
    });

    describe('and moved again inside the same range', () => {
      beforeEach(() => {
        editor.setCursorBufferPosition([0, 4]);
      });

      it('does not trigger another did-activate event', () => {
        expect(activateSpy.callCount).toEqual(1);
      });
    });

    describe('and moved outside a token', () => {
      beforeEach(() => {
        editor.setCursorBufferPosition([0, 13]);
      });

      it('triggers a did-deactivate event', () => {
        expect(deactivateSpy).toHaveBeenCalled();
      });

      it('does not trigger another did-activate event', () => {
        expect(activateSpy.callCount).toEqual(1);
      });
    });
  });

  describe('moved at a place where there is no token', () => {
    beforeEach(() => {
      editor.setCursorBufferPosition([0, 13]);
    });

    it('does not trigger a did-activate event', () => {
      expect(activateSpy).not.toHaveBeenCalled();
    });
  });

  describe('without a token check', () => {
    beforeEach(() => {
      gesture = new CursorMoveGesture(editor, tokensList, {
        checkToken: false,
      });

      gesture.onDidActivate(activateSpy);
    });

    describe('moved at a place where there is no token', () => {
      beforeEach(() => {
        editor.setCursorBufferPosition([0, 13]);
      });

      it('still triggers a did-activate event', () => {
        expect(activateSpy).toHaveBeenCalled();
      });
    });
  });
});

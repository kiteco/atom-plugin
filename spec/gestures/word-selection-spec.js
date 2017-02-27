'use strict';

const WordSelectionGesture = require('../../lib/gestures/word-selection');
const TokensList = require('../../lib/tokens-list');

describe('WordSelectionGesture', () => {
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
      gesture = new WordSelectionGesture(editor, tokensList);
      gesture.onDidActivate(activateSpy);
      gesture.onDidDeactivate(deactivateSpy);
    }));
  });

  describe('when a whole word is selected', () => {
    describe('and it matches a token range', () => {
      beforeEach(() => {
        editor.setSelectedBufferRange([[0, 0], [0, 8]]);
      });

      it('triggers a did-activate event', () => {
        expect(activateSpy).toHaveBeenCalled();
      });

      describe('then selecting a word that does not match a token range', () => {
        beforeEach(() => {
          editor.setSelectedBufferRange([[0, 11], [0, 13]]);
        });

        it('does not triggers another did-activate event', () => {
          expect(activateSpy.callCount).toEqual(1);
        });

        it('triggers a did-activate event', () => {
          expect(deactivateSpy).toHaveBeenCalled();
        });
      });
    });

    describe('and it does not match a token range', () => {
      beforeEach(() => {
        editor.setSelectedBufferRange([[0, 11], [0, 13]]);
      });

      it('triggers a did-activate event', () => {
        expect(activateSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('when a portion of a word is selected', () => {
    beforeEach(() => {
      editor.setSelectedBufferRange([[0, 2], [0, 5]]);
    });

    it('does not trigger a did-activate event', () => {
      expect(activateSpy).not.toHaveBeenCalled();
    });
  });

  describe('when more than a word is selected', () => {
    beforeEach(() => {
      editor.setSelectedBufferRange([[0, 0], [0, 14]]);
    });

    it('does not trigger a did-activate event', () => {
      expect(activateSpy).not.toHaveBeenCalled();
    });
  });

  describe('when several lines are selected', () => {
    beforeEach(() => {
      editor.setSelectedBufferRange([[0, 5], [2, 2]]);
    });

    it('does not trigger a did-activate event', () => {
      expect(activateSpy).not.toHaveBeenCalled();
    });
  });
});

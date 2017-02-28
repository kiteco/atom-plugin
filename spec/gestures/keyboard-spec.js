'use strict';

const KeyboardGesture = require('../../lib/gestures/keyboard');
const TokensList = require('../../lib/tokens-list');
const {keydown, keyup, mousemove} = require('../helpers/events');

describe('KeyboardGesture', () => {
  let editor, editorElement, gesture, activateSpy, tokensList, jasmineContent, workspaceElement;

  beforeEach(() => {
    jasmine.useRealClock();
    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);
    jasmineContent.appendChild(workspaceElement);

    activateSpy = jasmine.createSpy();

    waitsForPromise(() => atom.packages.activatePackage('language-python'));
    waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
      editor = e;
      editorElement = atom.views.getView(editor);
      tokensList = new TokensList(editor, require('../fixtures/sample-tokens.json').tokens);
    }));
  });

  describe('for a keydown event', () => {
    beforeEach(() => {
      gesture = new KeyboardGesture(editor, tokensList, {
        type: 'keydown',
        key: 'a',
      });
      gesture.onDidActivate(activateSpy);
    });

    describe('when the mouse is over a token', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 5, y: 5});
      });

      it('activates when the pressed key matches', () => {
        keydown(editorElement, {key: 'a'});

        expect(activateSpy).toHaveBeenCalled();
      });

      it('does not activate when the pressed key does not match', () => {
        keydown(editorElement, {key: 'a', ctrlKey: true});

        expect(activateSpy).not.toHaveBeenCalled();
      });
    });

    describe('when the mouse is not over a token', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 300, y: 5});
      });

      it('does not activate when the pressed key matches', () => {
        keydown(editorElement, {key: 'a'});

        expect(activateSpy).not.toHaveBeenCalled();
      });

      it('does not activate when the pressed key does not match', () => {
        keydown(editorElement, {key: 'a', ctrlKey: true});

        expect(activateSpy).not.toHaveBeenCalled();
      });
    });

  });

  describe('for a keyup event', () => {
    beforeEach(() => {
      gesture = new KeyboardGesture(editor, tokensList, {
        type: 'keyup',
        key: 'a',
      });
      gesture.onDidActivate(activateSpy);
    });

    describe('when the mouse is over a token', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 5, y: 5});
      });

      it('activates when the pressed key matches', () => {
        keyup(editorElement, {key: 'a'});

        expect(activateSpy).toHaveBeenCalled();
      });

      it('does not activate when the pressed key does not match', () => {
        keyup(editorElement, {key: 'a', ctrlKey: true});

        expect(activateSpy).not.toHaveBeenCalled();
      });
    });

    describe('when the mouse is not over a token', () => {
      beforeEach(() => {
        mousemove(editorElement, {x: 300, y: 5});
      });

      it('does not activate when the pressed key matches', () => {
        keyup(editorElement, {key: 'a'});

        expect(activateSpy).not.toHaveBeenCalled();
      });

      it('does not activate when the pressed key does not match', () => {
        keyup(editorElement, {key: 'a', ctrlKey: true});

        expect(activateSpy).not.toHaveBeenCalled();
      });
    });
  });
});

'use strict';

const KeyboardGesture = require('../../lib/gestures/keyboard');
const {keydown, keyup} = require('../helpers/events');

describe('KeyboardGesture', () => {
  let editor, editorElement, gesture, spy;

  beforeEach(() => {
    jasmine.useRealClock();
    spy = jasmine.createSpy();

    waitsForPromise(() => atom.packages.activatePackage('language-python'));
    waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
      editor = e;
      editorElement = atom.views.getView(editor);
    }));
  });

  describe('for a keydown event', () => {
    beforeEach(() => {
      gesture = new KeyboardGesture(editorElement, {
        type: 'keydown',
        key: 'a',
      });
      gesture.onDidActivate(spy);
    });

    it('activates when the pressed key matches', () => {
      keydown(editorElement, {key: 'a'});

      expect(spy).toHaveBeenCalled();
    });

    it('does not activate when the pressed key does not match', () => {
      keydown(editorElement, {key: 'a', ctrlKey: true});

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('for a keyup event', () => {
    beforeEach(() => {
      gesture = new KeyboardGesture(editorElement, {
        type: 'keyup',
        key: 'a',
      });
      gesture.onDidActivate(spy);
    });

    it('activates when the pressed key matches', () => {
      keyup(editorElement, {key: 'a'});

      expect(spy).toHaveBeenCalled();
    });

    it('does not activate when the pressed key does not match', () => {
      keyup(editorElement, {key: 'a', ctrlKey: true});

      expect(spy).not.toHaveBeenCalled();
    });
  });
});

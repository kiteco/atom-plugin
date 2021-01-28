'use strict';

const path = require('path');
const KiteAPI = require('kite-api');
const {withKite, withKiteRoutes} = require('kite-api/test/helpers/kite');
const {fakeResponse} = require('kite-api/test/helpers/http');
const {sleep} = require('./spec-helpers');
const {click} = require('./helpers/events');

const projectPath = path.join(__dirname, 'fixtures');

describe('Kite', () => {
  let workspaceElement, jasmineContent, notificationsPkg, kitePkg, editor;

  beforeEach(() => {
    spyOn(KiteAPI, 'request').andCallThrough();

    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);

    jasmineContent.appendChild(workspaceElement);

    waitsForPromise(() => atom.packages.activatePackage('notifications').then(pkg => {
      notificationsPkg = pkg.mainModule;
      notificationsPkg.initializeIfNotInitialized();
    }));
  });

  afterEach(() => {
    notificationsPkg.lastNotification = null;
    atom.notifications.clear();
  });

  describe('modules', () => {
    beforeEach(() => {
      waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
        kitePkg = pkg.mainModule;
      }));
    });

    describe('.registerModule()', () => {
      it('throws if the module does not respect the interface', () => {
        expect(() => kitePkg.registerModule()).toThrow();
        expect(() => kitePkg.registerModule('name')).toThrow();
        expect(() => kitePkg.registerModule('name', 'name')).toThrow();
        expect(() => kitePkg.registerModule('name', {})).toThrow();
        expect(() => kitePkg.registerModule('name', {init() {}})).toThrow();
        expect(() => kitePkg.registerModule('name', {dispose() {}})).toThrow();
        expect(() => kitePkg.registerModule('name', {
          init() {},
          dispose() {},
        })).not.toThrow();
      });

      it('throws when trying to register two modules with the same name', () => {
        kitePkg.registerModule('name', {
          init() {},
          dispose() {},
        });
        expect(() => kitePkg.registerModule('name', {
          init() {},
          dispose() {},
        })).toThrow();
      });

      it('activates modules asynchronously to avoid circular dependencies issues', () => {
        const a = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        const b = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        kitePkg.registerModule('a', a);
        kitePkg.registerModule('b', b);

        expect(a.init).not.toHaveBeenCalled();
        expect(b.init).not.toHaveBeenCalled();

        waitsFor('a.init', () => a.init.calls.length);
        runs(() => {
          expect(b.init).toHaveBeenCalled();
        });
      });

      it('disposes all plugins when it is itself being disposed of', () => {
        const a = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        const b = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        kitePkg.registerModule('a', a);
        kitePkg.registerModule('b', b);

        waitsFor('a.init', () => a.init.calls.length);
        runs(() => {
          kitePkg.deactivate();

          expect(a.dispose).toHaveBeenCalled();
          expect(b.dispose).toHaveBeenCalled();
        });
      });
    });

    describe('.getModule()', () => {
      let a, b;
      beforeEach(() => {
        a = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        b = {
          init: jasmine.createSpy(),
          dispose: jasmine.createSpy(),
        };
        waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
          kitePkg = pkg.mainModule;
          kitePkg.registerModule('a', a);
          kitePkg.registerModule('b', b);
        }));
      });

      it('returns the corresponding module or undefined', () => {
        expect(kitePkg.getModule('a')).toBe(a);
        expect(kitePkg.getModule('b')).toBe(b);
        expect(kitePkg.getModule('c')).toBeUndefined();
      });
    });
  });

  describe('when tree-sitter is enabled', () => {
    const queryNotificationSelectorAll = (notificationElement, selector) =>
      notificationElement.element
        ? notificationElement.element.querySelectorAll(selector)
        : notificationElement.querySelectorAll(selector);

    beforeEach(() => {
      atom.config.set('core.useTreeSitterParsers', true);

      atom.reload = () => undefined;

      waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
        kitePkg = pkg.mainModule;
      }));
    });

    it('notifies the user', () => {
      expect(workspaceElement.querySelector('atom-notification')).toExist();
    });

    describe('clicking on the turn off button', () => {
      it('changes the setting value', () => {
        const notificationElement = workspaceElement.querySelector('atom-notification');

        const button = queryNotificationSelectorAll(notificationElement, 'a.btn')[0];
        click(button);
        expect(atom.config.get('core.useTreeSitterParsers')).toBeFalsy();

      });
    });

  });

  withKite({running: false}, () => {
    describe('when startKiteAtStartup is disabled', () => {
      beforeEach(() => {
        atom.config.set('kite.startKiteAtStartup', false);
        spyOn(KiteAPI, 'runKiteAndWait');
        waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
          kitePkg = pkg.mainModule;
        }));
      });
      it('starts Kite on package activation', () => {
        expect(KiteAPI.runKiteAndWait).not.toHaveBeenCalled();
      });
    });
    describe('when startKiteAtStartup is enabled', () => {
      beforeEach(() => {
        atom.config.set('kite.startKiteAtStartup', true);
        spyOn(KiteAPI, 'runKiteAndWait');
        waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
          kitePkg = pkg.mainModule;
        }));
      });
      it('starts Kite on package activation', () => {
        waitsFor(() => KiteAPI.runKiteAndWait.callCount > 0);
      });
    });

  });

  withKite({reachable: true}, () => {
    describe('with the current project path in the whitelist', () => {
      describe('when activated', () => {
        describe('and there is no file open', () => {
          beforeEach(() => {
            waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
              kitePkg = pkg.mainModule;
            }));
          });

          it('does not notify the user', () => {
            expect(workspaceElement.querySelector('atom-notification')).not.toExist();
          });

          describe('opening a file without path', () => {
            beforeEach(() => {
              waitsForPromise(() => atom.workspace.open());
            });

            it('does not notify the user', () => {
              expect(workspaceElement.querySelector('atom-notification')).not.toExist();
            });

            describe('when the file is saved', () => {
              let editor;
              describe('as a supported file', () => {
                beforeEach(() => {
                  editor = atom.workspace.getActiveTextEditor();
                  spyOn(editor, 'getPath')
                  .andReturn(path.join(projectPath, 'file.py'));
                  editor.emitter.emit('did-change-path', editor.getPath());
                });

                it('does not notify the user', () => {
                  sleep(100);
                  runs(() => {
                    expect(workspaceElement.querySelector('atom-notification')).not.toExist();
                  });
                });

                it('subscribes to the editor events', () => {
                  sleep(100);
                  runs(() => {
                    const editor = atom.workspace.getActiveTextEditor();
                    expect(kitePkg.getModule('editors').hasEditorSubscription(editor)).toBeTruthy();
                  });
                });
              });

              describe('as an unsupported file', () => {
                beforeEach(() => {
                  editor = atom.workspace.getActiveTextEditor();
                  spyOn(editor, 'getPath')
                  .andReturn(path.join(projectPath, 'file.json'));
                  editor.emitter.emit('did-change-path', editor.getPath());
                });

                it('does not notify the user', () => {
                  sleep(100);
                  runs(() => {
                    expect(workspaceElement.querySelector('atom-notification')).not.toExist();
                  });
                });
              });
            });
          });
        });

        describe('and there is a supported file open', () => {
          beforeEach(() => {
            waitsForPromise(() => atom.workspace.open('sample.py').then(e => {
              editor = e;
            }));
            waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
              kitePkg = pkg.mainModule;
            }));
            runs(() => {
              const v = atom.views.getView(editor);
              v.dispatchEvent(new Event('focus'));
            });
            waitsFor('kite editor', () => kitePkg.getModule('editors').kiteEditorForEditor(editor));
            runs(() => advanceClock(200));
          });

          it('does not notify the user', () => {
            expect(workspaceElement.querySelector('atom-notification')).not.toExist();
          });

          it('subscribes to the editor events', () => {
            expect(kitePkg.getModule('editors').hasEditorSubscription(editor)).toBeTruthy();
          });

          describe('when the file path is changed', () => {
            describe('as an unsupported file', () => {
              beforeEach(() => {
                spyOn(editor, 'getPath')
                .andReturn(path.join(projectPath, 'file.json'));
                editor.emitter.emit('did-change-path', editor.getPath());
              });

              it('unsubscribes from the editor events', () => {
                sleep(100);
                runs(() => {
                  expect(kitePkg.getModule('editors').hasEditorSubscription(editor)).toBeFalsy();
                });
              });
            });
          });
        });

        describe('and there is an unsupported file open', () => {
          beforeEach(() => {
            waitsForPromise(() => atom.workspace.open('hello.json'));
            waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
              kitePkg = pkg.mainModule;
            }));
          });

          it('does not notify the user', () => {
            expect(workspaceElement.querySelector('atom-notification')).not.toExist();
          });
        });
      });
    });
  });
});

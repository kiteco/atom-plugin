'use strict';

const fs = require('fs');
const path = require('path');
const KiteAPI = require('kite-api');
const {fakeResponse} = require('kite-api/test/helpers/http');
const {withKite, withKiteRoutes, withKitePaths} = require('kite-api/test/helpers/kite');
const {click} = require('./helpers/events');
const projectPath = path.join(__dirname, 'fixtures');
const {ERROR_RESCUE_SHOW_SIDEBAR, ERROR_RESCUE_DONT_SHOW_SIDEBAR} = require('../lib/constants');

xdescribe('error rescue', () => {
  let kitePkg, kiteEditor, editor, buffer, jasmineContent, workspaceElement;

  beforeEach(() => {
    spyOn(KiteAPI, 'request').andCallThrough();

    jasmineContent = document.body.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);

    localStorage.removeItem('kite.autocorrect_model_version');

    atom.config.set('kite.actionWhenErrorRescueFixesCode', ERROR_RESCUE_DONT_SHOW_SIDEBAR);
    // Use these styles if you need to display the workspace when running the tests
    // jasmineContent.innerHTML = `
    // <style>
    //   atom-workspace {
    //     z-index: 10000000;
    //     height: 500px;
    //     opacity: 0.5;
    //   }
    // </style>`;
    jasmineContent.appendChild(workspaceElement);

    waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
      kitePkg = pkg.mainModule;
    }));
  });

  afterEach(() => {
    kitePkg && kitePkg.toggleErrorRescueSidebar(false);
    localStorage.removeItem('autocorrect_model_version');
  });

  withKite({logged: true}, () => {
    describe('with the current project path not in the whitelist', () => {
      withKitePaths({}, undefined, () => {
        describe('when activated', () => {
          describe('and there is a supported file open', () => {
            beforeEach(() => {
              waitsForPromise(() => atom.workspace.open('errored.py').then(e => {
                editor = e;
                buffer = editor.getBuffer();
                spyOn(buffer.buffer, 'save').andCallFake(() => Promise.resolve());
              }));
              waitsFor('kite editor', () => kiteEditor = kitePkg.kiteEditorForEditor(editor));
              runs(() => {
                spyOn(kiteEditor, 'willSaveHook');
              });
            });

            it('does not invoke the will-save hook', () => {
              editor.save();

              waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
              runs(() => {
                expect(kiteEditor.willSaveHook).not.toHaveBeenCalled();
              });
            });
          });
        });
      });
    });

    describe('with the current project path in the whitelist', () => {
      withKitePaths({
        whitelist: [projectPath],
      }, undefined, () => {
        withKiteRoutes([
          [
            o => /^\/clientapi\/editor\/autocorrect\/validation\/on-save$/.test(o.path),
            o => fakeResponse(200),
          ], [
            o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
            o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'autocorrect-no-fixes.json'))),
          ],
        ]);
        describe('when activated', () => {
          describe('and there is a supported file open', () => {
            beforeEach(() => {
              waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
                kitePkg = pkg.mainModule;
              }));
              waitsForPromise(() => atom.workspace.open('errored.py').then(e => {
                editor = e;
                buffer = editor.getBuffer();
                spyOn(buffer.buffer, 'save').andCallFake(() => Promise.resolve());
              }));
              waitsFor('kite editor', () => kiteEditor = kitePkg.kiteEditorForEditor(editor));
              runs(() => {
                spyOn(kiteEditor, 'willSaveHook').andCallThrough();
              });
            });

            it('does not have a clean up model version', () => {
              expect(kitePkg.errorRescueVersion()).toBeNull();
            });

            it('invokes the will-save hook', () => {
              editor.save();

              waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
              runs(() => {
                expect(kiteEditor.willSaveHook).toHaveBeenCalled();
              });
            });

            it('sends the content of the buffer over to the save and autocorrect endpoint', () => {
              editor.save();

              waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
              runs(() => {
                expect(KiteAPI.request)
                .toHaveBeenCalledWithPath('/clientapi/editor/autocorrect/validation/on-save');
                expect(KiteAPI.request)
                .toHaveBeenCalledWithPath('/clientapi/editor/autocorrect');
              });
            });

            describe('when there are no errors to fix', () => {
              it('does not change the file content', () => {
                const text = editor.getText();

                editor.save();

                waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                runs(() => {
                  expect(editor.getText()).toEqual(text);
                });
              });

              it('does not store the model version', () => {
                expect(kitePkg.errorRescueVersion()).toBeNull();
              });
            });

            describe('when there are some errors to fix and no version yet', () => {
              let sidebar, messageBox;

              withKiteRoutes([
                [
                  o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                  o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'autocorrect-with-fixes.json'))),
                ],
              ]);

              beforeEach(() => {
                editor.save();

                waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
              });

              it('changes the file content', () => {
                expect(editor.getText()).toEqual('for x in list:\n    print(x)\n');
              });

              it('stores the clean up model version', () => {
                expect(kitePkg.errorRescueVersion()).toEqual(1);
              });

              describe('saving the file again with no errors this time', () => {
                withKiteRoutes([
                  [
                    o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                    o => fakeResponse(200,
                          fs.readFileSync(
                            path.resolve(projectPath, 'autocorrect-fixed-no-fixes.json'))),
                  ],
                ]);

                beforeEach(() => {
                  editor.save();

                  waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 1);
                });

                it('does not change the file content', () => {
                  expect(editor.getText()).toEqual('for x in list:\n    print(x)\n');
                });
              });

              describe('the first run experience', () => {
                beforeEach(() => {
                  waitsFor('autocorrect sidebar', () =>
                  sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));
                  runs(() => messageBox = sidebar.querySelector('.message-box'));
                });
                it('has a message box', () => {
                  expect(messageBox).not.toBeNull();
                });

                it('displays the diffs of last fix', () => {
                  const diff = sidebar.querySelector('.diff');

                  expect(diff).not.toBeNull();

                  expect(diff.querySelector('del .line-number').textContent).toEqual('1');
                  expect(diff.querySelector('del .line').textContent).toEqual('for x in list');

                  expect(diff.querySelector('ins .line-number').textContent).toEqual('1');
                  expect(diff.querySelector('ins .line').textContent).toEqual('for x in list:');

                  expect(diff.querySelector('ins strong')).not.toBeNull();
                  expect(diff.querySelector('del strong')).not.toBeNull();
                });

                it('selects the correct option in the actions list', () => {
                  expect(sidebar.querySelector('select').value).toEqual(ERROR_RESCUE_DONT_SHOW_SIDEBAR);
                });

                it('displays the feedback buttons', () => {
                  const thumbUp = sidebar.querySelector('.diff .feedback-actions .thumb-up');
                  const thumbDown = sidebar.querySelector('.diff .feedback-actions .thumb-down');

                  expect(thumbUp).not.toBeNull();
                  expect(thumbDown).not.toBeNull();
                });

                describe('toggling on the checkbox input', () => {
                  it('deactivates the corresponding setting', () => {
                    const input = sidebar.querySelector('input');
                    input.checked = false;
                    input.dispatchEvent(new window.Event('change'));

                    expect(atom.config.get('kite.enableErrorRescue')).toBeFalsy();
                  });
                });

                describe('clicking on the feedback button', () => {
                  withKiteRoutes([
                    [
                      o => /^\/clientapi\/editor\/autocorrect\/feedback$/.test(o.path),
                      o => fakeResponse(200),
                    ],
                  ]);

                  describe('thumb up', () => {
                    beforeEach(() => {
                      const button = sidebar.querySelector('.diff .feedback-actions .thumb-up');

                      click(button);
                    });

                    it('sends a +1 request to the feedback endpoint', () => {
                      expect(KiteAPI.request).toHaveBeenCalledWithPath('/clientapi/editor/autocorrect/feedback');
                    });

                    it('adds a clicked class on the button', () => {
                      expect(sidebar.querySelector('.diff .feedback-actions .thumb-up.clicked')).toExist();
                    });
                  });

                  describe('thumb down', () => {
                    beforeEach(() => {
                      const button = sidebar.querySelector('.diff .feedback-actions .thumb-down');

                      click(button);
                    });

                    it('thumb down sends a -1 request to the feedback endpoint', () => {
                      expect(KiteAPI.request).toHaveBeenCalledWithPath('/clientapi/editor/autocorrect/feedback');
                    });

                    it('adds a clicked class on the button', () => {
                      expect(sidebar.querySelector('.diff .feedback-actions .thumb-down.clicked')).toExist();
                    });
                  });
                });

                describe('thumb up then down', () => {
                  beforeEach(() => {
                    let button = sidebar.querySelector('.diff .feedback-actions .thumb-up');

                    click(button);

                    button = sidebar.querySelector('.diff .feedback-actions .thumb-down');

                    click(button);
                  });

                  it('adds a clicked class on the thumb down button', () => {
                    expect(sidebar.querySelector('.diff .feedback-actions .thumb-down.clicked')).toExist();
                  });

                  it('removed a clicked class on the thumb up button', () => {
                    expect(sidebar.querySelector('.diff .feedback-actions .thumb-up.clicked')).toBeNull();
                  });

                });

                describe('clicking on the message box close button', () => {
                  beforeEach(() => {
                    const button = messageBox.querySelector('button');
                    click(button);
                  });

                  it('closes the message box', () => {
                    expect(sidebar.querySelector('.message-box')).toBeNull();
                  });
                });
              });

              describe('saving the file again with no errors this time', () => {
                withKiteRoutes([
                  [
                    o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                    o => fakeResponse(200,
                          fs.readFileSync(
                            path.resolve(projectPath, 'autocorrect-fixed-no-fixes.json'))),
                  ],
                ]);

                beforeEach(() => {
                  editor.save();

                  waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 1);
                });

                it('does not change the file content', () => {
                  expect(editor.getText()).toEqual('for x in list:\n    print(x)\n');
                });
              });
            });

            describe('when there are some errors to fix and already a version', () => {
              beforeEach(() => {
                localStorage.setItem('kite.autocorrect_model_version', 1);
              });

              describe('with reopen this sidebar setting', () => {
                beforeEach(() => {
                  atom.config.set('kite.actionWhenErrorRescueFixesCode', ERROR_RESCUE_SHOW_SIDEBAR);
                });

                describe('and the version does not change', () => {
                  let sidebar;

                  withKiteRoutes([
                    [
                      o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                      o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'autocorrect-with-fixes.json'))),
                    ],
                  ]);

                  beforeEach(() => {
                    editor.save();

                    waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                  });

                  it('changes the file content', () => {
                    expect(editor.getText()).toEqual('for x in list:\n    print(x)\n');
                  });

                  describe('the sidebar panel', () => {
                    beforeEach(() => {
                      waitsFor('autocorrect sidebar', () =>
                      sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));
                    });

                    it('is open again', () => {
                      expect(sidebar).not.toBeNull();
                    });

                    it('does not display any messages', () => {
                      expect(sidebar.querySelector('.messages:empty')).toExist();
                    });
                  });
                });

                describe('and the version changes', () => {
                  describe('when the sidebar is closed', () => {
                    let sidebar;

                    withKiteRoutes([
                      [
                        o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                        o => fakeResponse(200,
                          fs.readFileSync(path.resolve(projectPath, 'autocorrect-fixes-new-version.json'))),
                      ], [
                        o => /^\/api\/editor\/autocorrect\/model-info$/.test(o.path),
                        o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'model-info.json'))),
                      ],
                    ]);

                    beforeEach(() => {
                      editor.save();

                      waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                    });

                    it('changes the file content', () => {
                      expect(editor.getText()).toEqual('for x in list:\n    print(x)\n');
                    });

                    it('stores the new clean up model version', () => {
                      expect(kitePkg.errorRescueVersion()).toEqual(2);
                    });

                    describe('the sidebar panel', () => {
                      beforeEach(() => {
                        waitsFor('autocorrect sidebar', () =>
                          sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));
                      });

                      it('is open again', () => {
                        expect(sidebar).not.toBeNull();
                      });

                      it('makes a call to the model info endpoint', () => {
                        expect(KiteAPI.request).toHaveBeenCalledWithPath('/api/editor/autocorrect/model-info');
                      });

                      it('creates a message box for the changes', () => {
                        expect(sidebar.querySelector('.message-box')).toExist();
                      });
                    });
                  });
                });
              });

              describe('with Clean up quietly setting', () => {
                beforeEach(() => {
                  atom.config.set('kite.actionWhenErrorRescueFixesCode', ERROR_RESCUE_DONT_SHOW_SIDEBAR);
                });

                describe('when the sidebar is open, but not active', () => {
                  let sidebar, spy;

                  beforeEach(() => {
                    kitePkg.toggleErrorRescueSidebar(true);

                    waitsFor('autocorrect sidebar', () =>
                      sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));

                    waitsForPromise(() => {
                      const pane = atom.workspace.getRightDock().getActivePane();
                      return atom.workspace.open('sample.py', {pane});
                    });
                  });

                  withKiteRoutes([
                    [
                      o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                      o => fakeResponse(200,
                          fs.readFileSync(path.resolve(projectPath, 'autocorrect-fixes-new-version.json'))),
                    ], [
                      o => /^\/api\/editor\/autocorrect\/model-info$/.test(o.path),
                      o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'model-info.json'))),
                    ],
                  ]);

                  beforeEach(() => {
                    editor.save();

                    spy = jasmine.createSpy();

                    sidebar.onDidChangeIcon(spy);

                    waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                    waitsFor('icon changed', () => spy.calls.length > 0);
                  });

                  it('makes a call to the model info endpoint', () => {
                    expect(KiteAPI.request).toHaveBeenCalledWithPath('/api/editor/autocorrect/model-info');
                  });

                  it('stores the new clean up model version', () => {
                    expect(kitePkg.errorRescueVersion()).toEqual(2);
                  });

                  describe('the sidebar panel tab', () => {
                    it('has a specific icon', () => {
                      expect(sidebar.getIconName()).toEqual('info');
                    });

                    it('creates a message box for the changes', () => {
                      expect(sidebar.querySelector('.message-box')).toExist();
                    });

                    describe('when activated', () => {
                      it('sees its icon disappear', () => {
                        expect(sidebar.getIconName()).toEqual('info');

                        const spy = jasmine.createSpy();
                        sidebar.onDidChangeIcon(spy);
                        const pane = atom.workspace.paneForURI(sidebar.getURI());
                        pane.setActiveItem(sidebar);
                        expect(spy).toHaveBeenCalled();
                        expect(sidebar.getIconName()).toBeUndefined();
                      });
                    });
                  });
                });

                describe('when the sidebar is open and active', () => {
                  let sidebar;

                  withKiteRoutes([
                    [
                      o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                      o => fakeResponse(200,
                            fs.readFileSync(path.resolve(projectPath, 'autocorrect-fixes-new-version.json'))),
                    ], [
                      o => /^\/api\/editor\/autocorrect\/model-info$/.test(o.path),
                      o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'model-info.json'))),
                    ],
                  ]);

                  beforeEach(() => {
                    kitePkg.toggleErrorRescueSidebar(true);

                    waitsFor('autocorrect sidebar', () =>
                          sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));

                    runs(() => {
                      editor.save();
                    });

                    waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                  });

                  it('makes a call to the model info endpoint', () => {
                    expect(KiteAPI.request).toHaveBeenCalledWithPath('/api/editor/autocorrect/model-info');
                  });

                  it('stores the new clean up model version', () => {
                    expect(kitePkg.errorRescueVersion()).toEqual(2);
                  });

                  describe('the sidebar panel tab', () => {
                    it('does not have a specific icon', () => {
                      expect(sidebar.getIconName()).not.toEqual('info');
                    });

                    it('creates a message box for the changes', () => {
                      expect(sidebar.querySelector('.message-box')).toExist();
                    });
                  });
                });

                describe('when the sidebar is not visible', () => {
                  let notificationsPkg;

                  withKiteRoutes([
                    [
                      o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                      o => fakeResponse(200,
                              fs.readFileSync(path.resolve(projectPath, 'autocorrect-fixes-new-version.json'))),
                    ], [
                      o => /^\/api\/editor\/autocorrect\/model-info$/.test(o.path),
                      o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'model-info.json'))),
                    ],
                  ]);

                  beforeEach(() => {
                    waitsForPromise(() =>
                            atom.packages.activatePackage('notifications').then(pkg => {
                              notificationsPkg = pkg.mainModule;
                              notificationsPkg.initializeIfNotInitialized();

                              spyOn(atom.notifications, 'addInfo').andCallThrough();
                            }));

                    runs(() => editor.save());

                    waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                  });

                  afterEach(() => {
                    notificationsPkg.lastNotification = null;
                    atom.notifications.clear();
                  });

                  it('stores the new clean up model version', () => {
                    expect(kitePkg.errorRescueVersion()).toEqual(2);
                  });

                  it('creates a notification', () => {
                    expect(atom.notifications.addInfo).toHaveBeenCalled();

                    const [content, options] = atom.notifications.addInfo.calls[0].args;
                    expect(content).toEqual('#### Kite Error Rescue has just been updated\nSome string');
                    expect(options.detail).toEqual('for x in list:\nfor x in list');
                  });
                });
              });
            });

            describe('when there are some errors to fix but the hash mismatches', () => {
              withKiteRoutes([
                [
                  o => /^\/clientapi\/editor\/autocorrect\/metrics$/.test(o.path),
                  o => fakeResponse(200),
                ], [
                  o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                  o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'autocorrect-hash-mismatch.json'))),
                ],
              ]);

              beforeEach(() => {
                editor.save();

                waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
              });

              it('does not change the file content', () => {
                expect(editor.getText()).toEqual('for x in list\n    print(x)\n');
              });

              it('sends the received response to the metrics endpoint', () => {
                expect(KiteAPI.request).toHaveBeenCalledWithPath('/clientapi/editor/autocorrect/metrics');
              });
            });

            describe('when the sidebar is open on a file fixes', () => {
              let sidebar;

              withKiteRoutes([
                [
                  o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                  o => fakeResponse(200, fs.readFileSync(path.resolve(projectPath, 'autocorrect-with-fixes.json'))),
                ],
              ]);

              beforeEach(() => {
                editor.save();

                waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                        // runs(() => kitePkg.toggleErrorRescueSidebar());
                waitsFor('autocorrect sidebar',
                        () => sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));
                waitsFor('initial diff view', () => sidebar.querySelector('.diff'));
              });

              describe('then opening a new file', () => {
                beforeEach(() => {
                  waitsForPromise(() => atom.workspace.open('sample.py'));
                });

                it('clears the sidebar content', () => {
                  const message = sidebar.querySelector('.diffs .diff .message');

                  expect(message.textContent).toEqual('No fixes made to sample.py yet.');
                });

                describe('and switching back to the previous file', () => {
                  beforeEach(() => {
                    waitsForPromise(() => atom.workspace.open('errored.py'));
                  });

                  it('displays back the diffs for that file', () => {
                    expect(sidebar.querySelector('.diff')).not.toBeNull();
                  });
                });

              });

              describe('when new fixes are made while sidebar is open', () => {
                withKiteRoutes([
                  [
                    o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                    o => fakeResponse(200,
                              fs.readFileSync(path.resolve(projectPath, 'autocorrect-fixed-with-fixes.json'))),
                  ],
                ]);

                beforeEach(() => {
                  editor.save();

                  waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 1);
                });

                it('refreshes the sidebar content', () => {
                  expect(sidebar.querySelectorAll('.diff').length).toEqual(2);
                });
              });
            });

            describe('when the actionWhenErrorRescueFixesCode is set to reopen the sidebar', () => {
              let sidebar;

              withKiteRoutes([
                [
                  o => /^\/clientapi\/editor\/autocorrect$/.test(o.path),
                  o => fakeResponse(200,
                              fs.readFileSync(path.resolve(projectPath, 'autocorrect-with-fixes.json'))),
                ],
              ]);

              beforeEach(() => {
                atom.config.set('kite.actionWhenErrorRescueFixesCode', ERROR_RESCUE_SHOW_SIDEBAR);

                editor.save();

                waitsFor('buffer saved', () => buffer.buffer.save.calls.length > 0);
                waitsFor('autocorrect sidebar',
                            () => sidebar = workspaceElement.querySelector('kite-error-rescue-sidebar'));
                waitsFor('initial diff view', () => sidebar.querySelector('.diff'));
              });

              it('selects the correct option in the list', () => {
                expect(sidebar.querySelector('select').value).toEqual(ERROR_RESCUE_SHOW_SIDEBAR);
              });
            });
          });
        });
      });
    });

  });
});

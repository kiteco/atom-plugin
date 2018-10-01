'use strict';

const path = require('path');
const {withKite, withKiteRoutes, withKitePaths} = require('kite-api/test/helpers/kite');
const {fakeResponse} = require('kite-api/test/helpers/http');
const {withPlan} = require('../spec-helpers');
const {click} = require('../helpers/events');

describe('KiteStatusPanel', () => {

  let status, app, jasmineContent, workspaceElement, notificationsPkg;

  beforeEach(() => {
    jasmineContent = document.querySelector('#jasmine-content');
    workspaceElement = atom.views.getView(atom.workspace);

    jasmineContent.appendChild(workspaceElement);
    jasmine.useRealClock();

    waitsForPromise(() => atom.packages.activatePackage('notifications').then(pkg => {
      notificationsPkg = pkg.mainModule;
      notificationsPkg.initializeIfNotInitialized();
    }));

    waitsForPromise(() => atom.packages.activatePackage('kite').then(pkg => {
      app = pkg.mainModule.app;
      status = pkg.mainModule.getStatusPanel();

      document.body.appendChild(status);
    }));
  });

  afterEach(() => {
    notificationsPkg.lastNotification = null;
    atom.notifications.clear();
    delete status.starting;
    delete status.installing;
  });

  withKite({logged: true}, () => {
    withPlan('enterprise', {
      status: 'active',
      active_subscription: 'enterprise',
      features: {},
      trial_days_remaining: 0,
      started_kite_pro_trial: false,
    }, () => {
      it('displays an enterprise badge', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(status.querySelector('.split-line .left .enterprise')).toExist();
        }));
      });

      it('displays a link to the user account', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual('Account');
          expect(link.href).toEqual('http://localhost:46624/clientapi/desktoplogin?d=/settings/acccount');
        }));
      });
    });

    withPlan('active pro', {
      status: 'active',
      active_subscription: 'pro',
      features: {},
      trial_days_remaining: 0,
      started_kite_pro_trial: false,
    }, () => {
      it('displays a pro badge', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(status.querySelector('.split-line .left .pro')).toExist();
        }));
      });

      it('displays a link to the user account', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual('Account');
          expect(link.href).toEqual('http://localhost:46624/clientapi/desktoplogin?d=/settings/acccount');
        }));
      });
    });

    withPlan('trialing pro with more than 6 days remaining', {
      status: 'trialing',
      active_subscription: 'pro',
      features: {},
      trial_days_remaining: 9,
      started_kite_pro_trial: true,
    }, () => {
      it('displays a pro badge without the remaining days', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(status.querySelector('.split-line .left .pro')).toExist();
          const days = status.querySelector('.split-line .left .kite-trial-days');
          expect(days).not.toExist();
        }));
      });

      it('displays a link to the pro account help page', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual("What's this?");
          expect(link.href).toEqual('https://help.kite.com/article/65-kite-pro');
        }));
      });
    });

    withPlan('trialing pro with less than 5 days remaining', {
      status: 'trialing',
      active_subscription: 'pro',
      features: {},
      trial_days_remaining: 3,
      started_kite_pro_trial: true,
    }, () => {
      it('displays a pro badge with the remaining days in normal text', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(status.querySelector('.split-line .left .pro')).toExist();
          const days = status.querySelector('.split-line .left .kite-trial-days');
          expect(days).toExist();
          expect(days.textContent).toEqual('Trial: 3 days left');
          expect(days.classList.contains('text-danger')).toBeFalsy();
        }));
      });

      it('displays a link to upgrade to a pro account', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual('Upgrade');
          expect(link.href).toEqual('http://localhost:46624/redirect/pro');
        }));
      });
    });

    withPlan('community that did not trialed Kite yet', {
      status: 'active',
      active_subscription: 'community',
      features: {},
      trial_days_remaining: 0,
      started_kite_pro_trial: false,
    }, () => {
      it('displays as a kite basic account', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(
            status.querySelector('.split-line .left')
            .textContent
            .replace(/\s+/g, ' ')
            .trim()
          )
          .toEqual('kite_vector_icon Kite Basic');
        }));
      });

      it('displays a link to start a trial', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual('Start Pro trial');
          expect(link.href).toEqual('http://localhost:46624/redirect/trial');
        }));
      });
    });

    withPlan('community that already did the Kite trial', {
      status: 'active',
      active_subscription: 'community',
      features: {},
      trial_days_remaining: 0,
      started_kite_pro_trial: true,
    }, () => {
      it('displays as a kite basic account', () => {
        waitsForPromise(() => status.show().then(() => {
          expect(
            status.querySelector('.split-line .left')
            .textContent
            .replace(/\s+/g, ' ')
            .trim()
          )
          .toEqual('kite_vector_icon Kite Basic');
        }));
      });

      it('displays a link to upgrade to a pro account', () => {
        waitsForPromise(() => status.show().then(() => {
          const link = status.querySelector('.split-line .right a');
          expect(link).toExist();
          expect(link.textContent).toEqual('Upgrade');
          expect(link.href).toEqual('http://localhost:46624/redirect/pro');
        }));
      });
    });
  });

  withKite({running: false}, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('displays an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent)
      .toEqual('Kite engine is not running •');

      const button = state.querySelector('a');

      expect(button.href).toEqual('kite-atom-internal://start');
      expect(button.textContent).toEqual('Launch now');
    });

    describe('clicking on the button', () => {
      it('starts kited', () => {
        const button = status.querySelector('a.btn');

        spyOn(app, 'start').andReturn(Promise.resolve());
        click(button);

        expect(app.start).toHaveBeenCalled();
      });
    });
  });

  withKite({
    running: false,
    allInstallPaths: [
      '/path/to/app',
      '/path/to/app2',
    ],
  }, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('does not display an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent.replace(/\s+/g, ' '))
      .toEqual(`Kite engine is not running •
        You have multiple versions of Kite installed.
        Please launch your desired one.`.replace(/\s+/g, ' '));

      const button = state.querySelector('a');

      expect(button).toBeNull();
    });
  });

  withKite({runningEnterprise: false}, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show().catch(err => console.log(err)));
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('displays an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent)
      .toEqual('Kite engine is not running •');

      const button = state.querySelector('a');

      expect(button.href).toEqual('kite-atom-internal://start-enterprise');
      expect(button.textContent).toEqual('Launch now');
    });

    describe('clicking on the button', () => {
      it('starts kited', () => {
        const button = status.querySelector('a.btn');

        spyOn(app, 'startEnterprise').andReturn(Promise.resolve());
        click(button);

        expect(app.startEnterprise).toHaveBeenCalled();
      });
    });
  });

  withKite({
    runningEnterprise: false,
    allEnterpriseInstallPaths: ['/path/to/app', '/path/to/app2'],
  }, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('does not display an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent.replace(/\s+/g, ' '))
      .toEqual(`Kite engine is not running •
        You have multiple versions of Kite installed.
        Please launch your desired one.`.replace(/\s+/g, ' '));

      const button = state.querySelector('a');

      expect(button).toBeNull();
    });
  });

  withKite({
    running: false,
    runningEnterprise: false,
  }, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('displays an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent.replace(/\s+/g, ' '))
      .toEqual('Kite engine is not running • Which version of kite do you want to launch?');

      const buttons = state.querySelectorAll('a');

      expect(buttons.length).toEqual(2);

      expect(buttons[0].href).toEqual('kite-atom-internal://start-enterprise');
      expect(buttons[0].textContent).toEqual('Launch Kite Enterprise');
      expect(buttons[1].href).toEqual('kite-atom-internal://start');
      expect(buttons[1].textContent).toEqual('Launch Kite cloud');
    });

    describe('clicking on the enterprise button', () => {
      it('starts kited', () => {
        const button = status.querySelector('a.btn');

        spyOn(app, 'startEnterprise').andReturn(Promise.resolve());
        click(button);

        expect(app.startEnterprise).toHaveBeenCalled();
      });
    });

    describe('clicking on the cloud button', () => {
      it('starts kited', () => {
        const button = status.querySelectorAll('a.btn')[1];

        spyOn(app, 'start').andReturn(Promise.resolve());
        click(button);

        expect(app.start).toHaveBeenCalled();
      });
    });
  });

  withKite({
    running: false,
    runningEnterprise: false,
    allInstallPaths: ['/path/to/app', '/path/to/app2'],
    allEnterpriseInstallPaths: ['/path/to/enterprise/app', '/path/to/enterprise/app2'],
  }, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('does not display the account status', () => {
      expect(status.querySelector('.split-line')).not.toExist();
    });

    it('does not display an action to start kited', () => {
      const state = status.querySelector('.status');

      expect(state.querySelector('.text-danger').textContent.replace(/\s+/g, ' '))
      .toEqual(`Kite engine is not running •
        You have multiple versions of Kite installed.
        Please launch your desired one.`.replace(/\s+/g, ' '));

      const button = state.querySelector('a');

      expect(button).toBeNull();
    });
  });

  withKite({logged: false}, () => {
    withPlan('community that did not trialed Kite yet', {
      status: 'active',
      active_subscription: 'community',
      features: {},
      trial_days_remaining: 0,
      started_kite_pro_trial: false,
    }, () => {
      beforeEach(() => {
        waitsForPromise(() => status.show());
      });

      it('does not display the account status', () => {
        expect(status.querySelector('.split-line')).not.toExist();
      });

      it('displays an action to log into kited', () => {
        const state = status.querySelector('.status');

        expect(state.querySelector('.text-danger').textContent)
        .toEqual('Kite engine is not logged in •');

        const button = state.querySelector('a');

        expect(button.href).toEqual('kite-atom-internal://login');
        expect(button.textContent).toEqual('Login now');
      });

      describe('clicking on the button', () => {
        it('displays the kite login', () => {
          const button = status.querySelector('a.btn');

          spyOn(app, 'login').andReturn(Promise.resolve());
          click(button);

          expect(app.login).toHaveBeenCalled();
        });
      });
    });
  });

  withKite({logged: true}, () => {
    withKitePaths({}, undefined, () => {
      let editor;
      withPlan('community that did not trialed Kite yet', {
        status: 'active',
        active_subscription: 'community',
        features: {},
        trial_days_remaining: 0,
        started_kite_pro_trial: false,
      }, () => {
        describe('with a file not in the whitelist', () => {
          let notification;
          beforeEach(() => {
            waitsForPromise(() => atom.workspace.open('sample.py').then(e => editor = e));
            waitsFor('notification', () => notification = notificationsPkg.lastNotification);
            runs(() => {
              spyOn(notification, 'dismiss').andCallThrough();
            });
            waitsForPromise(() => status.show());
          });

          it('displays actions to whitelist the file and access the settings', () => {
            const state = status.querySelector('.status');

            expect(state.querySelector('.text-warning').textContent)
            .toEqual('Kite engine is not enabled for this file •');

            const buttons = state.querySelectorAll('a');
            const p = encodeURI(editor.getPath());
            const url = `kite-atom-internal://open-copilot-permissions?filename=${p}`;

            expect(buttons[0].href).toEqual(`kite-atom-internal://whitelist/${path.dirname(editor.getPath())}`);
            expect(buttons[0].textContent).toEqual(`Enable for ${path.dirname(editor.getPath())}`);

            expect(buttons[1].href).toEqual(url);
            expect(buttons[1].textContent).toEqual('Whitelist settings…');
          });

          describe('clicking on the whitelist button', () => {
            it('calls the whitelist endpoint', () => {
              const state = status.querySelector('.status');
              const button = state.querySelector('a');

              spyOn(app, 'whitelist').andReturn(Promise.resolve());
              click(button);

              expect(app.whitelist).toHaveBeenCalledWith(path.dirname(editor.getPath()));
            });

            it('dismiss the whitelist notification', () => {
              const state = status.querySelector('.status');
              const button = state.querySelector('a');

              spyOn(app, 'whitelist').andReturn(Promise.resolve());
              click(button);

              waitsFor('dismiss called', () => notification.dismiss.callCount);
            });
          });

          describe('clicking on the whitelist settings button', () => {
            it('calls the whitelist endpoint', () => {
              const state = status.querySelector('.status');
              const button = state.querySelector('a:last-child');
              const path = encodeURI(editor.getPath());
              const url = `kite://settings/permissions?filename=${path}`;

              spyOn(atom.applicationDelegate, 'openExternal');
              click(button);

              expect(atom.applicationDelegate.openExternal).toHaveBeenCalledWith(url);
            });
          });
        });

        describe('when the user has a verified email', () => {
          beforeEach(() => {
            waitsForPromise(() => status.show());
          });

          it('does not display a verification warning', () => {
            expect(status.querySelector('.kite-warning-box')).not.toExist();
          });
        });

        describe('when the user has an unverified email', () => {
          withKiteRoutes([[
            o => /^\/api\/account\/user/.test(o.path),
            o => fakeResponse(200, JSON.stringify({email_verified: false})),
          ]]);

          beforeEach(() => {
            waitsForPromise(() => status.show());
          });

          it('displays a verification warning', () => {
            expect(status.querySelector('.kite-warning-box')).toExist();
          });
        });
      });
    });
  });
});

'use strict';

const {withKite, withKiteRoutes} = require('kite-api/test/helpers/kite');
const {fakeResponse} = require('kite-connector/test/helpers/http');
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

  withKite({reachable: true}, () => {
    it('displays the icon', () => {
      waitsForPromise(() => status.show().then(() => {
        expect(status.querySelector('.split-line .left kite-logo')).toExist();
      }));
    });

    it('displays a link to the user account', () => {
      waitsForPromise(() => status.show().then(() => {
        const link = status.querySelector('.split-line .right a');
        expect(link).toExist();
        expect(link.textContent).toEqual('Account');
        expect(link.href).toEqual('kite-atom-internal://open-account-web');
      }));
    });
  });

  withKite({reachable: true}, () => {
    withKiteRoutes([
      [o => o.path === '/clientapi/user', o => fakeResponse(401)],
    ]);

    beforeEach(() => {
      waitsForPromise(() => status.show());
    });

    it('displays an action to open the copilot to log into kited', () => {
      const state = status.querySelector('.status');

      const button = state.querySelector('a');

      expect(button.href).toEqual('kite-atom-internal://open-copilot-settings');
      expect(button.textContent).toEqual('Login now');
    });

    describe('clicking on the button', () => {
      it('displays the kite copilot settings', () => {
        const button = status.querySelector('a.btn');

        spyOn(app, 'copilotSettings');
        click(button);

        expect(app.copilotSettings).toHaveBeenCalled();
      });

      it('closes the status panel', () => {
        const button = status.querySelector('a.btn');

        spyOn(app, 'copilotSettings');
        click(button);

        expect(status.parentNode).toBeNull();
      });
    });
  });

  withKite({running: false}, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
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
    allInstallPaths: ['/path/to/app', '/path/to/app2'],
    allEnterpriseInstallPaths: ['/path/to/enterprise/app', '/path/to/enterprise/app2'],
  }, () => {
    beforeEach(() => {
      waitsForPromise(() => status.show());
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
});

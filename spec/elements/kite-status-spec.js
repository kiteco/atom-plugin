'use struct';

const KiteApp = require('../../lib/kite-app');
const KiteStatus = require('../../lib/elements/kite-status');
const {fakeKiteInstallPaths, withKiteNotReachable, withKiteNotRunning, withKiteNotAuthenticated, withKiteWhitelistedPaths} = require('../spec-helpers');

describe('KiteStatus', () => {
  fakeKiteInstallPaths();

  let status, app;

  beforeEach(() => {
    app = new KiteApp();
    status = new KiteStatus();
    status.setApp(app);

    document.body.appendChild(status);
  });

  it('starts in an unknown state', () => {
    expect(status.getAttribute('status')).toEqual('unknown');
  });

  describe('when kite is not installed', () => {
    it('changes its status to UNINSTALLED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('uninstalled');
      }));
    });
  });

  withKiteNotRunning(() => {
    it('changes its status to INSTALLED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('installed');
      }));
    });
  });

  withKiteNotReachable(() => {
    it('changes its status to RUNNING', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('running');
      }));
    });
  });

  withKiteNotAuthenticated(() => {
    it('changes its status to REACHABLE', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('reachable');
      }));
    });
  });

  withKiteWhitelistedPaths(() => {
    it('changes its status to AUTHENTICATED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('authenticated');
      }));
    });
  });

  withKiteWhitelistedPaths([__dirname], () => {
    beforeEach(() => {
      atom.project.setPaths([__dirname]);
    });

    it('changes its status to WHITELISTED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('whitelisted');
      }));
    });
  });
});

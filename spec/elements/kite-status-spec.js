'use struct';

const {withKite, withKitePaths} = require('kite-api/test/helpers/kite');

const KiteApp = require('../../lib/kite-app');
const KiteStatus = require('../../lib/elements/kite-status');

describe('KiteStatus', () => {
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

  withKite({installed: false}, () => {
    it('changes its status to UNINSTALLED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('uninstalled');
      }));
    });
  });

  withKite({running: false}, () => {
    it('changes its status to INSTALLED', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('installed');
      }));
    });
  });

  withKite({reachable: false}, () => {
    it('changes its status to RUNNING', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('running');
      }));
    });
  });

  withKite({logged: false}, () => {
    it('changes its status to REACHABLE', () => {
      waitsForPromise(() => app.connect().then(() => {
        expect(status.getAttribute('status')).toEqual('reachable');
      }));
    });
  });

  withKite({logged: true}, () => {
    withKitePaths({}, undefined, () => {
      it('changes its status to AUTHENTICATED', () => {
        waitsForPromise(() => app.connect().then(() => {
          expect(status.getAttribute('status')).toEqual('authenticated');
        }));
      });
    });
  });
});

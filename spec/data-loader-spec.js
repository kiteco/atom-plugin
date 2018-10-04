'use strict';

const url = require('url');
const path = require('path');
const KiteAPI = require('kite-api');
const {fakeResponse} = require('kite-api/test/helpers/http');
const {withKite, withKiteRoutes, withKitePaths} = require('kite-api/test/helpers/kite');

const DataLoader = require('../lib/data-loader');

const projectPath = path.join(__dirname, 'fixtures');

describe('DataLoader', () => {
  beforeEach(() => {
    waitsForPromise(() => atom.workspace.open('sample.py'));
  });

  beforeEach(() => {
    spyOn(KiteAPI, 'request').andCallThrough();
  });

  withKite({reachable: true}, () => {
    describe('.getSupportedLanguages()', () => {
      withKiteRoutes([
        [
          o => o.path === '/clientapi/languages',
          o => fakeResponse(200, JSON.stringify(['javascript', 'python'])),
        ],
      ], () => {
        it('returns a promise that resolve with the supported languages', () => {
          waitsForPromise(() => DataLoader.getSupportedLanguages().then(languages => {
            expect(languages).toEqual(['javascript', 'python']);
          }));
        });
      });
    });

    withKitePaths({
      whitelist: [projectPath],
    }, undefined, () => {
      describe('.getValueReportDataForId()', () => {
        describe('when the request succeeds', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value/.test(o.path),
              o => fakeResponse(200, '{"foo": "bar"}'),
            ],
          ]);

          it('returns a promise that resolve with the returned hover data', () => {
            waitsForPromise(() => DataLoader.getValueReportDataForId('foo').then(data => {
              const parsedURL = url.parse(KiteAPI.request.mostRecentCall.args[0].path);

              expect(parsedURL.path.indexOf('/foo')).not.toEqual(-1);

              expect(data).toEqual({foo: 'bar'});
            }));
          });
        });

        describe('when the request fails', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value/.test(o.path),
              o => fakeResponse(404),
            ],
          ]);

          it('returns a promise that is rejected', () => {
            waitsForPromise({shouldReject: true}, () => DataLoader.getValueReportDataForId('foo'));
          });
        });
      });

      describe('.getMembersDataForId()', () => {
        describe('when the request succeeds', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value\/[^\/]+\/members/.test(o.path),
              o => fakeResponse(200, '{"foo": "bar"}'),
            ],
          ]);

          it('returns a promise that resolve with the returned members data', () => {
            waitsForPromise(() => DataLoader.getMembersDataForId('foo').then(data => {
              const parsedURL = url.parse(KiteAPI.request.calls[0].args[0].path);

              expect(parsedURL.path.indexOf('/foo')).not.toEqual(-1);

              expect(data).toEqual({foo: 'bar'});
            }));
          });
        });

        describe('when the request fails', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value\/[^\/]*\/members/.test(o.path),
              o => fakeResponse(404),
            ],
          ]);

          it('returns a promise that is rejected', () => {
            waitsForPromise({shouldReject: true}, () => DataLoader.getMembersDataForId('foo'));
          });
        });
      });

      describe('.getUsagesDataForValueId()', () => {
        describe('when the request succeeds', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value\/[^\/]+\/usages/.test(o.path),
              o => fakeResponse(200, '{"foo": "bar"}'),
            ],
          ]);

          it('returns a promise that resolve with the returned members data', () => {
            waitsForPromise(() => DataLoader.getUsagesDataForValueId('foo').then(data => {
              const parsedURL = url.parse(KiteAPI.request.calls[0].args[0].path);

              expect(parsedURL.path.indexOf('/foo')).not.toEqual(-1);

              expect(data).toEqual({foo: 'bar'});
            }));
          });
        });

        describe('when the request fails', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/value\/[^\/]*\/usages/.test(o.path),
              o => fakeResponse(404),
            ],
          ]);

          it('returns a promise that is rejected', () => {
            waitsForPromise({shouldReject: true}, () => DataLoader.getUsagesDataForValueId('foo'));
          });
        });
      });

      describe('.getUsageDataForId()', () => {
        describe('when the request succeeds', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/usages/.test(o.path),
              o => fakeResponse(200, '{"foo": "bar"}'),
            ],
          ]);

          it('returns a promise that resolve with the returned usage data', () => {
            waitsForPromise(() => DataLoader.getUsageDataForId('foo').then(data => {
              const parsedURL = url.parse(KiteAPI.request.calls[0].args[0].path);

              expect(parsedURL.path.indexOf('/foo')).not.toEqual(-1);

              expect(data).toEqual({foo: 'bar'});
            }));
          });
        });

        describe('when the request fails', () => {
          withKiteRoutes([
            [
              o => /^\/api\/editor\/usages/.test(o.path),
              o => fakeResponse(404),
            ],
          ]);

          it('returns a promise that is rejected', () => {
            waitsForPromise({shouldReject: true}, () => DataLoader.getUsageDataForId('foo'));
          });
        });
      });

      describe('.getExampleDataForId()', () => {
        describe('when the request succeeds', () => {
          withKiteRoutes([
            [
              o => /^\/api\/python\/curation/.test(o.path),
              o => fakeResponse(200, '{"foo": "bar"}'),
            ],
          ]);

          it('returns a promise that resolve with the returned example data', () => {
            waitsForPromise(() => DataLoader.getExampleDataForId('foo').then(data => {
              const parsedURL = url.parse(KiteAPI.request.calls[0].args[0].path);

              expect(parsedURL.path.indexOf('/foo')).not.toEqual(-1);

              expect(data).toEqual({foo: 'bar'});
            }));
          });
        });

        describe('when the request fails', () => {
          withKiteRoutes([
            [
              o => /^\/api\/python\/curation/.test(o.path),
              o => fakeResponse(404),
            ],
          ]);

          it('returns a promise that is rejected', () => {
            waitsForPromise({shouldReject: true}, () => DataLoader.getExampleDataForId('foo'));
          });
        });
      });
    });
  });
});

'use strict';

const Plan = require('../lib/plan.js');
const {fakeResponse} = require('kite-api/test/helpers/http');
const {withKite, withKiteRoutes} = require('kite-api/test/helpers/kite');

describe('Plan', () => {
  withKite({reachable: true}, () => {
    withKiteRoutes([[
      o => /\/clientapi\/plan/.test(o.path),
      o => fakeResponse(200, JSON.stringify({
        name: 'unknown',
        status: 'active',
        active_subscription: 'unknown',
        features: {
          drill_down: false,
          foo: true,
        },
      })),
    ]], () => {
      beforeEach(() => {
        waitsForPromise(() => Plan.queryPlan());
      });
      describe('.can()', () => {
        it('returns a boolean of the feature permission', () => {
          expect(Plan.can('drill_down')).toBeFalsy();
          expect(Plan.can('foo')).toBeTruthy();
          expect(Plan.can('bar')).toBeFalsy();
        });
      });
    });
  });
});

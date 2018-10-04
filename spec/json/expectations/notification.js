'use strict';

const {waitsFor, itForExpectation, NotificationsMock} = require('../utils');

module.exports = (expectation, not) => {
  beforeEach(() => {
    const promise = waitsFor(() => NotificationsMock.newNotification(), 100);

    if (not) {
      waitsForPromise({shouldReject: true, label: `${expectation.properties.level} notification`}, () => promise);
    } else {
      waitsForPromise({label: `${expectation.properties.level} notification`}, () => promise);
    }
  });

  const block = () => {
    if (!not) {
      expect(NotificationsMock.lastNotification.level).toEqual(expectation.properties.level);

      // if (expectation.properties.message) {
      //   const message = substituteFromContext(expectation.properties.message, buildContext());
      //
      //   expect(NotificationsMock.lastNotification.message).toEqual(message);
      // }
    }
  };

  itForExpectation(expectation, block);
};

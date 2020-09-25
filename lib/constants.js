'use strict';

// Enable or disable debug mode
const DEBUG = false;

// minimum interval in seconds between sending "could not connect..."
// events
const CONNECT_ERROR_LOCKOUT = 15 * 60;

const ERROR_RESCUE_SHOW_SIDEBAR = 'Reopen sidebar';
const ERROR_RESCUE_DONT_SHOW_SIDEBAR = 'Fix code quietly';

const UNKNOWN_TYPE = 'kite-empty-type';

module.exports = {
  CONNECT_ERROR_LOCKOUT,
  DEBUG,
  ERROR_RESCUE_SHOW_SIDEBAR,
  ERROR_RESCUE_DONT_SHOW_SIDEBAR,
  UNKNOWN_TYPE,
};

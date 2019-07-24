'use strict';

// Enable or disable debug mode
const DEBUG = false;

// MAX_FILE_SIZE is the maximum file size to send to Kite
const MAX_FILE_SIZE = 75 * Math.pow(2, 10); // 75 KB

// MAX_PAYLOAD_SIZE is the maximum length for a POST reqest body
const MAX_PAYLOAD_SIZE = 2 ** 21; // 2097152

// minimum interval in seconds between sending "could not connect..."
// events
const CONNECT_ERROR_LOCKOUT = 15 * 60;

const ERROR_RESCUE_SHOW_SIDEBAR = 'Reopen sidebar';
const ERROR_RESCUE_DONT_SHOW_SIDEBAR = 'Fix code quietly';

const UNKNOWN_TYPE = 'unknown';

module.exports = {
  CONNECT_ERROR_LOCKOUT,
  DEBUG,
  MAX_FILE_SIZE,
  MAX_PAYLOAD_SIZE,
  ERROR_RESCUE_SHOW_SIDEBAR,
  ERROR_RESCUE_DONT_SHOW_SIDEBAR,
  UNKNOWN_TYPE,
};

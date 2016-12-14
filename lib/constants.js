'use strict';

// Enable or disable debug mode
const DEBUG = false;

// MAX_FILE_SIZE is the maximum file size to send to Kite
const MAX_FILE_SIZE = 2 ** 20; // 1048576

// MAX_PAYLOAD_SIZE is the maximum length for a POST reqest body
const MAX_PAYLOAD_SIZE = 2 ** 21; // 2097152

// minimum interval in seconds between sending "could not connect..."
// events to mixpanel
const CONNECT_ERROR_LOCKOUT = 15 * 60;

module.exports = {
  CONNECT_ERROR_LOCKOUT,
  DEBUG,
  MAX_FILE_SIZE,
  MAX_PAYLOAD_SIZE,
};

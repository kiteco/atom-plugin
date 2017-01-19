'use strict';

var os = require('os');
const mixpanel = require('mixpanel');
const crypto = require('crypto');
const kitePkg = require('../package.json');
const localconfig = require('./localconfig.js');

const MIXPANEL_TOKEN = 'fb6b9b336122a8b29c60f4c28dab6d03';

const OS_VERSION = os.type() + ' ' + os.release();

const client = mixpanel.init(MIXPANEL_TOKEN, {
  protocol: 'https',
});

const EDITOR_UUID = localStorage.getItem('metrics.userId');

// Generate a unique ID for this user and save it for future use.
function distinctID() {
  var id = localconfig.get('distinctID');
  if (id === undefined) {
    // use the atom UUID
    id = EDITOR_UUID || crypto.randomBytes(32).toString('hex');
    localconfig.set('distinctID', id);
  }
  return id;
}

// Send an event to mixpanel
function track(eventName, properties) {
  if (properties === undefined) {
    console.log(`event: ${ eventName }`);
  } else {
    console.log(`event: ${ eventName }`, properties);
  }
  var eventData = {
    distinct_id: distinctID(),
    editor_uuid: EDITOR_UUID,
    editor: 'atom',
    atom_version: atom.getVersion(),
    kite_plugin_version: kitePkg.version,
    os: OS_VERSION,
  };
  for (var key in properties || {}) {
    eventData[key] = properties[key];
  }
  client.track(eventName, eventData);
}

module.exports = {
  track: track,
};

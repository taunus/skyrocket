'use strict';

var state = {
  configure: configure
};

function configure (options) {
  state.revolve = options.revolve;
  state.joining = options.joining || noop;
}

function noop () {}

module.exports = state;

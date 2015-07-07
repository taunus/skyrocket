'use strict';

var state = {
  configure: configure
};

function configure (options) {
  state.taunus = options.taunus;
  state.revolve = options.revolve;
}

module.exports = state;

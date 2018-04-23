'use strict';

var _IoTMonitor = require('./IoTMonitor');

var _IoTMonitor2 = _interopRequireDefault(_IoTMonitor);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var monitor = new _IoTMonitor2.default();
monitor.connect().then(function () {
  monitor.forkProcess('build/repeater.js');
});
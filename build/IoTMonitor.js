'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('child_process'),
    fork = _require.fork,
    execSync = _require.execSync;

var Client = require('azure-iot-device').Client;
var ConnectionString = require('azure-iot-device').ConnectionString;
var Message = require('azure-iot-device').Message;
var Protocol = require('azure-iot-device-mqtt').Mqtt;

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

var IoTMonitor = function () {
  function IoTMonitor() {
    var connectionString = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    _classCallCheck(this, IoTMonitor);

    this.methodListeners = [];
    this.backProcessesRunning = [];
    this.connectionString = connectionString || process.env['AzureIoTHubDeviceConnectionString'];
    this.client = null;
    this.connected = false;
  }

  /**
   * Listens for an `eventName` device method.  Once received, create a new instance
   * of node running in a seperate process and run `fileName`. All output from
   * that process will be sent to the IoTHub as an event.
   *
   * @param {string} eventName Name of event to listen to from the IotHub
   * @param {string} fileName  Relative path to the javascript file
   */


  _createClass(IoTMonitor, [{
    key: 'addRunInBackgroundListener',
    value: function addRunInBackgroundListener(eventName, fileName) {
      var _this = this;

      this.methodListeners.push({
        type: 'background',
        eventName: eventName,
        fileName: fileName
      });
      this.client.onDeviceMethod(eventName, function (res, req) {
        return _this._forkProcessCallback(res, req, fileName);
      });
    }

    /**
     * Listens for an `eventName` device method.  Once received, runs the provided
     * method in the same thread as the IoT Monitor.  This is meant for short methods
     * and avoids the creation of a separate process.  Consider, though, that while
     * the method is running, IoTMonitor will be unresponsive.
     * @param {string} eventName  name of the device method to listen for
     * @param {function} method    method to run on reciept of the eventName
     */

  }, {
    key: 'addSameThreadMethodListener',
    value: function addSameThreadMethodListener(eventName, method) {
      var _this2 = this;

      this.methodListeners.push({
        type: 'same thread',
        eventNamae: eventName,
        method: method
      });

      this.client.onDeviceMethod(eventName, function (res, req) {
        return _this2._runSameThreadCallBack(res, req, method);
      });
    }

    /**
     * Connect to Azure IoTHub
     * @return {Promise} A promise that resolves when successfully connected, and
     *  rejects with any errors encountered.
     */

  }, {
    key: 'connect',
    value: function connect() {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        try {
          _this3.client = Client.fromConnectionString(_this3.connectionString, Protocol);
        } catch (e) {
          reject(e);
        }
        _this3.client.open(function (err) {
          if (err) {
            reject(err);
          } else {
            _this3.connected = true;
            _this3.client.sendEvent(new Message('Connected!'));
            console.log('Connected!');
            resolve();
          }
        });
      });
    }

    /**
     * Run a method on the same thread as the IoTMonitor.
     * Meant for simple, synchronous methods which quickly terminate.
     * Avoids creating another Node instance.
     *
     * @param  {function} method method to be run on the same thread.
     * @param  {Array} args   Parameters to be passed into the method.
     */

  }, {
    key: 'runOnSameThread',
    value: function runOnSameThread(method, args) {
      var _arguments = arguments,
          _this4 = this;

      // Re-write console.log.
      // This might be a really stupid way to do this.
      // It also won't work if the method is asynchronous.  It will revert
      // console.log before those methods run.
      var consoleLog = console.log;
      console.log = function () {
        var logs = _arguments;
        if (_this4.connected) {
          _this4.client.sendEvent(new Message('Log from ' + method.name + ': ' + logs));
        }
        consoleLog(_arguments);
      };
      try {
        method.apply(undefined, _toConsumableArray(args));
      } catch (e) {
        if (this.connected) {
          this.client.sendEvent(new Message('Error in ' + method.name + ': ' + e));
          consoleLog(e);
        }
      } finally {
        console.log = consoleLog;
      }
    }

    /**
     * Creates a new instance of node and runs the fileName on this new instance.
     * Reports any output of this process to the Azure IoTHub.
     * @param  {string} fileName absolute path to the node script to be forked.
     */

  }, {
    key: 'forkProcess',
    value: function forkProcess(fileName) {
      var _this5 = this;

      if (!this.connected) {
        console.error('Client not connected while forking process');
      } else {
        console.log('Here');
        this.client.sendEvent(new Message('Forking ' + fileName));
        console.log('And there');
      }

      var forked = void 0;

      try {
        forked = fork(fileName, [], { silent: true });
      } catch (error) {
        if (this.connected) {
          this.client.sendEvent(new Message('Error forking ' + fileName + ": " + error));
        }
        console.error('Error forking ' + fileName, error);
        return false;
      }

      forked.on('error', function (error) {
        if (_this5.connected) {
          _this5.client.sendEvent(new Message('Error forking ' + fileName + ': ' + error.toString()), function (err) {
            return IoTMonitor._handleMessageSendError;
          });
        }
        console.error('Error forking ' + fileName, error);
        return false;
      });

      this.backProcessesRunning.push({
        fileName: fileName,
        fork: forked
      });

      forked.on('exit', function (code, signal) {
        if (_this5.connected) {
          _this5.client.sendEvent(new Message(fileName + ' ended on code ' + code), function (err) {
            return IoTMonitor._handleMessageSendError;
          });
        }
        console.log(fileName + ' ended');
      });

      if (this.connected) {
        forked.stdout.on('data', function (data) {
          _this5.client.sendEvent(new Message('Message from ' + fileName + ': ' + data.toString()), function (err) {
            return IoTMonitor._handleMessageSendError;
          });
        });

        forked.stderr.on('data', function (data) {
          _this5.client.sendEvent(new Message('Error in ' + fileName + ': ' + data.toString), function (err) {
            return IoTMonitor._handleMessageSendError;
          });
        });
      }
      return true;
    }
  }, {
    key: '_forkProcessCallback',
    value: function _forkProcessCallback(request, response, fileName) {
      console.log('Got message to fork ' + fileName);
      if (this.forkProcess(fileName)) {
        response.send(200, 'Successfully forked ' + fileName, function (err) {
          if (err) {
            IoTMonitor._handleMessageSendError(err);
          }
        });
      } else {
        response.send(500, 'Error Forking ' + fileName, function (err) {
          if (err) {
            IoTMonitor._handleMessageSendError(err);
          }
        });
      }
    }
  }, {
    key: '_runOnSameThreadCallback',
    value: function _runOnSameThreadCallback(request, response, method) {
      console.log('Got message to run ' + method.name + '(' + request.payload || '' + ')');

      if (this.runOnSameThread(method, request.payload)) {
        response.send(200, 'Successfully ran ' + method.name + '(' + request.payload || '' + ')', function (err) {
          if (err) {
            IoTMonitor._handleMessageSendError(err);
          }
        });
      } else {
        response.send(500, 'Error running ' + method.name, function (err) {
          if (err) {
            IoTMonitor._handleMessageSendError(err);
          }
        });
      }
    }
  }], [{
    key: '_handleMessageSendError',
    value: function _handleMessageSendError(error) {
      console.error(error);
    }
  }]);

  return IoTMonitor;
}();

exports.default = IoTMonitor;
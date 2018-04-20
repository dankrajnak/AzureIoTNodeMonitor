# Azure IoT Monitor
Run and monitor multiple node scripts using Azure IoT Hub.

## API

### Constructor
```Javascript
new IoTMonitor([connectionString])
```
* `connectionString {string}` — the device connection string to connect with the Azure IoT Hub.  Learn how to to connect your device to Azure [here](https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-node-node-device-management-get-started)

### Methods
```javascript
  connect()
```
`Returns a Promise.` Connect to the Azure IoT Hub.


```Javascript
addRunInBackgroundListener(eventName, fileName)
```
When the device receives a `Direct Method` message from Azure, it will fork another node instance and run `filename`.  All of the output from the forked process will be sent back to the IoTHub.

* `eventName {string}` the name of the direct method to listen for

* `fileName {string}` the absolute path to the file to be run.

```Javascript
addSameThreadMethodListener(eventName, method)
```

When the devices receives a `Direct Method` message from Azure, it will run the `method` provided and send all logs from the method to the IoTHub.  

* `eventName {string}` the name of the direct method to listen for

* `method {function}` the method to run

```Javascript
  forkProcess(fileName)
```

Fork a new node instance and run `fileName`.  All output from the process will be sent to the IoT Hub.

* `fileName {string}` the absolute path to the file to be run.

```javascript
runOnSameThread(method, args)
```

Run `method(args)` and send all logs and errors to the IoT Hub.

* `method {function}` the method to run

* `args {Array}` An array of parameters to be passed into the method
